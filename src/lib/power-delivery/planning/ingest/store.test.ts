import { describe, expect, it } from "vitest";

import { planningRecordHash, planningRetrievalKey, sha256 } from "@/lib/power-delivery/planning/ingest/artifact";
import { persistPlanningExtraction } from "@/lib/power-delivery/planning/ingest/store";
import type {
  ExtractedPlanningRecord, PlanningAdapter, PlanningExtraction, RetrievedArtifact,
} from "@/lib/power-delivery/planning/ingest/types";
import type { PlanningSqlExecutor } from "@/lib/power-delivery/planning/read";

/**
 * A small in-memory stand-in for the planning tables. It models exactly the behaviour the write
 * path depends on -- unique keys that make an insert a no-op, and one live point per identity --
 * so an idempotent rerun is proved by running it, not by asserting on SQL strings.
 */
function fakeDatabase() {
  const retrievals = new Map<string, string>();
  const rawRecords = new Map<string, string>();
  const vintages = new Map<string, string>();
  const scenarios = new Map<string, string>();
  const points = new Map<string, { id: string; value: number }>();
  const superseded: { id: string; by: string }[] = [];
  let sequence = 0;
  const id = () => `id-${(sequence += 1)}`;

  const sql: PlanningSqlExecutor = {
    async query(text, params) {
      const p = params as unknown[];
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
        if (rawRecords.has(`snap:${key}`)) return { rows: [] };
        rawRecords.set(`snap:${key}`, id());
        return { rows: [{ id: rawRecords.get(`snap:${key}`) }] };
      }
      if (text.includes("select id from pipeline.planning_forecast_vintages")) {
        const key = `${p[0]}|${p[1]}|${p[2]}`;
        const found = vintages.get(key);
        return { rows: found === undefined ? [] : [{ id: found }] };
      }
      if (text.includes("insert into pipeline.planning_forecast_vintages")) {
        const key = `${p[1]}|${p[0]}|${p[3]}`;
        const value = id();
        vintages.set(key, value);
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
      if (text.includes("insert into pipeline.raw_planning_forecast_records")) {
        const key = `${p[0]}|${p[2]}`;
        if (rawRecords.has(key)) return { rows: [] };
        rawRecords.set(key, id());
        return { rows: [{ id: rawRecords.get(key) }] };
      }
      if (text.includes("select id from pipeline.raw_planning_forecast_records")) {
        return { rows: [{ id: rawRecords.get(`${p[0]}|${p[1]}`) }] };
      }
      if (text.includes("from pipeline.planning_forecast_points")) {
        const found = points.get(JSON.stringify(p));
        return { rows: found === undefined ? [] : [{ id: found.id, value: found.value }] };
      }
      if (text.includes("update pipeline.planning_forecast_points")) {
        superseded.push({ id: String(p[1]), by: String(p[0]) });
        for (const [key, value] of points) if (value.id === String(p[1])) points.delete(key);
        return { rows: [] };
      }
      if (text.includes("insert into pipeline.planning_forecast_points")) {
        const identity = JSON.stringify([p[2], p[5], p[6], p[7], p[8], p[9], p[10], p[11], p[14], p[13]]);
        points.set(identity, { id: String(p[0]), value: Number(p[12]) });
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${text.slice(0, 80)}`);
    },
  };
  return { sql, points, superseded, rawRecords, retrievals };
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
});
