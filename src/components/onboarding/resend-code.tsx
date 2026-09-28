"use client";

import { useActionState } from "react";

import { resendOtpAction } from "@/app/access/actions";
import { IDLE_AUTH_STATE } from "@/app/auth/form-state";

/**
 * "Resend code".
 *
 * The address is deliberately not a field: it comes from the server's record of the
 * pending request. A form that accepted an arbitrary address would let anyone use
 * Urdais to mail anyone, and a resend is not the place to change identity —
 * "Use a different email" is, and it clears the record rather than mutating it.
 *
 * There is no hidden `returnTo` either. A resend does not navigate — it stays on
 * this screen and reports back — so there is no destination to carry, and a field
 * the server ignores is markup that implies otherwise.
 *
 * `pending` disables the button while the action is in flight, which stops an
 * impatient double-click becoming two sends against a 30-per-hour budget.
 */
export function ResendCode() {
  const [state, formAction, pending] = useActionState(resendOtpAction, IDLE_AUTH_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded-md border border-white/15 px-4 py-2.5 text-sm text-neutral-200 transition-colors hover:bg-white/[0.06] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
      >
        {pending ? "Sending…" : "Resend code"}
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
