import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { PremiumSummary } from "@/components/onboarding/premium-summary";
import { onboardingHref, onboardingReturnTo } from "@/lib/onboarding/routes";
import { resolveCheckoutHandoff } from "@/lib/onboarding/checkout-handoff";
import { resolveOnboarding } from "@/lib/onboarding/server";

export const metadata: Metadata = {
  title: "Ready to continue",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The checkout boundary. Phase 4 ends here.
 *
 * Only an authenticated, verified reader without an entitlement can see this screen,
 * and that is enforced twice on purpose. `resolveOnboarding` decides whether to
 * render it, and `resolveCheckoutHandoff` independently re-derives the same three
 * conditions — because Phase 5 will attach a form action here, and a form submission
 * is a second entry point that must not rely on the page having checked.
 *
 * ## What this screen must never do
 *
 * There is no payment control, because there is no payment. No card fields, no
 * imitation of Stripe Checkout, no "subscribe" button that does nothing, no fake
 * session id, and above all no entitlement: reaching this page writes nothing and
 * grants nothing. A reader who gets here has an account ready for a purchase that
 * cannot yet be made, and the copy says exactly that rather than implying a
 * transaction is one click away.
 *
 * No price either. Onboarding no longer quotes one: what a subscription costs
 * belongs at Plan / Pay, beside the payment it explains, and Phase 5 introduces both
 * together. The summary below says what is included, not what it costs.
 *
 * ## Phase 5
 *
 * Replace the notice below with the real action, built on `resolveCheckoutHandoff`.
 * Its `accountId` is derived from the session; it must not become a hidden form
 * field, or a reader could open a checkout session against someone else's account.
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

  // The same three conditions, re-derived. If these ever disagree with the line
  // above, the safe answer is to send the reader back rather than to render a
  // checkout boundary the handoff would refuse.
  const handoff = await resolveCheckoutHandoff(returnTo);
  if (handoff.kind !== "ready") redirect(onboardingHref("create_account", returnTo));

  return (
    <OnboardingShell
      eyebrow="READY"
      title="You&rsquo;re ready to continue"
      lead="Your Urdais account is set up and ready for premium access."
    >
      <PremiumSummary heading="Your subscription will include" />

      {/*
        Not a button. A disabled control that looks like a payment action invites
        clicking and reads as a bug; a stated fact does not. This is the honest
        boundary, and Phase 5 replaces this block with the real checkout action.
      */}
      <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-5">
        <p className="text-sm font-medium text-neutral-100">Checkout setup coming next</p>
        <p className="mt-2 text-sm text-neutral-400">
          Payment is not available yet, so there is nothing to complete on this page. Your account is ready, and no
          charge has been made.
        </p>
      </div>

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
    </OnboardingShell>
  );
}
