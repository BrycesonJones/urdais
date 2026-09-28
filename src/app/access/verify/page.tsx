import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { useDifferentEmailAction } from "@/app/access/actions";
import { ResendLink } from "@/components/onboarding/resend-link";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { resolveSupabaseIdentity } from "@/lib/auth/identity";
import { onboardingHref, onboardingReturnTo } from "@/lib/onboarding/routes";
import { readPendingEmail } from "@/lib/onboarding/pending-email";
import { resolveOnboarding } from "@/lib/onboarding/server";

export const metadata: Metadata = {
  title: "Check your email",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The authentication challenge: a sign-in link has been emailed and is waiting.
 *
 * Under passwordless authentication this is not a verification notice bolted onto a
 * password account — the link **is** the credential. Opening it proves the reader
 * controls the mailbox and establishes the session in one step, which is why
 * `/auth/confirm` needs no separate verification afterwards.
 *
 * Reached by two kinds of reader, and they differ in whether a session exists:
 *
 *   - **anonymous**, the ordinary case: the link is what will create their session,
 *     so there is nothing to resolve yet. The address comes from the server's
 *     short-lived record of the pending request.
 *   - **signed in but unconfirmed**: only possible for a legacy password account.
 *     The address comes from the Auth server, which is authoritative, and one
 *     emailed link both confirms it and signs them in.
 *
 * There is deliberately no "I've verified" control. A reader cannot assert their own
 * authentication, and a button that re-checked would be a refresh with extra steps —
 * refreshing already resolves the live state.
 */
export default async function CheckEmailRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = onboardingReturnTo(params.returnTo);

  const resolution = await resolveOnboarding("email_challenge", returnTo);

  const pending = await readPendingEmail();
  const identity = await resolveSupabaseIdentity();
  const email = (identity.kind === "authenticated" ? identity.identity.email : null) ?? pending;

  // The screen exists to say "a link is waiting at this address". Without an address
  // there is nothing to say, so someone who arrived here directly -- a stale link, a
  // typed URL, a cleared cookie -- is sent to the form rather than shown an empty
  // instruction. `email_challenge` is a legitimate anonymous state, so the state
  // machine alone cannot make this call; having something pending is what separates
  // "just asked for a link" from "wandered in".
  if (!email) redirect(onboardingHref("create_account", returnTo));

  // An authenticated reader who does not belong here at all -- verified, or entitled
  // -- still goes wherever their account says.
  if (resolution.kind === "redirect" && identity.kind === "authenticated") redirect(resolution.href);

  return (
    <OnboardingShell
      eyebrow="CHECK YOUR EMAIL"
      title="Check your email"
    >
      <p className="text-sm text-neutral-300">
        We sent a secure sign-in link to{" "}
        <span className="font-medium break-all text-neutral-50">{email}</span>. Open the link to continue.
      </p>

      <ResendLink returnTo={returnTo} />

      <div className="flex flex-col gap-2 border-t border-white/10 pt-5 text-xs text-neutral-500">
        {/*
          A form rather than a link: changing the address clears the server's pending
          record, which a navigation cannot do.
        */}
        <form action={useDifferentEmailAction}>
          {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
          <button
            type="submit"
            className="text-neutral-300 underline underline-offset-2 transition-colors hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
          >
            Use a different email
          </button>
        </form>

        <p>
          Already signed in on another device?{" "}
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
