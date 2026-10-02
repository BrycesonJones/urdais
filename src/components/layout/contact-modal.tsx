"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, MouseEvent, SyntheticEvent } from "react";

import {
  CONTACT_FIELD_ERROR_TEXT,
  validateContactInput,
  type ContactFieldError,
} from "@/lib/contact/validation";

type ContactModalProps = {
  open: boolean;
  onClose: () => void;
};

type Status = "idle" | "sending" | "success" | "error";
type FieldErrors = { email?: ContactFieldError; message?: ContactFieldError };

const HEADING_ID = "contact-modal-heading";
const EMAIL_ERROR_ID = "contact-email-error";
const MESSAGE_ERROR_ID = "contact-message-error";

/** Long enough for a slow provider, short enough that Send never hangs indefinitely. */
const REQUEST_TIMEOUT_MS = 20_000;

const fieldClass =
  "w-full border-0 border-b border-white/15 bg-transparent px-0 py-2 text-base text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 hover:border-white/25 focus:border-[#8ca4ff] aria-[invalid=true]:border-red-400/60 aria-[invalid=true]:focus:border-[#8ca4ff]";

const labelClass = "block text-sm text-neutral-300";

const fieldErrorClass = "mt-2 text-sm text-red-300";

/** True only for the endpoint's explicit success body; anything else is a failure. */
async function postContact(value: { email: string; message: string }): Promise<boolean> {
  try {
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body: unknown = await response.json().catch(() => null);
    return response.ok && typeof body === "object" && body !== null && (body as { ok?: unknown }).ok === true;
  } catch {
    return false;
  }
}

/**
 * The site's contact form, opened over the current page from the footer.
 *
 * Built on `<dialog>` with `showModal()`, the same way `SearchModal` and
 * `PremiumLayerDialog` are, so focus trapping, Escape, the top layer and
 * background inertness come from the platform. The `open` prop is the source
 * of truth and the effect keeps the DOM element in sync. The one thing the
 * platform does not do is stop the page underneath from scrolling, so the
 * effect locks that while the dialog is open.
 *
 * The inputs are uncontrolled and the dialog stays mounted, so a draft survives
 * an accidental backdrop click. The form is cleared only once `POST /api/contact`
 * confirms delivery; a failure leaves the draft exactly as it was.
 *
 * While a message is in flight the dialog cannot be closed, the fields are
 * read-only, and Send is disabled. The ref guard is what actually stops a fast
 * double-click: the second click can land before React re-renders the button
 * as disabled.
 */
export function ContactModal({ open, onClose }: ContactModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const sendingRef = useRef(false);
  const [status, setStatus] = useState<Status>("idle");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const sending = status === "sending";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }

    if (!dialog.open) dialog.showModal();
    emailRef.current?.focus();

    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previousOverflow;
    };
  }, [open]);

  // Send is disabled while sending, which drops focus; hand it back once there is an outcome.
  useEffect(() => {
    if (status === "success" || status === "error") submitRef.current?.focus();
  }, [status]);

  function requestClose() {
    if (!sendingRef.current) onClose();
  }

  // Escape arrives as a cancel event first; refusing it keeps an in-flight send on screen.
  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    if (sendingRef.current) event.preventDefault();
  }

  // A finished outcome is not carried into the next opening; the draft and field errors are.
  function handleDialogClose() {
    if (!sendingRef.current) setStatus("idle");
    onClose();
  }

  // A click whose target is the dialog itself landed on the backdrop, not the panel.
  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) requestClose();
  }

  function handleFieldInput(field: keyof FieldErrors) {
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }));
    if (status === "success" || status === "error") setStatus("idle");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendingRef.current) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const validation = validateContactInput({ email: data.get("email"), message: data.get("message") });
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      setStatus("idle");
      (validation.errors.email ? emailRef : messageRef).current?.focus();
      return;
    }

    sendingRef.current = true;
    setFieldErrors({});
    setStatus("sending");
    const delivered = await postContact(validation.value);
    sendingRef.current = false;

    if (delivered) form.reset();
    setStatus(delivered ? "success" : "error");
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={HEADING_ID}
      onCancel={handleCancel}
      onClose={handleDialogClose}
      onClick={handleBackdropClick}
      // The dialog renders inside the footer, so it resets the footer's mono, uppercase, centred type.
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none flex-col items-center justify-center bg-black/60 px-4 py-6 text-left font-sans text-base normal-case tracking-normal text-neutral-100 backdrop-blur-[10px] backdrop:bg-transparent open:flex"
    >
      <div className="relative max-h-full w-full max-w-[520px] overflow-y-auto rounded-lg border border-white/10 bg-[#0a0a0a] px-6 pb-8 pt-7 shadow-2xl shadow-black/60 sm:px-10 sm:pb-10 sm:pt-9">
        <button
          type="button"
          onClick={requestClose}
          disabled={sending}
          aria-label="Close contact form"
          className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff] disabled:pointer-events-none disabled:opacity-40 sm:right-4 sm:top-4"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            className="size-5"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>

        <h2 id={HEADING_ID} className="text-2xl font-semibold tracking-tight text-neutral-50">
          Contact
        </h2>

        {/* noValidate: the shared rules decide, so the browser's own bubbles never disagree with them. */}
        <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-8">
          <div>
            <label htmlFor="contact-email" className={labelClass}>
              Your email
            </label>
            <input
              ref={emailRef}
              id="contact-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@email.com"
              readOnly={sending}
              onInput={() => handleFieldInput("email")}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? EMAIL_ERROR_ID : undefined}
              className={`mt-2 ${fieldClass}`}
            />
            {fieldErrors.email && (
              <p id={EMAIL_ERROR_ID} className={fieldErrorClass}>
                {CONTACT_FIELD_ERROR_TEXT[fieldErrors.email]}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="contact-message" className={labelClass}>
              How can we help?
            </label>
            <textarea
              ref={messageRef}
              id="contact-message"
              name="message"
              rows={5}
              readOnly={sending}
              onInput={() => handleFieldInput("message")}
              aria-invalid={fieldErrors.message ? true : undefined}
              aria-describedby={fieldErrors.message ? MESSAGE_ERROR_ID : undefined}
              className={`mt-2 resize-none ${fieldClass}`}
            />
            {fieldErrors.message && (
              <p id={MESSAGE_ERROR_ID} className={fieldErrorClass}>
                {CONTACT_FIELD_ERROR_TEXT[fieldErrors.message]}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <button
              ref={submitRef}
              type="submit"
              disabled={sending}
              className="group inline-flex items-center gap-2 rounded-sm text-sm font-medium text-neutral-100 transition-colors hover:text-[#b6c7ff] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8ca4ff] disabled:cursor-default disabled:text-neutral-500"
            >
              {sending ? (
                "Sending…"
              ) : (
                <>
                  Send
                  <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </>
              )}
            </button>
            {/* Always mounted, so screen readers announce the outcome when its text appears. */}
            <p role="status" className="text-sm text-neutral-300">
              {status === "success" ? "Message sent." : ""}
            </p>
            {status === "error" && (
              <p role="alert" className="basis-full text-sm text-red-300">
                Something went wrong. Please try again.
              </p>
            )}
          </div>
        </form>
      </div>
    </dialog>
  );
}
