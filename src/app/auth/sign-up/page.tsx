import type { Metadata } from "next";

import { signUpAction } from "@/app/auth/actions";
import { AuthForm } from "@/app/auth/auth-form";
import { AuthShell } from "@/app/auth/auth-shell";
import { safeReturnTo } from "@/lib/auth/return-to";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: false },
};

/** Minimal account creation. See `auth-form.tsx`: Phase 4 replaces this surface. */
export default async function SignUpRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.returnTo);

  return (
    <AuthShell title="Create an account" caption="An account does not grant access to premium products. Nothing is for sale yet.">
      <AuthForm
        action={signUpAction}
        submitLabel="Create account"
        hint="You will receive an email to confirm your address."
        returnTo={returnTo}
        passwordAutoComplete="new-password"
      />
      <p className="mt-4 text-xs text-neutral-400">
        Already have one? <a className="underline" href={`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>Sign in</a>.
      </p>
    </AuthShell>
  );
}
