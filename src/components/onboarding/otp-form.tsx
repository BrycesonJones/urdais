"use client";

import { useActionState } from "react";

import { verifyOtpAction } from "@/app/access/actions";
import { IDLE_AUTH_STATE } from "@/app/auth/form-state";
import { MAX_OTP_LENGTH } from "@/lib/auth/otp";

/**
 * Where the emailed code is entered.
 *
 * ## One field, not one box per digit
 *
 * Split-digit inputs look tidy and behave badly: they fight password managers, they
 * announce as six unlabelled textboxes, and pasting a code from an email works only
 * if every browser quirk has been anticipated. A single labelled field pastes
 * correctly everywhere and reads correctly to assistive technology.
 *
 * `inputMode="numeric"` brings up the number pad on a phone without rejecting a
 * pasted string, and `autoComplete="one-time-code"` lets iOS and Android offer the
 * code straight from the notification — the single biggest reduction in friction
 * available here, and it costs one attribute.
 *
 * `maxLength` uses the widest code Supabase can mint rather than the configured
 * length, so raising `otp_length` in the dashboard cannot silently truncate what a
 * reader pastes. The server does not reject on length either; Supabase decides.
 *
 * The hint names a digit count only when a deployment has actually declared one.
 * The length is hosted configuration the app cannot read, and a guessed number is a
 * false promise about what is in the reader's email — "6-digit code" above a box
 * expecting eight tells someone their correct code is the wrong shape.
 */
export function OtpForm({ returnTo, expectedLength }: { returnTo: string | null; expectedLength: number | null }) {
  const [state, formAction, pending] = useActionState(verifyOtpAction, IDLE_AUTH_STATE);
  const failed = state.status === "error";

  return (
    <form action={formAction} className="flex flex-col gap-3" aria-describedby={failed ? "otp-error" : undefined}>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="onboarding-otp" className="text-sm text-neutral-300">
          Verification code
        </label>
        <input
          id="onboarding-otp"
          name="code"
          type="text"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={MAX_OTP_LENGTH}
          aria-invalid={failed || undefined}
          aria-describedby="onboarding-otp-hint"
          className="rounded-md border border-white/15 bg-black/30 px-3 py-2.5 font-mono text-lg tracking-[0.3em] text-neutral-100 placeholder:tracking-normal placeholder:font-sans placeholder:text-neutral-600 outline-none transition-colors focus-visible:border-[#526fe0] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8ca4ff]"
        />
        <p id="onboarding-otp-hint" className="text-xs text-neutral-500">
          {expectedLength === null ? "Enter the code from the email." : `${expectedLength}-digit code from the email.`}
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="mt-1 rounded-md bg-[#526fe0] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#6480e8] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
      >
        {pending ? "Verifying…" : "Verify"}
      </button>

      {failed ? (
        <p id="otp-error" role="alert" className="text-sm text-red-300">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
