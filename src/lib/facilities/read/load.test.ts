/**
 * What the public query asks the database for.
 *
 * The filters are asserted as text because they are the product: a read path
 * that dropped the publication clause, the map-eligibility predicate or the
 * power-relationship test would return rows that look exactly like correct
 * ones. The behaviour of those predicates against real rows is exercised in
 * supabase/tests/390_map_facility_foundation.sql; what is checked here is that
 * this query still contains them, and that it never re-derives eligibility in
 * TypeScript where it could drift from the write-side constraint.
 */

import { describe, expect, it } from "vitest";

import { FACILITY_VERIFICATION_HORIZON_DAYS } from "@/lib/facilities/domain";
import { loadFacilityReadModel } from "@/lib/facilities/read/load";
import { validatePublicFacilities } from "@/lib/facilities/read/read-model";

type Row = Record<string, unknown>;

function executor(rows: Row[], published = rows.length) {
  const queries: Array<{ text: string; values: readonly unknown[] }> = [];
  return {
    queries,
    async query(text: string, values: readonly unknown[]) {
      queries.push({ text, values });
      if (/count\(\*\)::int/.test(text)) return { rows: [{ n: published }] };
      return { rows };
    },
  };
}

const row = (overrides: Row = {}): Row => ({
  id: "csc-kajaani-lumi-host",
  name: "CSC Kajaani Data Center (LUMI host)",
  category: "data_center",
  owner_name: "CSC – IT Center for Science",
  operator_name: "CSC",
  lifecycle_status: "operational",
  street_address: "Tehdaskatu 15",
  locality: "Kajaani",
  admin_area: "Kainuu",
  country_name: "Finland",
  country_code: "FI",
  latitude: "64.2319866",
  longitude: "27.691477",
  coordinate_precision: "building",
  last_verified_date: "2026-09-17",
  sources: [{ publisher: "CSC", title: "LUMI Supercomputer", url: "https://example.com/csc" }],
  ...overrides,
});

describe("loadFacilityReadModel", () => {
  it("selects only published, placeable, current facilities", async () => {
    const sql = executor([row()]);
    await loadFacilityReadModel(sql);
    const text = sql.queries[0]!.text;
    expect(text).toContain("f.publication_state = 'published'");
    expect(text).toContain("reference.facility_is_map_eligible(f.latitude, f.longitude, f.coordinate_precision)");
    expect(text).toContain("f.last_verified_date >= (current_date - ($1::integer))");
    expect(sql.queries[0]!.values).toEqual([FACILITY_VERIFICATION_HORIZON_DAYS]);
  });

  it("keeps the power-infrastructure rule in the read path, not only at write time", async () => {
    const sql = executor([row()]);
    await loadFacilityReadModel(sql);
    const text = sql.queries[0]!.text;
    expect(text).toContain("f.category <> 'power_infrastructure'");
    expect(text).toContain("r.relationship_type = 'supplies_power_to'");
    expect(text).toContain("r.evidence_id is not null");
    expect(text).toContain("reference.facility_is_compute_category(t.category)");
  });

  it("selects no internal column", async () => {
    const sql = executor([row()]);
    await loadFacilityReadModel(sql);
    const text = sql.queries[0]!.text;
    for (const column of ["review_notes", "confidence", "coordinate_notes"]) {
      expect(text, column).not.toContain(`f.${column}`);
    }
  });

  it("builds a public facility whose response passes its own contract", async () => {
    const sql = executor([row()]);
    const loaded = await loadFacilityReadModel(sql);
    expect(loaded.facilities).toHaveLength(1);
    expect(loaded.facilities[0]).toEqual({
      id: "csc-kajaani-lumi-host",
      name: "CSC Kajaani Data Center (LUMI host)",
      category: "data_center",
      latitude: 64.2319866,
      longitude: 27.691477,
      coordinatePrecision: "building",
      address: "Tehdaskatu 15, Kajaani, Kainuu, Finland",
      ownerName: "CSC – IT Center for Science",
      operatorName: "CSC",
      lifecycleStatus: "operational",
      lastVerifiedDate: "2026-09-17",
      sources: [{ publisher: "CSC", title: "LUMI Supercomputer", url: "https://example.com/csc" }],
    });
    expect(validatePublicFacilities(JSON.parse(JSON.stringify(loaded)), new Date("2026-09-17T00:00:00Z"))).toEqual([]);
  });

  it("counts coverage by category and by country, and reports how many are published at all", async () => {
    const sql = executor(
      [
        row(),
        row({ id: "lumi-supercomputer", category: "gpu_compute_cluster" }),
        row({ id: "tsmc-fab-18-tainan", category: "semiconductor_fab", country_code: "TW" }),
      ],
      5,
    );
    const loaded = await loadFacilityReadModel(sql);
    expect(loaded.coverage).toEqual({
      published: 5,
      served: 3,
      byCategory: { data_center: 1, gpu_compute_cluster: 1, power_infrastructure: 0, semiconductor_fab: 1 },
      countries: 2,
    });
  });

  it("drops a row it cannot read rather than half-rendering it", async () => {
    const sql = executor([row(), row({ id: "broken", category: "compute_cluster" }), row({ id: "no-position", coordinate_precision: "city" })]);
    const loaded = await loadFacilityReadModel(sql);
    expect(loaded.facilities.map((facility) => facility.id)).toEqual(["csc-kajaani-lumi-host"]);
  });

  it("reports an empty database as an absence with a reason, keeping the coverage it measured", async () => {
    const sql = executor([], 0);
    const loaded = await loadFacilityReadModel(sql);
    expect(loaded.facilities).toEqual([]);
    expect(loaded.unavailableReason).toBe("no_published_facilities");
    expect(loaded.coverage.published).toBe(0);
  });

  it("ignores a malformed source entry rather than serving it", async () => {
    const sql = executor([row({ sources: [{ publisher: "CSC" }, { publisher: "", url: "https://example.com/x" }, "nonsense"] })]);
    const loaded = await loadFacilityReadModel(sql);
    expect(loaded.facilities[0]?.sources).toEqual([]);
  });
});
