import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { MARKETS_HREF } from "@/lib/routes";
import { onboardingReturnTo } from "@/lib/onboarding/routes";
import { resolveOnboarding } from "@/lib/onboarding/server";

export const metadata: Metadata = {
  title: "You already have full access",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The reader already subscribes.
 *
 * Shown instead of any part of the purchase journey. Once Stripe exists this is what
 * stops a second subscription being created by someone who followed a stale "Get
 * Full Access" link or pressed back — which is the ordinary way duplicate
 * subscriptions happen, and a refund conversation rather than a bug report.
 *
 * So there is deliberately no signup, no login, no verification prompt and no
 * checkout action here. The only thing offered is the way onward, using the
 * destination they arrived with where there is one.
 */
export default async function AlreadySubscribedRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = onboardingReturnTo(params.returnTo);

  const resolution = await resolveOnboarding("already_entitled", returnTo);
  if (resolution.kind === "redirect") redirect(resolution.href);

  const destination = returnTo ?? MARKETS_HREF;

  return (
    <OnboardingShell
      eyebrow="FULL ACCESS"
      title="You already have full access"
      lead="Your Urdais subscription already includes every premium product."
    >
      <Link
        href={destination}
        className="rounded-md bg-[#526fe0] px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-[#6480e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
      >
        {returnTo ? "Continue to where you were" : "Continue to Urdais"}
      </Link>
    </OnboardingShell>
  );
}
