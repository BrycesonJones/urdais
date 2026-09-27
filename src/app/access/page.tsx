import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { PremiumSummary } from "@/components/onboarding/premium-summary";
import { onboardingHref, onboardingReturnTo } from "@/lib/onboarding/routes";
import { resolveOnboardingEntry } from "@/lib/onboarding/server";

export const metadata: Metadata = {
  title: "Get full access",
  description: "One Urdais subscription unlocks every premium Urdais product.",
  // Onboarding is not a landing page and has no business in a search index.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The onboarding entry point, and where every premium gate's CTA leads.
 *
 * For an anonymous reader this is the value screen: what a subscription is, what it
 * costs, and an explicit choice between creating an account and logging in. The
 * choice is explicit because Urdais does not tell an anonymous visitor whether their
 * address already has an account — inferring it would be the account-enumeration
 * disclosure Phase 2 avoided.
 *
 * For anyone already signed in, this route decides nothing and renders nothing: it
 * redirects to whichever state their account is actually in. That is what makes a
 * refresh, a back button and a bookmarked `/access` all behave correctly without any
 * stored progress.
 */
export default async function AccessRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = onboardingReturnTo(params.returnTo);

  const resolution = await resolveOnboardingEntry(returnTo);
  if (resolution.kind === "redirect") redirect(resolution.href);

  return (
    <OnboardingShell
      eyebrow="FULL ACCESS"
      title="Get full access to Urdais"
      lead="One subscription unlocks Urdais's premium analytics and infrastructure data."
    >
      <PremiumSummary />

      <div className="flex flex-col gap-3">
        <Link
          href={onboardingHref("create_account", returnTo)}
          className="rounded-md bg-[#526fe0] px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-[#6480e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
        >
          Continue
        </Link>
        <p className="text-center text-xs text-neutral-500">
          Already have an account?{" "}
          <Link
            href={onboardingHref("login", returnTo)}
            className="text-neutral-300 underline underline-offset-2 transition-colors hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
          >
            Log in
          </Link>
        </p>
      </div>
    </OnboardingShell>
  );
}
