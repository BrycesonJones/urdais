"use client";

import { useActionState } from "react";

import { resendVerificationAction } from "@/app/access/actions";
import { IDLE_AUTH_STATE } from "@/app/auth/form-state";

/**
 * "Resend verification email".
 *
 * The address is deliberately **not** a field. It comes from the server's own record
 * of the pending signup, or from the authenticated session — a form that accepted an
 * arbitrary address would let anyone use Urdais to mail anyone. So this posts nothing
 * but the reader's destination.
 *
 * `pending` disables the button while the action is in flight, which is the guard
 * against an impatient double-click turning into two provider calls and a rate-limit
 * refusal. Supabase's own rate limiting is the real ceiling; this is politeness.
 *
 * Both outcomes are announced. A failure is reported as a failure rather than
 * smoothed into "sent" — while no custom SMTP is configured, refusal is the likely
 * outcome, and telling someone mail is on the way when it is not is the one message
 * that wastes their time completely.
 */
export function ResendVerification({ returnTo }: { returnTo: string | null }) {
  const [state, formAction, pending] = useActionState(resendVerificationAction, IDLE_AUTH_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded-md border border-white/15 px-4 py-2.5 text-sm text-neutral-200 transition-colors hover:bg-white/[0.06] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
      >
        {pending ? "Sending…" : "Resend verification email"}
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
