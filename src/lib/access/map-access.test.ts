/**
 * Map layer filtering.
 *
 * The map is the surface where getting this wrong is quietest: a filter that runs
 * in the browser still ships every premium coordinate, and the map looks correct
 * while the payload is a complete copy of the dataset. So these tests assert on
 * what the *model* contains, not on what would be drawn.
 *
 * They also pin the property that is easy to lose in the other direction — that a
 * locked layer stays visible as a layer. Withholding the points while hiding the
 * name would make the map look emptier instead of gated.
 */

import { describe, expect, it } from "vitest";

import { PREMIUM_ENFORCEMENT_ACTIVE_VALUE, PREMIUM_ENFORCEMENT_VAR } from "@/lib/access/activation";
import { ANONYMOUS_VIEWER, authenticatedViewer, subscriberViewer } from "@/lib/access/entitlement";
import { OPEN_MAP_ACCESS, filterFacilityModel, filterMapPoints, isCategoryVisible, mapAccessFor } from "@/lib/access/map-access";
import { FACILITY_CATEGORIES, type FacilityCategory } from "@/lib/facilities/domain";
import type { FacilityMapReadModel } from "@/lib/facilities/read/read-model";
import type { UrdaisMapPoint } from "@/types/map";

const ON = { [PREMIUM_ENFORCEMENT_VAR]: PREMIUM_ENFORCEMENT_ACTIVE_VALUE };

/** One point per category, with coordinates distinctive enough to find in a payload. */
function points(): UrdaisMapPoint[] {
  return FACILITY_CATEGORIES.map((category, index) => ({
    id: `point-${category}`,
    name: `Fixture ${category}`,
    category,
    longitude: 10 + index,
    latitude: 20 + index,
  }));
}

function model(): FacilityMapReadModel {
  return {
    dataset: "urdais-map-facilities",
    verificationHorizonDays: 180,
    facilities: FACILITY_CATEGORIES.map((category, index) => ({
      id: `facility-${category}`,
      name: `Fixture ${category}`,
      category,
      longitude: 10 + index,
      latitude: 20 + index,
    })) as unknown as FacilityMapReadModel["facilities"],
    coverage: {
      published: 40,
      served: 4,
      byCategory: { data_center: 10, gpu_compute_cluster: 11, power_infrastructure: 12, semiconductor_fab: 13 },
      countries: 7,
    } as unknown as FacilityMapReadModel["coverage"],
    unavailableReason: null,
  };
}

describe("with enforcement inactive", () => {
  it("is open for every reader, and nothing is locked", () => {
    for (const viewer of [ANONYMOUS_VIEWER, authenticatedViewer(), subscriberViewer()]) {
      expect(mapAccessFor(viewer, {})).toEqual(OPEN_MAP_ACCESS);
    }
  });

  it("passes the points and the model through untouched", () => {
    const access = mapAccessFor(ANONYMOUS_VIEWER, {});
    const all = points();
    // Identity, not just equality: current production behaviour is that nothing
    // happens on this path at all.
    expect(filterMapPoints(all, access)).toBe(all);
    const m = model();
    expect(filterFacilityModel(m, access)).toBe(m);
  });
});

