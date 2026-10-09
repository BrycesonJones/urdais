"use client";

import type { ReactNode } from "react";

import { signOutAction } from "@/app/auth/actions";
import { resetIdentity } from "@/lib/analytics/client";

/**
 * The sign-out form, which also forgets the account in analytics.
 *
 * The reset runs on submit, before the Server Action signs out and redirects, so
 * whatever the next page is, PostHog is already anonymous. Sign-out itself is
 * unchanged: the same Server Action, the same redirect.
 */
export function SignOutForm({ children }: { children: ReactNode }) {
  return (
    <form action={signOutAction} onSubmit={() => resetIdentity()}>
      {children}
    </form>
  );
}
