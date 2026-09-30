/**
 * The one thing Urdais sells, as a Stripe Product and Price.
 *
 * ## Discovery before creation
 *
 * Every function here looks for the canonical object before making one. A setup
 * script that creates on each run leaves a test account with nine "Urdais
 * Premium" Products and no way to tell which one the application is configured
 * against — and then a price change silently edits the wrong one.
 *
 * Identification is by **metadata**, not by name. A Product name is display copy
 * that somebody will reasonably reword; `urdais_product_key` is a key, and
 * matching on it means renaming the Product in the dashboard cannot orphan it.
 *
 * ## Reconciliation, not assumption
 *
 * `@/lib/access/pricing` holds `$80/week` for display. This module checks the
 * Stripe Price against it rather than trusting either side: a Price whose amount
 * has drifted from the copy a reader was shown is a support incident, and the
 * half that is wrong is always the half the customer read. Stripe remains the
 * billing authority — the check exists so a mismatch is loud instead of charged.
 */

import type Stripe from "stripe";

import { PREMIUM_PRICE, PREMIUM_PRODUCT_NAME, type PremiumPrice } from "@/lib/access/pricing";
import type { StripeMode } from "@/lib/billing/mode";

/** Metadata keys. Prefixed so they cannot collide with anything Stripe adds. */
export const METADATA_APPLICATION = "urdais_application";
export const METADATA_ENVIRONMENT = "urdais_environment";
export const METADATA_PRODUCT_KEY = "urdais_product_key";
/** On Checkout Sessions and Subscriptions: the Urdais account, server-derived. */
export const METADATA_ACCOUNT_ID = "urdais_account_id";

export const APPLICATION_VALUE = "urdais";
/** The single product key. A second value here would be a second tier. */
export const PREMIUM_PRODUCT_KEY = "premium";

/**
 * The Stripe tax code for Urdais Premium.
 *
 * ## Why this has to be set at all
 *
 * Stripe's **Managed Payments** is enabled by default on this account, and it makes
 * Stripe the merchant of record — which means Stripe calculates and remits sales tax
 * and therefore requires every Product to declare what it is. Without a tax code,
 * `checkout.sessions.create` fails outright with
 * `the product tax code is missing`. It is not optional and it cannot be inferred.
 *
 * ## Why this code
 *
 * `txcd_10701400` is "Website Information Services - Business Use". Urdais sells
 * access to market indices and infrastructure data that a professional reader logs
 * in and reads on a website. It is deliberately **not** a SaaS code
 * (`txcd_10103001`): Urdais is not software the customer operates, and misdescribing
 * it as such would classify the product wrongly in every jurisdiction Stripe remits
 * to.
 *
 * ## This is a tax decision, not an engineering one
 *
 * Chosen as the most accurate available description, and it needs the founder's
 * confirmation before live billing. Two things could change it:
 *
 *   - a different code is a better fit for how Urdais is actually sold (the nearest
 *     alternative is `txcd_10701410`, "Electronically Delivered Information
 *     Services - Business Use", which differs on whether delivery is the website
 *     itself);
 *   - Managed Payments is turned **off** for the account, in which case Urdais is
 *     the merchant of record, no tax code is required, and remitting tax becomes
 *     Urdais's own responsibility.
 *
 * Neither is a change this module should make on its own. See
 * docs/architecture/stripe-billing.md.
 */
export const PREMIUM_TAX_CODE = "txcd_10701400";

/** The metadata every Urdais-owned Stripe object carries. Never holds PII or secrets. */
export function catalogMetadata(mode: StripeMode): Record<string, string> {
  return {
    [METADATA_APPLICATION]: APPLICATION_VALUE,
    [METADATA_ENVIRONMENT]: mode,
    [METADATA_PRODUCT_KEY]: PREMIUM_PRODUCT_KEY,
  };
}

function isOurs(metadata: Stripe.Metadata | null, mode: StripeMode): boolean {
  if (!metadata) return false;
  return (
    metadata[METADATA_APPLICATION] === APPLICATION_VALUE &&
    metadata[METADATA_PRODUCT_KEY] === PREMIUM_PRODUCT_KEY &&
    metadata[METADATA_ENVIRONMENT] === mode
  );
}

