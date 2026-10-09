import Link from "next/link";

import { PremiumCtaLink } from "@/components/analytics/premium-cta-link";
import { gateCopy, type GateSurface } from "@/lib/access/gate-copy";
import { accessHref, signInHref } from "@/lib/access/gate-links";
import type { AccessDenialReason } from "@/lib/access/entitlement";
import type { UrdaisProductId } from "@/lib/access/products";

/**
 * The premium gate's content: heading, proposition, and actions.
 *
 * One component for both surfaces — the page-level locked shell and the map-layer
 * dialog — so the offer cannot say two different things in two places. It renders
 * no data and reads no state; the surrounding component decides how it is
 * presented.
 *
 * A Server Component. Its one interactive part, the CTA's analytics event, is the
 * small `PremiumCtaLink` client component; the rest never reaches the browser as
 * JavaScript. The map's dialog wraps it in a client component
 * for the modal behaviour, which is the only part that genuinely needs one.
 *
 * ## Accessibility
 *
 * The heading is a real heading at the level the caller specifies, so the locked
 * page keeps a sensible outline rather than skipping from the page title to a
 * `div`. "ACCESS REQUIRED" is literal capitals rather than `uppercase`, so a
 * screen reader is not left to guess at an acronym — and the lock is stated in
 * words, never by colour or an icon alone.
 */
export type AccessRequiredPanelProps = {
  reason: Exclude<AccessDenialReason, "unknown_product">;
  surface: GateSurface;
  /** Where the reader should come back to after subscribing. */
  returnTo: string;
  /** Heading level, so the panel fits the outline of whatever contains it. */
  headingLevel?: 1 | 2;
  /** Ties a dialog's `aria-labelledby` to the heading. */
  headingId?: string;
  /** The product behind the gate, for the CTA's analytics event. */
  productId?: UrdaisProductId;
};

export function AccessRequiredPanel({ reason, surface, returnTo, headingLevel = 2, headingId, productId }: AccessRequiredPanelProps) {
  const copy = gateCopy(reason, surface);
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-white/10 bg-[#111111] px-6 py-8 text-center shadow-2xl shadow-black/50">
      <span
        aria-hidden="true"
        className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-neutral-400"
      >
        {/* Decorative: the lock state is carried by the heading text, not this. */}
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4" focusable="false">
          <rect x="3.25" y="7" width="9.5" height="6.25" rx="1.25" />
          <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" />
        </svg>
      </span>

      <Heading id={headingId} className="text-xs font-semibold tracking-[0.18em] text-neutral-300">
        {copy.title}
      </Heading>

      <p className="text-base font-medium text-neutral-50">{copy.lead}</p>
      <p className="text-sm text-neutral-400">{copy.body}</p>

      <PremiumCtaLink
        href={accessHref(returnTo)}
        surface={surface}
        {...(productId ? { productId } : {})}
        className="mt-1 w-full rounded-md bg-[#526fe0] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#6480e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
      >
        {copy.ctaLabel}
      </PremiumCtaLink>

      {copy.secondary ? (
        <p className="text-xs text-neutral-500">
          Already have an account?{" "}
          <Link
            href={signInHref(returnTo)}
            className="text-neutral-300 underline underline-offset-2 transition-colors hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
          >
            {copy.secondary.label}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
