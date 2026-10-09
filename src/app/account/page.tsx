import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FinishDeletionForm } from "@/components/account/deletion-forms";
import { SignOutForm } from "@/components/account/sign-out-form";
import { AnalyticsIdentity } from "@/components/analytics/analytics-identity";
import { ManageSubscriptionButton } from "@/components/billing/manage-subscription-button";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { formatPremiumPrice } from "@/lib/access/pricing";
import { resolveAccountHub, type AccountProfile } from "@/lib/account/hub";
import { ACCOUNT_PLAN_NAME, type AccountAction, type SubscriptionPresentation } from "@/lib/account/subscription-presentation";
import { onboardingHref } from "@/lib/onboarding/routes";
import { ACCOUNT_DELETE_HREF, ACCOUNT_HREF } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * `/account` — the Account Hub.
 *
 * The reader's Urdais account: who they are signed in as, and what their
 * subscription is doing. Two sections, Profile and Subscription, and nothing else.
 *
 * Everything comes from `resolveAccountHub`, server-side. Nothing is read from the
 * request -- no account id, no Stripe id, no status -- so there is no input that
 * could point this page at somebody else's account.
 *
 * ## What it is not
 *
 * - **Not authorization.** The subscription section displays billing state;
 *   whether premium products open is decided by the entitlement, through
 *   `canAccess`, on every premium surface. Nothing rendered here grants anything.
 * - **Not a billing UI.** Viewing it makes no Stripe call and writes no billing
 *   state. Subscribe links to Plan / Pay, the canonical purchase path. Manage
 *   subscription / Manage billing open Stripe's hosted Customer Portal for the
 *   account's existing Customer (`openBillingPortalAction`), which returns here.
 *   Returning from the Portal changes nothing by itself: this page reads the
 *   webhook-reconciled state, and the entitlement decides access.
 * - **Delete account** (Phase 7D) is a separate, visually destructive section
 *   at the bottom. It links to `/account/delete` for step-up and the typed
 *   confirmation; nothing destructive happens on this page. A deletion already
 *   past billing termination replaces the page with a "finish deleting" state.
 *
 * An authenticated account without premium is a valid Urdais account, and this
 * page treats it as one: it is never sent to sign in, and never to Plan / Pay
 * merely for lacking premium.
 */
export default async function AccountRoute() {
  const hub = await resolveAccountHub();
  if (hub.kind === "anonymous") redirect(onboardingHref("login", ACCOUNT_HREF));

  if (hub.kind === "deletion_pending") {
    return (
      <OnboardingShell title="Account">
        <section aria-labelledby="account-deletion-pending" className="flex flex-col gap-4">
          <h2 id="account-deletion-pending" className={sectionHeading}>
            Account deletion in progress
          </h2>
          <p className="text-sm text-neutral-300">
            Your subscription has been canceled and your premium access has ended, but deleting your account didn&rsquo;t
            finish. Finish it now.
          </p>
          <FinishDeletionForm />
        </section>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell title="Account">
      {hub.kind === "ready" ? <AnalyticsIdentity accountId={hub.accountId} /> : null}
      <ProfileSection profile={hub.profile} />
      {hub.kind === "ready" ? (
        <SubscriptionSection subscription={hub.subscription} action={hub.action} />
      ) : (
        <SubscriptionSection subscription={{ kind: "unavailable", reason: "read_failed" }} action={null} />
      )}
      <DeleteAccountSection />
    </OnboardingShell>
  );
}

const sectionHeading = "text-xs font-semibold tracking-[0.18em] text-neutral-400 uppercase";
const linkFocus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]";

function ProfileSection({ profile }: { profile: AccountProfile }) {
  return (
    <section aria-labelledby="account-profile" className="flex flex-col gap-4">
      <h2 id="account-profile" className={sectionHeading}>
        Profile
      </h2>

      <dl className="flex flex-col gap-1">
        <dt className="text-xs text-neutral-500">Email</dt>
        <dd className="flex flex-wrap items-baseline gap-x-2 text-sm text-neutral-100">
          {/* `ph-no-capture`: analytics autocapture never records this element or its text. */}
          <span className="ph-no-capture font-medium break-all">{profile.email ?? "No email on this account"}</span>
          {profile.email ? (
            <span className="text-xs text-neutral-500">{profile.emailVerified ? "Verified" : "Not verified"}</span>
          ) : null}
        </dd>
      </dl>

      {/*
        No `returnTo`: signing out lands on the public home page, which cannot loop.
        `SignOutForm` is the same Server Action, plus an analytics identity reset.
      */}
      <SignOutForm>
        <button
          type="submit"
          className={`rounded-md border border-white/15 px-3.5 py-2 text-sm text-neutral-200 transition-colors hover:bg-white/5 hover:text-neutral-50 ${linkFocus}`}
        >
          Sign out
        </button>
      </SignOutForm>
    </section>
  );
}

