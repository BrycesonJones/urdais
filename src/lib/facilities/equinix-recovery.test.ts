import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseFacilityImportDocument } from "@/lib/facilities/contract";
import { isMapEligible } from "@/lib/facilities/domain";
import {
  EQUINIX_RECOVERY_DIGEST,
  mergeEquinixRecovery,
  projectEquinixRecovery,
  type EquinixRecoveryArtifact,
} from "@/lib/facilities/equinix-recovery";
import {
  materializeEquinixQueue,
  validateEquinixTranche,
  type EquinixGeocodeResult,
  type EquinixReviewDecisions,
} from "@/lib/facilities/equinix-tranche";

const text = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const json = <T>(path: string): T => JSON.parse(text(path)) as T;
const recoveryPath = "data/map/geocoding/equinix-precision-recovery.v1.json";
const recovery = json<EquinixRecoveryArtifact>(recoveryPath);
const v2 = json<{ results: EquinixGeocodeResult[] }>("data/map/geocoding/equinix-results.v2.json").results;
const v3 = json<{ qa: Record<string, unknown>; results: EquinixGeocodeResult[] }>("data/map/geocoding/equinix-results.v3.json");
const decisions = json<EquinixReviewDecisions>("data/map/geocoding/equinix-review-decisions.v1.json");
const source = validateEquinixTranche(json("data/map/equinix-manual-tranche.v1.json"));
const queue = materializeEquinixQueue(source.tranche);
const merged = mergeEquinixRecovery(v2, recovery, decisions);
const canonical = parseFacilityImportDocument(json("data/map/facilities.v1.json"));

const retainedCity = [
  "equinix-rj3",
  "equinix-sh1",
  "equinix-sh2",
  "equinix-os2x",
  "equinix-mn2",
  "equinix-ny13",
].sort();

describe("Equinix precision recovery", () => {
  it("pins the approved artifact and accounts for all 73 recovery decisions", () => {
    expect(createHash("sha256").update(text(recoveryPath)).digest("hex")).toBe(EQUINIX_RECOVERY_DIGEST);
    expect(recovery.records).toHaveLength(73);
    expect(new Set(recovery.records.map((record) => record.researchKey)).size).toBe(73);
    expect(merged.issues).toEqual([]);
    expect(merged.automaticUpgrades).toHaveLength(57);
    expect(merged.humanReviewed).toHaveLength(10);
    expect(merged.retainedCity).toEqual(retainedCity);
  });

  it("produces a complete v3 with the reviewed coordinates and no fabricated precision", () => {
    expect(v3.results).toEqual(merged.results);
    expect(v3.results).toHaveLength(187);
    expect(new Set(v3.results.map((result) => result.researchKey)).size).toBe(187);
    expect(v3.results.every((result) => result.outcome === "geocoded_ready" && result.latitude !== null && result.longitude !== null)).toBe(true);

    const byKey = new Map(v3.results.map((result) => [result.researchKey, result]));
    expect(byKey.get("equinix-sp5x")).toMatchObject({ latitude: -23.472, longitude: -46.685, coordinatePrecision: "street", provider: "manual_review" });
    expect(byKey.get("equinix-ny4")).toMatchObject({ latitude: 40.778534, longitude: -74.072237, coordinatePrecision: "building", provider: "manual_review" });
    expect(v3.results.filter((result) => result.coordinatePrecision === "city").map((result) => result.researchKey).sort()).toEqual(retainedCity);
  });

  it("applies the shared-point rule after recovery", () => {
    const byKey = new Map(v3.results.map((result) => [result.researchKey, result]));
    for (const key of ["equinix-da1", "equinix-da2", "equinix-da3"]) {
      expect(byKey.get(key)?.coordinatePrecision, key).toBe("street");
    }
    expect(merged.sharedPointDemotions).toEqual(["equinix-da1", "equinix-da2", "equinix-da3"]);
  });

  it("keeps the canonical projection update-only and protects stronger NY4 evidence", () => {
    expect(source.issues).toEqual([]);
    expect(canonical.issues).toEqual([]);
    expect(canonical.document).not.toBeNull();
    const projection = projectEquinixRecovery(canonical.document!.facilities, queue, v3.results);
    expect(projection.inserted).toBe(0);
    expect(projection.deleted).toBe(0);
    expect(projection.restamped).toBe(0);
    expect(projection.updated).toEqual([]);
    expect(projection.suppressed).toEqual([{
      researchKey: "equinix-ny4",
      reason: "existing per-facility coordinate evidence is stronger; the reviewed decision adds no independent coordinate source",
    }]);

    const ny4 = canonical.document!.facilities.find((facility) => facility.researchKey === "equinix-ny4")!;
    expect(ny4.location).toMatchObject({ latitude: 40.7764281, longitude: -74.0697759, coordinatePrecision: "street" });
  });

  it("leaves only the six explicit city records off the Equinix map", () => {
    const equinix = canonical.document!.facilities.filter((facility) => facility.operatorName === "Equinix");
    const visible = equinix.filter((facility) => isMapEligible({
      latitude: facility.location.latitude ?? null,
      longitude: facility.location.longitude ?? null,
      coordinatePrecision: facility.location.coordinatePrecision ?? null,
    }));
    expect(equinix).toHaveLength(227);
    expect(visible).toHaveLength(221);
    expect(equinix.filter((facility) => facility.location.coordinatePrecision === "city").map((facility) => facility.researchKey).sort()).toEqual(retainedCity);
  });
});
