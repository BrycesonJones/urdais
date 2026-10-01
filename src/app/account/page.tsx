import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { resolveViewer } from "@/lib/access/server";
import { resolveSupabaseIdentity } from "@/lib/auth/identity";
import { onboardingHref } from "@/lib/onboarding/routes";
import { ACCOUNT_HREF } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * `/account` — PHASE 7A PLACEHOLDER. Phase 7B replaces this page with the account
 * hub for identity and subscription status.
 *
 * It exists now for one reason: the header's account icon must never send a
 * signed-in reader through sign-in again. So this page does exactly two things:
 *
 *   - an anonymous reader is sent to sign in, with this page as the destination;
 *   - a signed-in reader is told they are signed in, and can sign out.
 *
 * Deliberately absent until Phase 7B: profile fields, subscription status, billing,
 * Stripe, and any wording that depends on entitlement. A reader with an active
 * subscription, a canceled one, a `past_due` one or none at all sees the same page,
 * because they all have the same thing here -- a valid Urdais account. Account
 * identity and premium entitlement are separate; being refused premium is never a
 * reason to sign in again.
 *
 * The decision is the server's: `resolveViewer` is the same authoritative session ->
 * account lookup every premium surface uses. Nothing is read from the request.
 */
export default async function AccountRoute() {
  const viewer = await resolveViewer();
  if (viewer.authentication.kind !== "authenticated") redirect(onboardingHref("login", ACCOUNT_HREF));

  // The address for display only, from the Auth server -- the same source the email
  // challenge uses. Absent for an account with no email, in which case it is omitted.
  const identity = await resolveSupabaseIdentity();
  const email = identity.kind === "authenticated" ? identity.identity.email : null;

  return (
    <OnboardingShell title="Account">
      <p className="text-sm text-neutral-300">
        {email ? (
          <>
            You&rsquo;re signed in as <span className="font-medium break-all text-neutral-50">{email}</span>.
          </>
        ) : (
          <>You&rsquo;re signed in.</>
        )}
      </p>

      {/*
        No `returnTo`: signing out lands on the home page, which is public and so
        cannot bounce the reader into a sign-in screen.
      */}
      <form action={signOutAction}>
        <button
          type="submit"
          className="rounded-md border border-white/15 px-4 py-2.5 text-sm font-medium text-neutral-100 transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
        >
          Sign out
        </button>
      </form>
    </OnboardingShell>
  );
}
