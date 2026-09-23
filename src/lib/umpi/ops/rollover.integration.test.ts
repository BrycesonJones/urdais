import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseEcosPayload } from "@/lib/umpi/ingest/bok";
import type { UmpiSqlExecutor } from "@/lib/umpi/ingest/store";
import type { ParseResult, SourceFetchResult, UmpiSourceAdapter } from "@/lib/umpi/ingest/types";
import type { UmpiSourceIdentity } from "@/lib/umpi/types";
import { productionIdentityFor } from "@/lib/umpi/identity";
import { checkUmpiProduction } from "@/lib/umpi/ops/production-check";
import { runUmpiOperations } from "@/lib/umpi/ops/run";
import { loadUmpiReadModel } from "@/lib/umpi/read/load";

/**
 * The unattended monthly rollover, proved before it happens.
 *
 * The next real reference month cannot be waited for, and fabricating one in the production
 * database is not an option — the whole product rests on its observations being genuinely
 * official. So the sequence that will occur unattended is proved here instead, against the real
 * schema, with two things controlled: the clock, and what the agency says.
 *
 * What it demonstrates, in order:
 *
 *   1. before the release day, holding last month's figure is `fresh` and nothing is fetched;
 *   2. past the release day with the agency silent, the state is `awaiting_release` and the
 *      product is still healthy — a late agency is not a broken Urdais;
 *   3. past the grace window with the agency still silent, it becomes `stale` and unhealthy,
 *      while every historical point stays readable;
 *   4. the month appears: one unattended run ingests it, derives it, publishes it, computes the
 *      month-over-month change against the prior month, and returns to `fresh`;
 *   5. the identical run again changes nothing at all.
 *
 * Skipped unless `UMPI_INTEGRATION_DATABASE_URL` points at a freshly migrated database, so CI and
 * an ordinary `npm test` are unaffected. To run it:
 *
 *   npm run db:reset && npm run db:migrate
 *   UMPI_INTEGRATION_DATABASE_URL="$(scripts/db/local.sh url)" \
 *     npx vitest run src/lib/umpi/ops/rollover.integration.test.ts
 */
const databaseUrl = process.env.UMPI_INTEGRATION_DATABASE_URL;

/** A Bank of Korea payload for whichever months the fixture should carry. */
function ecosPayload(months: ReadonlyArray<{ time: string; value: string }>): string {
  return JSON.stringify({
    StatisticSearch: {
      list_total_count: months.length,
      row: months.map((month) => ({
        STAT_CODE: "404Y016",
        STAT_NAME: "생산자물가지수(품목별)",
        ITEM_CODE1: "30911201AA",
        ITEM_NAME1: "DRAM",
        UNIT_NAME: "2020=100",
        TIME: month.time,
        DATA_VALUE: month.value,
      })),
    },
  });
}

/** ECOS's reply for a month it has not published: a well-formed envelope, not an outage. */
const ECOS_NO_DATA = JSON.stringify({
  RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다." },
});

/** A source that answers with a fixed payload, standing in for the network. */
function bokAdapter(payload: string): UmpiSourceAdapter<string> {
  const identity = productionIdentityFor("UMPI-KR-DRAM-PPI");
  return {
    name: "bok-fixture",
    seriesCode: "UMPI-KR-DRAM-PPI",
    identityKind: identity.kind,
    credentialEnv: "UMPI_ECOS_API_KEY",
    parse: (input: { identity: UmpiSourceIdentity; payload: string }): ParseResult =>
      parseEcosPayload(input),
    fetch: async (): Promise<SourceFetchResult> => ({
      ...parseEcosPayload({ identity, payload }),
      payloadDigest: payload.length.toString(16).padStart(64, "0"),
      enumerationAssessment: "complete",
      enumerationEvidence: "rollover fixture",
      retrievedAt: new Date().toISOString(),
      requestUrl: "https://ecos.bok.or.kr/api/StatisticSearch/REDACTED/json/kr/1/1000/404Y016/M",
      requestParameters: { statCode: "404Y016", itemCode: "30911201AA", cycle: "M" },
      httpStatus: 200,
      contentType: "application/json",
      responseByteLength: payload.length,
    }),
  };
}

