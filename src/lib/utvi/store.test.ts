import { describe, expect, it } from "vitest";

import {
  applySnapshot,
  publishCalculation,
  recordRetrieval,
  representationComplete,
  retrievalIdempotencyKey,
  snapshotHasCalculation,
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

/**
 * An active snapshot row as the database returns it.
 *
 * `persisted` defaults to a *complete* representation -- rows summing to the snapshot's own
 * total -- because that is the normal case and every pre-existing test assumes it. Passing a
 * smaller sum is how a test describes the 2025-09-16 defect: a snapshot whose aggregates are
 * correct and whose child rows are not all there.
 */
const activeRow = (
  hash: string,
  settlement = "provisional",
  total = "1050",
  persisted: { rows: number; sum: string } = { rows: 2, sum: total },
) => [
  {
    id: "99999999-9999-4999-8999-999999999999",
    observation_date: "2026-09-15",
    coverage_state: "covered_observed",
    date_content_hash: hash,
    settlement_state: settlement,
    total_tokens: total,
    persisted_row_count: persisted.rows,
    persisted_token_sum: persisted.sum,
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
      [], // begin: the snapshot and its observations commit together or not at all
      [{ id: "s1" }], // insert snapshot
      [], // observations, in one statement
      [], // commit
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

  it("can tell a snapshot that has a calculation from one that does not", async () => {
    // A run interrupted between the two writes leaves a date with coverage and no value, and a
    // later run that inferred "unchanged rows, therefore nothing to do" would skip it for ever.
    const withCalculation = scripted([[{ "?column?": 1 }]]);
    expect(await snapshotHasCalculation(withCalculation, "s1")).toBe(true);
    const without = scripted([[]]);
    expect(await snapshotHasCalculation(without, "s1")).toBe(false);
    expect(without.calls[0]!.text).toContain("pipeline.utvi_calculations");
    expect(without.calls[0]!.params).toEqual(["s1"]);
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
    const sql = scripted([activeRow(HASH_A), [], [], [{ id: "generated" }], [], []]);
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
    const sql = scripted([activeRow(HASH_A, "final"), [], [], [{ id: "x" }], [], []]);
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

  it("commits the snapshot and its observations together, or neither", async () => {
    // The 2025-09-16 defect, as a test. The snapshot row and its observations are two
    // statements; before this transaction a crash between them left a snapshot claiming fifty
    // rows with sixteen behind it, and nothing noticed for eleven months because nothing read
    // the child rows. What must be true is that the observation insert failing takes the
    // snapshot insert down with it.
    const attempted: string[] = [];
    let call = 0;
    const sql: SqlExecutor = {
      async query(text: string) {
        attempted.push(text.trim().split("\n")[0]!.trim());
        call += 1;
        if (call === 1) return { rows: [] }; // no active snapshot
        if (text.includes("insert into pipeline.utvi_model_observations")) {
          throw new Error("connection terminated unexpectedly");
        }
        if (text.includes("insert into pipeline.utvi_daily_snapshots")) return { rows: [{ id: "s1" }] };
        return { rows: [] };
      },
    };

    await expect(applySnapshot(sql, LINEAGE, "u1", snapshot(), AS_OF)).rejects.toThrow(
      "connection terminated unexpectedly",
    );

    // The snapshot insert was attempted inside the transaction, and the transaction was undone.
    const begin = attempted.indexOf("begin");
    const snapshotInsert = attempted.findIndex((t) => t.startsWith("insert into pipeline.utvi_daily_snapshots"));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(snapshotInsert).toBeGreaterThan(begin);
    expect(attempted).toContain("rollback");
    // The one thing that must never happen: a commit that leaves the half-written date behind.
    expect(attempted).not.toContain("commit");
  });

  it("repairs a date whose stored rows do not account for its own snapshot", async () => {
    // Identical content hash, incomplete storage: exactly 2025-09-16. Sixteen rows summing to
    // 610,905,052,424 beneath a snapshot claiming 803,652,511,533. The hash matched because the
    // hash describes the source, and the source had not changed.
    const sql = scripted([
      activeRow(HASH_A, "final", "1050", { rows: 1, sum: "1000" }),
      [], // begin
      [], // supersede the defective row
      [{ id: "generated" }], // insert the replacement
      [], // its observations
      [], // commit
    ]);
    const outcome = await applySnapshot(sql, LINEAGE, "u9", snapshot(HASH_A), AS_OF);

    expect(outcome).toMatchObject({
      kind: "repaired",
      supersededId: "99999999-9999-4999-8999-999999999999",
      recoveredRowCount: 1,
    });
    const supersede = sql.calls.find((c) => c.text.includes("set superseded_by_id"))!;
    // The reason has to say this was Urdais's storage and not the source, or a later reader
    // will mistake a repair for a revision of the data.
    expect(String(supersede.params[2])).toContain("repaired defective persisted representation");
    expect(String(supersede.params[2])).toContain("no value is revised");
    expect(String(supersede.params[2])).not.toContain("source revised");
  });

  it("does not repair, or rewrite anything, when the representation is complete", async () => {
    const sql = scripted([activeRow(HASH_A, "provisional", "1050", { rows: 2, sum: "1050" })]);
    const outcome = await applySnapshot(sql, LINEAGE, "u2", snapshot(HASH_A), AS_OF);
    expect(outcome.kind).toBe("confirmed");
    expect(sql.calls).toHaveLength(1);
  });

  it("refuses to repair when the content hash does not match, because that is a revision", async () => {
    // A repair asserts the source did not move. If it did, the revision path owns the date and
    // this one must not quietly rewrite history under the wrong reason.
    const sql = scripted([
      activeRow(HASH_A, "final", "1050", { rows: 1, sum: "1000" }),
      [], [], [{ id: "x" }], [], [],
    ]);
    const outcome = await applySnapshot(sql, LINEAGE, "u9", snapshot(HASH_B), AS_OF);
    expect(outcome.kind).toBe("revised");
  });

  it("carries the interpolated citation onto every observation row", async () => {
    const sql = scripted([[], [], [{ id: "s1" }], [], []]);
    await applySnapshot(sql, LINEAGE, "u1", snapshot(), AS_OF);
    const insert = sql.calls.find((c) => c.text.includes("insert into pipeline.utvi_model_observations"))!;
    const citation = `Source: OpenRouter (openrouter.ai/rankings), as of ${AS_OF}.`;
    expect(insert.params.filter((p) => p === citation)).toHaveLength(2);
  });

  it("writes a date's observations in one statement, not one per row", async () => {
    // A full backfill is six hundred days of fifty-one rows. Row-at-a-time was nine seconds
    // against a local socket and hours against a pooler in another region, which is the
    // difference between a backfill an operator runs and one they abandon.
    const sql = scripted([[], [], [{ id: "s1" }], [], []]);
    await applySnapshot(sql, LINEAGE, "u1", snapshot(), AS_OF);
    const inserts = sql.calls.filter((c) => c.text.includes("insert into pipeline.utvi_model_observations"));
    expect(inserts).toHaveLength(1);
    // Two rows, twelve bound columns each, and the placeholders numbered through.
    expect(inserts[0]!.params).toHaveLength(24);
    expect(inserts[0]!.text).toContain("$12)");
    expect(inserts[0]!.text).toContain("$24)");
  });

  it("degrades an evidenced lab with no provider row to unmapped rather than dropping the volume", async () => {
    const sql = scripted([[], [], [{ id: "s1" }], [], []]);
    const lineageWithoutLab: UtviLineage = { ...LINEAGE, labProviderIds: new Map() };
    await applySnapshot(sql, lineageWithoutLab, "u1", snapshot(), AS_OF);
    const insert = sql.calls.find((c) => c.text.includes("insert into pipeline.utvi_model_observations"))!;
    expect(insert.params).toContain("unmapped");
    expect(insert.params).toContain(1000n.toString());
    const flagArrays = insert.params.filter((p) => Array.isArray(p)) as string[][];
    expect(flagArrays.some((flags) => flags.includes("LAB_PROVIDER_ROW_MISSING"))).toBe(true);
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
    const sql = scripted([[], []]);
    const outcome = await publishCalculation(sql, approved, "c1", CALCULATION, "universe", AS_OF, "test");
    expect(outcome).toMatchObject({ kind: "published", revisionNumber: 1 });
    // The id is the writer's, because a supersession must be able to name the replacement
    // before it exists. A first publication takes the same path, without the transaction.
    expect((outcome as { publicationId: string }).publicationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(sql.calls.some((c) => c.text.trim() === "begin")).toBe(false);
  });

  it("declines a revision that did not move the value, rather than printing the same point twice", async () => {
    const approved: UtviLineage = { ...LINEAGE, methodologyStatus: "approved", methodologyVersion: "1.0.0" };
    const sql = scripted([[{ id: "p1", value: "1050", revision_number: 1, evidence_is_live: true }]]);
    const outcome = await publishCalculation(sql, approved, "c2", CALCULATION, "universe", AS_OF, "test");
    expect(outcome).toMatchObject({ kind: "refused", refusal: { reason: "no_change" } });
    expect(sql.calls).toHaveLength(1);
  });

  it("re-points an unchanged value whose evidence is no longer live", async () => {
    // After a storage repair the snapshot behind the standing publication is superseded. The
    // value has not moved, so the usual rule would decline to republish -- but declining leaves
    // the public point anchored to a representation the database no longer serves, and every
    // consumer that reads through live snapshots loses the date. So it is re-pointed, and the
    // reason says plainly that the number did not change.
    const approved: UtviLineage = { ...LINEAGE, methodologyStatus: "approved", methodologyVersion: "1.1.0" };
    const sql = scripted([
      [{ id: "p1", value: "1050", revision_number: 1, evidence_is_live: false }],
      [], [], [], [],
    ]);
    const outcome = await publishCalculation(sql, approved, "c9", CALCULATION, "universe", AS_OF, "test");

    expect(outcome).toMatchObject({ kind: "superseded", supersededId: "p1", revisionNumber: 2 });
    const published = sql.calls.find((c) => c.text.includes("insert into pipeline.utvi_publications"))!;
    // The value published is identical to the one it replaces.
    expect(published.params).toContain("1050");
    const supersede = sql.calls.find((c) => c.text.includes("set superseded_by_id"))!;
    expect(String(supersede.params[2])).toContain("re-pointed to the live snapshot");
    expect(String(supersede.params[2])).toContain("value is unchanged");
    expect(String(supersede.params[2])).not.toContain("source revision");
  });

  it("supersedes the prior point when the value did move, and numbers the revision", async () => {
    const approved: UtviLineage = { ...LINEAGE, methodologyStatus: "approved", methodologyVersion: "1.0.0" };
    const sql = scripted([[{ id: "p1", value: "1000", revision_number: 1, evidence_is_live: true }], [], [], [], []]);
    const outcome = await publishCalculation(sql, approved, "c2", CALCULATION, "universe", AS_OF, "test");
    expect(outcome).toMatchObject({ kind: "superseded", supersededId: "p1", revisionNumber: 2 });

    // Supersede before insert: one live publication per date is a unique index, so the other
    // order puts two live points on the date for an instant and is rejected. This had never
    // fired in production because no point had ever been superseded.
    const statements = sql.calls.map((c) => c.text.trim().split("\n")[0]!.trim());
    const begin = statements.indexOf("begin");
    const update = statements.findIndex((t) => t.startsWith("update pipeline.utvi_publications"));
    const insert = statements.findIndex((t) => t.startsWith("insert into pipeline.utvi_publications"));
    const commit = statements.indexOf("commit");
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(update).toBeGreaterThan(begin);
    expect(insert).toBeGreaterThan(update);
    expect(commit).toBeGreaterThan(insert);
    expect(sql.calls[2]!.text).toContain("set superseded_by_id");
  });

  it("freezes the universe descriptor onto the published row", async () => {
    const approved: UtviLineage = { ...LINEAGE, methodologyStatus: "approved", methodologyVersion: "1.0.0" };
    const sql = scripted([[], [{ id: "p1" }]]);
    await publishCalculation(sql, approved, "c1", CALCULATION, "the covered universe", AS_OF, "test");
    expect(sql.calls[1]!.params).toContain("the covered universe");
  });
});

describe("representation completeness", () => {
  const snap = (over: Partial<Parameters<typeof representationComplete>[0]> = {}) => ({
    id: "s1",
    observationDate: "2025-09-16",
    coverageState: "covered_observed",
    dateContentHash: HASH_A,
    settlementState: "final" as const,
    totalTokens: 803_652_511_533n,
    persistedRowCount: 51,
    persistedTokenSum: 803_652_511_533n,
    ...over,
  });

  it("accepts rows that account for the snapshot exactly", () => {
    expect(representationComplete(snap())).toBe(true);
  });

  it("rejects the real 2025-09-16 shape", () => {
    expect(
      representationComplete(snap({ persistedRowCount: 16, persistedTokenSum: 610_905_052_424n })),
    ).toBe(false);
  });

  it("rejects a snapshot with no rows at all", () => {
    expect(representationComplete(snap({ persistedRowCount: 0, persistedTokenSum: 0n }))).toBe(false);
  });

  it("is exact rather than tolerant, because these are integers copied from one source", () => {
    expect(representationComplete(snap({ persistedTokenSum: 803_652_511_532n }))).toBe(false);
  });

  it("expects no rows beneath a date the source served empty", () => {
    const empty = snap({ coverageState: "covered_no_rows", totalTokens: null, persistedRowCount: 0, persistedTokenSum: 0n });
    expect(representationComplete(empty)).toBe(true);
    expect(representationComplete({ ...empty, persistedRowCount: 3 })).toBe(false);
  });
});
