import { describe, expect, it, beforeAll, afterAll } from "vitest";

import { productionIdentityFor } from "../identity";
import { parseCustomsPayload } from "./customs";
import { parseEcosPayload } from "./bok";
import { CUSTOMS_SINGLE_MONTH } from "./fixtures/customs";
import { BOK_SINGLE_MONTH, BOK_SINGLE_MONTH_REVISED } from "./fixtures/bok";
import { persistUmpiFetch, resolveUmpiLineage, type UmpiSqlExecutor } from "./store";
import type { SourceFetchResult } from "./types";

/**
 * The write path against the real schema.
 *
 * The unit tests run against a fake, which is fast and proves the decision logic but cannot
 * prove that a statement's placeholders and parameters agree, that a unique constraint behaves
 * as the code assumes, or that a column the code forgot is `not null`. Those are exactly the
 * failures that reach production, so this exercises the same store against a real database.
 *
 * It is skipped unless `UMPI_INTEGRATION_DATABASE_URL` points at a migrated database, so CI and
 * an ordinary `npm test` are unaffected. To run it locally:
 *
 *   npm run db:start && npm run db:reset && npm run db:migrate
 *   UMPI_INTEGRATION_DATABASE_URL="$(scripts/db/local.sh url)" npx vitest run src/lib/umpi/ingest/store.integration.test.ts
 */
const databaseUrl = process.env.UMPI_INTEGRATION_DATABASE_URL;

