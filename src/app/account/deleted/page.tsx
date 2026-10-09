import type { Metadata } from "next";
import Link from "next/link";

import { AnalyticsIdentity } from "@/components/analytics/analytics-identity";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";

export const metadata: Metadata = {
  title: "Account deleted",
  robots: { index: false, follow: false },
};

/**
 * After a completed deletion. Public and static: it reads no session and shows
 * nothing about the deleted account. It says what is retained rather than
 * implying financial records were erased.
 */
export default function AccountDeletedRoute() {
  return (
    <OnboardingShell title="Your Urdais account has been deleted.">
      {/* Forget the deleted account in analytics; the next visit is anonymous. */}
      <AnalyticsIdentity accountId={null} />
      <p className="text-sm text-neutral-300">
        You&rsquo;ve been signed out. A minimal record of past billing is kept, detached from any account, as
        financial records require.
      </p>
      <Link
        href="/"
        className="self-start text-sm text-neutral-300 underline underline-offset-2 transition-colors hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
      >
        Go to Urdais
      </Link>
    </OnboardingShell>
  );
}
