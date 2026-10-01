"use client";

import { useRef, useState } from "react";

import { ContactModal } from "@/components/layout/contact-modal";

type ContactTriggerProps = {
  className?: string;
};

/**
 * The footer's Contact control: a button that opens `ContactModal` over the
 * current page. Focus goes back to this button on close; browsers do that for a
 * modal `<dialog>` already, and doing it explicitly covers the ones that don't.
 */
export function ContactTrigger({ className }: ContactTriggerProps) {
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
        className={`cursor-pointer uppercase ${className ?? ""}`}
      >
        Contact
      </button>
      <ContactModal open={open} onClose={handleClose} />
    </>
  );
}
