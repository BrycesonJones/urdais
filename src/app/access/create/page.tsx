import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { onboardingSignUpAction } from "@/app/access/actions";
import { CredentialsForm } from "@/components/onboarding/credentials-form";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { onboardingHref, onboardingReturnTo } from "@/lib/onboarding/routes";
import { resolveOnboarding } from "@/lib/onboarding/server";

export const metadata: Metadata = {
  title: "Create your Urdais account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Account creation, for an anonymous reader who chose it.
 *
 * Uses Phase 2's `signUpWithPassword` through a Server Action. An authenticated
 * reader who lands here is redirected to their own state rather than shown a signup
 * form — Invariant 3.
 *
 * Creating an account grants nothing. It is not a subscription, and the copy says so
 * rather than letting someone infer otherwise from having "signed up".
 */
export default async function CreateAccountRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = onboardingReturnTo(params.returnTo);

  const resolution = await resolveOnboarding("create_account", returnTo);
  if (resolution.kind === "redirect") redirect(resolution.href);

  return (
    <OnboardingShell
      eyebrow="CREATE ACCOUNT"
      title="Create your Urdais account"
      lead="You'll confirm your email address, then set up payment. An account on its own does not include premium access."
      back={{ href: onboardingHref("intro", returnTo), label: "Back" }}
    >
      <CredentialsForm
        action={onboardingSignUpAction}
        submitLabel="Create account"
        passwordAutoComplete="new-password"
        returnTo={returnTo}
        passwordHint="Use at least 8 characters."
      />

      <p className="text-xs text-neutral-500">
        Already have an account?{" "}
        <Link
          href={onboardingHref("login", returnTo)}
          className="text-neutral-300 underline underline-offset-2 transition-colors hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
        >
          Log in
        </Link>
      </p>
    </OnboardingShell>
  );
}
