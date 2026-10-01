/**
 * The Account Hub read model: everything `/account` renders, resolved server-side.
 *
 * One function, `resolveAccountHub`, so the page never touches SQL, Stripe or a
 * status string. It reads, in order:
 *
 *   1. the Supabase identity       -- who is signed in (Auth server, never the request)
 *   2. the Urdais account          -- `resolveUrdaisAccount`, the same primitive
 *                                     `resolveViewer` uses, keyed on the auth subject
 *   3. the premium entitlement     -- `loadPremiumEntitlement`, the authorization source
 *   4. the billing subscriptions   -- `identity.billing_subscriptions`, the local
 *                                     state Stripe's signed webhooks reconcile
 *
 * ## Read-only, and Stripe-free
 *
 * Viewing `/account` makes no Stripe API call and writes no billing state: no
 * Customer, no Checkout Session, no subscription change, no entitlement change.
 * Subscription state comes from the webhook-reconciled table, which is what Phase 5
 * built it for. Stripe is needed only to *act* -- buying (Plan / Pay) and managing
 * (Phase 7C) -- so Stripe being down does not stop the hub rendering.
 *
 * The one write reachable from here is `resolveUrdaisAccount`'s provisioning upsert,
 * shared with every authenticated page: it creates the account row on first sight
 * and otherwise only keeps its support email in step. It is idempotent on
 * (provider, subject), so it cannot create a second account.
 *
 * ## Failure is distinguished from absence
 *
 * A read that fails yields `unavailable`, never `none`. "We could not load this"
 * and "this account has never subscribed" lead to different actions -- the second
 * offers Subscribe -- so conflating them would invite a subscriber to buy twice.
 */

import { hasPremiumEntitlement, type Viewer } from "@/lib/access/entitlement";
import { loadPremiumEntitlement } from "@/lib/access/entitlement-store";
import { AccountDeletionPendingError, resolveUrdaisAccount, SUPABASE_AUTH_PROVIDER } from "@/lib/auth/accounts";
import { readInFlightDeletion } from "@/lib/account/deletion-store";
import { resolveSupabaseIdentity } from "@/lib/auth/identity";
import { billingAvailability } from "@/lib/billing/mode";
import {
  actionFor,
  presentSubscription,
  type AccountAction,
  type AccountSubscriptionRow,
  type SubscriptionPresentation,
} from "@/lib/account/subscription-presentation";
import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";
import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";

export type AccountProfile = {
  /** From the Auth server. Null for an account with no address. */
  readonly email: string | null;
  /** `email_confirmed_at is not null`, from the Auth server. */
  readonly emailVerified: boolean;
};

export type AccountHub =
  /** No session. `/account` sends the reader to sign in. */
  | { readonly kind: "anonymous" }
  /** Signed in, but the account could not be loaded. Nothing about billing is claimed. */
  | { readonly kind: "unavailable"; readonly profile: AccountProfile }
  /**
   * An account deletion is past billing termination but not finished (Phase 7D).
   * Billing is cancelled and premium revoked; the page offers only to finish.
   */
  | { readonly kind: "deletion_pending"; readonly profile: AccountProfile }
  | {
      readonly kind: "ready";
      readonly profile: AccountProfile;
      readonly subscription: SubscriptionPresentation;
      readonly action: AccountAction | null;
    };

/**
 * Every subscription for one account, newest first. Read-only; the account id is
 * the server-resolved one, so there is no way to ask about another account.
 */
export const ACCOUNT_SUBSCRIPTIONS_QUERY = `
  select status, stripe_price_id, cancel_at_period_end, current_period_end
    from identity.billing_subscriptions
   where account_id = $1
   order by coalesce(last_event_at, created_at) desc
`;

function isoOrNull(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim() !== "") return value;
  return null;
}

export async function readAccountSubscriptions(sql: TokenSqlExecutor, accountId: string): Promise<AccountSubscriptionRow[]> {
  const { rows } = await sql.query(ACCOUNT_SUBSCRIPTIONS_QUERY, [accountId]);
  return rows.map((row) => ({
    status: typeof row.status === "string" ? row.status : "",
    stripePriceId: typeof row.stripe_price_id === "string" ? row.stripe_price_id : "",
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    currentPeriodEnd: isoOrNull(row.current_period_end),
  }));
}

/** The configured canonical Price id, read from configuration -- no Stripe call. */
function canonicalPriceId(): string | null {
  const availability = billingAvailability();
  return availability.kind === "available" ? availability.priceId : null;
}

export async function resolveAccountHub(): Promise<AccountHub> {
  const resolution = await resolveSupabaseIdentity();
  if (resolution.kind !== "authenticated") return { kind: "anonymous" };

  const { identity } = resolution;
  const profile: AccountProfile = { email: identity.email, emailVerified: identity.emailVerified };

  let sql: TokenSqlExecutor;
  let accountId: string;
  let viewer: Viewer;
  try {
    const databaseUrl = resolveTokenDatabaseUrl();
    if (!databaseUrl) {
      console.error("account hub: no database configured");
      return { kind: "unavailable", profile };
    }
    sql = await tokenSqlExecutor(databaseUrl);
    // A deletion past billing termination owns this identity now, whether or not
    // the account row still exists.
    const deletion = await readInFlightDeletion(sql, SUPABASE_AUTH_PROVIDER, identity.subject);
    if (deletion && deletion.state !== "requested") return { kind: "deletion_pending", profile };
    const account = await resolveUrdaisAccount(sql, identity);
    accountId = account.id;
    viewer = {
      authentication: { kind: "authenticated", accountId, emailVerified: identity.emailVerified },
      premiumEntitlement: await loadPremiumEntitlement(sql, accountId),
    };
  } catch (error) {
    if (error instanceof AccountDeletionPendingError) return { kind: "deletion_pending", profile };
    console.error(`account hub: account could not be loaded (${error instanceof Error ? error.message : String(error)})`);
    return { kind: "unavailable", profile };
  }

  // Billing is read separately so a failure here costs only the subscription
  // section, never the account itself.
  let subscription: SubscriptionPresentation;
  try {
    subscription = presentSubscription({
      subscriptions: await readAccountSubscriptions(sql, accountId),
      // The canonical authorization answer, as every premium surface computes it.
      entitlementGrants: hasPremiumEntitlement(viewer),
      entitlementSource: viewer.premiumEntitlement?.source ?? null,
      canonicalPriceId: canonicalPriceId(),
    });
  } catch (error) {
    console.error(`account hub: billing could not be read (${error instanceof Error ? error.message : String(error)})`);
    subscription = { kind: "unavailable", reason: "read_failed" };
  }

  if (subscription.kind === "unavailable" && subscription.reason === "inconsistent") {
    // Worth an operator's attention: the entitlement and the billing rows disagree.
    // Authorization is unaffected -- it reads the entitlement alone.
    console.warn(`account hub: billing and entitlement disagree for account ${accountId}`);
  }

  return { kind: "ready", profile, subscription, action: actionFor(subscription) };
}
