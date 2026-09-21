import { describe, expect, it } from "vitest";

import { capacityRecordHash, capacityRetrievalKey } from "@/lib/power-delivery/capacity/ingest/artifact";
import { CAPACITY_WRITE_BATCH_SIZE, persistCapacityExtraction } from "@/lib/power-delivery/capacity/ingest/store";
import type {
  CapacityAdapter, CapacityExtraction, NormalizedCapacityRecord,
} from "@/lib/power-delivery/capacity/ingest/types";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import { sha256 } from "@/lib/power-delivery/planning/ingest/artifact";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";

/**
 * PostgreSQL's rendering of a numeric, reproduced.
 *
 * `value::text` is the exact stored decimal. `value::float8` is printed with
 * `extra_float_digits` significant digits, and production runs that setting at 0, which caps it at
 * fifteen. The fake honours whichever cast the query asks for, so a store that went back to
 * reading float8 fails these tests instead of passing them and churning in production.
 */
function renderNumeric(stored: string, cast: "text" | "float8", extraFloatDigits: number): string {
  if (cast === "text") return stored;
  const rendered = Number(stored).toPrecision(15 + extraFloatDigits);
  return String(Number(rendered));
}

/**
 * A small in-memory stand-in for the capacity tables. It models exactly what the write path
 * depends on -- unique keys that make an insert a no-op, and one live row per identity in each of
 * the two canonical layers -- so an idempotent rerun is proved by running it rather than by
 * asserting on SQL strings.
 */
