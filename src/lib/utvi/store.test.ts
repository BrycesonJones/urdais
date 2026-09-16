import { describe, expect, it } from "vitest";

import {
  applySnapshot,
  publishCalculation,
  recordRetrieval,
  retrievalIdempotencyKey,
  type SqlExecutor,
  type UtviLineage,
} from "@/lib/utvi/store";
import type { DailySnapshot, RetrievalResult, UtviCalculation } from "@/lib/utvi/types";

/**
 * A scripted executor. Each entry answers the next query in order, so a test states exactly
 * what the database replies and then asserts what was written. The real database's own
 * invariants are exercised separately, in supabase/tests/290_utvi_observed_token_volume.sql.
 */
function scripted(answers: Record<string, unknown>[][]): SqlExecutor & {
  calls: { text: string; params: readonly unknown[] }[];
} {
  const calls: { text: string; params: readonly unknown[] }[] = [];
  let index = 0;
  return {
    calls,
    async query(text: string, params: readonly unknown[]) {
      calls.push({ text, params });
      return { rows: answers[index++] ?? [] };
    },
  };
}

const LINEAGE: UtviLineage = {
  instrumentId: "11111111-1111-4111-8111-111111111111",
  instrumentSpecVersionId: "22222222-2222-4222-8222-222222222222",
  methodologyVersionId: "33333333-3333-4333-8333-333333333333",
  methodologyVersion: "0.1.1-draft",
  methodologyStatus: "draft",
  sourceInterfaceId: "44444444-4444-4444-8444-444444444444",
  permissionGrantId: "55555555-5555-4555-8555-555555555555",
  servingPlatformId: "66666666-6666-4666-8666-666666666666",
  labProviderIds: new Map([["deepseek", "77777777-7777-4777-8777-777777777777"]]),
};

const AS_OF = "2026-09-16T01:00:33.578Z";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function snapshot(hash = HASH_A, overrides: Partial<DailySnapshot> = {}): DailySnapshot {
  return {
    observationDate: "2026-09-15",
    coverageState: "covered_observed",
    totalTokens: 1050n,
    attributedTokens: 1000n,
    residualTokens: 50n,
    namedRowCount: 2,
    residualRowPresent: true,
    dateContentHash: hash,
    settlementState: "provisional",
    observations: [
      {
        permaslug: "deepseek/deepseek-v4",
        namespace: "deepseek",
        variant: null,
        baseSlug: "deepseek/deepseek-v4",
        tokens: 1000n,
        isResidual: false,
        labSlug: "deepseek",
        labAttributionState: "evidenced",
        qualityFlags: [],
      },
      {
        permaslug: "other",
        namespace: null,
        variant: null,
        baseSlug: "other",
        tokens: 50n,
        isResidual: true,
        labSlug: null,
        labAttributionState: "not_applicable",
        qualityFlags: ["RESIDUAL_UNATTRIBUTED"],
      },
    ],
    ...overrides,
  };
}

const CALCULATION: UtviCalculation = {
  calculationDate: "2026-09-15",
  totalObservedTokens: 1050n,
  modelResidualTokens: 50n,
  labResidualTokens: 0n,
  attributedTokens: 1000n,
  eligibleRowCount: 2,
  excludedRowCount: 0,
  exclusions: [],
  coverageState: "covered_observed",
  settlementState: "provisional",
  sourceContentHash: HASH_A,
};

const activeRow = (hash: string, settlement = "provisional", total = "1050") => [
  {
    id: "99999999-9999-4999-8999-999999999999",
    observation_date: "2026-09-15",
    coverage_state: "covered_observed",
    date_content_hash: hash,
    settlement_state: settlement,
    total_tokens: total,
  },
];

const RETRIEVAL: RetrievalResult = {
  outcome: "succeeded",
  outcomeDetail: null,
  httpStatus: 200,
  responseHash: HASH_A,
  responseByteLength: 5415,
  requestedStartDate: "2026-09-15",
  requestedEndDate: "2026-09-15",
  actualStartDate: "2026-09-15",
  actualEndDate: "2026-09-15",
  sourceAsOf: AS_OF,
  datasetVersion: "v1",
  rowCount: 51,
  retrievedAt: "2026-09-16T01:00:33.600Z",
  requestUrl: "https://openrouter.ai/api/v1/datasets/rankings-daily?start_date=2026-09-15&end_date=2026-09-15&period=day",
  requestParameters: { start_date: "2026-09-15", end_date: "2026-09-15", period: "day" },
  response: null,
};