describe.skipIf(!databaseUrl)("the write path against a real database", () => {
  let sql: UmpiSqlExecutor & { end: () => Promise<void> };

  beforeAll(async () => {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: databaseUrl });
    sql = {
      query: (text, params) => pool.query(text, params as unknown[]).then((r) => ({ rows: r.rows })),
      end: () => pool.end(),
    };
    // This test writes real evidence and **cannot clean up after itself**: UMPI observations are
    // append-only by trigger, so a delete is refused for every role, which is the property the
    // rest of the suite depends on. Disabling that trigger to tidy up would undermine the very
    // guarantee under test. So the test requires a freshly migrated database and says so.
    const { rows } = await sql.query("select count(*)::int as n from pipeline.umpi_observations", []);
    if (Number(rows[0]!.n) !== 0) {
      throw new Error(
        "UMPI_INTEGRATION_DATABASE_URL points at a database that already holds UMPI observations. " +
          "Run `npm run db:reset && npm run db:migrate` first, and again afterwards.",
      );
    }
  });

  afterAll(async () => {
    if (sql) await sql.end();
  });

  const bokIdentity = productionIdentityFor("UMPI-KR-DRAM-PPI");
  const customsIdentity = productionIdentityFor("UMPI-KR-DRAM-EXPORT-UV");

  const bokFetch = (payload: string, retrievedAt: string): SourceFetchResult => ({
    ...parseEcosPayload({ identity: bokIdentity, payload }),
    payloadDigest: payload.length.toString(16).padStart(64, "0"),
    enumerationAssessment: "complete",
    enumerationEvidence: "integration fixture",
    retrievedAt,
    requestUrl: "https://ecos.bok.or.kr/api/StatisticSearch/REDACTED/json/kr/1/1000/404Y016/M/202606/202606/30911201AA",
    requestParameters: { statCode: "404Y016", itemCode: "30911201AA", cycle: "M" },
    httpStatus: 200,
    contentType: "application/json",
    responseByteLength: payload.length,
  });

  const options = (key: string) => ({ fromMonth: "2026-06", toMonth: "2026-06", idempotencyKey: key });

  it("writes the first vintage with full retrieval lineage", async () => {
    const lineage = await resolveUmpiLineage(sql, "UMPI-KR-DRAM-PPI");
    const result = await persistUmpiFetch(
      sql,
      lineage,
      bokFetch(BOK_SINGLE_MONTH, "2026-09-22T10:00:00.000Z"),
      options("integration:bok:1"),
    );
    expect(result).toMatchObject({ rowsInserted: 1, rowsUnchanged: 0, rowsRevised: 0 });

    const { rows } = await sql.query(
      `select o.source_retrieval_id, o.ingestion_run_id, o.retrieved_at, o.vintage_ordinal,
              o.index_level, o.source_interface_id, o.source_series_id,
              r.source_interface_id as retrieval_interface_id
         from pipeline.umpi_observations o
         join pipeline.source_retrievals r on r.id = o.source_retrieval_id
        where o.reference_month = date '2026-06-01'`,
      [],
    );
    expect(rows).toHaveLength(1);
    const row = rows[0]!;

    // The lineage the schema reserves a column for, actually populated.
    expect(row.source_retrieval_id).not.toBeNull();
    expect(String(row.source_retrieval_id)).toBe(result.retrievalId);
    expect(String(row.ingestion_run_id)).toBe(result.runId);
    // The observation, its series binding and the retrieval all name the same interface.
    expect(String(row.retrieval_interface_id)).toBe(String(row.source_interface_id));
    expect(String(row.source_series_id)).toBe(lineage.sourceSeriesId);
    // The instant the agency was read, not a database clock.
    expect(new Date(String(row.retrieved_at)).toISOString()).toBe("2026-09-22T10:00:00.000Z");
    expect(Number(row.index_level)).toBe(100);
  });

  it("an exact rerun completes, reuses the run row, and writes no observation", async () => {
    const lineage = await resolveUmpiLineage(sql, "UMPI-KR-DRAM-PPI");
    const first = await persistUmpiFetch(
      sql,
      lineage,
      bokFetch(BOK_SINGLE_MONTH, "2026-09-22T12:00:00.000Z"),
      options("integration:bok:rerun"),
    );
    // The same logical run, executed again. Before the fix this threw on the unique index
    // before observation idempotence could even be observed.
    const second = await persistUmpiFetch(
      sql,
      lineage,
      bokFetch(BOK_SINGLE_MONTH, "2026-09-22T13:00:00.000Z"),
      options("integration:bok:rerun"),
    );

    expect(second.runId).toBe(first.runId);
    expect(second.runReused).toBe(true);
    expect(second).toMatchObject({ rowsInserted: 0, rowsRevised: 0, rowsUnchanged: 1, idempotenceState: "no_change" });

    const runs = await sql.query(
      `select count(*)::int as n from pipeline.umpi_ingestion_runs where idempotency_key = $1`,
      ["integration:bok:rerun"],
    );
    expect(Number(runs.rows[0]!.n)).toBe(1);

    // Each attempt remains independently auditable.
    expect(second.retrievalId).not.toBe(first.retrievalId);
    const retrievals = await sql.query(
      `select count(*)::int as n from pipeline.source_retrievals where idempotency_key like $1`,
      ["umpi:retrieval:UMPI-KR-DRAM-PPI:2026-06:2026-06:%"],
    );
    expect(Number(retrievals.rows[0]!.n)).toBeGreaterThanOrEqual(2);

    // And exactly one live observation for the month, whatever the number of attempts.
    const current = await sql.query(
      `select count(*)::int as n from pipeline.umpi_current_observations where reference_month = date '2026-06-01' and series_id = $1`,
      [lineage.seriesId],
    );
    expect(Number(current.rows[0]!.n)).toBe(1);
  });

  it("a revised value becomes a new vintage and the prior one survives", async () => {
    const lineage = await resolveUmpiLineage(sql, "UMPI-KR-DRAM-PPI");
    const revised = await persistUmpiFetch(
      sql,
      lineage,
      bokFetch(BOK_SINGLE_MONTH_REVISED, "2026-09-22T14:00:00.000Z"),
      options("integration:bok:revision"),
    );
    expect(revised).toMatchObject({ rowsRevised: 1, rowsInserted: 0 });

    const all = await sql.query(
      `select vintage_ordinal, index_level, superseded_by_id from pipeline.umpi_observations
        where reference_month = date '2026-06-01' and series_id = $1 order by vintage_ordinal`,
      [lineage.seriesId],
    );
    expect(all.rows).toHaveLength(2);
    expect(Number(all.rows[0]!.index_level)).toBe(100);
    expect(all.rows[0]!.superseded_by_id).not.toBeNull();
    expect(Number(all.rows[1]!.index_level)).toBe(101);
    expect(all.rows[1]!.superseded_by_id).toBeNull();
  });

  it("writes customs evidence through the same path, keeping USD and kg", async () => {
    const lineage = await resolveUmpiLineage(sql, "UMPI-KR-DRAM-EXPORT-UV");
    const parsed = parseCustomsPayload({ identity: customsIdentity, payload: CUSTOMS_SINGLE_MONTH });
    const result = await persistUmpiFetch(
      sql,
      lineage,
      {
        ...parsed,
        payloadDigest: "c".repeat(64),
        enumerationAssessment: "complete",
        enumerationEvidence: "integration fixture",
        retrievedAt: "2026-09-22T15:00:00.000Z",
        requestUrl: "https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList?serviceKey=REDACTED&hsSgn=8542321010",
        requestParameters: { hsSgn: "8542321010" },
        httpStatus: 200,
        contentType: "application/xml",
        responseByteLength: CUSTOMS_SINGLE_MONTH.length,
      },
      { fromMonth: "2026-06", toMonth: "2026-06", idempotencyKey: "integration:customs:1" },
    );
    expect(result.rowsInserted).toBe(1);

    const { rows } = await sql.query(
      `select export_value_usd, export_weight_kg, index_level, source_retrieval_id
         from pipeline.umpi_observations where series_id = $1`,
      [lineage.seriesId],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.export_value_usd)).toBe(1_000_000);
    expect(Number(rows[0]!.export_weight_kg)).toBe(10_000);
    expect(rows[0]!.index_level).toBeNull();
    expect(rows[0]!.source_retrieval_id).not.toBeNull();
  });

  it("ingestion creates no publication and no index base", async () => {
    for (const table of ["pipeline.umpi_publications", "pipeline.umpi_index_bases"]) {
      const { rows } = await sql.query(`select count(*)::int as n from ${table}`, []);
      expect(Number(rows[0]!.n), table).toBe(0);
    }
  });
});
