"use client";

import { useActionState } from "react";

import { signInAction } from "@/app/auth/actions";
import { IDLE_AUTH_STATE } from "@/app/auth/form-state";

/**
 * LEGACY. The password sign-in form, for operators and pre-existing accounts.
 *
 * Not part of the customer journey and linked from nowhere in it. Urdais
 * authenticates passwordlessly; this exists because accounts created before that
 * change still have passwords, and because it is what lets the authenticated and
 * entitled states be exercised without a mailbox.
 *
 * Delete it once no password account remains.
 */
export function LegacyPasswordForm({ returnTo }: { returnTo: string }) {
  const [state, formAction, pending] = useActionState(signInAction, IDLE_AUTH_STATE);
  const failed = state.status === "error";

  return (
    <form action={formAction} className="flex flex-col gap-4" aria-describedby={failed ? "legacy-error" : undefined}>
      <input type="hidden" name="returnTo" value={returnTo} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-300">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          aria-invalid={failed || undefined}
          className="rounded border border-white/15 bg-black/30 px-3 py-2 text-neutral-100 outline-none focus-visible:border-[#526fe0]"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-300">Password</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          aria-invalid={failed || undefined}
          className="rounded border border-white/15 bg-black/30 px-3 py-2 text-neutral-100 outline-none focus-visible:border-[#526fe0]"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded bg-[#526fe0] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Working…" : "Sign in"}
      </button>

      {failed ? (
        <p id="legacy-error" role="alert" className="text-sm text-red-300">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
