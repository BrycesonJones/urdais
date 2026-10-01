/**
 * Account deletion: the workflow.
 *
 * > Cancel subscription and Delete account are intentionally different operations.
 * > Cancellation preserves access through the already-paid billing period. Account
 * > deletion terminates the Urdais relationship immediately and forfeits remaining
 * > paid access.
 *
 * Stripe, PostgreSQL and Supabase Auth are not one transaction, so this is a
 * resumable state machine over `identity.account_deletions` (see
 * `deletion-store.ts`). Every stage re-reads the truth it depends on and is safe
 * to repeat; a retry, a double submit or a resumed attempt converges on the same
 * terminal result.
 *
 * ## Ordering, and the two invariants it protects
 *
 *   0. preflight      authenticated; recent sign-in (15 min); Auth admin and, if the
 *                     account has a Stripe Customer, Stripe are both available.
 *                     Fails here -> nothing changed.
 *   1. requested      record opened.
 *   2. billing        Stripe lists and cancels every potentially billable
 *                     subscription, then re-lists to prove none remain.
 *                     Fails here -> account intact, still able to manage billing.
 *   3. billing_terminated   + entitlement revoked, in one transaction.
 *   4. Stripe Customer metadata detached; account row deleted (billing rows
 *                     detach, entitlement cascades) -> local_cleanup_complete.
 *   5. Supabase Auth user deleted -> auth_deleted.
 *   6. complete       identifiers nulled.
 *
 *   - Never report success while a subscription can still bill: `complete` is only
 *     reachable through stage 2's verified termination.
 *   - Never remove the ability to manage billing before billing is terminated: no
 *     local or Auth deletion happens before stage 3.
 *
 * Nothing is read from the request but the confirmation word; the account,
 * Customer, subscriptions and Auth user are all resolved server-side.
 */

import { resolveSupabaseIdentity } from "@/lib/auth/identity";
import { authAdminAvailability, deleteAuthUser } from "@/lib/auth/admin";
import { resolveUrdaisAccount, SUPABASE_AUTH_PROVIDER } from "@/lib/auth/accounts";
import { checkRecentAuthentication } from "@/lib/auth/recent-auth";
import { readCustomerMapping } from "@/lib/billing/store";
import { stripeContext } from "@/lib/billing/stripe";
import { detachStripeCustomer, terminateBilling } from "@/lib/account/deletion-billing";
import {
  acquireLease,
  completeDeletion,
  markAuthDeleted,
  markBillingTerminated,
  openDeletion,
  readInFlightDeletion,
  releaseLease,
  removeLocalAccount,
  type DeletionRecord,
} from "@/lib/account/deletion-store";
import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";
import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";

export type DeletionOutcome =
  | { readonly kind: "complete" }
  | { readonly kind: "anonymous" }
  /** Sign-in older than 15 minutes: verify with an emailed code first. Nothing changed. */
  | { readonly kind: "reauth_required" }
  /** Deletion cannot start here (Auth admin, Stripe or the database unavailable). Nothing changed. */
  | { readonly kind: "unavailable" }
  /** Another attempt holds the lease right now. */
  | { readonly kind: "in_progress" }
  /**
   * Billing could not be verified or terminated. The account was NOT deleted and
   * can still manage billing. `anyCanceled`: this attempt cancelled something
   * before failing, so "nothing changed" would be false.
   */
  | { readonly kind: "billing_not_terminated"; readonly anyCanceled: boolean }
  /**
   * Billing is terminated and premium revoked, but a later stage failed. The
   * deletion is recorded and resumable; it is not complete.
   */
  | { readonly kind: "incomplete" };

/** Whether account deletion can run on this deployment at all. Configuration only. */
export function accountDeletionAvailable(): boolean {
  return authAdminAvailability().kind === "available";
}

/**
 * Start (or resume) deleting the current reader's account.
 *
 * `confirmed` is the typed confirmation, required to *start* -- resuming a
 * deletion that is already past billing termination needs only the session.
 */
