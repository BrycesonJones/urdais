import { permanentRedirect } from "next/navigation";

import { onboardingHref, onboardingReturnTo } from "@/lib/onboarding/routes";

export const dynamic = "force-dynamic";

/**
 * Superseded by onboarding.
 *
 * This was Phase 2's minimal password sign-up form. Urdais authenticates
 * passwordlessly now, so the form is gone rather than hidden — there is no password
 * to collect. The route survives only to carry anyone holding an old link to the
 * account form, with their destination intact.
 */
export default async function LegacySignUpRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  permanentRedirect(onboardingHref("create_account", onboardingReturnTo(params.returnTo)));
}
