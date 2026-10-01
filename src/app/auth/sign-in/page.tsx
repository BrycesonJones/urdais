import { permanentRedirect } from "next/navigation";

import { onboardingHref, onboardingReturnTo } from "@/lib/onboarding/routes";

export const dynamic = "force-dynamic";

/**
 * Superseded by the passwordless sign-in screen.
 *
 * This was Phase 2's password sign-in form, kept as an "operator surface" for
 * accounts created before passwordless authentication. It was not one: premium
 * gates linked their "Sign in" here, so readers with an account were asked for a
 * password Urdais no longer uses, on a page explaining migration history.
 *
 * Phase 7A removed the form. Nothing is stranded by that: a password account signs
 * in with an emailed code like every other account, because the code is sent to an
 * address, not to a credential type. The route survives only to carry anyone
 * holding an old link to `/access/login`, with their destination intact -- the same
 * treatment `/auth/sign-up` already had.
 */
export default async function LegacySignInRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  permanentRedirect(onboardingHref("login", onboardingReturnTo(params.returnTo)));
}