/** Status words and the sentence under them, one entry per presentation state. */
function describe(subscription: SubscriptionPresentation): { plan: boolean; status: string; detail: string } {
  switch (subscription.kind) {
    case "none":
      return {
        plan: false,
        status: "No active subscription",
        detail: `Get full access to Urdais premium products for ${formatPremiumPrice()}.`,
      };
    case "active":
      if (subscription.cancellationScheduled) {
        // Still entitled: Stripe keeps the subscription active until the paid
        // period ends, and so does the entitlement. Access has not ended yet.
        return {
          plan: true,
          status: subscription.endsAt ? `Active until ${formatDate(subscription.endsAt)}` : "Active",
          detail: subscription.endsAt
            ? "Cancellation scheduled. You have premium access until then."
            : "Cancellation scheduled. You have premium access until the end of the current billing period.",
        };
      }
      return { plan: true, status: "Active", detail: "You have premium access." };
    case "complimentary":
      return { plan: true, status: "Active", detail: "Premium access is included with your account." };
    case "canceled":
      return { plan: true, status: "Canceled", detail: "Your premium access has ended." };
    case "payment_issue":
      return {
        plan: true,
        status: "Payment issue",
        detail:
          subscription.status === "incomplete"
            ? "Premium access is currently unavailable because the first payment did not complete."
            : "Premium access is currently unavailable because the latest payment did not go through. Update your payment method in billing management; access returns once the payment succeeds.",
      };
    case "paused":
      return { plan: true, status: "Paused", detail: "Premium access is currently unavailable." };
    case "unavailable":
      return {
        plan: false,
        status: "Status unavailable",
        detail: "We couldn’t load your subscription right now. Nothing about it has changed. Try again shortly.",
      };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function SubscriptionSection({ subscription, action }: { subscription: SubscriptionPresentation; action: AccountAction | null }) {
  const { plan, status, detail } = describe(subscription);
  const price = subscription.kind === "active" ? subscription.priceLabel : null;

  return (
    <section aria-labelledby="account-subscription" className="flex flex-col gap-4 border-t border-white/10 pt-6">
      <h2 id="account-subscription" className={sectionHeading}>
        Subscription
      </h2>

      <div className="flex flex-col gap-1">
        {plan ? <p className="text-sm font-medium text-neutral-50">{ACCOUNT_PLAN_NAME}</p> : null}
        <p className="text-sm text-neutral-100">
          {/* Status is words, never a colour alone. */}
          <span data-testid="subscription-status">{status}</span>
          {price ? <span className="text-neutral-400"> · {price}</span> : null}
        </p>
        <p className="mt-1 text-sm text-neutral-400">{detail}</p>
      </div>

      {action ? <ActionControl action={action} /> : null}
    </section>
  );
}

function ActionControl({ action }: { action: AccountAction }) {
  if (action.kind === "subscribe") {
    // A link, not a form: it goes to Plan / Pay, which quotes the price and holds
    // the canonical Subscribe control. Nothing is created until the reader presses
    // that. Plan / Pay is addressed directly because `/access?returnTo=/account`
    // sends a signed-in reader back here.
    return (
      <Link
        href={onboardingHref("ready_for_checkout", ACCOUNT_HREF)}
        className={`self-start rounded-md bg-[#526fe0] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#6480e8] ${linkFocus}`}
      >
        {action.label}
      </Link>
    );
  }

  // Stripe's hosted Portal for this account's existing Customer, resolved on the
  // server. Returns to /account.
  return <ManageSubscriptionButton label={action.label} />;
}

/**
 * The destructive area. Separated from everything above it by spacing, a border
 * and red treatment, and it only links onward: the step-up check and the typed
 * confirmation happen on `/account/delete`. It duplicates no cancellation control.
 */
function DeleteAccountSection() {
  return (
    <section aria-labelledby="account-delete" className="mt-6 flex flex-col gap-3 rounded-md border border-red-500/30 p-4">
      <h2 id="account-delete" className="text-sm font-semibold text-red-300">
        Delete account
      </h2>
      <p className="text-sm text-neutral-400">Permanently delete your Urdais account and account data.</p>
      <p className="text-sm text-neutral-400">
        If you have an active subscription, it will be canceled immediately and you&rsquo;ll lose access to Urdais
        Premium. Any remaining paid access will be forfeited. This cannot be undone.
      </p>
      <Link
        href={ACCOUNT_DELETE_HREF}
        className="self-start rounded-md border border-red-500/60 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
      >
        Delete account
      </Link>
    </section>
  );
}
