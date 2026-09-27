"use client";

import { useActionState } from "react";

import { IDLE_AUTH_STATE, type AuthFormState } from "@/app/auth/form-state";

/**
 * The email-and-password form, for both create-account and log-in.
 *
 * One component for both because the fields and the failure handling are identical;
 * only the labels, the autocomplete token and the action differ. Two components
 * would be two places for an accessibility detail to be got right.
 *
 * It holds no session state. The form posts to a Server Action, the action sets the
 * httpOnly cookie, and the next page renders from the server — so there is no
 * client-side notion of "signed in" that can disagree with the cookie.
 *
 * Accessibility: every field has a real `<label>`, the error is a live region tied
 * to the form via `aria-describedby`, `aria-invalid` marks the fields when the
 * submission failed, and the button reports its own busy state in words rather than
 * only by going dim.
 */
export function CredentialsForm({
  action,
  submitLabel,
  passwordAutoComplete,
  returnTo,
  passwordHint,
}: {
  action: (previous: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  submitLabel: string;
  passwordAutoComplete: "new-password" | "current-password";
  returnTo: string | null;
  passwordHint?: string;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_AUTH_STATE);
  const failed = state.status === "error";

  return (
    <form action={formAction} className="flex flex-col gap-4" aria-describedby={failed ? "credentials-error" : undefined}>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="onboarding-email" className="text-sm text-neutral-300">
          Email
        </label>
        <input
          id="onboarding-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={failed || undefined}
          className="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-neutral-100 outline-none transition-colors focus-visible:border-[#526fe0] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8ca4ff]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="onboarding-password" className="text-sm text-neutral-300">
          Password
        </label>
        <input
          id="onboarding-password"
          type="password"
          name="password"
          required
          autoComplete={passwordAutoComplete}
          aria-invalid={failed || undefined}
          aria-describedby={passwordHint ? "onboarding-password-hint" : undefined}
          className="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-neutral-100 outline-none transition-colors focus-visible:border-[#526fe0] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8ca4ff]"
        />
        {passwordHint ? (
          <p id="onboarding-password-hint" className="text-xs text-neutral-500">
            {passwordHint}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="mt-1 rounded-md bg-[#526fe0] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#6480e8] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
      >
        {pending ? "Working…" : submitLabel}
      </button>

      {/* Announced, and never conveyed by colour alone: the message is the signal. */}
      {failed ? (
        <p id="credentials-error" role="alert" className="text-sm text-red-300">
          {state.message}
        </p>
      ) : null}
      {state.status === "check_email" ? (
        <p role="status" className="text-sm text-emerald-300">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