/** Whether a Stripe Price is the weekly $80 recurring Price the copy promises. */
export function priceMatchesPremium(price: Stripe.Price, expected: PremiumPrice = PREMIUM_PRICE): boolean {
  return (
    price.active &&
    price.currency === expected.currency.toLowerCase() &&
    price.unit_amount === expected.amountMinorUnits &&
    price.type === "recurring" &&
    price.recurring?.interval === expected.interval &&
    price.recurring?.interval_count === 1
  );
}

/** Why a configured Price cannot be used, or null when it is sound. */
export function describePriceMismatch(price: Stripe.Price, expected: PremiumPrice = PREMIUM_PRICE): string | null {
  if (!price.active) return `Price ${price.id} is archived`;
  if (price.type !== "recurring") return `Price ${price.id} is ${price.type}, not recurring`;
  if (price.currency !== expected.currency.toLowerCase()) {
    return `Price ${price.id} is in ${price.currency.toUpperCase()}, expected ${expected.currency}`;
  }
  if (price.unit_amount !== expected.amountMinorUnits) {
    return `Price ${price.id} is ${price.unit_amount} minor units, expected ${expected.amountMinorUnits}`;
  }
  if (price.recurring?.interval !== expected.interval || price.recurring?.interval_count !== 1) {
    return `Price ${price.id} recurs every ${price.recurring?.interval_count ?? "?"} ${price.recurring?.interval ?? "?"}, expected 1 ${expected.interval}`;
  }
  return null;
}

/**
 * The canonical Product, or null.
 *
 * Lists rather than using Stripe's search API: search is eventually consistent,
 * and a setup script that runs twice in quick succession would not see what its
 * first run created. A hundred products is more than a single-product catalogue
 * will ever hold.
 */
export async function findPremiumProduct(stripe: Stripe, mode: StripeMode): Promise<Stripe.Product | null> {
  for await (const product of stripe.products.list({ limit: 100, active: true })) {
    if (isOurs(product.metadata, mode)) return product;
  }
  return null;
}

/** The canonical Price on that Product, or null. */
export async function findPremiumPrice(stripe: Stripe, productId: string, mode: StripeMode): Promise<Stripe.Price | null> {
  for await (const price of stripe.prices.list({ product: productId, limit: 100, active: true })) {
    if (isOurs(price.metadata, mode) && priceMatchesPremium(price)) return price;
  }
  return null;
}

export type CatalogSetup = {
  readonly product: Stripe.Product;
  readonly price: Stripe.Price;
  readonly createdProduct: boolean;
  readonly createdPrice: boolean;
};

/**
 * The canonical Product and Price, creating only what is missing.
 *
 * Idempotent by construction: run it any number of times and the second run
 * reports `createdProduct: false, createdPrice: false`.
 */
export async function ensurePremiumCatalog(stripe: Stripe, mode: StripeMode): Promise<CatalogSetup> {
  const metadata = catalogMetadata(mode);

  const existingProduct = await findPremiumProduct(stripe, mode);
  let product =
    existingProduct ??
    (await stripe.products.create({
      name: PREMIUM_PRODUCT_NAME,
      description: "Urdais premium analytics and infrastructure data. One subscription unlocks every premium product.",
      tax_code: PREMIUM_TAX_CODE,
      metadata,
    }));

  // An existing Product created before the tax code was required, or pointed at a
  // different one, is corrected in place. Leaving it would make Checkout fail with
  // an error no reader could act on, and creating a second Product would give the
  // account two "Urdais Premium" entries.
  const currentTaxCode = typeof product.tax_code === "string" ? product.tax_code : product.tax_code?.id;
  if (currentTaxCode !== PREMIUM_TAX_CODE) {
    product = await stripe.products.update(product.id, { tax_code: PREMIUM_TAX_CODE });
  }

  const existingPrice = await findPremiumPrice(stripe, product.id, mode);
  const price =
    existingPrice ??
    (await stripe.prices.create({
      product: product.id,
      currency: PREMIUM_PRICE.currency.toLowerCase(),
      unit_amount: PREMIUM_PRICE.amountMinorUnits,
      recurring: { interval: PREMIUM_PRICE.interval, interval_count: 1 },
      metadata,
    }));

  return {
    product,
    price,
    createdProduct: existingProduct === null,
    createdPrice: existingPrice === null,
  };
}
