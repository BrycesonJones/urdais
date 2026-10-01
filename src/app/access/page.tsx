import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthDivider } from "@/components/onboarding/auth-divider";
import { EmailForm } from "@/components/onboarding/email-form";
import { GoogleButton } from "@/components/onboarding/google-button";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { isGoogleAuthAvailable } from "@/lib/auth/google";
import { onboardingHref, onboardingReturnTo } from "@/lib/onboarding/routes";
import { resolveOnboardingEntry } from "@/lib/onboarding/server";

export const metadata: Metadata = {
  title: "Create your account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * `/access` — the canonical onboarding entry point, and the account form itself.
 *
 * The premium gate already established intent: someone who pressed "Get Full
 * Access" has decided. So this is the form, not a screen asking them to press
 * Continue to reach the form. There is no price here either — what a subscription
 * costs belongs at Plan / Pay, next to the payment it explains. And no eyebrow, lead
 * or note about passwords: the screen is the same shape as "Sign in to Urdais", one
 * email field and "Send code", under its own heading.
 *
 * For anyone with a session this route renders nothing and redirects to whichever
 * state their account implies, which is what makes `/access` canonical rather than
 * merely first: a bookmark, a stale link and a fresh click all resolve correctly.
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

  // Server-resolved, and absent rather than disabled when Google is unconfigured.
  const google = await isGoogleAuthAvailable();

  return (
    <OnboardingShell title="Create your account">
      {google ? (
        <>
          <GoogleButton returnTo={returnTo} />
          <AuthDivider />
        </>
      ) : null}

      <EmailForm returnTo={returnTo} />

      <p className="text-sm text-neutral-400">
        Already have an account?{" "}
        <Link
          href={onboardingHref("login", returnTo)}
          className="text-neutral-200 underline underline-offset-2 transition-colors hover:text-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
        >
          Sign in
        </Link>
      </p>
    </OnboardingShell>
  );
}
