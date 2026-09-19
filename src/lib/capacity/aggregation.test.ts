import { describe, expect, it } from "vitest";

import { aggregate, breakdownBy, byGpuType, byRegion, dedupeKey, deduplicate } from "@/lib/capacity/aggregation";
import { observation } from "@/lib/capacity/fixtures";
import { availabilityOnly, exactQuantity, quantityRange, unknownCapacity } from "@/lib/capacity/normalize";

const exact = (n: number) => {
  const result = exactQuantity(n, "accelerator");
  if (!result.ok) throw new Error(result.reason);
  return result.measurement;
};
const range = (min: number, max: number) => {
  const result = quantityRange(min, max, "accelerator");
  if (!result.ok) throw new Error(result.reason);
  return result.measurement;
};
const state = (s: "available" | "limited" | "sold_out") => {
  const result = availabilityOnly(s);
  if (!result.ok) throw new Error(result.reason);
  return result.measurement;
};

describe("quantitative totals", () => {
  it("sums exact quantities into a point total", () => {
    const result = aggregate([
      observation(exact(120), { capacitySourceEntityId: "a" }),
      observation(exact(96), { capacitySourceEntityId: "b" }),
      observation(exact(72), { capacitySourceEntityId: "c" }),
    ]);
    expect(result.total).toMatchObject({ lower: 288, upper: 288, exact: true, quantitativeSources: 3 });
  });

  it("includes an observed zero in the total", () => {
    const result = aggregate([
      observation(exact(100), { capacitySourceEntityId: "a" }),
      observation(exact(0), { capacitySourceEntityId: "b" }),
    ]);
    expect(result.total).toMatchObject({ lower: 100, upper: 100, quantitativeObservations: 2 });
  });

  it("keeps ranges as bounds and never as a midpoint", () => {
    const result = aggregate([
      observation(exact(100), { capacitySourceEntityId: "a" }),
      observation(range(50, 100), { capacitySourceEntityId: "b" }),
    ]);
    expect(result.total).toMatchObject({ lower: 150, upper: 200, exact: false });
    // 175 is the number a midpoint would have produced, and nobody reported it.
    expect(result.total?.lower).not.toBe(175);
  });

  it("does not add quantities in different units", () => {
    const nodes = exactQuantity(4, "node");
    const result = aggregate([
      observation(exact(100), { capacitySourceEntityId: "a" }),
      observation(nodes.ok ? nodes.measurement : unknownCapacity(), { capacitySourceEntityId: "b" }),
    ]);
    expect(result.total).toMatchObject({ lower: 100, upper: 100, quantitativeObservations: 1 });
  });
});

describe("categorical observations", () => {
  it("counts availability states and never adds them to the total", () => {
    const result = aggregate([
      observation(exact(742), { capacitySourceEntityId: "a" }),
      observation(state("available"), { capacitySourceEntityId: "b" }),
      observation(state("available"), { capacitySourceEntityId: "c" }),
      observation(state("limited"), { capacitySourceEntityId: "d" }),
    ]);
    // The published sentence is "742 across 1 quantitative source, plus 3 more
    // providers reporting availability". It is never "745".
    expect(result.total?.lower).toBe(742);
    expect(result.total?.upper).toBe(742);
    expect(result.categorical.observations).toBe(3);
    expect(result.categorical.sources).toBe(3);
    expect(result.categorical.byState.available).toBe(2);
    expect(result.categorical.byState.limited).toBe(1);
  });

  it("returns a null total when every observation is categorical", () => {
    const result = aggregate([
      observation(state("available"), { capacitySourceEntityId: "a" }),
      observation(state("available"), { capacitySourceEntityId: "b" }),
    ]);
    // Not zero. Zero would read as "the market has none available".
    expect(result.total).toBeNull();
    expect(result.categorical.sources).toBe(2);
  });

  it("returns a null total when there are no observations at all", () => {
    expect(aggregate([]).total).toBeNull();
  });
});

