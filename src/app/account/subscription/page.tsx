import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { resolveSupabaseIdentity } from "@/lib/auth/identity";
import { onboardingHref } from "@/lib/onboarding/routes";
import { ACCOUNT_HREF, ACCOUNT_SUBSCRIPTION_HREF } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Manage subscription",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * `/account/subscription` — PHASE 7C SEAM.
 *
 * Where the Account Hub's "Manage subscription" leads. In Phase 7B it says
 * plainly that managing a subscription from the account is not available yet, and
 * does nothing else: no Stripe call, no Customer lookup, no billing write, and no
 * homegrown cancel / change-card / invoice control.
 *
 * Phase 7C replaces this page's implementation with the Stripe Customer Portal
 * handoff (`startBillingPortal` in `@/lib/billing/checkout` already exists), its
 * return path back to `/account`, and the reconciliation that follows a Portal
 * change. The route and the hub's link to it are meant to stay.
 *
 * Authenticated-only, like `/account`. It shows nothing account-specific, but a
 * signed-out reader has no subscription to manage, and the identity check costs one
 * Auth round trip -- no database read.
 */
export default async function ManageSubscriptionRoute() {
  const identity = await resolveSupabaseIdentity();
  if (identity.kind !== "authenticated") redirect(onboardingHref("login", ACCOUNT_SUBSCRIPTION_HREF));

  return (
    <OnboardingShell title="Manage subscription">
      <p className="text-sm text-neutral-300">
        Managing your subscription from your Urdais account isn&rsquo;t available yet. Nothing has been changed.
      </p>
      <p className="text-sm text-neutral-400">
        If you need to change or cancel your subscription before then,{" "}
        <Link
          href="/contact"
          className="text-neutral-200 underline underline-offset-2 transition-colors hover:text-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
        >
          contact us
        </Link>
        .
      </p>
      <Link
        href={ACCOUNT_HREF}
        className="self-start text-sm text-neutral-300 underline underline-offset-2 transition-colors hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
      >
        Back to Account
      </Link>
    </OnboardingShell>
  );
}
