"use client";

import { useActionState } from "react";

import { signInWithGoogleAction } from "@/app/access/actions";
import { IDLE_AUTH_STATE } from "@/app/auth/form-state";

/**
 * "Continue with Google".
 *
 * Rendered only where the server has established that the provider is actually
 * configured — see `@/lib/auth/google`. A button that predictably fails is worse
 * than no button, so when Google is unconfigured this component is not rendered at
 * all rather than rendered disabled: a disabled control for something that may never
 * exist asks the reader to wonder what they are missing.
 *
 * The action is server-side. The browser does not build the OAuth request, so it
 * cannot choose the provider, the scopes or the callback.
 *
 * The mark is Google's own four-colour G, drawn here rather than loaded from a CDN
 * (which the app does not do for any asset). It is decorative: the button's
 * accessible name is its text.
 */
export function GoogleButton({ returnTo }: { returnTo: string | null }) {
  const [state, formAction, pending] = useActionState(signInWithGoogleAction, IDLE_AUTH_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="flex w-full items-center justify-center gap-2.5 rounded-md border border-white/15 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-neutral-100 transition-colors hover:bg-white/[0.08] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
      >
        <svg aria-hidden="true" focusable="false" viewBox="0 0 18 18" className="size-4 shrink-0">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
          <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
        </svg>
        {pending ? "Redirecting…" : "Continue with Google"}
      </button>

      {state.status === "error" ? (
        <p role="alert" className="text-sm text-red-300">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
