import { PREMIUM_PRODUCT_IDS, findProduct } from "@/lib/access/products";
import { PREMIUM_PRODUCT_NAME, PREMIUM_TRIAL_NOTE, formatPremiumPrice } from "@/lib/access/pricing";

/**
 * What a subscription includes, and what it costs.
 *
 * The product list is **derived from the Phase 1 registry**, not written out. If a
 * product's access class changes, this list changes with it — the alternative is
 * onboarding advertising something that is actually public, or omitting something a
 * reader is about to be charged for.
 *
 * Shown twice on purpose: once on the intro, before anyone creates an account, and
 * again at the checkout boundary. Someone should know the price before they hand
 * over an email address, not discover it on a payment screen.
 */
export function premiumProductNames(): readonly string[] {
  return PREMIUM_PRODUCT_IDS.map((id) => findProduct(id)?.name ?? id);
}

export function PremiumSummary({ heading = "Premium access includes" }: { heading?: string }) {
  return (
    <section aria-labelledby="premium-summary-heading" className="rounded-lg border border-white/10 bg-[#111111] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="premium-summary-heading" className="text-sm font-medium text-neutral-100">
          {PREMIUM_PRODUCT_NAME}
        </h2>
        <p className="text-sm font-medium text-neutral-50">
          {formatPremiumPrice()}
          {/* Stated plainly rather than buried: a trial nobody offers is the kind of
              thing readers assume by default. */}
          <span className="ml-2 font-normal text-neutral-500">{PREMIUM_TRIAL_NOTE}</span>
        </p>
      </div>

      <p className="mt-4 text-xs font-medium tracking-wide text-neutral-400">{heading}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {premiumProductNames().map((name) => (
          <li key={name} className="flex items-start gap-2 text-sm text-neutral-300">
            <span aria-hidden="true" className="mt-[7px] inline-block size-1 shrink-0 rounded-full bg-[#526fe0]" />
            {name}
          </li>
        ))}
      </ul>
    </section>
  );
}
