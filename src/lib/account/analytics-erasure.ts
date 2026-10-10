/**
 * Erasing a deleted account's analytics, durably.
 *
 * ## Why the deletion record is held
 *
 * PostHog keys an identified person on the Urdais account id. The deletion
 * workflow nulls that id when it reaches `complete`, after which nothing in Urdais
 * can say which PostHog person belonged to the deleted account. So when analytics
 * is in use, a deletion that has removed the account and the Supabase user stops
 * at `auth_deleted` instead, still holding the account id, until PostHog has
 * accepted the erasure. Only then does it complete and drop the id.
 *
 * The reader is not kept waiting and nothing they can see depends on PostHog: at
 * `auth_deleted` their account and sign-in are gone, and they are told so. The
 * daily `/api/cron/analytics-erasure` then requests the erasure, retrying until
 * PostHog accepts; a PostHog outage delays it and loses nothing. The existing
 * states, lease and `last_error` column carry all of this: no new table.
 *
 * ## Not immediately, and "requested", not "erased"
 *
 * PostHog's `bulk_delete` deletes only events **captured before the request**, and
 * PostHog ingests asynchronously. Erasing at the moment of deletion would race the
 * reader's last few events still in flight, which would then recreate the person
 * with nothing left to erase it. So a held deletion is only settled once it is at
 * least `ERASURE_MIN_AGE` old.
 *
 * Settling means PostHog **accepted** the request (202): the person is removed
 * shortly after and its events are queued for deletion, which PostHog runs later
 * (off-peak, typically weekends on PostHog Cloud). Urdais records that the erasure
 * was requested and accepted. It does not, and cannot from this API, confirm that
 * every historical event is gone; nothing here claims it.
 *
 * ## When it applies
 *
 * Whenever this deployment has used PostHog: analytics is configured, or erasure
 * credentials are. Keep the credentials configured for as long as PostHog may hold
 * Urdais data, even after turning analytics off. With neither, a deletion completes
 * exactly as before.
 */

import { analyticsConfig } from "@/lib/analytics/config";
import { erasePostHogPerson, erasureConfig, POSTHOG_PERSONAL_API_KEY_VAR, type ErasureConfig, type ErasureOutcome } from "@/lib/analytics/erasure";
import { acquireLease, completeDeletion, releaseLease } from "@/lib/account/deletion-store";
import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";

/** `last_error` codes. Short machine codes only, per the column's constraint. */
export const ERASURE_PENDING = "analytics_erasure_pending";
export const ERASURE_FAILED = "analytics_erasure_failed";
export const ERASURE_UNCONFIGURED = "analytics_erasure_unconfigured";

/** Whether deletions on this deployment must erase analytics before completing. */
export function analyticsErasureRequired(env: Record<string, string | undefined> = process.env): boolean {
  const analyticsOn = analyticsConfig({ key: env.NEXT_PUBLIC_POSTHOG_KEY, host: env.NEXT_PUBLIC_POSTHOG_HOST, nodeEnv: env.NODE_ENV }) !== null;
  return analyticsOn || (env[POSTHOG_PERSONAL_API_KEY_VAR]?.trim() ?? "") !== "";
}

export type ErasureDeps = {
  readonly required: () => boolean;
  readonly config: () => ErasureConfig | { missing: string[] };
  readonly erase: (accountId: string, config: ErasureConfig) => Promise<ErasureOutcome>;
};

const DEFAULT_DEPS: ErasureDeps = {
  required: () => analyticsErasureRequired(),
  config: () => erasureConfig(),
  erase: (accountId, config) => erasePostHogPerson(accountId, config),
};

export type SettleOutcome =
  /** Completed without contacting PostHog: erasure not required, or nothing to erase. */
  | { readonly kind: "completed" }
  /**
   * PostHog accepted the erasure request; the deletion is complete. Event deletion
   * itself is asynchronous on PostHog's side and is not confirmed here.
   */
  | { readonly kind: "erasure_requested" }
  /** Still held at `auth_deleted`, with the account id, for the next attempt. */
  | { readonly kind: "held"; readonly code: string }
  /** Another attempt holds the lease, or the record is not at `auth_deleted`. */
  | { readonly kind: "skipped" };

/**
 * Settle one deletion held at `auth_deleted`: erase, then complete. Never throws.
 * Safe to run concurrently and repeatedly: the lease admits one attempt at a time,
 * a completed record is never leased again, and PostHog ignores a duplicate
 * erasure request for a person already queued.
 */
export async function settleHeldDeletion(sql: TokenSqlExecutor, deletionId: string, deps: ErasureDeps = DEFAULT_DEPS): Promise<SettleOutcome> {
  const record = await acquireLease(sql, deletionId).catch(() => null);
  if (!record) return { kind: "skipped" };
  const hold = async (code: string): Promise<SettleOutcome> => {
    await releaseLease(sql, deletionId, code).catch(() => undefined);
    return { kind: "held", code };
  };

  try {
    if (record.state !== "auth_deleted") {
      await releaseLease(sql, deletionId, null);
      return { kind: "skipped" };
    }
    if (!deps.required() || !record.accountId) {
      await completeDeletion(sql, deletionId);
      return { kind: "completed" };
    }
    const config = deps.config();
    if ("missing" in config) return hold(ERASURE_UNCONFIGURED);
    const outcome = await deps.erase(record.accountId, config);
    if (outcome.kind !== "queued") return hold(ERASURE_FAILED);
    await completeDeletion(sql, deletionId);
    return { kind: "erasure_requested" };
  } catch {
    return hold("database_error");
  }
}

/**
 * How long a held deletion waits before its erasure is requested, so the reader's
 * last events have been ingested (see the module comment). Generous: PostHog's
 * ingestion lag is normally seconds to minutes.
 */
export const ERASURE_MIN_AGE = "1 hour";

/** Deletions waiting at `auth_deleted` for at least `ERASURE_MIN_AGE`, oldest first. Ids only. */
export const HELD_DELETIONS_SQL = `
  select id from identity.account_deletions
   where state = 'auth_deleted'
     and (auth_deleted_at is null or auth_deleted_at < now() - interval '${ERASURE_MIN_AGE}')
   order by auth_deleted_at asc nulls first
   limit $1
`;

export type SweepSummary = {
  readonly completed: number;
  /** PostHog accepted the erasure request. Not a confirmation that events are gone. */
  readonly erasure_requested: number;
  readonly held: number;
  readonly skipped: number;
  readonly codes: readonly string[];
};

/** Settle every held deletion, up to `limit`. Used by the daily cron. */
export async function settleHeldDeletions(sql: TokenSqlExecutor, limit = 50, deps: ErasureDeps = DEFAULT_DEPS): Promise<SweepSummary> {
  const { rows } = await sql.query(HELD_DELETIONS_SQL, [limit]);
  const summary = { completed: 0, erasure_requested: 0, held: 0, skipped: 0, codes: [] as string[] };
  for (const row of rows) {
    if (typeof row.id !== "string") continue;
    const outcome = await settleHeldDeletion(sql, row.id, deps);
    summary[outcome.kind] += 1;
    if (outcome.kind === "held" && !summary.codes.includes(outcome.code)) summary.codes.push(outcome.code);
  }
  return summary;
}