describe("an anonymous reader with enforcement active", () => {
  const access = mapAccessFor(ANONYMOUS_VIEWER, ON);

  it("keeps data centres visible and locks the other three", () => {
    expect([...access.visibleCategories]).toEqual(["data_center"]);
    expect([...access.lockedCategories].sort()).toEqual(["gpu_compute_cluster", "power_infrastructure", "semiconductor_fab"]);
  });

  it("carries the reason that sends them to sign in or subscribe", () => {
    expect(access.reason).toBe("authentication_required");
  });

  it("withholds every premium point", () => {
    const filtered = filterMapPoints(points(), access);
    expect(filtered.map((p) => p.category)).toEqual(["data_center"]);
  });

  it("leaves no premium coordinate anywhere in the serialised points", () => {
    // The assertion that actually matters: a premium latitude or longitude must not
    // survive serialisation, because that is what reaches the browser.
    const serialised = JSON.stringify(filterMapPoints(points(), access));
    for (const category of access.lockedCategories) {
      expect(serialised).not.toContain(category);
      expect(serialised).not.toContain(`Fixture ${category}`);
    }
    // The public one is still there.
    expect(serialised).toContain("data_center");
  });

  it("withholds premium facilities from the read model", () => {
    const filtered = filterFacilityModel(model(), access);
    expect(filtered.facilities.map((f) => f.category)).toEqual(["data_center"]);
  });

  it("zeroes the withheld per-category counts", () => {
    // Otherwise the response tells an unsubscribed reader exactly how many GPU
    // clusters and fabs are being kept from them, which is the dataset's shape.
    const filtered = filterFacilityModel(model(), access);
    expect(filtered.coverage.byCategory).toEqual({
      data_center: 10,
      gpu_compute_cluster: 0,
      power_infrastructure: 0,
      semiconductor_fab: 0,
    });
  });

  it("recomputes served from what actually ships", () => {
    expect(filterFacilityModel(model(), access).coverage.served).toBe(1);
  });

  it("leaves published alone, because dataset size is a public fact", () => {
    expect(filterFacilityModel(model(), access).coverage.published).toBe(40);
  });

  it("keeps the response a valid facility model", () => {
    const filtered = filterFacilityModel(model(), access);
    expect(filtered.dataset).toBe("urdais-map-facilities");
    expect(filtered.unavailableReason).toBeNull();
  });
});

describe("a signed-in non-subscriber with enforcement active", () => {
  const access = mapAccessFor(authenticatedViewer(), ON);

  it("is locked out of the same three layers", () => {
    expect([...access.lockedCategories].sort()).toEqual(["gpu_compute_cluster", "power_infrastructure", "semiconductor_fab"]);
  });

  it("carries the reason that sends them to subscribe, not to sign in again", () => {
    expect(access.reason).toBe("entitlement_required");
  });
});

describe("a subscriber with enforcement active", () => {
  const access = mapAccessFor(subscriberViewer(), ON);

  it("sees every category", () => {
    expect([...access.visibleCategories].sort()).toEqual([...FACILITY_CATEGORIES].sort());
    expect(access.lockedCategories).toEqual([]);
    expect(access.reason).toBeNull();
  });

  it("receives every point and every facility", () => {
    expect(filterMapPoints(points(), access)).toHaveLength(FACILITY_CATEGORIES.length);
    expect(filterFacilityModel(model(), access).facilities).toHaveLength(FACILITY_CATEGORIES.length);
  });

  it("keeps the counts intact", () => {
    expect(filterFacilityModel(model(), access).coverage.byCategory.gpu_compute_cluster).toBe(11);
  });
});

describe("the map stays public", () => {
  it("never locks the data centre layer, for any reader", () => {
    for (const viewer of [ANONYMOUS_VIEWER, authenticatedViewer(), subscriberViewer()]) {
      for (const env of [{}, ON]) {
        const access = mapAccessFor(viewer, env);
        expect(isCategoryVisible(access, "data_center")).toBe(true);
        expect(access.lockedCategories).not.toContain("data_center");
      }
    }
  });

  it("locks exactly the three premium categories and never a fourth", () => {
    const access = mapAccessFor(ANONYMOUS_VIEWER, ON);
    const locked = new Set<FacilityCategory>(access.lockedCategories);
    expect(locked.size).toBe(3);
    expect(locked.has("data_center")).toBe(false);
  });

  it("partitions the taxonomy exhaustively, so no category is silently dropped", () => {
    const access = mapAccessFor(ANONYMOUS_VIEWER, ON);
    const union = [...access.visibleCategories, ...access.lockedCategories].sort();
    expect(union).toEqual([...FACILITY_CATEGORIES].sort());
  });
});
