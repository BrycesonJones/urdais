import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ResendVerification } from "@/components/onboarding/resend-verification";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { resolveSupabaseIdentity } from "@/lib/auth/identity";
import { onboardingHref, onboardingReturnTo } from "@/lib/onboarding/routes";
import { readPendingEmail } from "@/lib/onboarding/pending-email";
import { resolveOnboarding } from "@/lib/onboarding/server";

export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Verification required.
 *
 * Reached two ways, and they differ in whether a session exists:
 *
 *   - straight after signup, where Supabase issued no session because it requires
 *     confirmation first. The address comes from the server's short-lived record of
 *     the pending signup.
 *   - as a signed-in reader whose address is still unconfirmed. The address comes
 *     from the Auth server itself, which is authoritative.
 *
 * Either way the verification *state* is never taken from this page, a cookie or a
 * form. It is `email_confirmed_at` on the Auth server, read through
 * `resolveViewer`, and it is what decides whether this screen is shown at all.
 *
 * Note the deliberate absence: there is no "I've verified" button. A reader cannot
 * assert their own verification, and a button that re-checked would only be a
 * refresh with extra steps — refreshing already resolves the live state.
 */
export default async function VerifyEmailRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = onboardingReturnTo(params.returnTo);

  const resolution = await resolveOnboarding("verification_required", returnTo);

  // An anonymous reader is normally redirected away -- except immediately after
  // signup, which is exactly this state with no session yet. The pending record is
  // what distinguishes "just signed up" from "wandered in".
  const pending = await readPendingEmail();
  if (resolution.kind === "redirect" && !pending) redirect(resolution.href);

  // Authoritative where a session exists; the pending record otherwise. Never a
  // query parameter, which would let a link name anyone's address.
  const identity = resolution.kind === "render" ? await resolveSupabaseIdentity() : null;
  const email = (identity?.kind === "authenticated" ? identity.identity.email : null) ?? pending;

  return (
    <OnboardingShell
      eyebrow="VERIFY EMAIL"
      title="Verify your email"
      lead={
        email
          ? undefined
          : "Open the verification link we sent you to finish setting up your Urdais account."
      }
    >
      {email ? (
        <p className="text-sm text-neutral-300">
          We&rsquo;ve sent a verification link to{" "}
          <span className="font-medium break-all text-neutral-50">{email}</span>. Open the link in that email to verify
          your Urdais account.
        </p>
      ) : null}

      <ResendVerification returnTo={returnTo} />

      <div className="flex flex-col gap-2 border-t border-white/10 pt-5 text-xs text-neutral-500">
        <p>
          Wrong address, or want to start again?{" "}
          <Link
            href={onboardingHref("create_account", returnTo)}
            className="text-neutral-300 underline underline-offset-2 transition-colors hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
          >
            Use a different email
          </Link>
        </p>
        <p>
          Already verified on another device?{" "}
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