describe("unknown observations", () => {
  it("counts them separately and contributes them to nothing", () => {
    const result = aggregate([
      observation(unknownCapacity(), { capacitySourceEntityId: "a" }),
      observation(unknownCapacity(), { capacitySourceEntityId: "b" }),
    ]);
    expect(result.total).toBeNull();
    expect(result.categorical.observations).toBe(0);
    expect(result.unknownObservations).toBe(2);
  });
});

describe("deduplication", () => {
  it("keys on capacity source, GPU type and region", () => {
    const key = dedupeKey(observation(exact(1), { capacitySourceEntityId: "seller-a" }));
    expect(key).toBe("seller-a|H100-SXM|US");
  });

  it("collapses two interfaces reporting one capacity source to one observation", () => {
    const rows = [
      observation(exact(120), {
        capacitySourceEntityId: "seller-a",
        availabilityEvidenceGrade: 3,
        provenance: {
          rawOfferId: "r1",
          retrievalId: "t1",
          sourceInterfaceSlug: "interface-one",
          methodologyVersion: "0.1.0-draft",
          collectorIdentity: "x",
          sourceNativeValue: null,
          sourceNativeField: null,
          sourceUrl: null,
        },
      }),
      observation(exact(120), {
        capacitySourceEntityId: "seller-a",
        availabilityEvidenceGrade: 1,
        provenance: {
          rawOfferId: "r2",
          retrievalId: "t2",
          sourceInterfaceSlug: "interface-two",
          methodologyVersion: "0.1.0-draft",
          collectorIdentity: "x",
          sourceNativeValue: null,
          sourceNativeField: null,
          sourceUrl: null,
        },
      }),
    ];
    const deduped = deduplicate(rows);
    expect(deduped).toHaveLength(1);
    // Best evidence grade wins; the total is 120, not 240.
    expect(deduped[0]!.availabilityEvidenceGrade).toBe(1);
    expect(aggregate(deduped).total?.lower).toBe(120);
  });

  it("keeps the same seller's different regions apart", () => {
    const deduped = deduplicate([
      observation(exact(50), { capacitySourceEntityId: "a", canonicalRegionCode: "US" }),
      observation(exact(30), { capacitySourceEntityId: "a", canonicalRegionCode: "DE" }),
    ]);
    expect(deduped).toHaveLength(2);
    expect(aggregate(deduped).total?.lower).toBe(80);
  });

  it("prefers the more recent observation when evidence grades tie", () => {
    const deduped = deduplicate([
      observation(exact(10), { observedAt: "2026-09-16T00:00:00.000Z" }),
      observation(exact(20), { observedAt: "2026-09-17T00:00:00.000Z" }),
    ]);
    expect(deduped).toHaveLength(1);
    expect(aggregate(deduped).total?.lower).toBe(20);
  });
});

describe("breakdowns", () => {
  it("groups by GPU type", () => {
    const rows = [
      observation(exact(100), { capacitySourceEntityId: "a", hardware: { normalizedGpuType: "H100-SXM", gpuVendor: null, gpuModel: null, formFactor: null, gpuMemoryGb: null, identityGrade: "A", gpusPerUnit: null } }),
      observation(exact(40), { capacitySourceEntityId: "b", hardware: { normalizedGpuType: "A100-SXM4", gpuVendor: null, gpuModel: null, formFactor: null, gpuMemoryGb: null, identityGrade: "A", gpusPerUnit: null } }),
    ];
    const groups = breakdownBy(rows, byGpuType);
    expect(groups.map((g) => g.key)).toEqual(["H100-SXM", "A100-SXM4"]);
    expect(groups[0]!.aggregate.total?.lower).toBe(100);
  });

  it("leaves unresolved dimensions out of the breakdown rather than bucketing them", () => {
    const rows = [
      observation(exact(100), { capacitySourceEntityId: "a", canonicalRegionCode: "US" }),
      observation(exact(40), { capacitySourceEntityId: "b", canonicalRegionCode: null }),
    ];
    const groups = breakdownBy(rows, byRegion);
    // An "unknown region" bucket would read as a measured region.
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe("US");
  });
});