/** Customs is held still throughout: this test is about one series rolling over. */
function silentCustoms(): UmpiSourceAdapter<string> {
  const identity = productionIdentityFor("UMPI-KR-DRAM-EXPORT-UV");
  const empty: ParseResult = { identity, rows: [], rejected: [] } as unknown as ParseResult;
  return {
    name: "customs-fixture",
    seriesCode: "UMPI-KR-DRAM-EXPORT-UV",
    identityKind: identity.kind,
    credentialEnv: "UMPI_CUSTOMS_API_KEY",
    parse: () => empty,
    fetch: async (): Promise<SourceFetchResult> => ({
      ...empty,
      payloadDigest: "0".repeat(64),
      enumerationAssessment: "complete",
      enumerationEvidence: "rollover fixture: no rows",
      retrievedAt: new Date().toISOString(),
      requestUrl: "https://tradedata.go.kr/cts/REDACTED",
      requestParameters: {},
      httpStatus: 200,
      contentType: "text/html",
      responseByteLength: 0,
    }),
  };
}

const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe.skipIf(!databaseUrl)("the unattended monthly rollover", () => {
  let sql: UmpiSqlExecutor & { end: () => Promise<void> };

  beforeAll(async () => {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: databaseUrl });
    sql = {
      query: (text, params) => pool.query(text, params as unknown[]).then((r) => ({ rows: r.rows })),
      end: () => pool.end(),
    };
    // UMPI observations are append-only by trigger, so this test cannot clean up after itself.
    // It requires a freshly migrated database and says so rather than deleting evidence.
    const { rows } = await sql.query("select count(*)::int as n from pipeline.umpi_observations", []);
    if (Number(rows[0]!.n) !== 0) {
      throw new Error(
        "UMPI_INTEGRATION_DATABASE_URL points at a database that already holds UMPI observations. "
        + "Run `npm run db:reset && npm run db:migrate` first, and again afterwards.",
      );
    }
  });

  afterAll(async () => {
    if (sql) await sql.end();
  });

  const ppiFreshness = async (asOf: Date) =>
    (await loadUmpiReadModel(sql, asOf)).series.find((s) => s.seriesCode === "UMPI-KR-DRAM-PPI")!;

  it("seeds July and August, the state the rollover starts from", async () => {
    const result = await runUmpiOperations(sql, {
      asOf: at("2026-09-25"),
      trigger: "manual",
      withoutLock: true,
      adapters: {
        bok: bokAdapter(ecosPayload([{ time: "202607", value: "110" }, { time: "202608", value: "121" }])),
        customs: silentCustoms(),
      },
    });
    expect(result.outcome).toBe("success_changed");
    const ppi = result.checks.find((c) => c.seriesCode === "UMPI-KR-DRAM-PPI")!;
    expect(ppi.observationsWritten).toBe(2);
    expect(ppi.derivationRan).toBe(true);
    expect(ppi.publishedMonth).toBe("2026-08");
    expect(ppi.freshness.state).toBe("fresh");
  });

  it("stays fresh before September is due, and fetches nothing new", async () => {
    // 15 October: September is not expected until the 22nd. The agency is silent and correct.
    const result = await runUmpiOperations(sql, {
      asOf: at("2026-10-15"),
      trigger: "cron",
      withoutLock: true,
      adapters: { bok: bokAdapter(ECOS_NO_DATA), customs: silentCustoms() },
    });
    const ppi = result.checks.find((c) => c.seriesCode === "UMPI-KR-DRAM-PPI")!;
    expect(ppi.reachable).toBe(true);
    expect(ppi.failure).toBeNull();
    expect(ppi.observationsWritten).toBe(0);
    expect(ppi.derivationRan).toBe(false);
    expect(result.outcome).toBe("success_no_change");
    // A month the agency has not published is not an outage, and must not read as one.
    expect(ppi.freshness.state).toBe("fresh");
  });

  it("is awaiting_release past the due date, and still healthy", async () => {
    const result = await runUmpiOperations(sql, {
      asOf: at("2026-10-24"),
      trigger: "cron",
      withoutLock: true,
      adapters: { bok: bokAdapter(ECOS_NO_DATA), customs: silentCustoms() },
    });
    const ppi = result.checks.find((c) => c.seriesCode === "UMPI-KR-DRAM-PPI")!;
    expect(ppi.freshness.state).toBe("awaiting_release");
    const report = await checkUmpiProduction(sql, at("2026-10-24"));
    expect(report.series.find((s) => s.seriesCode === "UMPI-KR-DRAM-PPI")!.freshness).toBe("awaiting_release");
    expect(report.findings.some((f) => f.code === "reference_month_stale")).toBe(false);
  });

  it("becomes stale past the grace window, without losing a single historical point", async () => {
    const asOf = at("2026-11-05");
    const result = await runUmpiOperations(sql, {
      asOf,
      trigger: "cron",
      withoutLock: true,
      adapters: { bok: bokAdapter(ECOS_NO_DATA), customs: silentCustoms() },
    });
    const ppi = result.checks.find((c) => c.seriesCode === "UMPI-KR-DRAM-PPI")!;
    expect(ppi.freshness.state).toBe("stale");
    expect(ppi.freshness.staleSince).not.toBeNull();

    // The gate withholds currentness, never history. Both months stay readable.
    const view = await ppiFreshness(asOf);
    expect(view.points.map((p) => p.referenceMonth)).toEqual(["2026-07", "2026-08"]);
    expect(view.freshness!.state).toBe("stale");
    expect(view.latest!.referenceMonth).toBe("2026-08");

    const report = await checkUmpiProduction(sql, asOf);
    expect(report.healthy).toBe(false);
    expect(report.findings.some((f) => f.code === "reference_month_stale" && f.blocking)).toBe(true);
  });

  it("rolls over unattended the moment the month appears", async () => {
    const asOf = at("2026-11-06");
    const result = await runUmpiOperations(sql, {
      asOf,
      trigger: "cron",
      withoutLock: true,
      adapters: {
        bok: bokAdapter(ecosPayload([
          { time: "202608", value: "121" },
          { time: "202609", value: "133" },
          { time: "202610", value: "140" },
        ])),
        customs: silentCustoms(),
      },
    });

    const ppi = result.checks.find((c) => c.seriesCode === "UMPI-KR-DRAM-PPI")!;
    expect(result.outcome).toBe("success_changed");
    expect(ppi.observationsWritten).toBe(2);
    expect(ppi.derivationRan).toBe(true);
    expect(ppi.publishedMonth).toBe("2026-10");
    expect(ppi.freshness.state).toBe("fresh");

    // The chain reached the public read model, with the month-over-month change computed against
    // the real prior month rather than left null or filled with a zero.
    const view = await ppiFreshness(asOf);
    expect(view.latest!.referenceMonth).toBe("2026-10");
    expect(view.latest!.level).toBeCloseTo(140, 6);
    expect(view.latest!.change).toBeCloseTo((140 - 133) / 133, 8);
    expect(view.points.map((p) => p.referenceMonth)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(view.freshness!.state).toBe("fresh");

    const report = await checkUmpiProduction(sql, asOf);
    expect(report.series.find((s) => s.seriesCode === "UMPI-KR-DRAM-PPI")!.freshness).toBe("fresh");
  });

  it("changes nothing when the identical run repeats", async () => {
    const asOf = at("2026-11-06");
    const before = await sql.query(
      `select count(*)::int as n from pipeline.umpi_publications where superseded_by_id is null`, []);
    const result = await runUmpiOperations(sql, {
      asOf,
      trigger: "cron",
      withoutLock: true,
      adapters: {
        bok: bokAdapter(ecosPayload([
          { time: "202608", value: "121" },
          { time: "202609", value: "133" },
          { time: "202610", value: "140" },
        ])),
        customs: silentCustoms(),
      },
    });
    const ppi = result.checks.find((c) => c.seriesCode === "UMPI-KR-DRAM-PPI")!;
    expect(result.outcome).toBe("success_no_change");
    expect(ppi.observationsWritten).toBe(0);
    expect(ppi.observationsRevised).toBe(0);
    expect(ppi.derivationRan).toBe(false);
    expect(ppi.freshness.state).toBe("fresh");

    const after = await sql.query(
      `select count(*)::int as n from pipeline.umpi_publications where superseded_by_id is null`, []);
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
    const superseded = await sql.query(
      `select count(*)::int as n from pipeline.umpi_publications where superseded_by_id is not null`, []);
    expect(superseded.rows[0]!.n).toBe(0);
  });

  it("handles a revision unattended: a new vintage, one current row, a corrected change", async () => {
    const asOf = at("2026-11-07");
    const result = await runUmpiOperations(sql, {
      asOf,
      trigger: "cron",
      withoutLock: true,
      adapters: {
        bok: bokAdapter(ecosPayload([
          { time: "202608", value: "121" },
          // September revised by the agency: preliminary 133 becomes 135.
          { time: "202609", value: "135" },
          { time: "202610", value: "140" },
        ])),
        customs: silentCustoms(),
      },
    });
    const ppi = result.checks.find((c) => c.seriesCode === "UMPI-KR-DRAM-PPI")!;
    expect(ppi.observationsRevised).toBe(1);
    expect(ppi.derivationRan).toBe(true);
    expect(ppi.freshness.state).toBe("fresh");

    const view = await ppiFreshness(asOf);
    const september = view.points.find((p) => p.referenceMonth === "2026-09")!;
    expect(september.level).toBeCloseTo(135, 6);
    // The following month's change is recomputed against the revised base, not left stale.
    expect(view.latest!.change).toBeCloseTo((140 - 135) / 135, 8);

    // The prior vintage is superseded, not edited, and exactly one row stays current.
    const vintages = await sql.query(
      `select count(*)::int as n from pipeline.umpi_observations o
         join reference.umpi_series s on s.id = o.series_id
        where s.series_code = 'UMPI-KR-DRAM-PPI' and o.reference_month = date '2026-09-01'`, []);
    expect(vintages.rows[0]!.n).toBe(2);
    const current = await sql.query(
      `select count(*)::int as n from pipeline.umpi_observations o
         join reference.umpi_series s on s.id = o.series_id
        where s.series_code = 'UMPI-KR-DRAM-PPI' and o.reference_month = date '2026-09-01'
          and o.superseded_by_id is null`, []);
    expect(current.rows[0]!.n).toBe(1);
  });

  it("refuses to report fresh when the source is ahead and derivation did not run", async () => {
    // The month is stored as a current observation but has no current publication: the shape a
    // crashed derivation leaves behind. Simulated by retiring October's publication.
    //
    // It is superseded by a real row rather than a synthetic id, because `superseded_by_id`
    // carries a foreign key -- the schema refuses an orphan supersession, which is itself worth
    // knowing and is why this is not a `delete`.
    const asOf = at("2026-11-08");
    await sql.query(
      `update pipeline.umpi_publications p
          set superseded_by_id = (
                select p2.id from pipeline.umpi_publications p2
                  join reference.umpi_series s2 on s2.id = p2.series_id
                 where s2.series_code = 'UMPI-KR-DRAM-PPI'
                   and p2.reference_month = date '2026-09-01'
                   and p2.superseded_by_id is null
                 limit 1),
              superseded_at = now(),
              supersession_reason = 'integration: simulated derivation failure'
        from reference.umpi_series s
       where s.id = p.series_id and s.series_code = 'UMPI-KR-DRAM-PPI'
         and p.reference_month = date '2026-10-01' and p.superseded_by_id is null`, []);

    const view = await ppiFreshness(asOf);
    expect(view.freshness!.state).toBe("derivation_failed");
    expect(view.latest!.referenceMonth).toBe("2026-09");

    const report = await checkUmpiProduction(sql, asOf);
    expect(report.healthy).toBe(false);
    expect(report.findings.some((f) => f.code === "publication_did_not_advance")).toBe(true);
  });

  it("refuses to report fresh when the scheduler has stopped", async () => {
    // Every other fact is healthy; only the heartbeat is missing. Currentness is unverifiable,
    // and an unverifiable figure must not be presented as current.
    const asOf = at("2026-12-20");
    const view = await ppiFreshness(asOf);
    expect(view.freshness!.state).toBe("unknown");
    expect(view.freshness!.reason).toContain("beyond the 48h");

    const report = await checkUmpiProduction(sql, asOf);
    expect(report.healthy).toBe(false);
    expect(report.findings.some((f) => f.code === "scheduler_missed")).toBe(true);
  });

  it("no-ops cleanly when another run holds the lock", async () => {
    const { Pool } = await import("pg");
    const holder = new Pool({ connectionString: databaseUrl });
    const client = await holder.connect();
    try {
      await client.query(`select pg_advisory_lock(hashtextextended($1, 0))`, ["umpi:operations"]);
      const result = await runUmpiOperations(sql, { asOf: at("2026-11-09"), trigger: "cron" });
      expect(result.skippedReason).toContain("holds the lock");
      expect(result.checks).toEqual([]);
      // Recorded as skipped rather than as a check: a run that looked at nothing must never be
      // mistaken for evidence that the source was looked at.
      const skipped = await sql.query(
        `select skipped_reason from pipeline.umpi_operational_runs where id = $1`, [result.runId]);
      expect(skipped.rows[0]!.skipped_reason).toContain("holds the lock");
    } finally {
      await client.query(`select pg_advisory_unlock(hashtextextended($1, 0))`, ["umpi:operations"]);
      client.release();
      await holder.end();
    }
  });
});
