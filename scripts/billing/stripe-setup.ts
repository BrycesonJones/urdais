/**
 * Create or reconcile the canonical Urdais Stripe Product and Price.
 *
 * Idempotent: discovers by metadata first and creates only what is missing, so
 * running it twice does not leave two "Urdais Premium" Products behind. Safe to
 * re-run after a key rotation or on a fresh Stripe account.
 *
 *   npm run billing:setup
 *
 * Refuses to run against live Stripe **unless explicitly told twice**:
 *
 *   npm run billing:setup -- --live --confirm
 *
 * Creating the live catalogue charges nobody — a Product and a Price are not a
 * payment — but it is the object real customers are billed against, and a script
 * that could touch it by accident is a script that eventually will. Two flags, and
 * the mode is still checked against Stripe rather than the key's prefix.
 *
 * Prints the Product and Price ids, which are not secrets, and never the key.
 */

import { PREMIUM_PRICE, formatPremiumPrice } from "@/lib/access/pricing";
import { PREMIUM_TAX_CODE, ensurePremiumCatalog, describePriceMismatch } from "@/lib/billing/catalog";
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
  const argv = process.argv.slice(2);
  const wantsLive = argv.includes("--live");
  const confirmed = argv.includes("--confirm");

  if (mode === "live" && !(wantsLive && confirmed)) {
    console.error("Refusing to run against LIVE Stripe without an explicit opt-in.");
    console.error("This would create or reconcile the catalogue real customers are billed against.");
    console.error("");
    console.error("  npm run billing:setup -- --live --confirm");
    process.exit(2);
  }
  if (mode === "test" && wantsLive) {
    // Guards the other direction: --live against a test key almost certainly means
    // the wrong credential is loaded, and silently doing test setup would hide it.
    console.error("--live was passed but the configured key is a TEST key. Stopping rather than guessing.");
    process.exit(2);
  }

  const stripe = new Stripe(key, { appInfo: { name: "Urdais setup" }, maxNetworkRetries: 2 });

  // Confirm the mode with Stripe itself, not only by the key's prefix. A prefix is a
  // string; `livemode` is the API's own answer, and the two disagreeing means
  // something is wrong that no amount of local reasoning will fix.
  const balance = await stripe.balance.retrieve();
  const expectedLivemode = mode === "live";
  if (balance.livemode !== expectedLivemode) {
    console.error(`Stripe reports livemode=${balance.livemode} for a ${mode}-mode key. Stopping.`);
    process.exit(2);
  }
  console.log(`Stripe ${mode} authentication succeeded.`);
  if (mode === "live") console.log("Operating against LIVE Stripe.\n");

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
  console.log(`tax code     ${PREMIUM_TAX_CODE}   (required by Managed Payments; CONFIRM THIS CLASSIFICATION)`);
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
