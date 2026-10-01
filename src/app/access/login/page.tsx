import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthDivider } from "@/components/onboarding/auth-divider";
import { EmailForm } from "@/components/onboarding/email-form";
import { GoogleButton } from "@/components/onboarding/google-button";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { isGoogleAuthAvailable } from "@/lib/auth/google";
import { onboardingHref, onboardingReturnTo } from "@/lib/onboarding/routes";
import { resolveOnboarding } from "@/lib/onboarding/server";

export const metadata: Metadata = {
  title: "Sign in to Urdais",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Sign in — the same primitive as account creation, under a different heading.
 *
 * One task: an email address and "Send code". No password, no explanation of how
 * Urdais used to authenticate, and no eyebrow or lead repeating the heading. It is
 * reached from the header's account icon (with `/account` as the destination) and
 * from a premium gate's "Sign in" (with the premium page as the destination).
 *
 * The distinction is orientation, not mechanism: both screens email a one-time
 * verification code, and the call is identical. That identity is the anti-enumeration
 * property. A login screen that behaved differently for an address with no account
 * would answer "does this person have a Urdais account" to anyone who asked.
 *
 * Which is also why the two screens are never swapped automatically. Detecting that
 * an address is unknown and switching the reader to "create account" would disclose
 * exactly what the identical call protects.
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

  const google = await isGoogleAuthAvailable();

  return (
    <OnboardingShell title="Sign in to Urdais">
      {google ? (
        <>
          <GoogleButton returnTo={returnTo} />
          <AuthDivider />
        </>
      ) : null}

      <EmailForm returnTo={returnTo} submitLabel="Send code" />

      <p className="text-sm text-neutral-400">
        Don&rsquo;t have an account?{" "}
        <Link
          href={onboardingHref("create_account", returnTo)}
          className="text-neutral-200 underline underline-offset-2 transition-colors hover:text-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
        >
          Create account
        </Link>
      </p>
    </OnboardingShell>
  );
}
