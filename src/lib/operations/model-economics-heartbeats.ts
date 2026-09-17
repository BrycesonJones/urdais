import type { SqlExecutor } from "@/lib/utvi/store";

export type SchedulerTrigger = "scheduled" | "operator";

export type UtviHeartbeatInput = {
  ranAt: string;
  trigger: SchedulerTrigger;
  outcome: "succeeded" | "failed";
  collectionDate: string | null;
  settlementDate: string | null;
  summary: Record<string, unknown>;
  detail: string | null;
};

export type TokenVerificationHeartbeatInput = {
  ranAt: string;
  trigger: SchedulerTrigger;
  outcome: "current" | "review_due" | "failed";
  checkedAt: string | null;
  reviewIntervalDays: number | null;
  latestVerifiedAt: string | null;
  reviewDue: readonly string[];
  neverVerified: readonly string[];
  summary: Record<string, unknown>;
  detail: string | null;
};

/** Persist one UTVI operational heartbeat. This table carries no UTVI market data. */
export async function recordUtviHeartbeat(sql: SqlExecutor, input: UtviHeartbeatInput): Promise<void> {
  await sql.query(
    `insert into pipeline.utvi_check_runs
       (ran_at, trigger, outcome, collection_date, settlement_date, summary, detail)
     values ($1::timestamptz, $2, $3, $4::date, $5::date, $6::jsonb, $7)`,
    [
      input.ranAt,
      input.trigger,
      input.outcome,
      input.collectionDate,
      input.settlementDate,
      JSON.stringify(input.summary),
      input.detail,
    ],
  );
}

/** Persist one Token Price watchdog heartbeat. This never represents a provider read. */
export async function recordTokenVerificationHeartbeat(
  sql: SqlExecutor,
  input: TokenVerificationHeartbeatInput,
): Promise<void> {
  await sql.query(
    `insert into pipeline.token_verification_check_runs
       (ran_at, trigger, outcome, checked_at, review_interval_days, latest_verified_at,
        review_due, never_verified, summary, detail)
     values ($1::timestamptz, $2, $3, $4::timestamptz, $5, $6::timestamptz,
             $7::text[], $8::text[], $9::jsonb, $10)`,
    [
      input.ranAt,
      input.trigger,
      input.outcome,
      input.checkedAt,
      input.reviewIntervalDays,
      input.latestVerifiedAt,
      [...input.reviewDue],
      [...input.neverVerified],
      JSON.stringify(input.summary),
      input.detail,
    ],
  );
}

export type ScheduledHeartbeat = {
  ranAt: string;
  outcome: string;
  detail: string | null;
};

/** Latest successful scheduled UTVI heartbeat; operator runs never satisfy scheduler liveness. */
export async function latestScheduledUtviHeartbeat(sql: SqlExecutor): Promise<ScheduledHeartbeat | null> {
  const { rows } = await sql.query(
    `select ran_at::text as ran_at, outcome, detail
       from pipeline.utvi_check_runs
      where trigger = 'scheduled' and outcome = 'succeeded'
      order by ran_at desc
      limit 1`,
    [],
  );
  const row = rows[0];
  if (!row) return null;
  return { ranAt: String(row.ran_at), outcome: String(row.outcome), detail: row.detail === null ? null : String(row.detail) };
}

export type TokenScheduledHeartbeat = ScheduledHeartbeat & {
  checkedAt: string | null;
  reviewIntervalDays: number | null;
  latestVerifiedAt: string | null;
};

/** Latest nonfailed scheduled Token Price watchdog heartbeat. */
export async function latestScheduledTokenVerificationHeartbeat(
  sql: SqlExecutor,
): Promise<TokenScheduledHeartbeat | null> {
  const { rows } = await sql.query(
    `select ran_at::text as ran_at, outcome, detail, checked_at::text as checked_at,
            review_interval_days, latest_verified_at::text as latest_verified_at
       from pipeline.token_verification_check_runs
      where trigger = 'scheduled' and outcome <> 'failed'
      order by ran_at desc
      limit 1`,
    [],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ranAt: String(row.ran_at),
    outcome: String(row.outcome),
    detail: row.detail === null ? null : String(row.detail),
    checkedAt: row.checked_at === null ? null : String(row.checked_at),
    reviewIntervalDays: row.review_interval_days === null ? null : Number(row.review_interval_days),
    latestVerifiedAt: row.latest_verified_at === null ? null : String(row.latest_verified_at),
  };
}
