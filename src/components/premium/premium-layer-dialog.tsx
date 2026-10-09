"use client";

import { useEffect, useRef, type MouseEvent } from "react";

import { gateCopy } from "@/lib/access/gate-copy";
import { accessHref, signInHref } from "@/lib/access/gate-links";
import type { AccessDenialReason } from "@/lib/access/entitlement";
import type { UrdaisProductId } from "@/lib/access/products";
import { track } from "@/lib/analytics/client";
import { ANALYTICS_EVENTS, productProperties } from "@/lib/analytics/events";

/**
 * The map's premium gate: the access-required proposition in a modal, over a map
 * that stays where it was.
 *
 * Clicking a locked layer must not navigate. A reader who has panned to a region
 * and zoomed in has state worth keeping, and throwing it away to show them an
 * upsell would be a worse experience than the lock itself. So this opens over the
 * map and closing it returns them to exactly the view they had.
 *
 * ## Modal semantics come from the platform
 *
 * Built on `<dialog>` with `showModal()`, the same way `SearchModal` is. That is
 * not merely consistency: it means focus trapping, Escape, the top layer,
 * background inertness and focus restoration are the browser's implementation
 * rather than four hand-rolled event listeners that each have an edge case. The
 * `open` prop is the source of truth and the effect keeps the DOM element in sync.
 *
 * The panel is re-implemented here rather than reusing `AccessRequiredPanel`
 * because that component is a Server Component and this one must be a client
 * component; the *copy* is shared through `gateCopy`, which is the part that must
 * not diverge.
 */
export type PremiumLayerDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Which layer was clicked, for the accessible name. */
  layerName: string | null;
  reason: Exclude<AccessDenialReason, "unknown_product">;
  /** Where to come back to, including the layer the reader wanted. */
  returnTo: string;
  /** The locked layer's product, for the CTA's analytics event. */
  productId?: UrdaisProductId | null;
};

const HEADING_ID = "premium-layer-gate-heading";

export function PremiumLayerDialog({ open, onClose, layerName, reason, returnTo, productId }: PremiumLayerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const copy = gateCopy(reason, "map_layer");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  // A click whose target is the dialog itself landed on the backdrop, not the panel.
  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={HEADING_ID}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none flex-col items-center justify-center bg-black/60 px-4 text-neutral-100 backdrop:bg-transparent open:flex"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-white/10 bg-[#111111] px-6 py-8 text-center shadow-2xl shadow-black/50">
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-neutral-400"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4" focusable="false">
            <rect x="3.25" y="7" width="9.5" height="6.25" rx="1.25" />
            <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" />
          </svg>
        </span>

        <h2 id={HEADING_ID} className="text-xs font-semibold tracking-[0.18em] text-neutral-300">
          {copy.title}
        </h2>

        {/* Names the layer they actually clicked, so the modal answers the question they asked. */}
        <p className="text-base font-medium text-neutral-50">{layerName ? `${layerName} requires an Urdais subscription.` : copy.lead}</p>
        <p className="text-sm text-neutral-400">{copy.body}</p>

        <a
          href={accessHref(returnTo)}
          onClick={() => {
            const product = productId ? productProperties(productId) : null;
            track(ANALYTICS_EVENTS.premiumCtaClicked, {
              ...(product ?? {}),
              cta_surface: "map_layer",
              source_page: window.location.pathname,
            });
          }}
          className="mt-1 w-full rounded-md bg-[#526fe0] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#6480e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
        >
          {copy.ctaLabel}
        </a>

        <button
          type="button"
          onClick={onClose}
          className="text-xs text-neutral-500 underline underline-offset-2 transition-colors hover:text-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
        >
          Back to the map
        </button>

        {copy.secondary ? (
          <p className="text-xs text-neutral-500">
            Already have an account?{" "}
            <a
              href={signInHref(returnTo)}
              className="text-neutral-300 underline underline-offset-2 transition-colors hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
            >
              {copy.secondary.label}
            </a>
          </p>
        ) : null}
      </div>
    </dialog>
  );
}
