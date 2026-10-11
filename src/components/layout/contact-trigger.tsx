"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";

import { ContactModal } from "@/components/layout/contact-modal";

type ContactTriggerProps = {
  className?: string;
  /** The button's text. "Contact" in the footer; prose elsewhere, such as the privacy policy. */
  children?: ReactNode;
};

/**
 * A button that opens `ContactModal` over the current page: the footer's Contact
 * control, and the privacy policy's route to the same form. Focus goes back to
 * this button on close; browsers do that for a modal `<dialog>` already, and
 * doing it explicitly covers the ones that don't.
 *
 * It renders a `<dialog>`, so place it where flow content is allowed (a `<li>` or
 * `<div>`), never inside a `<p>`.
 */
export function ContactTrigger({ className, children = "Contact" }: ContactTriggerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function handleClose() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={`cursor-pointer ${className ?? ""}`}
      >
        {children}
      </button>
      <ContactModal open={open} onClose={handleClose} />
    </>
  );
}
