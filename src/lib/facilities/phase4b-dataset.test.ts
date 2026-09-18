import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseFacilityImportDocument } from "@/lib/facilities/contract";
import {
  FACILITY_CATEGORIES,
  MAP_ELIGIBLE_PRECISIONS,
  hasAdmissiblePositioning,
  isMapEligible,
} from "@/lib/facilities/domain";
import { buildImportPlan } from "@/lib/facilities/import/plan";

type ReadyRow = {
  ID: string;
  Facility: string;
  Country: string | null;
  Latitude: number;
  Longitude: number;
  Precision: string;
  Outcome: string;
  Sources: string;
};

type WorkbookManifest = {
  manifestVersion: string;
  sourceWorkbook: string;
  ready: ReadyRow[];
  manualLookup: Array<{ ID: string; "Current Outcome": string }>;
};

const read = (path: string) => JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
const manifest = read("data/map/phase4b-workbook-manifest.v1.json") as WorkbookManifest;
const rawFacilities = read("data/map/facilities.v1.json");
const { document, issues } = parseFacilityImportDocument(rawFacilities);
const plan = buildImportPlan(document!, { today: new Date("2026-09-18T00:00:00Z") });
const byKey = new Map(document!.facilities.map((facility) => [facility.researchKey, facility]));
const readyIds = manifest.ready.map((row) => row.ID);
const readySet = new Set(readyIds);
const manualIds = manifest.manualLookup.map((row) => row.ID);

describe("the authoritative Phase 4B workbook projection", () => {
  it("preserves the workbook scope invariants without silently skipping a row", () => {
    expect(manifest.manifestVersion).toBe("urdais.map.phase4b-workbook-manifest/1");
    expect(manifest.sourceWorkbook).toBe("urdais_map_phase4b_ready_and_manual_v2.xlsx");
    expect(manifest.ready).toHaveLength(107);
    expect(new Set(readyIds).size).toBe(107);
    expect(manifest.manualLookup).toHaveLength(312);
    expect(new Set(manualIds).size).toBe(312);
    expect(readyIds.filter((id) => new Set(manualIds).has(id))).toEqual([]);
    expect(new Set([...readyIds, ...manualIds]).size).toBe(419);
  });

  it("keeps all Manual Lookup records out of the Phase 4B write set", () => {
    const splitRequired = manifest.manualLookup
      .filter((row) => row["Current Outcome"] === "entity_split_required")
      .map((row) => row.ID);
    expect(splitRequired.length).toBeGreaterThan(0);
    expect(manualIds.some((id) => readySet.has(id))).toBe(false);
    expect(splitRequired.some((id) => readySet.has(id))).toBe(false);
  });

  it("normalizes every ready row into one valid /2 canonical facility", () => {
    expect(issues).toEqual([]);
    expect(plan.errors).toEqual([]);
    expect(document!.contractVersion).toBe("urdais.map.facility-import/2");
    expect(document!.researchDocument).toBe("docs/operations/map-phase-4b-ready-facilities.md");
    expect(readyIds.filter((id) => !byKey.has(id))).toEqual([]);

    for (const row of manifest.ready) {
      const facility = byKey.get(row.ID)!;
      expect(facility.canonicalName, row.ID).toBe(row.Facility);
      expect(FACILITY_CATEGORIES, row.ID).toContain(facility.category);
      expect(facility.requestedPublicationState, row.ID).toBe("research");
      expect(facility.quality.lastVerifiedDate, row.ID).toBe("2026-09-18");
      expect(facility.evidence.length, row.ID).toBeGreaterThan(0);
    }
  });

  it("makes all 107 ready rows map-safe and publicly readable as research", () => {
    for (const row of manifest.ready) {
      expect(Number.isFinite(row.Latitude), row.ID).toBe(true);
      expect(Number.isFinite(row.Longitude), row.ID).toBe(true);
      expect(MAP_ELIGIBLE_PRECISIONS, row.ID).toContain(row.Precision);
      expect(row.Precision, row.ID).not.toBe("city");
      expect(row.Outcome, row.ID).toBe("resolved_map_ready");

      const facility = byKey.get(row.ID)!;
      expect(
        isMapEligible({
          latitude: facility.location.latitude ?? null,
          longitude: facility.location.longitude ?? null,
          coordinatePrecision: facility.location.coordinatePrecision ?? null,
        }),
        row.ID,
      ).toBe(true);
      const positioning = facility.evidence.filter((evidence) =>
        evidence.claims.some((claim) => claim.field === "location" || claim.field === "coordinates"),
      );
      expect(hasAdmissiblePositioning(positioning), row.ID).toBe(true);
    }
  });

  it("retains every supplied source reference and its positioning claims", () => {
    for (const row of manifest.ready) {
      const facility = byKey.get(row.ID)!;
      for (const reference of row.Sources.split(";").map((part) => part.trim()).filter(Boolean)) {
        expect(facility.evidence.some((evidence) => evidence.title.includes(reference)), `${row.ID}: ${reference}`).toBe(true);
      }
      expect(
        facility.evidence.some((evidence) =>
          evidence.claims.some((claim) => claim.field === "location" || claim.field === "coordinates"),
        ),
        row.ID,
      ).toBe(true);
    }
  });

  it("keeps legitimate shared-location entities distinct", () => {
    const ty6 = byKey.get("equinix-ty6")!;
    const ty7 = byKey.get("equinix-ty7")!;
    expect(ty6.researchKey).not.toBe(ty7.researchKey);
    expect([ty6.location.latitude, ty6.location.longitude]).toEqual([ty7.location.latitude, ty7.location.longitude]);

    const slough = ["equinix-ld4", "equinix-ld5", "equinix-ld6"].map((id) => byKey.get(id)!);
    expect(new Set(slough.map((facility) => facility.researchKey)).size).toBe(3);
    expect(new Set(slough.map((facility) => `${facility.location.latitude},${facility.location.longitude}`)).size).toBe(1);
  });

  it("places QTS Vimercate in Italy", () => {
    const vimercate = byKey.get("qts-vimercate")!;
    expect(vimercate.location.countryName).toBe("Italy");
    expect(vimercate.location.countryCode).toBe("IT");
  });
});
