import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DeleteConfirmForm, StepUpForm } from "@/components/account/deletion-forms";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { accountDeletionAvailable } from "@/lib/account/deletion";
import { resolveAccountHub } from "@/lib/account/hub";
import type { SubscriptionPresentation } from "@/lib/account/subscription-presentation";
import { checkRecentAuthentication } from "@/lib/auth/recent-auth";
import { resolveSupabaseIdentity } from "@/lib/auth/identity";
import { onboardingHref } from "@/lib/onboarding/routes";
import { ACCOUNT_DELETE_HREF, ACCOUNT_HREF } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Delete account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * `/account/delete` — step-up, then the destructive confirmation.
 *
 * Reached from the Account Hub's Delete account section. Everything here is
 * resolved from the session: whether deletion is available on this deployment,
 * whether this session authenticated in the last 15 minutes, and what the
 * reader's subscription is doing (for the warning). Rendering it changes nothing.
 */
export default async function DeleteAccountRoute() {
  const resolution = await resolveSupabaseIdentity();
  if (resolution.kind !== "authenticated") redirect(onboardingHref("login", ACCOUNT_DELETE_HREF));

  const hub = await resolveAccountHub();
  if (hub.kind === "anonymous") redirect(onboardingHref("login", ACCOUNT_DELETE_HREF));
  // Past billing termination, the account page is where it finishes.
  if (hub.kind === "deletion_pending") redirect(ACCOUNT_HREF);

  const back = (
    <Link href={ACCOUNT_HREF} className="self-start text-sm text-neutral-300 underline underline-offset-2 transition-colors hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]">
      Keep my account
    </Link>
  );

  if (!accountDeletionAvailable()) {
    return (
      <OnboardingShell title="Delete account">
        <p className="text-sm text-neutral-300">Account deletion isn&rsquo;t available right now. Your account has not been changed.</p>
        {back}
      </OnboardingShell>
    );
  }

  const recent = await checkRecentAuthentication(resolution.identity.subject);
  const email = resolution.identity.email;

  if (recent.kind !== "recent") {
    return (
      <OnboardingShell title="Confirm it&rsquo;s you">
        <p className="text-sm text-neutral-300">
          Deleting your account needs a recent sign-in. We&rsquo;ll email a verification code to your account&rsquo;s
          address; enter it here to continue.
        </p>
        {email && recent.kind === "stale" ? (
          <StepUpForm email={email} />
        ) : (
          <p className="text-sm text-neutral-400">Verification isn&rsquo;t available right now. Your account has not been changed.</p>
        )}
        {back}
      </OnboardingShell>
    );
  }

  const subscription = hub.kind === "ready" ? hub.subscription : null;

  return (
    <OnboardingShell title="Delete account">
      <div className="flex flex-col gap-3 rounded-md border border-red-500/40 bg-red-950/20 p-4 text-sm text-neutral-200" role="note" aria-label="What deleting your account does">
        <p>Your Urdais account and account data will be permanently deleted. This cannot be undone.</p>
        {warningsFor(subscription).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <DeleteConfirmForm />
      {back}
    </OnboardingShell>
  );
}

/**
 * State-specific consequences. Never an invoice warning for a reader who has no
 * unpaid invoice; never "nothing to cancel" when the state could not be read.
 */
function warningsFor(subscription: SubscriptionPresentation | null): string[] {
  const forfeit =
    "Your subscription will be canceled immediately and you’ll lose access to Urdais Premium. Any remaining paid access will be forfeited, and no refund is issued.";
  if (!subscription) return [forfeit];
  switch (subscription.kind) {
    case "none":
    case "canceled":
      return [];
    case "complimentary":
      return ["Your premium access will end immediately."];
    case "active":
      return subscription.cancellationScheduled
        ? [
            "Your subscription is already set to end at the close of the current billing period. Deleting your account cancels it immediately instead: access ends now, the remaining paid time is forfeited, and no refund is issued.",
          ]
        : [forfeit];
    case "payment_issue":
      return [
        "Your subscription will be canceled immediately, so no further billing periods will be charged.",
        "An unpaid invoice is not forgiven by deleting your account. It remains outstanding; Stripe stops retrying the payment automatically.",
      ];
    case "paused":
    case "unavailable":
      return [forfeit];
  }
}
