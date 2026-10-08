import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PremiumOnboardingShell } from "@/components/onboarding/premium-onboarding-shell";
import { onboardingHref, onboardingReturnTo } from "@/lib/onboarding/routes";
import { resolveOnboarding } from "@/lib/onboarding/server";

export const metadata: Metadata = { title: "Discover Full Access", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const PRODUCTS = [
  ["Compute Economics", "GPU rental economics, payback, and operating assumptions."],
  ["Power Analytics", "Electricity demand, grid constraints, and power delivery."],
  ["Infrastructure Maps", "GPU compute clusters, power infrastructure, and semiconductor fabs."],
  ["Market Intelligence", "Connected analytics for understanding AI infrastructure markets."],
] as const;

export default async function DiscoverFullAccessRoute({ searchParams }: PageProps<"/access/discover">) {
  const params = await searchParams;
  const returnTo = onboardingReturnTo(params.returnTo);
  const resolution = await resolveOnboarding("discover", returnTo);
  if (resolution.kind === "redirect") redirect(resolution.href);

  return (
    <PremiumOnboardingShell label="FULL ACCESS">
      <div className="flex flex-1 flex-col py-10 sm:py-14">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-50 sm:text-4xl lg:text-5xl">
            Intelligence for the Information Age.
          </h1>
          <p className="mt-4 max-w-5xl text-base leading-relaxed text-neutral-300 sm:text-lg">
            Unlock advanced analytics and infrastructure intelligence across the markets powering artificial intelligence.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:mt-10 md:grid-cols-2">
          {PRODUCTS.map(([title, description]) => (
            <article key={title} className="rounded-xl border border-white/15 bg-white/[0.04] p-5 sm:p-6">
              <h2 className="text-xl font-medium text-neutral-100 sm:text-2xl">{title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400 sm:text-base">{description}</p>
            </article>
          ))}
        </div>

        <Link
          href={onboardingHref("audience", returnTo)}
          className="mt-8 rounded-lg bg-[#526fe0] px-5 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-[#6480e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff] sm:text-base"
        >
          Continue
        </Link>
      </div>
    </PremiumOnboardingShell>
  );
}

