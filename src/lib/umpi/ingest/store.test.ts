import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { productionIdentityFor } from "../identity";
import { parseEcosPayload } from "./bok";
import { BOK_SINGLE_MONTH, BOK_SINGLE_MONTH_REVISED } from "./fixtures/bok";
import { persistUmpiFetch, resolveUmpiLineage, type UmpiLineage, type UmpiSqlExecutor } from "./store";
import type { SourceFetchResult } from "./types";

const identity = productionIdentityFor("UMPI-KR-DRAM-PPI");

/**
 * A fake that models what the write path depends on: unique keys that make a second insert
 * yield, observations keyed by month with vintage ordinals and a supersession pointer, and the
 * column positions of the real statements. The SQL-level guarantees are proven against a real
 * database in `supabase/tests/610_umpi_ingestion.sql` and, end to end, in
 * `store.integration.test.ts`.
 */
function fakeSql() {
  type Obs = {
    id: string;
    month: string;
    hash: string;
    ordinal: number;
    superseded: string | null;
    level: number | null;
    retrievalId: string;
    retrievedAt: string;
    runId: string;
  };
  const observations: Obs[] = [];
  const retrievals: { id: string; key: string }[] = [];
  const runs: { id: string; key: string; state: string; counts: unknown[] | null }[] = [];
  const statements: string[] = [];
  let next = 1;

  const sql: UmpiSqlExecutor = {
    async query(text, params) {
      statements.push(text.trim().split("\n")[0]!.trim());

      if (text.includes("from reference.umpi_series")) {
        return {
          rows: [{
            series_id: "s1", series_code: params[0], methodology_version_id: "m1",
            source_series_id: "ss1", source_interface_id: "si1", identity_kind: "bok_ecos_series",
          }],
        };
      }

      if (text.includes("insert into pipeline.source_retrievals")) {
        const key = String(params[1]);
        const existing = retrievals.find((r) => r.key === key);
        if (existing) return { rows: [{ id: existing.id }] };
        const id = `retrieval-${next++}`;
        retrievals.push({ id, key });
        return { rows: [{ id }] };
      }

      if (text.includes("insert into pipeline.umpi_ingestion_runs")) {
        const key = String(params[4]);
        // `on conflict (idempotency_key) do nothing` yields no row when the run already exists.
        if (runs.some((r) => r.key === key)) return { rows: [] };
        const id = `run-${next++}`;
        runs.push({ id, key, state: "pending", counts: null });
        return { rows: [{ id }] };
      }
      if (text.includes("from pipeline.umpi_ingestion_runs where idempotency_key")) {
        const run = runs.find((r) => r.key === String(params[0]));
        return { rows: run ? [{ id: run.id, idempotence_state: run.state }] : [] };
      }
      if (text.includes("update pipeline.umpi_ingestion_runs")) {
        const run = runs.find((r) => r.id === String(params[0]));
        if (run) {
          run.counts = [...params];
          run.state = text.includes("'failed'") ? "failed" : String(params[5] ?? run.state);
        }
        return { rows: [] };
      }

      if (text.includes("and provenance_hash =")) {
        const [, month, hash] = params as [string, string, string];
        return { rows: observations.filter((o) => o.month === month && o.hash === hash).map((o) => ({ id: o.id })) };
      }
      if (text.includes("superseded_by_id is null")) {
        const [, month] = params as [string, string];
        const current = observations
          .filter((o) => o.month === month && o.superseded === null)
          .sort((a, b) => b.ordinal - a.ordinal);
        return { rows: current.length > 0 ? [{ id: current[0]!.id, vintage_ordinal: current[0]!.ordinal }] : [] };
      }
      if (text.includes("insert into pipeline.umpi_observations")) {
        const id = `obs-${next++}`;
        // Column order of the real statement: $4 retrieval, $5 run, $8 month, $9 retrieved_at,
        // $10 ordinal, $12 level, $16 provenance hash.
        observations.push({
          id,
          retrievalId: String(params[3]),
          runId: String(params[4]),
          month: String(params[7]),
          retrievedAt: String(params[8]),
          ordinal: Number(params[9]),
          level: params[11] === null ? null : Number(params[11]),
          hash: String(params[15]),
          superseded: null,
        });
        return { rows: [{ id }] };
      }
      if (text.includes("set superseded_by_id")) {
        const [by, target] = params as [string, string];
        const row = observations.find((o) => o.id === target);
        if (row) row.superseded = by;
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  return { sql, observations, retrievals, runs, statements };
}

function fetchResultFor(payload: string, retrievedAt: string): SourceFetchResult {
  const parsed = parseEcosPayload({ identity, payload });
  return {
    ...parsed,
    // Content-addressed, like the real digest: two payloads that differ only in a value must
    // produce different digests, or a revision would look like the same logical work.
    payloadDigest: createHash("sha256").update(payload).digest("hex"),
    enumerationAssessment: "complete" as const,
    enumerationEvidence: "fixture",
    retrievedAt,
    requestUrl:
      "https://ecos.bok.or.kr/api/StatisticSearch/REDACTED/json/kr/1/1000/404Y016/M/202606/202606/30911201AA",
    requestParameters: { statCode: "404Y016" },
    httpStatus: 200,
    contentType: "application/json",
    responseByteLength: payload.length,
  };
}

const lineage: UmpiLineage = {
  seriesId: "s1",
  seriesCode: "UMPI-KR-DRAM-PPI",
  sourceSeriesId: "ss1",
  sourceInterfaceId: "si1",
  methodologyVersionId: "m1",
  observationKind: "bok_index_level",
};

/** One logical ingestion: same range, its own fetch instant. */
const persist = (sql: UmpiSqlExecutor, payload: string, retrievedAt: string) =>
  persistUmpiFetch(sql, lineage, fetchResultFor(payload, retrievedAt), {
    fromMonth: "2026-06",
    toMonth: "2026-06",
    idempotencyKey: `umpi:bok:2026-06:2026-06:${createHash("sha256").update(payload).digest("hex")}`,
  });

describe("the observation write path", () => {
  it("inserts the first vintage of a month, with its retrieval and fetch instant", async () => {
    const { sql, observations } = fakeSql();
    const result = await persist(sql, BOK_SINGLE_MONTH, "2026-09-22T10:00:00.000Z");

    expect(result).toMatchObject({ rowsInserted: 1, rowsUnchanged: 0, rowsRevised: 0, idempotenceState: "changed" });
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({ ordinal: 1, superseded: null, level: 100 });
    // Lineage: the observation names the retrieval that produced it, and the run.
    expect(observations[0]!.retrievalId).toBe(result.retrievalId);
    expect(observations[0]!.runId).toBe(result.runId);
    // And it carries the instant the agency was read, not a database clock.
    expect(observations[0]!.retrievedAt).toBe("2026-09-22T10:00:00.000Z");
  });

  it("an exact rerun resolves to the same run, adds a retrieval, and writes no observation", async () => {
    const { sql, observations, runs, retrievals } = fakeSql();
    const first = await persist(sql, BOK_SINGLE_MONTH, "2026-09-22T10:00:00.000Z");
    const second = await persist(sql, BOK_SINGLE_MONTH, "2026-09-22T11:00:00.000Z");

    // The logical run is the same work, so it is the same run row — not a second one, and not
    // a unique-constraint failure.
    expect(second.runId).toBe(first.runId);
    expect(second.runReused).toBe(true);
    expect(runs).toHaveLength(1);

    // Each HTTP attempt stays independently auditable.
    expect(retrievals).toHaveLength(2);
    expect(second.retrievalId).not.toBe(first.retrievalId);

    // And the evidence is unchanged, so nothing is written.
    expect(second).toMatchObject({ rowsInserted: 0, rowsRevised: 0, rowsUnchanged: 1, idempotenceState: "no_change" });
    expect(observations).toHaveLength(1);
  });

  it("leaves a completed run's counts alone when it is replayed", async () => {
    const { sql, runs } = fakeSql();
    await persist(sql, BOK_SINGLE_MONTH, "2026-09-22T10:00:00.000Z");
    const countsAfterFirst = runs[0]!.counts;
    const second = await persist(sql, BOK_SINGLE_MONTH, "2026-09-22T11:00:00.000Z");

    // Overwriting with the replay's zeroes would make the run row contradict the observation
    // that carries its id.
    expect(second.runCountsPreserved).toBe(true);
    expect(runs[0]!.counts).toEqual(countsAfterFirst);
  });

  it("persisting the identical fetch result twice does not double the retrieval audit", async () => {
    const { sql, retrievals } = fakeSql();
    const fetched = fetchResultFor(BOK_SINGLE_MONTH, "2026-09-22T10:00:00.000Z");
    const options = { fromMonth: "2026-06", toMonth: "2026-06", idempotencyKey: "k" };
    await persistUmpiFetch(sql, lineage, fetched, options);
    await persistUmpiFetch(sql, lineage, fetched, options);
    // Same attempt, replayed: one attempt, one row. A second attempt would carry a later instant.
    expect(retrievals).toHaveLength(1);
  });

  it("appends a new vintage when the agency revises the month, and preserves the old one", async () => {
    const { sql, observations } = fakeSql();
    await persist(sql, BOK_SINGLE_MONTH, "2026-09-22T10:00:00.000Z");
    const revised = await persist(sql, BOK_SINGLE_MONTH_REVISED, "2026-09-22T11:00:00.000Z");

    // A different payload is different work, so it is its own run.
    expect(revised.runReused).toBe(false);
    expect(revised).toMatchObject({ rowsRevised: 1, rowsInserted: 0, idempotenceState: "changed" });
    expect(observations).toHaveLength(2);

    const [first, second] = observations;
    expect(first).toMatchObject({ ordinal: 1, level: 100 });
    expect(first!.superseded).toBe(second!.id);
    expect(second).toMatchObject({ ordinal: 2, level: 101, superseded: null });
  });

  it("returns to no-change once the revision itself is re-read", async () => {
    const { sql, observations } = fakeSql();
    await persist(sql, BOK_SINGLE_MONTH, "2026-09-22T10:00:00.000Z");
    await persist(sql, BOK_SINGLE_MONTH_REVISED, "2026-09-22T11:00:00.000Z");
    const third = await persist(sql, BOK_SINGLE_MONTH_REVISED, "2026-09-22T12:00:00.000Z");
    expect(third).toMatchObject({ rowsInserted: 0, rowsRevised: 0, rowsUnchanged: 1, idempotenceState: "no_change" });
    expect(observations).toHaveLength(2);
  });

  it("wraps the writes in one transaction", async () => {
    const { sql, statements } = fakeSql();
    await persist(sql, BOK_SINGLE_MONTH, "2026-09-22T10:00:00.000Z");
    expect(statements).toContain("begin");
    expect(statements).toContain("commit");
    expect(statements).not.toContain("rollback");
  });

  it("rolls back and records a failed run when a write throws", async () => {
    const { sql, statements } = fakeSql();
    const failing: UmpiSqlExecutor = {
      query: async (text, params) => {
        if (text.includes("insert into pipeline.umpi_observations")) throw new Error("constraint violated");
        return sql.query(text, params);
      },
    };
    await expect(persist(failing, BOK_SINGLE_MONTH, "2026-09-22T10:00:00.000Z")).rejects.toThrow(/write path failed/);
    expect(statements).toContain("rollback");
  });

  it("retries a previously failed run rather than preserving its failure", async () => {
    const { sql, runs } = fakeSql();
    const failing: UmpiSqlExecutor = {
      query: async (text, params) => {
        if (text.includes("insert into pipeline.umpi_observations")) throw new Error("transient");
        return sql.query(text, params);
      },
    };
    await expect(persist(failing, BOK_SINGLE_MONTH, "2026-09-22T10:00:00.000Z")).rejects.toThrow();
    expect(runs[0]!.state).toBe("failed");

    const recovered = await persist(sql, BOK_SINGLE_MONTH, "2026-09-22T11:00:00.000Z");
    expect(recovered.runReused).toBe(true);
    // A failed run is a genuine retry: its counts are updated rather than preserved.
    expect(recovered.runCountsPreserved).toBe(false);
    expect(recovered.rowsInserted).toBe(1);
  });

  it("never persists a request URL containing a credential", async () => {
    const { sql } = fakeSql();
    const captured: unknown[][] = [];
    const spy: UmpiSqlExecutor = {
      query: async (text, params) => {
        if (text.includes("insert into pipeline.source_retrievals")) captured.push([...params]);
        return sql.query(text, params);
      },
    };
    await persist(spy, BOK_SINGLE_MONTH, "2026-09-22T10:00:00.000Z");
    expect(JSON.stringify(captured)).toContain("REDACTED");
    expect(JSON.stringify(captured)).not.toMatch(/serviceKey=[A-Za-z0-9]/);
  });
});

describe("lineage resolution", () => {
  it("resolves by series code and refuses an ambiguous binding", async () => {
    const { sql } = fakeSql();
    await expect(resolveUmpiLineage(sql, "UMPI-KR-DRAM-PPI")).resolves.toMatchObject({ sourceSeriesId: "ss1" });

    const two: UmpiSqlExecutor = { query: async () => ({ rows: [{ series_id: "s1" }, { series_id: "s1" }] }) };
    await expect(resolveUmpiLineage(two, "UMPI-KR-DRAM-PPI")).rejects.toThrow(/exactly one/);

    const none: UmpiSqlExecutor = { query: async () => ({ rows: [] }) };
    await expect(resolveUmpiLineage(none, "UMPI-KR-DRAM-PPI")).rejects.toThrow(/no active source identity/);
  });
});