export async function deleteCurrentAccount(input: { readonly confirmed: boolean }): Promise<DeletionOutcome> {
  const resolution = await resolveSupabaseIdentity();
  if (resolution.kind !== "authenticated") return { kind: "anonymous" };
  const { identity } = resolution;

  // A deployment without the Auth admin key must refuse before anything
  // irreversible, never cancel billing and then stall.
  if (!accountDeletionAvailable()) return { kind: "unavailable" };

  let sql: TokenSqlExecutor;
  try {
    const databaseUrl = resolveTokenDatabaseUrl();
    if (!databaseUrl) return { kind: "unavailable" };
    sql = await tokenSqlExecutor(databaseUrl);
  } catch {
    return { kind: "unavailable" };
  }

  let record: DeletionRecord;
  try {
    const inFlight = await readInFlightDeletion(sql, SUPABASE_AUTH_PROVIDER, identity.subject);

    if (!inFlight || inFlight.state === "requested") {
      // Starting -- or retrying a start that never terminated billing -- is the
      // destructive decision, so it needs both the confirmation and a recent sign-in.
      if (!input.confirmed) return { kind: "unavailable" };
      const recent = await checkRecentAuthentication(identity.subject);
      if (recent.kind === "stale") return { kind: "reauth_required" };
      if (recent.kind !== "recent") return { kind: "unavailable" };
    }

    if (inFlight) {
      record = inFlight;
    } else {
      const account = await resolveUrdaisAccount(sql, identity);
      const mapping = await readCustomerMapping(sql, account.id);
      // Stripe must be reachable *before* the record exists if there is billing
      // to terminate; otherwise there is nothing to verify and no reason to start.
      if (mapping && stripeContext().kind !== "ready") return { kind: "unavailable" };
      record = await openDeletion(sql, {
        accountId: account.id,
        provider: SUPABASE_AUTH_PROVIDER,
        subject: identity.subject,
        stripeCustomerId: mapping?.stripeCustomerId ?? null,
      });
    }
  } catch (error) {
    console.error(`account deletion: could not open (${error instanceof Error ? error.name : "error"})`);
    return { kind: "unavailable" };
  }

  const leased = await acquireLease(sql, record.id).catch(() => null);
  if (!leased) return { kind: "in_progress" };

  return advance(sql, leased);
}

/** Run every remaining stage, releasing the lease with a code on any failure. */
async function advance(sql: TokenSqlExecutor, start: DeletionRecord): Promise<DeletionOutcome> {
  let record = start;
  // True once Stripe has confirmed termination in this attempt, even if recording
  // it then fails -- after that, "nothing changed" is no longer true.
  let terminatedAtStripe = false;
  const fail = async (code: string, outcome: DeletionOutcome): Promise<DeletionOutcome> => {
    console.error(`account deletion ${record.id}: stopped at ${record.state} (${code})`);
    await releaseLease(sql, record.id, code).catch(() => undefined);
    return outcome;
  };

  try {
    // ------------------------------------------------ 2-3. billing termination
    if (record.state === "requested") {
      if (record.stripeCustomerId) {
        const context = stripeContext();
        if (context.kind !== "ready") return fail("stripe_unavailable", { kind: "billing_not_terminated", anyCanceled: false });
        const termination = await terminateBilling(context.stripe, record.stripeCustomerId, context.availability.mode);
        if (termination.kind === "failed") {
          return fail(termination.reason, { kind: "billing_not_terminated", anyCanceled: termination.anyCanceled });
        }
        terminatedAtStripe = true;
      }
      await markBillingTerminated(sql, record);
      record = { ...record, state: "billing_terminated" };
    }

    // ---------------------------------------------------- 4. local cleanup
    if (record.state === "billing_terminated") {
      if (record.stripeCustomerId) {
        const context = stripeContext();
        if (context.kind !== "ready") return fail("stripe_unavailable", { kind: "incomplete" });
        if (!(await detachStripeCustomer(context.stripe, record.stripeCustomerId))) {
          return fail("stripe_detach_failed", { kind: "incomplete" });
        }
      }
      await removeLocalAccount(sql, record);
      record = { ...record, state: "local_cleanup_complete" };
    }

    // ---------------------------------------------------- 5. Supabase Auth
    if (record.state === "local_cleanup_complete") {
      if (!record.authSubject) return fail("missing_subject", { kind: "incomplete" });
      const deleted = await deleteAuthUser(record.authSubject);
      if (deleted.kind !== "deleted" && deleted.kind !== "already_absent") {
        return fail(deleted.kind === "failed" ? deleted.code : "auth_admin_unavailable", { kind: "incomplete" });
      }
      await markAuthDeleted(sql, record.id);
      record = { ...record, state: "auth_deleted" };
    }

    // ---------------------------------------------------- 6. complete
    if (record.state === "auth_deleted") {
      await completeDeletion(sql, record.id);
    }
    return { kind: "complete" };
  } catch {
    // A database failure mid-stage. Whatever committed stays committed; the next
    // attempt resumes from the recorded state.
    const pastBilling = record.state !== "requested" || terminatedAtStripe;
    return fail("database_error", pastBilling ? { kind: "incomplete" } : { kind: "billing_not_terminated", anyCanceled: false });
  }
}
