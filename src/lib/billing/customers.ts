/**
 * The Urdais account's Stripe Customer.
 *
 * ## The relationship is account id <-> customer id, never email
 *
 * A Customer is found by the mapping row, not by searching Stripe for an address.
 * Email is mutable on both sides: a reader changes their Stripe email, or two
 * providers assert the same address, and an email-keyed lookup then attaches one
 * person's subscription to another's account. Phase 1 made the same decision for
 * `identity.accounts`, where `email` is explicitly a support copy rather than an
 * identity — this is the billing half of that.
 *
 * Stripe's own view of the customer's email is therefore initialisation copy: it
 * makes receipts land somewhere useful, and it is never read back to decide who
 * anybody is.
 *
 * ## Creating at most one, under concurrency
 *
 * Two simultaneous first checkouts can both reach Stripe before either writes.
 * Both create a Stripe Customer; the database primary key lets exactly one become
 * the account's mapping, and both callers continue with the winner. The loser is
 * an unattached Customer with no subscription and no payment method — visible in
 * the Stripe dashboard, harmless, and a far better outcome than two mappings for
 * one reader, which is two invoice histories and a subscription they cannot find.
 *
 * Checking first and creating second cannot fix that race; it only narrows it.
 */

import type Stripe from "stripe";

import { catalogMetadata, METADATA_ACCOUNT_ID } from "@/lib/billing/catalog";
import type { StripeMode } from "@/lib/billing/mode";
import { claimCustomerId, readCustomerId } from "@/lib/billing/store";
import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";

/**
 * The account's Stripe Customer id, creating one only if it has none.
 *
 * The returned id is always the mapped one, which under a lost race is not the id
 * this call created.
 */
export async function resolveStripeCustomerId(
  stripe: Stripe,
  sql: TokenSqlExecutor,
  input: {
    readonly accountId: string;
    readonly email: string | null;
    readonly mode: StripeMode;
  },
): Promise<string> {
  const existing = await readCustomerId(sql, input.accountId);
  if (existing) return existing;

  const created = await stripe.customers.create({
    // Initialisation only. Never read back as identity.
    ...(input.email ? { email: input.email } : {}),
    metadata: {
      ...catalogMetadata(input.mode),
      // The trusted link back to Urdais, written by the server from the session.
      [METADATA_ACCOUNT_ID]: input.accountId,
    },
  });

  return claimCustomerId(sql, input.accountId, created.id, input.mode === "live");
}
