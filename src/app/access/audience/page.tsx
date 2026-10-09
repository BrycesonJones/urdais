import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AudienceForm } from "@/components/onboarding/audience-form";
import { AnalyticsIdentity } from "@/components/analytics/analytics-identity";
import { PremiumOnboardingShell } from "@/components/onboarding/premium-onboarding-shell";
import { analyticsAccountId } from "@/lib/analytics/identity";
import { onboardingHref, onboardingReturnTo } from "@/lib/onboarding/routes";
import { resolveOnboarding } from "@/lib/onboarding/server";

export const metadata: Metadata = { title: "About you", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AudienceClassificationRoute({ searchParams }: PageProps<"/access/audience">) {
  const params = await searchParams;
  const returnTo = onboardingReturnTo(params.returnTo);
  const resolution = await resolveOnboarding("audience", returnTo);
  if (resolution.kind === "redirect") redirect(resolution.href);

  return (
    <PremiumOnboardingShell label="STEP 2 OF 2">
      <AnalyticsIdentity accountId={analyticsAccountId(resolution.viewer)} />
      <div className="flex w-full flex-1 flex-col justify-center py-10 sm:py-14">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-50 sm:text-4xl">What best describes you?</h1>
        <p className="mt-4 text-base leading-relaxed text-neutral-300 sm:text-lg">
          Help us understand who uses Urdais and how our intelligence supports their work.
        </p>

        <div className="mt-9">
          <AudienceForm returnTo={returnTo} />
        </div>

        <p className="mt-6 text-center text-sm text-neutral-400">
          Already have an account?{" "}
          <Link
            href={onboardingHref("login", returnTo)}
            className="text-neutral-200 underline underline-offset-4 transition-colors hover:text-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
          >
            Sign in
          </Link>
        </p>
        <p className="mt-6 text-center text-sm text-neutral-500 sm:text-base">
          Your selection won&rsquo;t restrict the products you can access.
        </p>
      </div>
    </PremiumOnboardingShell>
  );
}
