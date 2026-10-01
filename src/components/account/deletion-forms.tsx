"use client";

import { useActionState, useId, useState } from "react";

import { deleteAccountAction, finishDeletionAction, sendStepUpCodeAction, verifyStepUpCodeAction } from "@/app/account/delete/actions";
import { IDLE_AUTH_STATE } from "@/app/auth/form-state";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]";
const destructive = `rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-900/60 disabled:text-red-200/70 ${focus}`;

/**
 * Step-up: email a code to the signed-in account's own address, then verify it.
 *
 * No address field. The server sends to, and verifies against, the session's
 * address. A successful verification redirects back to the deletion page.
 */
export function StepUpForm({ email }: { email: string }) {
  const [sent, sendAction, sending] = useActionState(sendStepUpCodeAction, IDLE_AUTH_STATE);
  const [verified, verifyAction, verifying] = useActionState(verifyStepUpCodeAction, IDLE_AUTH_STATE);
  const codeId = useId();
  const codeSent = sent.status === "check_email" || verified.status === "check_email";
  const error = verified.status === "check_email" ? verified.message : sent.status === "error" ? sent.message : verified.status === "error" ? verified.message : null;

  return (
    <div className="flex flex-col gap-4">
      {!codeSent ? (
        <form action={sendAction}>
          <button type="submit" disabled={sending} aria-busy={sending} className={`rounded-md border border-white/15 px-4 py-2 text-sm text-neutral-100 transition-colors hover:bg-white/5 disabled:opacity-60 ${focus}`}>
            {sending ? "Sending…" : `Email a code to ${email}`}
          </button>
        </form>
      ) : (
        <form action={verifyAction} className="flex flex-col gap-3" aria-describedby={error ? "step-up-error" : undefined}>
          <p className="text-sm text-neutral-300" role="status">
            We sent a verification code to <span className="font-medium break-all text-neutral-50">{email}</span>.
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={codeId} className="text-sm text-neutral-300">
              Verification code
            </label>
            <input
              id={codeId}
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-invalid={error ? true : undefined}
              className="rounded-md border border-white/15 bg-black/30 px-3 py-2.5 text-neutral-100 outline-none focus-visible:border-[#526fe0] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8ca4ff]"
            />
          </div>
          <button type="submit" disabled={verifying} aria-busy={verifying} className={`self-start rounded-md bg-[#526fe0] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#6480e8] disabled:opacity-60 ${focus}`}>
            {verifying ? "Verifying…" : "Verify"}
          </button>
        </form>
      )}
      {error ? (
        <p id="step-up-error" role="alert" className="text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The destructive confirmation: type DELETE, then press Delete account.
 *
 * The button stays disabled until the word matches, and says why in text tied to
 * it, so it is never a control that silently does nothing. The server checks the
 * word again; the client check is convenience only. `pending` disables the button
 * against a double submit, and the server's lease and idempotent stages make a
 * duplicate harmless anyway.
 */
export function DeleteConfirmForm() {
  const [state, formAction, pending] = useActionState(deleteAccountAction, IDLE_AUTH_STATE);
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const ready = typed === "DELETE";
  const failed = state.status === "error";

  return (
    <form action={formAction} className="flex flex-col gap-3" aria-describedby={failed ? "delete-error" : "delete-hint"}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm text-neutral-300">
          Type <span className="font-mono font-semibold text-neutral-50">DELETE</span> to confirm
        </label>
        <input
          id={inputId}
          name="confirmation"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={failed || undefined}
          className="rounded-md border border-white/15 bg-black/30 px-3 py-2.5 font-mono text-neutral-100 outline-none focus-visible:border-red-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#8ca4ff]"
        />
        <p id="delete-hint" className="text-xs text-neutral-500">
          {ready ? "Pressing the button deletes your account now." : "The button activates once you type DELETE."}
        </p>
      </div>
      <button type="submit" disabled={!ready || pending} aria-busy={pending} className={`self-start ${destructive}`}>
        {pending ? "Deleting…" : "Delete account"}
      </button>
      {failed ? (
        <p id="delete-error" role="alert" className="text-sm text-red-300">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** Finish a deletion already past billing termination. */
export function FinishDeletionForm() {
  const [state, formAction, pending] = useActionState(finishDeletionAction, IDLE_AUTH_STATE);
  const failed = state.status === "error";
  return (
    <form action={formAction} className="flex flex-col gap-3" aria-describedby={failed ? "finish-error" : undefined}>
      <button type="submit" disabled={pending} aria-busy={pending} className={`self-start ${destructive}`}>
        {pending ? "Finishing…" : "Finish deleting account"}
      </button>
      {failed ? (
        <p id="finish-error" role="alert" className="text-sm text-red-300">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
