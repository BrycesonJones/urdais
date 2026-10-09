import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AnalyticsIdentity } from "@/components/analytics/analytics-identity";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { analyticsAccountId } from "@/lib/analytics/identity";
import { hasPremiumEntitlement } from "@/lib/access/entitlement";
import { resolveViewer } from "@/lib/access/server";
import { recordSubscriptionCompleted } from "@/lib/analytics/server";
import { reconcileAccount } from "@/lib/billing/reconcile";
import { stripeContext } from "@/lib/billing/stripe";
import { onboardingHref, onboardingReturnTo } from "@/lib/onboarding/routes";
import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";

export const metadata: Metadata = {
  title: "Finishing up",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Where Stripe sends a reader who completed Checkout.
 *
 * ## This page does not grant anything
 *
 * **The critical invariant of the whole billing layer.** A success URL is a string
 * in an address bar: anyone can type it, and a reader who abandoned Checkout at the
 * card form can reach it by pressing back. If arriving here were enough to unlock
 * Urdais, the subscription would be optional.
 *
 * So nothing on this page reads the query string as evidence. There is no
 * "payment succeeded because `session_id` is present". The page asks one question —
 * *does this account hold an active entitlement?* — of the same authority every
 * premium surface asks, and renders the answer.
 *
 * ## What the session id is for
 *
 * A lookup key, and only that. It is handed to **Stripe**, which is asked what the
 * session actually is; the answer is checked to belong to this reader's own Stripe
 * Customer before anything is written. A session id lifted from somebody else's URL
 * resolves to a Customer that is not this one and is refused.
 *
 * That reconciliation exists because the webhook is usually faster than this
 * redirect but not always, and a reader who has paid should not have to guess when
 * to refresh. It writes through exactly the same idempotency ledger a webhook uses,
 * so the two racing cannot grant twice — and if the webhook has already landed,
 * there is nothing for it to do.
 *
 * ## Why it can still say "processing"
 *
 * Because honest is better than optimistic. If Stripe has not yet made the
 * subscription active — a payment still confirming, say — the page says so and
 * offers a refresh. It does not grant access on the assumption that it will work
 * out.
 */
export default async function CheckoutCompleteRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = onboardingReturnTo(params.returnTo);
  const sessionId = typeof params.session_id === "string" ? params.session_id : null;

  const viewer = await resolveViewer();
  if (viewer.authentication.kind !== "authenticated") redirect(onboardingHref("create_account", returnTo));

  // Already entitled: the webhook arrived first, which is the ordinary case.
  if (hasPremiumEntitlement(viewer)) redirect(returnTo ?? onboardingHref("already_entitled", null));

  // Not yet. Ask Stripe rather than waiting for the webhook — see the module comment.
  const context = stripeContext();
  const databaseUrl = resolveTokenDatabaseUrl();

  // Set inside the `try`, acted on after it. `redirect()` works by throwing, so
  // calling it inside the `try` let the catch below swallow it as a "reconciliation
  // failure" and render the confirming page to a reader who was already entitled.
  let entitled = false;

  if (context.kind === "ready" && databaseUrl) {
    try {
      const sql = await tokenSqlExecutor(databaseUrl);
      const reconciliation = await reconcileAccount(context.stripe, sql, {
        accountId: viewer.authentication.accountId,
        sessionId,
        mode: context.availability.mode,
      });

      // Set first, so nothing after it -- analytics included -- can stand between an
      // entitled reader and the redirect below.
      entitled = reconciliation.kind === "entitled";

      if (reconciliation.kind === "entitled") {
        // Only when this reconciliation was the one that activated access: if the
        // webhook got there first, it has already recorded the conversion.
        if (reconciliation.activated) {
          recordSubscriptionCompleted({
            accountId: viewer.authentication.accountId,
            subscriptionId: reconciliation.subscriptionId,
            livemode: reconciliation.livemode,
            via: "reconciliation",
          });
        }
      }

      if (reconciliation.kind === "refused") {
        console.warn(`checkout complete: reconciliation refused (${reconciliation.detail})`);
      }
    } catch (error) {
      // A reconciliation failure is not the reader's problem and must not 500 a page
      // they reached after paying. The webhook remains the authority and will land.
      console.error(`checkout complete: reconciliation failed (${error instanceof Error ? error.message : "error"})`);
    }
  }

  if (entitled) {
    // Resolved on a fresh request rather than rendered from this one: the viewer
    // in hand was resolved before the entitlement was written, and rendering
    // "you're in" from stale state is how a page disagrees with the database.
    redirect(returnTo ?? onboardingHref("already_entitled", null));
  }

  // Re-entering this same route re-runs the authoritative Stripe lookup, carrying the
  // session id so the narrowed lookup still applies.
  const reloadParams = new URLSearchParams();
  if (sessionId) reloadParams.set("session_id", sessionId);
  if (returnTo) reloadParams.set("returnTo", returnTo);
  const reloadHref = reloadParams.size > 0 ? `/access/complete?${reloadParams.toString()}` : "/access/complete";

  return (
    <OnboardingShell
      eyebrow="FINISHING UP"
      title="We&rsquo;re confirming your subscription"
      lead="Stripe has your payment. Urdais is waiting for confirmation, which usually takes a few seconds."
    >
      <AnalyticsIdentity accountId={analyticsAccountId(viewer)} />
      <div className="rounded-lg border border-white/10 bg-[#111111] p-5">
        <p className="text-sm text-neutral-300">
          Nothing further is needed from you. This page does not need to stay open — your access is attached to your
          account, not to this tab.
        </p>
      </div>

      <div className="flex flex-col gap-2 text-xs text-neutral-500">
        <p>
          {/*
            Back to THIS page, not to Plan / Pay. Sending someone who has just paid to
            a screen with a Subscribe button on it is the ordinary way a customer buys
            the same subscription twice -- which is a refund conversation rather than a
            bug report. Reloading here re-runs the reconciliation instead.
          */}
          <Link
            href={reloadHref}
            className="text-neutral-300 underline underline-offset-2 transition-colors hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
          >
            Check again
          </Link>{" "}
          if this is still showing in a minute.
        </p>
        <p>If your payment did not complete, you have not been charged and nothing has changed on your account.</p>
      </div>
    </OnboardingShell>
  );
}
