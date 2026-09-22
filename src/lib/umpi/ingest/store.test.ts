import { describe, expect, it } from "vitest";

import { productionIdentityFor } from "../identity";
import { parseEcosPayload } from "./bok";
import { BOK_SINGLE_MONTH, BOK_SINGLE_MONTH_REVISED } from "./fixtures/bok";
import { persistUmpiFetch, resolveUmpiLineage, type UmpiLineage, type UmpiSqlExecutor } from "./store";
import type { SourceFetchResult } from "./types";

const identity = productionIdentityFor("UMPI-KR-DRAM-PPI");

/**
 * A fake executor that models only what the store depends on: observation rows keyed by month,
 * their vintage ordinals, their provenance hashes and their supersession pointer. It is
 * deliberately not a Postgres emulator — the SQL-level guarantees are proven against a real
 * database in `supabase/tests/610_umpi_ingestion.sql`. What this proves is the store's decision
 * logic: when it writes, when it does not, and what it counts.
 */
function fakeSql() {
  type Obs = { id: string; month: string; hash: string; ordinal: number; superseded: string | null; level: number | null };
  const observations: Obs[] = [];
  const statements: string[] = [];
  const runs: Record<string, Record<string, unknown>> = {};
  let next = 1;

  const sql: UmpiSqlExecutor = {
    async query(text, params) {
      statements.push(text.trim().split("\n")[0]!.trim());
      if (text.includes("from reference.umpi_series")) {
        return { rows: [{ series_id: "s1", series_code: params[0], methodology_version_id: "m1", source_series_id: "ss1", source_interface_id: "si1", identity_kind: "bok_ecos_series" }] };
      }
      if (text.includes("insert into pipeline.source_retrievals")) return { rows: [{ id: "retrieval-1" }] };
      if (text.includes("insert into pipeline.umpi_ingestion_runs")) {
        const id = `run-${next++}`;
        runs[id] = {};
        return { rows: [{ id }] };
      }
      if (text.includes("update pipeline.umpi_ingestion_runs")) {
        const id = String(params[0]);
        runs[id] = { ...(runs[id] ?? {}), params };
        return { rows: [] };
      }
      if (text.includes("and provenance_hash =")) {
        const [, month, hash] = params as [string, string, string];
        return { rows: observations.filter((o) => o.month === month && o.hash === hash).map((o) => ({ id: o.id })) };
      }
      if (text.includes("superseded_by_id is null")) {
        const [, month] = params as [string, string];
        const current = observations.filter((o) => o.month === month && o.superseded === null).sort((a, b) => b.ordinal - a.ordinal);
        return { rows: current.length > 0 ? [{ id: current[0]!.id, vintage_ordinal: current[0]!.ordinal }] : [] };
      }
      if (text.includes("insert into pipeline.umpi_observations")) {
        const id = `obs-${next++}`;
        observations.push({
          id,
          month: String(params[6]),
          ordinal: Number(params[7]),
          level: params[9] === null ? null : Number(params[9]),
          // $15 is provenance_hash; $16 is the raw payload. Off-by-one here silently turns
          // an idempotent re-read into a phantom revision, which is what it did the first time.
          hash: String(params[13]),
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
  return { sql, observations, statements, runs };
}

function fetchResultFor(payload: string): SourceFetchResult {
  const parsed = parseEcosPayload({ identity, payload });
  return {
    ...parsed,
    payloadDigest: "a".repeat(64),
    enumerationAssessment: "complete" as const,
    enumerationEvidence: "fixture",
    retrievedAt: new Date("2026-09-22T00:00:00Z").toISOString(),
    requestUrl: "https://ecos.bok.or.kr/api/StatisticSearch/REDACTED/json/kr/1/1000/404Y016/M/202606/202606/30911201AA",
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

const persist = (sql: UmpiSqlExecutor, payload: string, key: string) =>
  persistUmpiFetch(sql, lineage, fetchResultFor(payload), { fromMonth: "2026-06", toMonth: "2026-06", idempotencyKey: key });

describe("the observation write path", () => {
  it("inserts the first vintage of a month", async () => {
    const { sql, observations } = fakeSql();
    const result = await persist(sql, BOK_SINGLE_MONTH, "k1");
    expect(result).toMatchObject({ rowsInserted: 1, rowsUnchanged: 0, rowsRevised: 0, idempotenceState: "changed" });
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({ ordinal: 1, superseded: null, level: 100 });
  });

  it("is idempotent: the identical payload writes nothing the second time", async () => {
    const { sql, observations } = fakeSql();
    await persist(sql, BOK_SINGLE_MONTH, "k1");
    const second = await persist(sql, BOK_SINGLE_MONTH, "k2");

    expect(second).toMatchObject({ rowsInserted: 0, rowsRevised: 0, rowsUnchanged: 1, idempotenceState: "no_change" });
    expect(observations).toHaveLength(1);
    // A second retrieval is still an audit fact; it just produces no observation.
    expect(second.retrievalId).toBe("retrieval-1");
  });

  it("appends a new vintage when the agency revises the month, and preserves the old one", async () => {
    const { sql, observations } = fakeSql();
    await persist(sql, BOK_SINGLE_MONTH, "k1");
    const revised = await persist(sql, BOK_SINGLE_MONTH_REVISED, "k2");

    expect(revised).toMatchObject({ rowsRevised: 1, rowsInserted: 0, idempotenceState: "changed" });
    expect(observations).toHaveLength(2);

    const [first, second] = observations;
    // The prior vintage keeps its value and is marked superseded — never edited in place.
    expect(first).toMatchObject({ ordinal: 1, level: 100 });
    expect(first!.superseded).toBe(second!.id);
    expect(second).toMatchObject({ ordinal: 2, level: 101, superseded: null });
  });

  it("returns to no-change once the revision itself is re-read", async () => {
    const { sql, observations } = fakeSql();
    await persist(sql, BOK_SINGLE_MONTH, "k1");
    await persist(sql, BOK_SINGLE_MONTH_REVISED, "k2");
    const third = await persist(sql, BOK_SINGLE_MONTH_REVISED, "k3");
    expect(third).toMatchObject({ rowsInserted: 0, rowsRevised: 0, rowsUnchanged: 1, idempotenceState: "no_change" });
    expect(observations).toHaveLength(2);
  });

  it("wraps the writes in one transaction", async () => {
    const { sql, statements } = fakeSql();
    await persist(sql, BOK_SINGLE_MONTH, "k1");
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
    await expect(persist(failing, BOK_SINGLE_MONTH, "k1")).rejects.toThrow(/write path failed/);
    expect(statements).toContain("rollback");
    // The run is closed as failed, never as a success with partial counts.
    const failedUpdate = statements.filter((s) => s.startsWith("update pipeline.umpi_ingestion_runs"));
    expect(failedUpdate.length).toBeGreaterThan(0);
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
    await persist(spy, BOK_SINGLE_MONTH, "k1");
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