describe("retrieval identity", () => {
  it("is deterministic in the requested window and the retrieval instant", () => {
    expect(retrievalIdempotencyKey(RETRIEVAL)).toBe(
      "openrouter-datasets-rankings-daily|2026-09-15|2026-09-15|day|2026-09-16T01:00:33.600Z",
    );
  });

  it("differs between two deliberate reads of the same window, so both are recorded", () => {
    const later = { ...RETRIEVAL, retrievedAt: "2026-09-16T01:05:16.286Z" };
    expect(retrievalIdempotencyKey(later)).not.toBe(retrievalIdempotencyKey(RETRIEVAL));
  });
});

describe("recording a retrieval", () => {
  it("records a production purpose with the permission grant that permits it", async () => {
    const sql = scripted([[{ id: "r1" }], [{ id: "u1" }]]);
    await recordRetrieval(sql, LINEAGE, RETRIEVAL, "test");
    const insert = sql.calls[0]!;
    expect(insert.text).toContain("pipeline.source_retrievals");
    expect(insert.text).toContain("'production'");
    expect(insert.params).toContain(LINEAGE.permissionGrantId);
  });

  it("stores the resolved window alongside the requested one, never instead of it", async () => {
    const clamped = { ...RETRIEVAL, requestedEndDate: "2026-09-16", actualEndDate: "2026-09-15" };
    const sql = scripted([[{ id: "r1" }], [{ id: "u1" }]]);
    await recordRetrieval(sql, LINEAGE, clamped, "test");
    const insert = sql.calls[1]!;
    expect(insert.params).toContain("2026-09-16");
    expect(insert.params).toContain("2026-09-15");
  });

  it("records a failed read as a fact, with its outcome and no evidence of success", async () => {
    const failed: RetrievalResult = {
      ...RETRIEVAL,
      outcome: "http_error",
      outcomeDetail: "HTTP 429: Rate limit exceeded",
      httpStatus: 429,
      actualStartDate: null,
      actualEndDate: null,
      sourceAsOf: null,
      datasetVersion: null,
      rowCount: null,
    };
    const sql = scripted([[{ id: "r1" }], [{ id: "u1" }]]);
    await recordRetrieval(sql, LINEAGE, failed, "test");
    expect(sql.calls[0]!.params).toContain(429);
    // A failure claims no enumeration, because it enumerated nothing.
    expect(sql.calls[0]!.params).toContain("unknown");
    expect(sql.calls[1]!.params).toContain("http_error");
  });
});

