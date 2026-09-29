import { PREMIUM_PRODUCT_IDS, findProduct } from "@/lib/access/products";
import { PREMIUM_PRODUCT_NAME } from "@/lib/access/pricing";

/**
 * What a subscription includes, and what it costs.
 *
 * The product list is **derived from the Phase 1 registry**, not written out. If a
 * product's access class changes, this list changes with it — the alternative is
 * onboarding advertising something that is actually public, or omitting something a
 * reader is about to be charged for.
 *
 * **No price here.** What a subscription costs belongs at Plan / Pay, next to the
 * payment it explains; quoting it during account creation asks someone to weigh a
 * number before they have seen anything they would be paying for. The account form
 * does not render this component at all — it is the pre-payment summary on the
 * checkout boundary and nothing else.
 */
export function premiumProductNames(): readonly string[] {
  return PREMIUM_PRODUCT_IDS.map((id) => findProduct(id)?.name ?? id);
}

export function PremiumSummary({ heading = "Premium access includes" }: { heading?: string }) {
  return (
    <section aria-labelledby="premium-summary-heading" className="rounded-lg border border-white/10 bg-[#111111] p-5">
      <h2 id="premium-summary-heading" className="text-sm font-medium text-neutral-100">
        {PREMIUM_PRODUCT_NAME}
      </h2>

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