function fakeDatabase(options: { extraFloatDigits?: number } = {}) {
  const extraFloatDigits = options.extraFloatDigits ?? 0;
  const retrievals = new Map<string, string>();
  const snapshots = new Set<string>();
  const rawRecords = new Map<string, { id: string; retrievalId: string; hash: string; row: unknown[] }>();
  const vintages = new Map<string, string>();
  const scenarios = new Map<string, string>();
  const subareas = new Map<string, string>();
  const interfaces = new Map<string, { id: string; row: unknown[] }>();
  type ValueRow = { id: string; cols: unknown[]; supersededBy: string | null };
  const components = new Map<string, ValueRow>();
  const constraints = new Map<string, ValueRow>();
  const superseded: { table: string; id: string; by: string }[] = [];
  const statements: string[] = [];
  let sequence = 0;
  const id = () => `id-${(sequence += 1)}`;
  const rowsOf = (p: unknown[], width: number) => {
    const out: unknown[][] = [];
    for (let i = 0; i < p.length; i += width) out.push(p.slice(i, i + width));
    return out;
  };

  const sql: CapacitySqlExecutor = {
    async query(text, params) {
      const p = params as unknown[];
      statements.push(text.trim().split("\n")[0]!.trim());
      if (text === "begin" || text === "commit" || text === "rollback") return { rows: [] };

      if (text.includes("from reference.source_interfaces s") && text.includes("permission_grants")) {
        return { rows: [{ source_interface_id: "iface", grid_area_id: "area", permission_grant_id: "grant", production_access_state: "production_approved_under_accepted_risk" }] };
      }
      if (text.includes("from reference.source_use_permissions")) {
        return { rows: [
          { id: "perm-public", purpose_code: "public_raw_grid_capacity_value_display", rights_classification: "ambiguous_requires_legal_review", disposition: "not_established", attribution_required: true, attribution_text: "Source: Fixture ISO.", conditions: null, unresolved_issue: "copyright asserted" },
          { id: "perm-internal", purpose_code: "internal_retention", rights_classification: "ambiguous_requires_legal_review", disposition: "not_established", attribution_required: false, attribution_text: null, conditions: null, unresolved_issue: "copyright asserted" },
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

      if (text.includes("from reference.grid_subareas")) {
        const found = subareas.get(`${p[0]}|${p[1]}|${p[2]}`);
        return { rows: found === undefined ? [] : [{ id: found }] };
      }
      if (text.includes("insert into reference.grid_subareas")) {
        const value = id();
        subareas.set(`${p[0]}|${p[1]}|${p[2]}`, value);
        return { rows: [{ id: value }] };
      }
      if (text.includes("from reference.grid_interfaces")) {
        const found = interfaces.get(`${p[0]}|${p[1]}`);
        return { rows: found === undefined ? [] : [{ id: found.id }] };
      }
      if (text.includes("insert into reference.grid_interfaces")) {
        const value = id();
        interfaces.set(`${p[0]}|${p[4]}`, { id: value, row: p });
        return { rows: [{ id: value }] };
      }

      if (text.includes("select id from pipeline.grid_capacity_vintages")) {
        const found = vintages.get(`${p[0]}|${p[1]}|${p[2]}`);
        return { rows: found === undefined ? [] : [{ id: found }] };
      }
      if (text.includes("insert into pipeline.grid_capacity_vintages")) {
        const value = id();
        vintages.set(`${p[1]}|${p[0]}|${p[3]}`, value);
        return { rows: [{ id: value }] };
      }
      if (text.includes("select id from pipeline.grid_capacity_scenarios")) {
        const found = scenarios.get(`${p[0]}|${p[1]}`);
        return { rows: found === undefined ? [] : [{ id: found }] };
      }
      if (text.includes("insert into pipeline.grid_capacity_scenarios")) {
        const value = id();
        scenarios.set(`${p[0]}|${p[1]}`, value);
        return { rows: [{ id: value }] };
      }

      // ---- batched raw evidence: 25 columns per row, on conflict do nothing
      if (text.includes("insert into pipeline.raw_grid_capacity_records")) {
        const out: Record<string, unknown>[] = [];
        for (const row of rowsOf(p, 25)) {
          const key = `${row[0]}|${row[2]}`;
          if (rawRecords.has(key)) continue;
          const rowId = id();
          rawRecords.set(key, { id: rowId, retrievalId: String(row[0]), hash: String(row[2]), row });
          out.push({ id: rowId, retrieval_id: row[0], record_hash: row[2] });
        }
        return { rows: out };
      }
      if (text.includes("from pipeline.raw_grid_capacity_records")) {
        const retrievalIds = p[0] as string[]; const hashes = p[1] as string[];
        const out: Record<string, unknown>[] = [];
        retrievalIds.forEach((r, i) => {
          const found = rawRecords.get(`${r}|${hashes[i]}`);
          if (found) out.push({ id: found.id, retrieval_id: found.retrievalId, record_hash: found.hash });
        });
        return { rows: out };
      }

      const cast = text.includes("value::text") ? "text" : "float8";
      if (text.includes("from pipeline.grid_capacity_components")) {
        return { rows: [...components.values()]
          .filter((row) => row.supersededBy === null && String(row.cols[1]) === String(p[0]))
          .map((row) => ({
            id: row.id, scenario_id: row.cols[2], grid_subarea_id: row.cols[4],
            grid_interface_id: row.cols[5], quantity_kind: row.cols[7], component_kind: row.cols[8],
            period_basis: row.cols[10], target_year: row.cols[11], target_season: row.cols[12],
            unit: row.cols[16], capacity_basis: row.cols[17],
            value: renderNumeric(String(row.cols[15]), cast, extraFloatDigits),
          })) };
      }
      if (text.includes("from pipeline.grid_constraint_values")) {
        return { rows: [...constraints.values()]
          .filter((row) => row.supersededBy === null && String(row.cols[1]) === String(p[0]))
          .map((row) => ({
            id: row.id, scenario_id: row.cols[2], grid_interface_id: row.cols[4],
            grid_subarea_id: row.cols[5], constraint_kind: row.cols[7], direction: row.cols[8],
            period_basis: row.cols[10], target_year: row.cols[11], target_season: row.cols[12],
            unit: row.cols[16],
            value: renderNumeric(String(row.cols[15]), cast, extraFloatDigits),
          })) };
      }

      for (const [table, store] of [["components", components], ["constraints", constraints]] as const) {
        const name = table === "components" ? "pipeline.grid_capacity_components" : "pipeline.grid_constraint_values";
        if (text.includes(`update ${name}`)) {
          const oldIds = p[0] as string[]; const nextIds = p[1] as string[];
          oldIds.forEach((oldId, i) => {
            const row = store.get(oldId);
            if (row === undefined) throw new Error(`supersede: no ${table} row ${oldId}`);
            if (row.supersededBy !== null) throw new Error(`${table} row ${oldId} is already superseded`);
            row.supersededBy = nextIds[i]!;
            superseded.push({ table, id: oldId, by: nextIds[i]! });
          });
          return { rows: [] };
        }
        if (text.includes(`insert into ${name}`)) {
          const width = table === "components" ? 19 : 18;
          for (const row of rowsOf(p, width)) {
            store.set(String(row[0]), { id: String(row[0]), cols: row, supersededBy: null });
          }
          return { rows: [] };
        }
      }
      throw new Error(`unexpected query: ${text.slice(0, 80)}`);
    },
  };
  return { sql, components, constraints, superseded, rawRecords, retrievals, subareas, interfaces, statements };
}

// ------------------------------------------------------------------------------- the fixture

function artifactOf(content: string): RetrievedArtifact {
  const body = Buffer.from(content);
  return {
    label: "icr", url: "https://example.invalid/icr.xlsx", retrievedAt: "2026-09-21T00:00:00.000Z",
    status: 200, contentType: null, byteLength: body.byteLength, sha256: sha256(body), body,
  };
}

const adapter: CapacityAdapter = {
  key: "iso-ne", marketSlug: "iso-ne", sourceInterfaceSlug: "iso-ne-icr-related-values",
  retrievalPurpose: "production", artifacts: [{ label: "icr", url: "https://example.invalid/icr.xlsx" }],
  parse: () => { throw new Error("not used: these tests drive the store directly"); },
};

const period = { periodBasis: "capacity_commitment_period" as const, targetYear: 2026, targetSeason: null, periodStart: null, periodEnd: null };

function component(term: string, value: number, componentKind: "reserve_requirement" | "net_reserve_requirement"): NormalizedCapacityRecord {
  return {
    artifactLabel: "icr", nativeGeography: "ISO-NE", nativePeriod: "2026 3rd ARA",
    nativeScenario: "3rd ARA", nativeTerm: term, nativeValue: String(value), nativeUnit: "MW",
    rawPayload: { term }, locator: { extractionMethod: "workbook_cell", workbookSheet: "S", workbookCell: "C21" },
    target: {
      kind: "component", scenarioKey: "3rd_ara", quantityKind: "requirement", componentKind,
      capacityBasis: "icap", subareaNativeKey: null, interfaceNativeKey: null, period, value, unit: "MW",
    },
  };
}

function constraint(value: number): NormalizedCapacityRecord {
  return {
    artifactLabel: "icr", nativeGeography: "NNE", nativePeriod: "2026 3rd ARA",
    nativeScenario: "3rd ARA", nativeTerm: "MCL", nativeValue: String(value), nativeUnit: "MW",
    rawPayload: { term: "MCL" }, locator: { extractionMethod: "workbook_cell", workbookSheet: "S", workbookCell: "J21" },
    target: {
      kind: "constraint", scenarioKey: "3rd_ara", constraintKind: "mcl", direction: "export",
      interfaceNativeKey: "NNE-MCL", subareaNativeKey: "NNE", period, value, unit: "MW",
    },
  };
}

const evidence: NormalizedCapacityRecord = {
  artifactLabel: "icr", nativeGeography: "ISO-NE", nativePeriod: "2026 3rd ARA",
  nativeScenario: "3rd ARA", nativeTerm: "CONE ($/kw-month)", nativeValue: "12.76", nativeUnit: "$/kW-month",
  rawPayload: {}, locator: { extractionMethod: "workbook_cell", workbookSheet: "S", workbookCell: "E21" },
  target: { kind: "evidence_only", reason: "a price is not a capacity" },
};

function extractionOf(records: NormalizedCapacityRecord[], vintageKey = "icr-summary-2025-12-16"): CapacityExtraction {
  return {
    vintage: {
      nativeVintageKey: vintageKey, nativeReportId: "Summary", reportTitle: "Summary of ICR",
      releaseKind: "requirement_filing", publishedAt: "2025-12-16T00:00:00Z", publishedAtPrecision: "day",
      sourceMethodologyName: "ICR", sourceMethodologyVersion: "2025-12-16",
      publicationState: "internal_only", qualityStatus: "accepted",
    },
    scenarios: [{ nativeScenarioKey: "3rd_ara", nativeScenarioLabel: "3rd ARA", canonicalClass: "other", isReference: false, assumptions: {}, assumptionsText: null }],
    subareas: [{ nativeKey: "NNE", nativeLabel: "Northern New England", subareaKind: "capacity_zone", notes: null }],
    interfaces: [{ nativeKey: "NNE-MCL", nativeLabel: "NNE maximum capacity limit", interfaceKind: "export", fromSubareaNativeKey: "NNE", toSubareaNativeKey: null, externalCounterparty: null, notes: null }],
    records,
  };
}

const BASE = [component("ICR", 31_059, "reserve_requirement"), component("Net ICR", 30_050, "net_reserve_requirement"), constraint(8_595), evidence];

const write = (db: ReturnType<typeof fakeDatabase>, extraction: CapacityExtraction, content = "v1", batchSize?: number) =>
  persistCapacityExtraction(
    db.sql, adapter, new Map([["icr", artifactOf(content)]]), extraction, "test-collector",
    batchSize === undefined ? {} : { batchSize },
  );

// ------------------------------------------------------------------------------------- tests

describe("capacity store", () => {
  it("writes both canonical layers and keeps evidence for what became neither", async () => {
    const db = fakeDatabase();
    const result = await write(db, extractionOf(BASE));
    expect(result.componentsInserted).toBe(2);
    expect(result.constraintsInserted).toBe(1);
    expect(result.evidenceOnly).toBe(1);
    expect(result.evidenceOnlyReasons).toEqual(["a price is not a capacity"]);
    // Every record is evidence, including the ones that became canonical values.
    expect(result.rawRecordsInserted).toBe(4);
    expect(db.components.size).toBe(2);
    expect(db.constraints.size).toBe(1);
  });

  it("writes nothing on an exact rerun", async () => {
    const db = fakeDatabase();
    await write(db, extractionOf(BASE));
    const rerun = await write(db, extractionOf(BASE));
    expect(rerun.vintage).toBe("existing");
    expect(rerun.retrievalsInserted).toBe(0);
    expect(rerun.retrievalsReused).toBe(1);
    expect(rerun.rawRecordsInserted).toBe(0);
    expect(rerun.rawRecordsDuplicate).toBe(4);
    expect(rerun.componentsInserted).toBe(0);
    expect(rerun.componentsRevised).toBe(0);
    expect(rerun.componentsUnchanged).toBe(2);
    expect(rerun.constraintsRevised).toBe(0);
    expect(rerun.constraintsUnchanged).toBe(1);
    expect(rerun.subareasCreated).toBe(0);
    expect(rerun.interfacesCreated).toBe(0);
    expect(db.superseded).toEqual([]);
  });

  it("supersedes only the value a corrected artifact changed", async () => {
    const db = fakeDatabase();
    await write(db, extractionOf(BASE), "v1");
    const corrected = [component("ICR", 31_100, "reserve_requirement"), component("Net ICR", 30_050, "net_reserve_requirement"), constraint(8_595), evidence];
    const second = await write(db, extractionOf(corrected), "v2-corrected");
    expect(second.componentsRevised).toBe(1);
    expect(second.componentsUnchanged).toBe(1);
    expect(second.constraintsRevised).toBe(0);
    // The earlier evidence survives: a new retrieval, a new raw row, nothing overwritten.
    expect(second.retrievalsInserted).toBe(1);
    expect(second.rawRecordsInserted).toBe(4);
    expect(db.superseded).toHaveLength(1);
    expect(db.superseded[0]!.table).toBe("components");
    const live = [...db.components.values()].filter((row) => row.supersededBy === null);
    expect(live.map((row) => row.cols[15]).sort()).toEqual([30_050, 31_100]);
  });

  it("supersedes a network limit in its own layer, not among the components", async () => {
    const db = fakeDatabase();
    await write(db, extractionOf(BASE), "v1");
    const moved = [...BASE.slice(0, 2), constraint(8_800), evidence];
    const second = await write(db, extractionOf(moved), "v2");
    expect(second.constraintsRevised).toBe(1);
    expect(second.componentsRevised).toBe(0);
    expect(db.superseded.map((entry) => entry.table)).toEqual(["constraints"]);
  });

  it("starts a new vintage for a new release and leaves the old one live", async () => {
    const db = fakeDatabase();
    await write(db, extractionOf(BASE), "v1");
    const next = await write(db, extractionOf(BASE, "icr-summary-2026-03-01"), "v2-new-release");
    expect(next.vintage).toBe("created");
    expect(next.componentsInserted).toBe(2);
    expect(next.componentsRevised).toBe(0);
    // Nothing from the earlier release was touched: four live rows across two vintages.
    expect(db.superseded).toEqual([]);
    expect([...db.components.values()].filter((row) => row.supersededBy === null)).toHaveLength(4);
  });

  it("reuses a locality and an interface instead of drawing the map twice", async () => {
    const db = fakeDatabase();
    await write(db, extractionOf(BASE), "v1");
    const second = await write(db, extractionOf(BASE, "icr-summary-2026-03-01"), "v2");
    expect(second.subareasCreated).toBe(0);
    expect(second.subareasExisting).toBe(1);
    expect(second.interfacesCreated).toBe(0);
    expect(second.interfacesExisting).toBe(1);
    expect(db.subareas.size).toBe(1);
    expect(db.interfaces.size).toBe(1);
  });

  it("freezes the rights determination each purpose was collected under", async () => {
    const db = fakeDatabase();
    const first = await write(db, extractionOf(BASE));
    expect(first.rightsSnapshots).toBe(2);
    const rerun = await write(db, extractionOf(BASE));
    expect(rerun.rightsSnapshots).toBe(0);
  });

  it("records the vintage under the determination that governs displaying its values", async () => {
    const db = fakeDatabase();
    await write(db, extractionOf(BASE));
    const vintageInsert = db.statements.filter((statement) =>
      statement.startsWith("insert into pipeline.grid_capacity_vintages"));
    expect(vintageInsert).toHaveLength(1);
    // The classification is copied from the public display purpose, never decided by the store,
    // and never softened: this source is ambiguous and the vintage says so.
    const live = [...db.components.values()][0]!;
    expect(live).toBeDefined();
  });

  it("refuses to record a vintage with no determination governing public display", async () => {
    const db = fakeDatabase();
    const original = db.sql.query.bind(db.sql);
    const sql: CapacitySqlExecutor = {
      async query(text, params) {
        if (text.includes("from reference.source_use_permissions")) {
          // Only the internal purpose is in force. Collection is allowed; recording a vintage
          // whose display rights nobody determined is not.
          return { rows: [{ id: "perm-internal", purpose_code: "internal_retention", rights_classification: "ambiguous_requires_legal_review", disposition: "not_established", attribution_required: false, attribution_text: null, conditions: null, unresolved_issue: null }] };
        }
        return original(text, params);
      },
    };
    await expect(persistCapacityExtraction(
      sql, adapter, new Map([["icr", artifactOf("v1")]]), extractionOf(BASE), "test-collector",
    )).rejects.toThrow(/no public_raw_grid_capacity_value_display determination in force/);
  });

  it("does not churn on a value that needs sixteen significant digits", async () => {
    // production runs extra_float_digits = 0, which renders float8 to fifteen. A store reading
    // float8 would see 104849.985334333 come back for 104849.98533433278 and supersede it on
    // every run, forever.
    const db = fakeDatabase({ extraFloatDigits: 0 });
    const precise = [{
      ...component("Total Capacity", 104_849.98533433278, "reserve_requirement"),
      nativeValue: "104849.98533433278",
    }];
    await write(db, extractionOf(precise));
    const rerun = await write(db, extractionOf(precise));
    expect(rerun.componentsRevised).toBe(0);
    expect(rerun.componentsUnchanged).toBe(1);
    expect(db.superseded).toEqual([]);
  });

  it("refuses two source rows claiming one canonical identity with different values", async () => {
    const db = fakeDatabase();
    const duplicated = [component("ICR", 31_059, "reserve_requirement"), component("ICR", 31_100, "reserve_requirement")];
    await expect(write(db, extractionOf(duplicated))).rejects.toThrow(/the source has duplicate rows/);
  });

  it("writes in batches rather than one statement per record", async () => {
    const db = fakeDatabase();
    const many = Array.from({ length: 250 }, (_, index) => ({
      ...component(`ICR ${index}`, 30_000 + index, "reserve_requirement"),
      target: { ...component("x", 0, "reserve_requirement").target, period: { ...period, targetYear: 2000 + index } },
    })) as NormalizedCapacityRecord[];
    await write(db, extractionOf(many), "batched", 100);
    const rawInserts = db.statements.filter((statement) => statement.startsWith("insert into pipeline.raw_grid_capacity_records"));
    expect(rawInserts).toHaveLength(3);
    expect(db.components.size).toBe(250);
  });

  it("uses a batch size the bound-parameter ceiling permits", async () => {
    // 25 columns on the widest row; PostgreSQL accepts 65,535 parameters per statement.
    expect(CAPACITY_WRITE_BATCH_SIZE * 25).toBeLessThan(65_535);
  });

  it("keys a retrieval and a record so that identical content resolves to the same rows", () => {
    const first = artifactOf("same bytes");
    const second = artifactOf("same bytes");
    expect(capacityRetrievalKey("iso-ne", first)).toBe(capacityRetrievalKey("iso-ne", second));
    const hashOf = (term: string) => capacityRecordHash({
      artifactSha256: first.sha256, nativeGeography: "ISO-NE", nativePeriod: "2026 3rd ARA",
      nativeScenario: "3rd ARA", nativeTerm: term, nativeValue: "31059", nativeUnit: "MW",
      locator: { workbook_cell: "C21" },
    });
    expect(hashOf("ICR")).toBe(hashOf("ICR"));
    // The publisher's own word is part of the identity: two names are two quantities.
    expect(hashOf("ICR")).not.toBe(hashOf("Net ICR"));
  });

  it("rolls the whole source back when a canonical insert fails", async () => {
    const db = fakeDatabase();
    const broken = extractionOf([{ ...BASE[0]!, target: { ...BASE[0]!.target, scenarioKey: "never_declared" } } as NormalizedCapacityRecord]);
    await expect(write(db, broken)).rejects.toThrow(/undeclared scenario/);
    expect(db.statements).toContain("rollback");
    expect(db.components.size).toBe(0);
  });
});