describe("applying a snapshot", () => {
  it("creates the first snapshot for a date", async () => {
    const sql = scripted([
      [], // no active snapshot
      [{ id: "s1" }], // insert snapshot
      [], // observation 1
      [], // observation 2
    ]);
    const outcome = await applySnapshot(sql, LINEAGE, "u1", snapshot(), AS_OF);
    expect(outcome).toEqual({ kind: "created", snapshotId: "s1" });
    expect(sql.calls.some((c) => c.text.includes("insert into pipeline.utvi_daily_snapshots"))).toBe(true);
  });

  it("confirms an identical re-read without writing a second snapshot", async () => {
    // The idempotency rule, and it is decided by content rather than by time.
    const sql = scripted([activeRow(HASH_A)]);
    const outcome = await applySnapshot(sql, LINEAGE, "u2", snapshot(HASH_A), AS_OF);
    expect(outcome).toEqual({ kind: "confirmed", snapshotId: "99999999-9999-4999-8999-999999999999" });
    expect(sql.calls).toHaveLength(1);
    expect(sql.calls.some((c) => c.text.includes("insert into"))).toBe(false);
  });

  it("settles an identical re-read whose date has since stopped moving, and nothing else", async () => {
    const sql = scripted([activeRow(HASH_A, "provisional")]);
    const outcome = await applySnapshot(
      sql,
      LINEAGE,
      "u2",
      snapshot(HASH_A, { settlementState: "final" }),
      AS_OF,
    );
    expect(outcome.kind).toBe("settled");
    const update = sql.calls[1]!;
    expect(update.text).toContain("set settlement_state = 'final'");
    // The one thing it must not do is touch the arithmetic.
    expect(update.text).not.toContain("total_tokens");
  });

  it("supersedes the old row BEFORE inserting the new one, inside a transaction", async () => {
    // A real bug, found against a real database and not by this test's ancestors: one live
    // snapshot per date is a partial unique index, a unique index is checked the instant a row
    // is inserted, and inserting first therefore put two live rows on the date and was
    // rejected. The order is load-bearing, and the transaction is what lets the deferred
    // self-reference point at a row that does not exist yet.
    // activeSnapshot, begin, update, insert snapshot, two observations, commit.
    const sql = scripted([activeRow(HASH_A), [], [], [{ id: "generated" }], [], [], []]);
    await applySnapshot(sql, LINEAGE, "u2", snapshot(HASH_B), AS_OF);
    const statements = sql.calls.map((c) => c.text.trim().split("\n")[0]!.trim());
    const begin = statements.findIndex((t) => t === "begin");
    const update = statements.findIndex((t) => t.startsWith("update pipeline.utvi_daily_snapshots"));
    const insert = statements.findIndex((t) => t.startsWith("insert into pipeline.utvi_daily_snapshots"));
    const commit = statements.findIndex((t) => t === "commit");
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(update).toBeGreaterThan(begin);
    expect(insert).toBeGreaterThan(update);
    expect(commit).toBeGreaterThan(insert);
  });

  it("rolls back and rethrows if either half of a revision fails", async () => {
    let call = 0;
    const attempted: string[] = [];
    const sql: SqlExecutor = {
      async query(text: string) {
        attempted.push(text.trim().split("\n")[0]!.trim());
        call += 1;
        if (call === 1) return { rows: activeRow(HASH_A) };
        if (text.trim().startsWith("update pipeline.utvi_daily_snapshots")) throw new Error("conflict");
        return { rows: [] };
      },
    };
    await expect(applySnapshot(sql, LINEAGE, "u2", snapshot(HASH_B), AS_OF)).rejects.toThrow("conflict");
    expect(attempted).toContain("rollback");
    expect(attempted).not.toContain("commit");
  });

  it("revises and supersedes when the content hash changed", async () => {
    // Measured: one row moved by +93,102 tokens on a completed day.
    const sql = scripted([
      activeRow(HASH_A, "provisional", "17750400127183"),
      [],
      [],
      [{ id: "generated" }],
      [],
      [],
      [],
    ]);
    const outcome = await applySnapshot(sql, LINEAGE, "u2", snapshot(HASH_B), AS_OF);
    expect(outcome).toMatchObject({
      kind: "revised",
      supersededId: "99999999-9999-4999-8999-999999999999",
      previousTotal: 17_750_400_127_183n,
    });
    // The new id is generated by the writer, because the old row must point at it before it
    // exists. It is a uuid, and it is the id the supersession names.
    expect((outcome as { snapshotId: string }).snapshotId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    const supersede = sql.calls.find((c) => c.text.includes("set superseded_by_id"))!;
    expect(supersede.params[1]).toBe((outcome as { snapshotId: string }).snapshotId);
    expect(String(supersede.params[2])).toContain("source revised");
  });

  it("supersedes a date that had already settled, because a late revision is still a fact", async () => {
    const sql = scripted([activeRow(HASH_A, "final"), [], [], [{ id: "x" }], [], [], []]);
    const outcome = await applySnapshot(
      sql,
      LINEAGE,
      "u3",
      snapshot(HASH_B, { settlementState: "final" }),
      AS_OF,
    );
    expect(outcome.kind).toBe("revised");
  });

  it("writes nothing at all for a date the source returned no rows for", async () => {
    const sql = scripted([]);
    const outcome = await applySnapshot(
      sql,
      LINEAGE,
      "u1",
      snapshot(HASH_A, {
        coverageState: "covered_no_rows",
        totalTokens: null,
        attributedTokens: null,
        residualTokens: null,
        namedRowCount: 0,
        dateContentHash: null,
        observations: [],
      }),
      AS_OF,
    );
    expect(outcome).toEqual({ kind: "no_rows" });
    expect(sql.calls).toHaveLength(0);
  });

  it("carries the interpolated citation onto every observation row", async () => {
    const sql = scripted([[], [{ id: "s1" }], [], []]);
    await applySnapshot(sql, LINEAGE, "u1", snapshot(), AS_OF);
    const observationInserts = sql.calls.filter((c) => c.text.includes("utvi_model_observations"));
    expect(observationInserts).toHaveLength(2);
    for (const insert of observationInserts) {
      expect(insert.params).toContain(`Source: OpenRouter (openrouter.ai/rankings), as of ${AS_OF}.`);
    }
  });

  it("degrades an evidenced lab with no provider row to unmapped rather than dropping the volume", async () => {
    const sql = scripted([[], [{ id: "s1" }], [], []]);
    const lineageWithoutLab: UtviLineage = { ...LINEAGE, labProviderIds: new Map() };
    await applySnapshot(sql, lineageWithoutLab, "u1", snapshot(), AS_OF);
    const named = sql.calls.find(
      (c) => c.text.includes("utvi_model_observations") && c.params.includes("deepseek/deepseek-v4"),
    )!;
    expect(named.params).toContain("unmapped");
    expect(named.params).toContain(1000n.toString());
    expect((named.params.find((p) => Array.isArray(p)) as string[]) ?? []).toContain("LAB_PROVIDER_ROW_MISSING");
  });
});

describe("publication governance", () => {
  it("refuses to publish under a draft methodology, by name, without touching the table", async () => {
    const sql = scripted([]);
    const outcome = await publishCalculation(sql, LINEAGE, "c1", CALCULATION, "universe", AS_OF, "test");
    expect(outcome).toMatchObject({ kind: "refused", refusal: { reason: "methodology_not_approved" } });
    expect(sql.calls).toHaveLength(0);
  });

  it("publishes a first point once the methodology is approved", async () => {
    const approved: UtviLineage = { ...LINEAGE, methodologyStatus: "approved", methodologyVersion: "1.0.0" };
    const sql = scripted([[], [{ id: "p1" }]]);
    const outcome = await publishCalculation(sql, approved, "c1", CALCULATION, "universe", AS_OF, "test");
    expect(outcome).toMatchObject({ kind: "published", publicationId: "p1", revisionNumber: 1 });
  });

  it("declines a revision that did not move the value, rather than printing the same point twice", async () => {
    const approved: UtviLineage = { ...LINEAGE, methodologyStatus: "approved", methodologyVersion: "1.0.0" };
    const sql = scripted([[{ id: "p1", value: "1050", revision_number: 1 }]]);
    const outcome = await publishCalculation(sql, approved, "c2", CALCULATION, "universe", AS_OF, "test");
    expect(outcome).toMatchObject({ kind: "refused", refusal: { reason: "no_change" } });
    expect(sql.calls).toHaveLength(1);
  });

  it("supersedes the prior point when the value did move, and numbers the revision", async () => {
    const approved: UtviLineage = { ...LINEAGE, methodologyStatus: "approved", methodologyVersion: "1.0.0" };
    const sql = scripted([[{ id: "p1", value: "1000", revision_number: 1 }], [{ id: "p2" }]]);
    const outcome = await publishCalculation(sql, approved, "c2", CALCULATION, "universe", AS_OF, "test");
    expect(outcome).toMatchObject({ kind: "superseded", publicationId: "p2", supersededId: "p1", revisionNumber: 2 });
    expect(sql.calls[2]!.text).toContain("set superseded_by_id");
  });

  it("freezes the universe descriptor onto the published row", async () => {
    const approved: UtviLineage = { ...LINEAGE, methodologyStatus: "approved", methodologyVersion: "1.0.0" };
    const sql = scripted([[], [{ id: "p1" }]]);
    await publishCalculation(sql, approved, "c1", CALCULATION, "the covered universe", AS_OF, "test");
    expect(sql.calls[1]!.params).toContain("the covered universe");
  });
});
