import { describe, expect, it, vi } from "vitest";

import {
  latestScheduledTokenVerificationHeartbeat,
  latestScheduledUtviHeartbeat,
  recordTokenVerificationHeartbeat,
  recordUtviHeartbeat,
} from "@/lib/operations/model-economics-heartbeats";
import type { SqlExecutor } from "@/lib/utvi/store";

function executor(rows: Record<string, unknown>[] = []) {
  const query = vi.fn(async (_text: string, _params: readonly unknown[]) => ({ rows }));
  return { sql: { query } as SqlExecutor, query };
}

describe("Model Economics scheduler heartbeats", () => {
  it("records UTVI scheduler identity separately from its market data", async () => {
    const { sql, query } = executor();
    await recordUtviHeartbeat(sql, {
      ranAt: "2026-09-17T02:00:03Z",
      trigger: "scheduled",
      outcome: "succeeded",
      collectionDate: "2026-09-16",
      settlementDate: "2026-09-15",
      summary: { published: 1 },
      detail: null,
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [statement, params] = query.mock.calls[0]!;
    expect(statement).toContain("pipeline.utvi_check_runs");
    expect(params).toContain("scheduled");
    expect(params).toContain("2026-09-16");
  });

  it("records watchdog liveness without pretending it collected a price", async () => {
    const { sql, query } = executor();
    await recordTokenVerificationHeartbeat(sql, {
      ranAt: "2026-09-17T07:00:02Z",
      trigger: "scheduled",
      outcome: "current",
      checkedAt: "2026-09-17T07:00:02Z",
      reviewIntervalDays: 7,
      latestVerifiedAt: "2026-09-14T22:16:11Z",
      reviewDue: [],
      neverVerified: [],
      summary: { providers: 6 },
      detail: null,
    });

    const [statement, params] = query.mock.calls[0]!;
    expect(statement).toContain("pipeline.token_verification_check_runs");
    expect(statement).not.toContain("token_price_observations");
    expect(params).toContain("scheduled");
    expect(params).toContain("2026-09-14T22:16:11Z");
  });

  it("reads the latest scheduled UTVI run, including a failure", async () => {
    const { sql, query } = executor([
      { ran_at: "2026-09-17 02:00:03+00", outcome: "failed", detail: "source unavailable" },
    ]);
    const row = await latestScheduledUtviHeartbeat(sql);
    expect(row).toEqual({
      ranAt: "2026-09-17 02:00:03+00",
      outcome: "failed",
      detail: "source unavailable",
    });
    expect(query.mock.calls[0]![0]).toContain("trigger = 'scheduled'");
  });

  it("reads the latest scheduled token watchdog even when human review is due", async () => {
    const { sql } = executor([
      {
        ran_at: "2026-09-17 07:00:02+00",
        outcome: "review_due",
        detail: null,
        checked_at: "2026-09-17 07:00:02+00",
        review_interval_days: 7,
        latest_verified_at: "2026-09-09 22:16:11+00",
      },
    ]);
    const row = await latestScheduledTokenVerificationHeartbeat(sql);
    expect(row?.outcome).toBe("review_due");
    expect(row?.reviewIntervalDays).toBe(7);
    expect(row?.latestVerifiedAt).toBe("2026-09-09 22:16:11+00");
  });
});
