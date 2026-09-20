import { describe, expect, it } from "vitest";

import { planningRecordHash, planningRetrievalKey, sha256 } from "@/lib/power-delivery/planning/ingest/artifact";
import { persistPlanningExtraction, PLANNING_WRITE_BATCH_SIZE } from "@/lib/power-delivery/planning/ingest/store";
import type {
  ExtractedPlanningRecord, PlanningAdapter, PlanningExtraction, RetrievedArtifact,
} from "@/lib/power-delivery/planning/ingest/types";
import type { PlanningSqlExecutor } from "@/lib/power-delivery/planning/read";

/**
 * A small in-memory stand-in for the planning tables. It models exactly the behaviour the write
 * path depends on -- unique keys that make an insert a no-op, and one live point per identity --
 * so an idempotent rerun is proved by running it, not by asserting on SQL strings.
 */
/**
 * PostgreSQL's rendering of a numeric, reproduced.
 *
 * `value::text` is the exact stored decimal. `value::float8` is printed with
 * `extra_float_digits` significant digits, and production runs that setting at 0, which caps it
 * at fifteen. The fake honours whichever cast the query asks for, so a store that goes back to
 * reading float8 fails these tests instead of passing them and churning in production.
 */
function renderNumeric(stored: string, cast: "text" | "float8", extraFloatDigits: number): string {
  if (cast === "text") return stored;
  const digits = 15 + extraFloatDigits;
  const rendered = Number(stored).toPrecision(digits);
  // toPrecision keeps trailing zeros and may use exponent form; PostgreSQL prints neither.
  return String(Number(rendered));
}

