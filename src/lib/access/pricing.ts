/**
 * What Urdais premium costs, for presentation only.
 *
 * ## This is not the billing authority
 *
 * When Stripe lands it owns the authoritative Price object, and the amount a
 * reader is actually charged comes from there — never from this file. What lives
 * here is the copy shown during onboarding so that nobody discovers the price
 * for the first time on a payment screen.
 *
 * It is one module rather than a string repeated in three components for the
 * ordinary reason: two components disagreeing about the price is a support
 * problem, and the one that is wrong is always the one the customer read.
 *
 * Phase 5 must reconcile `PREMIUM_PRICE` against the Stripe Price it creates. The
 * shape is deliberately split into amount/currency/interval rather than kept as
 * the single string `"$80/week"`, so that reconciliation is a comparison of
 * values and not of prose.
 */

export type PremiumPrice = {
  /** Minor units, as Stripe counts them: 8000 = $80.00. */
  readonly amountMinorUnits: number;
  readonly currency: "USD";
  readonly interval: "week";
  /** Whether a free trial is offered. Urdais offers none. */
  readonly trial: false;
};

export const PREMIUM_PRICE: PremiumPrice = Object.freeze({
  amountMinorUnits: 8000,
  currency: "USD",
  interval: "week",
  trial: false,
});

/** The product name as a reader sees it. */
export const PREMIUM_PRODUCT_NAME = "Urdais Premium";

/**
 * `$80` — the amount alone, with no interval.
 *
 * Whole dollars are rendered without decimals because that is how the price is
 * written everywhere else; a price with cents would render them.
 */
export function formatPremiumAmount(price: PremiumPrice = PREMIUM_PRICE): string {
  const major = price.amountMinorUnits / 100;
  const body = Number.isInteger(major) ? String(major) : major.toFixed(2);
  return `$${body}`;
}

/** `$80/week` — what appears beside the product name. */
export function formatPremiumPrice(price: PremiumPrice = PREMIUM_PRICE): string {
  return `${formatPremiumAmount(price)}/${price.interval}`;
}

/** `Urdais Premium — $80/week`. */
export function premiumPriceHeadline(price: PremiumPrice = PREMIUM_PRICE): string {
  return `${PREMIUM_PRODUCT_NAME} — ${formatPremiumPrice(price)}`;
}

/**
 * The one line about billing terms Urdais is prepared to stand behind today.
 *
 * Deliberately says nothing about tax, proration, renewal mechanics or
 * cancellation, because none of those have been established. A sentence implying
 * terms that do not exist is worse than no sentence.
 */
export const PREMIUM_TRIAL_NOTE = "No free trial.";
