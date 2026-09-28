import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/app/auth/auth-shell";
import { LegacyPasswordForm } from "@/app/auth/legacy-password-form";
import { safeReturnTo } from "@/lib/auth/return-to";
import { ONBOARDING_HREF } from "@/lib/onboarding/routes";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * LEGACY password sign-in. Not the customer route.
 *
 * Urdais authenticates passwordlessly at `/access`, and nothing in the product links
 * here. This page survives for two narrow reasons, both stated on it:
 *
 *   - accounts created before the change still have passwords, and deleting the only
 *     path that can use them would strand them;
 *   - it is what lets the authenticated, entitled and signed-out states be verified
 *     end to end without a mailbox.
 *
 * Delete it once no password account remains. The page points anyone who lands here
 * by accident at the real entry point.
 */
export default async function LegacySignInRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.returnTo);

  return (
    <AuthShell
      title="Sign in with a password"
      caption="Urdais now signs you in by email — no password needed. This page is only for accounts created before that change."
    >
      <LegacyPasswordForm returnTo={returnTo} />

      <p className="mt-4 text-xs text-neutral-400">
        Looking for the usual way in?{" "}
        <Link href={ONBOARDING_HREF} className="underline">
          Continue with email
        </Link>
        .
      </p>
    </AuthShell>
  );
}
