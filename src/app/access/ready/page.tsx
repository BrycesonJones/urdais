import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { PremiumSummary } from "@/components/onboarding/premium-summary";
import { SubscribeButton } from "@/components/billing/subscribe-button";
import { PREMIUM_PRODUCT_NAME, PREMIUM_TRIAL_NOTE, formatPremiumPrice } from "@/lib/access/pricing";
import { isPremiumEnforcementActive } from "@/lib/access/activation";
import { billingAvailability, describeUnavailability } from "@/lib/billing/mode";
import { onboardingHref, onboardingReturnTo } from "@/lib/onboarding/routes";
import { resolveCheckoutHandoff } from "@/lib/onboarding/checkout-handoff";
import { resolveOnboarding } from "@/lib/onboarding/server";

export const metadata: Metadata = {
  title: "Urdais Premium",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Plan / Pay. The subscription offer, and the only place Urdais quotes a price.
 *
 * Only an authenticated, verified reader without an entitlement sees it, enforced
 * twice on purpose: `resolveOnboarding` decides whether to render, and
 * `resolveCheckoutHandoff` independently re-derives the same three conditions —
 * because the Subscribe control is a form submission, which is a second entry point
 * and must not rely on the page having checked. `startCheckout` re-derives them a
 * third time for the same reason.
 *
 * ## Why the price is here and nowhere earlier
 *
 * Nobody should meet a number for the first time on a payment screen, and nobody
 * should be asked to weigh one before they have seen what it buys. The gate
 * established intent, account creation asked for an email, and this screen makes the
 * offer. `@/lib/access/pricing` is the single source for the copy, and
 * `@/lib/billing/catalog` reconciles it against the Stripe Price that will actually
 * be charged — so the number a reader sees and the number Stripe bills cannot drift
 * apart silently.
 *
 * ## When billing is not configured
 *
 * Production today holds no live Stripe credentials, and `billingAvailability`
 * returns `unavailable` for a test key in production by design. The offer then
 * renders **without a purchase control** and says so plainly. That is what lets this
 * phase deploy without changing what a production reader can do: there is no button
 * to press, so there is no Checkout to accidentally open against a sandbox.
 *
 * A disabled button would be worse than none — it invites clicking and reads as a
 * bug. A stated fact does not.
 */
export default async function ReadyForCheckoutRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = onboardingReturnTo(params.returnTo);

  const resolution = await resolveOnboarding("ready_for_checkout", returnTo);
  if (resolution.kind === "redirect") redirect(resolution.href);

  const handoff = await resolveCheckoutHandoff(returnTo);
  if (handoff.kind !== "ready") redirect(onboardingHref("create_account", returnTo));

  // Read here only to decide what to render. `startCheckout` checks it again before
  // creating anything, because a form can be submitted by something that never
  // rendered this page.
  const availability = billingAvailability();
  const enforcementActive = isPremiumEnforcementActive();
  if (availability.kind === "unavailable") {
    console.warn(`plan/pay rendered without a purchase control: ${describeUnavailability(availability)}`);
  }

  return (
    <OnboardingShell
      eyebrow="SUBSCRIBE"
      title={PREMIUM_PRODUCT_NAME}
      lead="Unlock Urdais&rsquo; premium analytics and infrastructure data."
    >
      <div className="flex flex-col gap-1">
        <p className="text-3xl font-semibold tracking-tight text-neutral-50">{formatPremiumPrice()}</p>
        <p className="text-xs text-neutral-500">Billed weekly. {PREMIUM_TRIAL_NOTE} Cancel any time.</p>
      </div>

      <PremiumSummary heading="Your subscription includes" />

      {availability.kind === "available" ? (
        <SubscribeButton returnTo={handoff.returnTo} />
      ) : (
        /*
          Deliberately not a disabled button. See the module comment.
        */
        <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-5">
          <p className="text-sm font-medium text-neutral-100">Checkout is not open yet</p>
          <p className="mt-2 text-sm text-neutral-400">
            Subscriptions are not available in this environment yet, so there is nothing to complete on this page. Your
            account is ready, and no charge has been made.
          </p>
        </div>
      )}

      {enforcementActive ? (
        // Premium is gated, so the old "still readable without a subscription"
        // reassurance below would be false. Offer the way back and nothing else.
        handoff.returnTo ? (
          <p className="text-xs text-neutral-500">
            Not now?{" "}
            <Link
              href={handoff.returnTo}
              className="text-neutral-300 underline underline-offset-2 transition-colors hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
            >
              Go back
            </Link>
            .
          </p>
        ) : null
      ) : (
        <p className="text-xs text-neutral-500">
          {handoff.returnTo ? (
            <>
              You came from{" "}
              <Link
                href={handoff.returnTo}
                className="text-neutral-300 underline underline-offset-2 transition-colors hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
              >
                that page
              </Link>
              . It is still readable without a subscription today.
            </>
          ) : (
            <>
              Urdais premium products are still readable without a subscription today.{" "}
              <Link
                href="/markets"
                className="text-neutral-300 underline underline-offset-2 transition-colors hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
              >
                Browse Urdais markets
              </Link>
              .
            </>
          )}
        </p>
      )}
    </OnboardingShell>
  );
}
