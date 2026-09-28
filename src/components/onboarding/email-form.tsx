"use client";

import { useActionState } from "react";

import { sendSignInLinkAction } from "@/app/access/actions";
import { IDLE_AUTH_STATE } from "@/app/auth/form-state";

/**
 * The whole sign-in form: one email field.
 *
 * There is no password input, and none is hidden either — Urdais authenticates by
 * emailing a one-time link, so a password is not collected because it is not used.
 * The same component serves "Create your account" and "Log in"; only the submit
 * label differs, because the underlying call is identical and deliberately so.
 *
 * Accessibility: a real `<label>`, an error in a live region tied to the form by
 * `aria-describedby`, `aria-invalid` on the field when the submission failed, and a
 * button that states its own busy condition in words rather than only dimming.
 */
export function EmailForm({
  returnTo,
  submitLabel = "Send link",
}: {
  returnTo: string | null;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(sendSignInLinkAction, IDLE_AUTH_STATE);
  const failed = state.status === "error";

  return (
    <form action={formAction} className="flex flex-col gap-3" aria-describedby={failed ? "email-form-error" : undefined}>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="onboarding-email" className="text-sm text-neutral-300">
          Your email
        </label>
        <input
          id="onboarding-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="name@company.com"
          aria-invalid={failed || undefined}
          className="rounded-md border border-white/15 bg-black/30 px-3 py-2.5 text-neutral-100 placeholder:text-neutral-600 outline-none transition-colors focus-visible:border-[#526fe0] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8ca4ff]"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="mt-1 rounded-md bg-[#526fe0] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#6480e8] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
      >
        {pending ? "Sending…" : submitLabel}
      </button>

      {failed ? (
        <p id="email-form-error" role="alert" className="text-sm text-red-300">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
