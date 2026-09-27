import type { Metadata } from "next";

import { signInAction } from "@/app/auth/actions";
import { AuthForm } from "@/app/auth/auth-form";
import { AuthShell } from "@/app/auth/auth-shell";
import { safeReturnTo } from "@/lib/auth/return-to";

export const metadata: Metadata = {
  title: "Sign in",
  // Authentication routes have no business in a search index.
  robots: { index: false, follow: false },
};

/** Minimal sign-in. See `auth-form.tsx`: Phase 4 replaces this surface. */
export default async function SignInRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.returnTo);

  return (
    <AuthShell title="Sign in" caption="Urdais accounts are free. A subscription is not yet available.">
      <AuthForm action={signInAction} submitLabel="Sign in" returnTo={returnTo} passwordAutoComplete="current-password" />
      <p className="mt-4 text-xs text-neutral-400">
        No account? <a className="underline" href={`/auth/sign-up?returnTo=${encodeURIComponent(returnTo)}`}>Create one</a>.
      </p>
    </AuthShell>
  );
}
