import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { onboardingLoginAction } from "@/app/access/actions";
import { CredentialsForm } from "@/components/onboarding/credentials-form";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { onboardingHref, onboardingReturnTo } from "@/lib/onboarding/routes";
import { resolveOnboarding } from "@/lib/onboarding/server";

export const metadata: Metadata = {
  title: "Log in to Urdais",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Log in, for an existing reader inside the onboarding journey.
 *
 * Uses Phase 2's `signInWithPassword`. Logging in proves who someone is and nothing
 * about what they may read: the next screen is decided by their account's actual
 * entitlement and verification state, not by the fact that authentication succeeded.
 */
export default async function OnboardingLoginRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = onboardingReturnTo(params.returnTo);

  const resolution = await resolveOnboarding("login", returnTo);
  if (resolution.kind === "redirect") redirect(resolution.href);

  return (
    <OnboardingShell
      eyebrow="LOG IN"
      title="Log in to Urdais"
      lead="Use the email and password for your Urdais account."
      back={{ href: onboardingHref("intro", returnTo), label: "Back" }}
    >
      <CredentialsForm
        action={onboardingLoginAction}
        submitLabel="Log in"
        passwordAutoComplete="current-password"
        returnTo={returnTo}
      />

      <p className="text-xs text-neutral-500">
        No account yet?{" "}
        <Link
          href={onboardingHref("create_account", returnTo)}
          className="text-neutral-300 underline underline-offset-2 transition-colors hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
        >
          Create one
        </Link>
      </p>
    </OnboardingShell>
  );
}
