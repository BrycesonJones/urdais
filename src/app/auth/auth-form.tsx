"use client";

/**
 * The minimal sign-in / sign-up form.
 *
 * Deliberately plain. Phase 4 owns the designed onboarding journey ("Get Full
 * Access" → onboarding → create account → verify → Stripe); this exists only so
 * the authentication implementation underneath it can be exercised end to end by
 * a person in a browser. It should be replaced or absorbed by that phase, not
 * extended.
 *
 * It holds no session state. The form posts to a Server Action, the action sets
 * the session cookie, and the page re-renders from the server — so there is no
 * client-side notion of "signed in" to get out of step with the cookie.
 */

import { useActionState } from "react";

import { IDLE_AUTH_STATE, type AuthFormState } from "@/app/auth/form-state";

type AuthFormProps = {
  action: (previous: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  submitLabel: string;
  /** Rendered under the password field; sign-up states the confirmation step. */
  hint?: string;
  returnTo: string;
  /** New passwords get the right autocomplete token, which matters to managers. */
  passwordAutoComplete: "current-password" | "new-password";
};

export function AuthForm({ action, submitLabel, hint, returnTo, passwordAutoComplete }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE_AUTH_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="returnTo" value={returnTo} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-300">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="rounded border border-white/15 bg-black/30 px-3 py-2 text-neutral-100 outline-none focus-visible:border-[#526fe0]"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-300">Password</span>
        <input
          type="password"
          name="password"
          required
          autoComplete={passwordAutoComplete}
          className="rounded border border-white/15 bg-black/30 px-3 py-2 text-neutral-100 outline-none focus-visible:border-[#526fe0]"
        />
      </label>

      {hint ? <p className="text-xs text-neutral-400">{hint}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-[#526fe0] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Working…" : submitLabel}
      </button>

      {/* `role="status"` so the outcome is announced; both states are live regions. */}
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-red-300">
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
