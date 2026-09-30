/**
 * Create or reconcile the canonical Urdais Stripe Product and Price.
 *
 * Idempotent: discovers by metadata first and creates only what is missing, so
 * running it twice does not leave two "Urdais Premium" Products behind. Safe to
 * re-run after a key rotation or on a fresh Stripe account.
 *
 *   npm run billing:setup
 *
 * Refuses to run against live Stripe. Creating the live Product is a Phase 6 step
 * with a human present, and a script that could do it accidentally is a script
 * that eventually will.
 *
 * Prints the Product and Price ids, which are not secrets, and never the key.
 */

import { PREMIUM_PRICE, formatPremiumPrice } from "@/lib/access/pricing";
import { ensurePremiumCatalog, describePriceMismatch } from "@/lib/billing/catalog";
import { STRIPE_PREMIUM_PRICE_ID_VAR, stripeModeOfKey } from "@/lib/billing/mode";
import Stripe from "stripe";

async function main(): Promise<void> {
  const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (key === "") {
    console.error("STRIPE_SECRET_KEY is not set.");
    process.exit(2);
  }

  const mode = stripeModeOfKey(key);
  if (mode === null) {
    console.error("STRIPE_SECRET_KEY is not a recognisable Stripe secret key.");
    process.exit(2);
  }
  if (mode === "live") {
    console.error("Refusing to run against LIVE Stripe. The live Product and Price are a Phase 6 step.");
    process.exit(2);
  }

  const stripe = new Stripe(key, { appInfo: { name: "Urdais setup" }, maxNetworkRetries: 2 });

  // Confirm the credential really is test mode with Stripe itself, not only by
  // its prefix. A prefix is a string; `livemode` is the API's own answer.
  const balance = await stripe.balance.retrieve();
  if (balance.livemode !== false) {
    console.error("Stripe reports livemode=true for this credential. Stopping.");
    process.exit(2);
  }
  console.log("Stripe test authentication succeeded.");

  const setup = await ensurePremiumCatalog(stripe, mode);

  const mismatch = describePriceMismatch(setup.price);
  if (mismatch) {
    console.error(`\nThe canonical Price does not match @/lib/access/pricing: ${mismatch}`);
    process.exit(1);
  }

  console.log("");
  console.log(`product      ${setup.product.name}`);
  console.log(`product id   ${setup.product.id}   ${setup.createdProduct ? "(created)" : "(existing, reused)"}`);
  console.log(`price id     ${setup.price.id}   ${setup.createdPrice ? "(created)" : "(existing, reused)"}`);
  console.log(`amount       ${setup.price.unit_amount} minor units (${formatPremiumPrice()})`);
  console.log(`currency     ${(setup.price.currency ?? "").toUpperCase()}`);
  console.log(`recurrence   every ${setup.price.recurring?.interval_count} ${setup.price.recurring?.interval}`);
  console.log(`trial        ${PREMIUM_PRICE.trial ? "yes" : "none"}`);
  console.log("");
  console.log(`reconciled against @/lib/access/pricing: ok`);
  console.log("");
  console.log(`Set this in the environment:`);
  console.log(`  ${STRIPE_PREMIUM_PRICE_ID_VAR}=${setup.price.id}`);
}

main().catch((error: unknown) => {
  // Stripe errors can carry request context; the message is safe, the key is never in it.
  console.error(`stripe setup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
