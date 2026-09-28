"use client";

import { useActionState } from "react";

import { resendSignInLinkAction } from "@/app/access/actions";
import { IDLE_AUTH_STATE } from "@/app/auth/form-state";

/**
 * "Resend email".
 *
 * The address is deliberately not a field: it comes from the server's record of the
 * pending sign-in. A form that accepted an arbitrary address would let anyone use
 * Urdais to mail anyone.
 *
 * `pending` disables the button while the action is in flight, which stops an
 * impatient double-click becoming two provider calls and a rate-limit refusal.
 * Supabase's own limit is the real ceiling; this is politeness.
 */
export function ResendLink({ returnTo }: { returnTo: string | null }) {
  const [state, formAction, pending] = useActionState(resendSignInLinkAction, IDLE_AUTH_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded-md border border-white/15 px-4 py-2.5 text-sm text-neutral-200 transition-colors hover:bg-white/[0.06] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
      >
        {pending ? "Sending…" : "Resend email"}
      </button>

      {state.status === "check_email" ? (
        <p role="status" className="text-sm text-emerald-300">
          {state.message}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-red-300">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
