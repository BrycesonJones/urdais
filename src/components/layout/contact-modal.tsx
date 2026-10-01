"use client";

import { useEffect, useRef } from "react";
import type { FormEvent, MouseEvent } from "react";

type ContactModalProps = {
  open: boolean;
  onClose: () => void;
};

const HEADING_ID = "contact-modal-heading";

const fieldClass =
  "w-full border-0 border-b border-white/15 bg-transparent px-0 py-2 text-base text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 hover:border-white/25 focus:border-amber-500";

const labelClass = "block text-sm text-neutral-300";

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
 * an accidental backdrop click.
 */
export function ContactModal({ open, onClose }: ContactModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

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

  // A click whose target is the dialog itself landed on the backdrop, not the panel.
  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  // Delivery is not built yet; Send deliberately does nothing beyond staying on the form.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={HEADING_ID}
      onClose={onClose}
      onClick={handleBackdropClick}
      // The dialog renders inside the footer, so it resets the footer's mono, uppercase, centred type.
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none flex-col items-center justify-center bg-black/60 px-4 py-6 text-left font-sans text-base normal-case tracking-normal text-neutral-100 backdrop-blur-[10px] backdrop:bg-transparent open:flex"
    >
      <div className="relative max-h-full w-full max-w-[520px] overflow-y-auto rounded-lg border border-white/10 bg-[#0a0a0a] px-6 pb-8 pt-7 shadow-2xl shadow-black/60 sm:px-10 sm:pb-10 sm:pt-9">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close contact form"
          className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 sm:right-4 sm:top-4"
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

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-8">
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
              className={`mt-2 ${fieldClass}`}
            />
          </div>

          <div>
            <label htmlFor="contact-message" className={labelClass}>
              How can we help?
            </label>
            <textarea
              id="contact-message"
              name="message"
              rows={5}
              className={`mt-2 resize-none ${fieldClass}`}
            />
          </div>

          <button
            type="submit"
            className="group inline-flex items-center gap-2 self-start rounded-sm text-sm font-medium text-neutral-100 transition-colors hover:text-amber-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-500"
          >
            Send
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </button>
        </form>
      </div>
    </dialog>
  );
}