function fakeDatabase(options: { extraFloatDigits?: number } = {}) {
  const extraFloatDigits = options.extraFloatDigits ?? 0;
  const retrievals = new Map<string, string>();
  const snapshots = new Set<string>();
  const rawRecords = new Map<string, { id: string; retrievalId: string; hash: string; row: unknown[] }>();
  const vintages = new Map<string, string>();
  const scenarios = new Map<string, string>();
  type PointRow = { id: string; cols: unknown[]; supersededBy: string | null };
  const points = new Map<string, PointRow>();
  const superseded: { id: string; by: string }[] = [];
  const rawInserts: unknown[][] = [];
  const statements: string[] = [];
  let sequence = 0;
  let failNextPointInsert = false;
  const id = () => `id-${(sequence += 1)}`;
  /** Split a multi-row VALUES parameter list back into rows. */
  const rowsOf = (p: unknown[], width: number) => {
    const out: unknown[][] = [];
    for (let i = 0; i < p.length; i += width) out.push(p.slice(i, i + width));
    return out;
  };

  const sql: PlanningSqlExecutor = {
    async query(text, params) {
      const p = params as unknown[];
      statements.push(text.trim().split("\n")[0]!.trim());
      if (text === "begin" || text === "commit" || text === "rollback") return { rows: [] };

      if (text.includes("from reference.source_interfaces s") && text.includes("permission_grants")) {
        return { rows: [{ source_interface_id: "iface", grid_area_id: "area", permission_grant_id: "grant", production_access_state: "production_approved" }] };
      }
      if (text.includes("from reference.source_use_permissions")) {
        return { rows: [
          { id: "perm-public", purpose_code: "public_raw_planning_value_display", rights_classification: "ambiguous_requires_legal_review", disposition: "not_established", attribution_required: true, attribution_text: "Source: Fixture.", conditions: null, unresolved_issue: "open question" },
          { id: "perm-internal", purpose_code: "internal_retention", rights_classification: "ambiguous_requires_legal_review", disposition: "not_established", attribution_required: false, attribution_text: null, conditions: null, unresolved_issue: "open question" },
        ] };
      }
      if (text.includes("insert into pipeline.source_retrievals")) {
        const key = String(p[1]);
        if (retrievals.has(key)) return { rows: [] };
        retrievals.set(key, id());
        return { rows: [{ id: retrievals.get(key) }] };
      }
      if (text.includes("select id from pipeline.source_retrievals")) {
        return { rows: [{ id: retrievals.get(String(p[0])) }] };
      }
      if (text.includes("insert into pipeline.retrieval_rights_snapshots")) {
        const key = `${p[0]}|${p[1]}`;
        if (snapshots.has(key)) return { rows: [] };
        snapshots.add(key);
        return { rows: [{ id: id() }] };
      }
      if (text.includes("select id from pipeline.planning_forecast_vintages")) {
        const found = vintages.get(`${p[0]}|${p[1]}|${p[2]}`);
        return { rows: found === undefined ? [] : [{ id: found }] };
      }
      if (text.includes("insert into pipeline.planning_forecast_vintages")) {
        const value = id();
        vintages.set(`${p[1]}|${p[0]}|${p[3]}`, value);
        return { rows: [{ id: value }] };
      }
      if (text.includes("select id from pipeline.planning_forecast_scenarios")) {
        const found = scenarios.get(`${p[0]}|${p[1]}`);
        return { rows: found === undefined ? [] : [{ id: found }] };
      }
      if (text.includes("insert into pipeline.planning_forecast_scenarios")) {
        const value = id();
        scenarios.set(`${p[0]}|${p[1]}`, value);
        return { rows: [{ id: value }] };
      }

      // ---- batched raw evidence: 22 columns per row, on conflict do nothing
      if (text.includes("insert into pipeline.raw_planning_forecast_records")) {
        const out: Record<string, unknown>[] = [];
        for (const row of rowsOf(p, 22)) {
          rawInserts.push(row);
          const key = `${row[0]}|${row[2]}`;
          if (rawRecords.has(key)) continue;
          const rowId = id();
          rawRecords.set(key, { id: rowId, retrievalId: String(row[0]), hash: String(row[2]), row });
          out.push({ id: rowId, retrieval_id: row[0], record_hash: row[2] });
        }
        return { rows: out };
      }
      if (text.includes("from pipeline.raw_planning_forecast_records")) {
        const retrievalIds = p[0] as string[]; const hashes = p[1] as string[];
        const out: Record<string, unknown>[] = [];
        retrievalIds.forEach((r, i) => {
          const found = rawRecords.get(`${r}|${hashes[i]}`);
          if (found) out.push({ id: found.id, retrieval_id: found.retrievalId, record_hash: found.hash });
        });
        return { rows: out };
      }

      // ---- bulk load of live points for one vintage
      if (text.includes("from pipeline.planning_forecast_points")) {
        const vintageId = String(p[0]);
        const cast = text.includes("value::text") ? "text" : "float8";
        const out = [...points.values()]
          .filter((row) => row.supersededBy === null && String(row.cols[1]) === vintageId)
          .map((row) => ({
            id: row.id, scenario_id: row.cols[2], geographic_grain: row.cols[5],
            native_geography_label: row.cols[6], target_period_kind: row.cols[7],
            target_year: row.cols[8], target_season: row.cols[9], target_month: row.cols[10],
            target_timestamp: row.cols[11], peak_type: row.cols[14], unit: row.cols[13],
            value: renderNumeric(String(row.cols[12]), cast, extraFloatDigits),
          }));
        return { rows: out };
      }
      if (text.includes("update pipeline.planning_forecast_points")) {
        const oldIds = p[0] as string[]; const nextIds = p[1] as string[];
        oldIds.forEach((oldId, i) => {
          const row = points.get(oldId);
          if (row === undefined) throw new Error(`supersede: no point ${oldId}`);
          if (row.supersededBy !== null) throw new Error(`point ${oldId} is already superseded`);
          row.supersededBy = nextIds[i]!;
          superseded.push({ id: oldId, by: nextIds[i]! });
        });
        return { rows: [] };
      }
      // ---- batched canonical points: 21 columns per row
      if (text.includes("insert into pipeline.planning_forecast_points")) {
        if (failNextPointInsert) { failNextPointInsert = false; throw new Error("simulated batch failure"); }
        for (const row of rowsOf(p, 21)) {
          points.set(String(row[0]), { id: String(row[0]), cols: row, supersededBy: null });
        }
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${text.slice(0, 80)}`);
    },
  };
  return {
    sql, points, superseded, rawRecords, retrievals, rawInserts, statements,
    failPointInsert: () => { failNextPointInsert = true; },
  };
}

const body = Buffer.from("fixture artifact");
const artifact: RetrievedArtifact = {
  label: "peaks", url: "https://example.invalid/peaks.xlsx", retrievedAt: "2026-09-21T00:00:00.000Z",
  status: 200, contentType: null, byteLength: body.byteLength, sha256: sha256(body), body,
};

const adapter: PlanningAdapter = {
  key: "ercot", marketSlug: "ercot", sourceInterfaceSlug: "ercot-long-term-load-forecast",
  retrievalPurpose: "production", artifacts: [{ label: "peaks", url: artifact.url }],
  parse: () => { throw new Error("not used"); },
};

function extraction(value: number): PlanningExtraction {
  const record: ExtractedPlanningRecord = {
    artifactLabel: "peaks", nativeGeography: "ERCOT", nativePeriod: "2031",
    nativeScenario: "ERCOT Adjusted Forecast", nativeValue: String(value), nativeUnit: "MW",
    rawPayload: { value }, locator: {
      extractionMethod: "workbook_cell", workbookSheet: "Summer", workbookCell: "J22",
      archiveRef: "peaks", archiveMember: "xl/worksheets/sheet1.xml",
      archiveMemberHash: "a".repeat(64),
    },
    point: {
      scenarioKey: "ERCOT_Adjusted", geographicGrain: "balancing_authority", nativeGeographyLabel: null,
      targetPeriodKind: "seasonal", targetYear: 2031, targetSeason: "summer", targetMonth: null,
      targetTimestamp: null, value, unit: "MW", peakType: "coincident_peak",
      weatherBasis: "unspecified", loadBasis: "net", largeLoadPolicy: "included_probability_weighted",
    },
  };
  return {
    vintage: {
      nativeVintageKey: "ltlf-2025-04-adjusted", nativeReportId: "2025 LTLF",
      reportTitle: "2025 LTLF", publishedAt: "2025-04-08T00:00:00Z", publishedAtPrecision: "day",
      sourceMethodologyName: null, sourceMethodologyVersion: null,
      publicationState: "published", qualityStatus: "accepted",
    },
    scenarios: [{
      nativeScenarioKey: "ERCOT_Adjusted", nativeScenarioLabel: "ERCOT Adjusted Forecast",
      canonicalClass: "reference", isReference: true, weatherBasis: "unspecified", loadBasis: "net",
      largeLoadPolicy: "included_probability_weighted", assumptions: {}, assumptionsText: null,
    }],
    records: [record],
  };
}

const run = (db: ReturnType<typeof fakeDatabase>, value = 144522, override?: RetrievedArtifact) =>
  persistPlanningExtraction(db.sql, adapter, new Map([["peaks", override ?? artifact]]), extraction(value), "test");

describe("planning ingestion write path", () => {
  it("writes a vintage, a scenario, evidence and a point on the first run", async () => {
    const db = fakeDatabase();
    const result = await run(db);
    expect(result).toMatchObject({
      vintage: "created", retrievalsInserted: 1, retrievalsReused: 0, rightsSnapshots: 2,
      scenariosCreated: 1, rawRecordsInserted: 1, pointsInserted: 1, pointsUnchanged: 0, pointsRevised: 0,
    });
  });

  it("writes nothing on an identical rerun", async () => {
    const db = fakeDatabase();
    await run(db);
    const second = await run(db);
    expect(second).toMatchObject({
      vintage: "existing", retrievalsInserted: 0, retrievalsReused: 1, rightsSnapshots: 0,
      scenariosCreated: 0, scenariosExisting: 1, rawRecordsInserted: 0, rawRecordsDuplicate: 1,
      pointsInserted: 0, pointsUnchanged: 1, pointsRevised: 0,
    });
    expect(db.superseded).toEqual([]);
  });

  it("supersedes the prior value when a corrected artifact restates it, keeping the old evidence", async () => {
    const db = fakeDatabase();
    await run(db);
    const correctedBody = Buffer.from("corrected artifact");
    const corrected: RetrievedArtifact = { ...artifact, body: correctedBody, sha256: sha256(correctedBody) };
    const result = await run(db, 145000, corrected);
    expect(result).toMatchObject({
      vintage: "existing", retrievalsInserted: 1, rawRecordsInserted: 1, pointsRevised: 1, pointsInserted: 0,
    });
    expect(db.superseded).toHaveLength(1);
    // Both retrievals and both raw records survive; a correction adds, it does not overwrite.
    expect(db.retrievals.size).toBe(2);
    expect([...db.rawRecords.keys()].filter((key) => !key.startsWith("snap:"))).toHaveLength(2);
  });

  it("keys a retrieval by artifact content, so a changed file is a new retrieval", () => {
    const other = Buffer.from("different bytes");
    expect(planningRetrievalKey("ercot", artifact))
      .not.toBe(planningRetrievalKey("ercot", { ...artifact, sha256: sha256(other) }));
  });

  it("keys a record by its value and its locator together", () => {
    const base = {
      artifactSha256: artifact.sha256, nativeGeography: "ERCOT", nativePeriod: "2031",
      nativeScenario: "ERCOT Adjusted Forecast", nativeValue: "144522", nativeUnit: "MW",
      locator: { workbook_sheet: "Summer", workbook_cell: "J22" },
    };
    expect(planningRecordHash(base)).toBe(planningRecordHash({ ...base }));
    expect(planningRecordHash(base)).not.toBe(planningRecordHash({ ...base, nativeValue: "144523" }));
    expect(planningRecordHash(base))
      .not.toBe(planningRecordHash({ ...base, locator: { workbook_sheet: "Summer", workbook_cell: "J23" } }));
  });

  it("persists the archive member and its hash into raw provenance", async () => {
    const db = fakeDatabase();
    await run(db);
    // The raw-record insert names its columns in order; archive_member_hash is the last.
    const params = db.rawInserts[0]!;
    expect(params[3]).toBe("ercot/peaks");
    expect(params[19]).toBe("peaks");
    expect(params[20]).toBe("xl/worksheets/sheet1.xml");
    expect(params[21]).toBe("a".repeat(64));
  });
});

/**
 * PD-3E. The production defect, reproduced at the store level and guarded.
 *
 * ERCOT publishes weather-zone and scenario values carrying sixteen significant digits. Read
 * back through `value::float8` under production's `extra_float_digits = 0` they return with
 * fifteen, compare unequal to the number they were stored from, and are superseded and
 * re-inserted on every run. 285 of 982 ERCOT points churned that way in production while PJM,
 * the CEC and ISO-NE, whose published values are shorter, stayed idempotent.
 */
describe("value comparison across a rerun", () => {
  // One of the 285 that churned in production, and its neighbours that did not.
  const SIXTEEN_DIGITS = 173231.3029514549;
  const production = () => fakeDatabase({ extraFloatDigits: 0 });

  it("reproduces PostgreSQL's rendering, so these tests can tell the two casts apart", () => {
    // Proves the guard itself works: at extra_float_digits=0 a float8 read loses the digit.
    expect(renderNumeric("173231.3029514549", "float8", 0)).toBe("173231.302951455");
    expect(renderNumeric("173231.3029514549", "text", 0)).toBe("173231.3029514549");
    // Local PostgreSQL defaults to 1, which is why the local suite never saw the defect.
    expect(renderNumeric("173231.3029514549", "float8", 1)).toBe("173231.3029514549");
    // A short value renders identically either way.
    expect(renderNumeric("144521.884", "float8", 0)).toBe("144521.884");
  });

  it("leaves a sixteen-digit value unchanged on an identical rerun", async () => {
    const db = production();
    await run(db, SIXTEEN_DIGITS);
    const second = await run(db, SIXTEEN_DIGITS);
    expect(second.pointsUnchanged).toBe(1);
    expect(second.pointsRevised).toBe(0);
    expect(second.pointsInserted).toBe(0);
    // No supersession, and no replacement row.
    expect(db.superseded).toEqual([]);
    expect(db.points.size).toBe(1);
  });

  it("changes nothing else about the vintage, scenario, evidence or rights on that rerun", async () => {
    const db = production();
    await run(db, SIXTEEN_DIGITS);
    const second = await run(db, SIXTEEN_DIGITS);
    expect(second).toMatchObject({
      vintage: "existing", retrievalsInserted: 0, retrievalsReused: 1, rightsSnapshots: 0,
      scenariosCreated: 0, scenariosExisting: 1, rawRecordsInserted: 0, rawRecordsDuplicate: 1,
    });
  });

  it("still records exactly one revision when the publisher genuinely restates the value", async () => {
    const db = production();
    await run(db, SIXTEEN_DIGITS);
    const corrected = Buffer.from("corrected artifact");
    const second = await run(db, 173999.4029514549, { ...artifact, body: corrected, sha256: sha256(corrected) });
    expect(second.pointsRevised).toBe(1);
    expect(second.pointsUnchanged).toBe(0);
    expect(db.superseded).toHaveLength(1);
  });

  it("catches a restatement that only differs in the sixteenth digit", async () => {
    // The digit float8 was dropping. Reading the exact decimal is what makes this detectable.
    const db = production();
    await run(db, SIXTEEN_DIGITS);
    const corrected = Buffer.from("corrected artifact");
    const second = await run(db, 173231.3029514548, { ...artifact, body: corrected, sha256: sha256(corrected) });
    expect(second.pointsRevised).toBe(1);
  });

  it("leaves shorter PJM, CEC and ISO-NE style values idempotent, as they always were", async () => {
    for (const value of [144521.884, 15624, 49398, 25228, 62000]) {
      const db = production();
      await run(db, value);
      const second = await run(db, value);
      expect(second.pointsUnchanged, `value ${value}`).toBe(1);
      expect(second.pointsRevised, `value ${value}`).toBe(0);
    }
  });

  it("is idempotent at every extra_float_digits setting, not only production's", async () => {
    for (const extraFloatDigits of [0, 1, 2, 3]) {
      const db = fakeDatabase({ extraFloatDigits });
      await run(db, SIXTEEN_DIGITS);
      const second = await run(db, SIXTEEN_DIGITS);
      expect(second.pointsRevised, `extra_float_digits=${extraFloatDigits}`).toBe(0);
    }
  });
});

/**
 * Batched persistence. The per-record path cost three statements per record -- insert the
 * evidence, look up the live point, write the point -- which is fifty minutes of network
 * latency for PJM's 15,624 rows. These tests hold the classification each record receives
 * constant while the number of round trips it takes collapses.
 */
describe("batched persistence", () => {
  const BATCH = 3;
  /** Seven records over a batch size of three: two full batches and a partial one. */
  function manyRecords(values: readonly number[]): PlanningExtraction {
    const base = extraction(0);
    return {
      ...base,
      records: values.map((value, index) => ({
        ...base.records[0]!,
        nativeValue: String(value),
        nativePeriod: `203${index}`,
        locator: { ...base.records[0]!.locator, workbookCell: `J${index}` },
        point: { ...base.records[0]!.point, targetYear: 2030 + index, value },
      })),
    };
  }
  const write = (db: ReturnType<typeof fakeDatabase>, values: readonly number[], art = artifact, batchSize = BATCH) =>
    persistPlanningExtraction(db.sql, adapter, new Map([["peaks", art]]), manyRecords(values), "test", { batchSize });
  const VALUES = [100, 200, 300, 400, 500, 600, 700];
  const changed = (n: number) => {
    const body = Buffer.from(`artifact revision ${n}`);
    return { ...artifact, body, sha256: sha256(body) };
  };

  it("writes every record and point across batch boundaries", async () => {
    const db = fakeDatabase();
    const result = await write(db, VALUES);
    expect(result).toMatchObject({ rawRecordsInserted: 7, pointsInserted: 7, pointsRevised: 0, pointsUnchanged: 0 });
    expect(db.points.size).toBe(7);
    // Seven rows over a batch of three: three statements each for evidence and points.
    expect(db.statements.filter((t) => t.startsWith("insert into pipeline.raw_planning_forecast_records"))).toHaveLength(3);
    expect(db.statements.filter((t) => t.startsWith("insert into pipeline.planning_forecast_points"))).toHaveLength(3);
  });

  it("stops the statement count scaling with the record count", async () => {
    // The per-record path issued three statements per record, so a hundredfold dataset cost a
    // hundredfold round trips. Within one batch the cost is now flat.
    const small = fakeDatabase();
    await write(small, VALUES, artifact, PLANNING_WRITE_BATCH_SIZE);
    const large = fakeDatabase();
    const many = Array.from({ length: 700 }, (_, index) => 1000 + index);
    await write(large, many, artifact, PLANNING_WRITE_BATCH_SIZE);
    expect(large.points.size).toBe(700);
    expect(large.statements.length).toBe(small.statements.length);
    // And what the per-record path would have cost, for contrast.
    expect(large.statements.length).toBeLessThan(many.length);
  });

  it("is idempotent on an exact rerun", async () => {
    const db = fakeDatabase();
    await write(db, VALUES);
    const second = await write(db, VALUES);
    expect(second).toMatchObject({
      rawRecordsInserted: 0, rawRecordsDuplicate: 7,
      pointsInserted: 0, pointsRevised: 0, pointsUnchanged: 7,
    });
    expect(db.superseded).toEqual([]);
    expect(db.points.size).toBe(7);
  });

  it("revises exactly the one value that changed and leaves its neighbours alone", async () => {
    const db = fakeDatabase();
    await write(db, VALUES);
    const restated = [...VALUES]; restated[4] = 555;
    const second = await write(db, restated, changed(1));
    expect(second).toMatchObject({ pointsRevised: 1, pointsUnchanged: 6, pointsInserted: 0 });
    expect(db.superseded).toHaveLength(1);
    // The superseded row is the one whose value moved, and the replacement carries the new value.
    const old = db.points.get(db.superseded[0]!.id)!;
    expect(Number(old.cols[12])).toBe(500);
    expect(Number(db.points.get(db.superseded[0]!.by)!.cols[12])).toBe(555);
  });

  it("inserts a genuinely new record without revising anything that already existed", async () => {
    const db = fakeDatabase();
    await write(db, VALUES);
    const second = await write(db, [...VALUES, 800], changed(2));
    expect(second).toMatchObject({ pointsInserted: 1, pointsRevised: 0, pointsUnchanged: 7 });
    expect(db.superseded).toEqual([]);
    expect(db.points.size).toBe(8);
  });

  it("keeps raw lineage, locators and hashes attached to the right point", async () => {
    const db = fakeDatabase();
    await write(db, VALUES);
    for (const [index] of VALUES.entries()) {
      const raw = db.rawInserts[index]!;
      expect(raw[3]).toBe("ercot/peaks");            // artifact_ref keeps its source prefix
      expect(raw[12]).toBe("Summer");                 // workbook_sheet
      expect(raw[14]).toBe(`J${index}`);              // workbook_cell, distinct per record
      expect(raw[20]).toBe("xl/worksheets/sheet1.xml");
      expect(raw[21]).toBe("a".repeat(64));           // archive member hash
      expect(raw[1]).toBe(index);                     // row_ordinal preserved in source order
    }
    // Every point points at a raw record that exists.
    for (const row of db.points.values()) {
      expect([...db.rawRecords.values()].some((raw) => raw.id === String(row.cols[4]))).toBe(true);
    }
  });

  it("keeps vintage and scenario identity stable across batches", async () => {
    const db = fakeDatabase();
    await write(db, VALUES);
    const vintageIds = new Set([...db.points.values()].map((row) => String(row.cols[1])));
    const scenarioIds = new Set([...db.points.values()].map((row) => String(row.cols[2])));
    expect(vintageIds.size).toBe(1);
    expect(scenarioIds.size).toBe(1);
  });

  it("produces the same result at every batch size", async () => {
    const shape = async (batchSize: number) => {
      const db = fakeDatabase();
      await write(db, VALUES, artifact, batchSize);
      const restated = [...VALUES]; restated[2] = 333;
      const second = await write(db, restated, changed(3), batchSize);
      return {
        second,
        points: [...db.points.values()].map((r) => [String(r.cols[8]), String(r.cols[12]), r.supersededBy === null]).sort(),
      };
    };
    const baseline = await shape(1);
    for (const size of [2, 3, 7, 50, PLANNING_WRITE_BATCH_SIZE]) {
      const other = await shape(size);
      expect(other.points, `batch size ${size}`).toEqual(baseline.points);
      expect(other.second.pointsRevised, `batch size ${size}`).toBe(baseline.second.pointsRevised);
      expect(other.second.pointsUnchanged, `batch size ${size}`).toBe(baseline.second.pointsUnchanged);
    }
  });

  it("does not depend on the order records arrive in", async () => {
    const forward = fakeDatabase();
    await write(forward, VALUES);
    const reversed = fakeDatabase();
    const base = manyRecords(VALUES);
    await persistPlanningExtraction(reversed.sql, adapter, new Map([["peaks", artifact]]),
      { ...base, records: [...base.records].reverse() }, "test", { batchSize: BATCH });
    const identity = (db: ReturnType<typeof fakeDatabase>) =>
      [...db.points.values()].map((r) => `${r.cols[8]}=${r.cols[12]}`).sort();
    expect(identity(reversed)).toEqual(identity(forward));
  });

  it("leaves no half-applied supersession when a batch fails", async () => {
    const db = fakeDatabase();
    await write(db, VALUES);
    const before = [...db.points.values()].filter((r) => r.supersededBy === null).length;
    const restated = [...VALUES]; restated[1] = 222;
    db.failPointInsert();
    await expect(write(db, restated, changed(4))).rejects.toThrow(/simulated batch failure/);
    // The store rolled back; a real database discards the supersession with it.
    expect(db.statements.at(-1)).toBe("rollback");
    expect([...db.points.values()].filter((r) => r.supersededBy === null).length).toBe(before - 1);
    expect(db.superseded).toHaveLength(1);
  });

  it("refuses two source rows claiming one identity with different values", async () => {
    const db = fakeDatabase();
    const base = manyRecords([100]);
    const twin = { ...base.records[0]!, nativeValue: "999", point: { ...base.records[0]!.point, value: 999 } };
    await expect(persistPlanningExtraction(db.sql, adapter, new Map([["peaks", artifact]]),
      { ...base, records: [base.records[0]!, twin] }, "test", { batchSize: BATCH }))
      .rejects.toThrow(/same canonical identity with different values/);
  });
});
