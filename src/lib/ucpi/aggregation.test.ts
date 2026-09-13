import { describe, expect, it } from "vitest";

import { calculateRegion, collapseCapacitySources, quantileType7, reduceSellers, type CapacitySourceObservation } from "@/lib/ucpi/aggregation";
import { ENTITIES, eligibleObservation, VERSIONS } from "@/lib/ucpi/fixtures";

const entities = new Map(ENTITIES.map((e) => [e.id, e]));

describe("seller-level reduction over eligible observations", () => {
  it("selects the 1x price at a seller with quantity discounts, retaining every candidate", () => {
    const cell = [
      eligibleObservation({ id: "l8", sellerEntityId: "ent-lambda", gpuCount: 8, normalizedPrice: 3.99 }),
      eligibleObservation({ id: "l4", sellerEntityId: "ent-lambda", gpuCount: 4, normalizedPrice: 4.09 }),
      eligibleObservation({ id: "l2", sellerEntityId: "ent-lambda", gpuCount: 2, normalizedPrice: 4.19 }),
      eligibleObservation({ id: "l1", sellerEntityId: "ent-lambda", gpuCount: 1, normalizedPrice: 4.29 }),
    ];
    const [s] = reduceSellers(cell);
    expect(s).toMatchObject({ canonicalQuantity: 1, representativePrice: 4.29, selectedObservationId: "l1", consideredCount: 4, canonicalCount: 1 });
    expect(s!.candidates.filter((c) => c.atCanonicalQuantity).map((c) => c.observationId)).toEqual(["l1"]);
    expect(s!.candidates.find((c) => c.observationId === "l8")).toMatchObject({ atCanonicalQuantity: false, selected: false });
  });

  it("takes the cheaper tier at 1x when a seller has two variants", () => {
    const cell = [
      eligibleObservation({ id: "rs", sellerEntityId: "ent-runpod", normalizedPrice: 3.49, serviceTier: { tier_label: "SECURE" } }),
      eligibleObservation({ id: "rc", sellerEntityId: "ent-runpod", normalizedPrice: 2.69, serviceTier: { tier_label: "COMMUNITY" } }),
    ];
    const [s] = reduceSellers(cell);
    expect(s).toMatchObject({ representativePrice: 2.69, selectedObservationId: "rc", canonicalCount: 2 });
  });

  it("uses the only eligible variant when there is one", () => {
    const [s] = reduceSellers([eligibleObservation({ id: "only", normalizedPrice: 3.1 })]);
    expect(s).toMatchObject({ representativePrice: 3.1, consideredCount: 1, canonicalCount: 1 });
  });

  it("ignores a lower price at a larger quantity", () => {
    const [s] = reduceSellers([eligibleObservation({ id: "a1", gpuCount: 1, normalizedPrice: 3.0 }), eligibleObservation({ id: "a8", gpuCount: 8, normalizedPrice: 1.0 })]);
    expect(s!.representativePrice).toBe(3.0);
  });

  it("keeps sellers and countries in separate cells", () => {
    const out = reduceSellers([
      eligibleObservation({ id: "us-c", sellerEntityId: "ent-c", canonicalRegionCode: "US", normalizedPrice: 3 }),
      eligibleObservation({ id: "de-c", sellerEntityId: "ent-c", canonicalRegionCode: "DE", normalizedPrice: 2 }),
      eligibleObservation({ id: "us-d", sellerEntityId: "ent-d", canonicalRegionCode: "US", normalizedPrice: 4 }),
    ]);
    expect(out.map((s) => `${s.canonicalRegionCode}:${s.sellerEntityId}:${s.representativePrice}`)).toEqual(["DE:ent-c:2", "US:ent-c:3", "US:ent-d:4"]);
  });
});

describe("capacity-source collapse", () => {
  const seller = (sellerEntityId: string, price: number, slugs: string[] = ["iface"], operatorEntityId: string | null = null) => ({
    sellerEntityId,
    canonicalRegionCode: "US",
    canonicalQuantity: 1,
    representativePrice: price,
    selectedObservationId: `sel-${sellerEntityId}`,
    consideredCount: 1,
    canonicalCount: 1,
    reductionRule: "canonical_quantity_then_minimum" as const,
    candidates: [],
    sourceInterfaceSlugs: slugs,
    operatorEntityId,
  });

  it("two independent legal sellers are two capacity sources", () => {
    const out = collapseCapacitySources([seller("ent-c", 3), seller("ent-d", 4)], entities);
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.attributionStatus === "seller_fallback")).toBe(true);
  });

  it("two brands under common control are one capacity source at the lowest accessible channel", () => {
    const out = collapseCapacitySources([seller("ent-c", 3.2), seller("ent-c-brand", 2.9)], entities);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ capacitySourceEntityId: "ent-c", representativePrice: 2.9, attributionStatus: "common_control", memberSellerEntityIds: ["ent-c", "ent-c-brand"] });
  });

  it("two interfaces exposing the same legal seller are one capacity source", () => {
    // Two seller observations cannot share a seller in one run, so two interfaces reach the same seller through one cell;
    // the collapse still sees one entity and counts both interfaces.
    const out = collapseCapacitySources([seller("ent-c", 3, ["iface-a", "iface-b"])], entities);
    expect(out).toHaveLength(1);
    expect(out[0]!.sourceInterfaceCount).toBe(2);
  });

  it("a seller together with its disclosed underlying operator collapses onto the operator", () => {
    const out = collapseCapacitySources([seller("ent-d", 3.5, ["iface"], null), seller("ent-c", 3.0, ["iface"], "ent-d")], entities);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ capacitySourceEntityId: "ent-d", attributionStatus: "operator_determined", representativePrice: 3.0 });
  });

  it("undetermined operators leave seller identity governing, whatever the prices look like", () => {
    const out = collapseCapacitySources([seller("ent-c", 3.0), seller("ent-d", 3.0)], entities);
    expect(out).toHaveLength(2);
  });
});

describe("regional calculation", () => {
  const participant = (id: string, price: number, slugs: string[] = [`iface-${id}`]): CapacitySourceObservation => ({
    capacitySourceEntityId: id,
    canonicalRegionCode: "US",
    representativePrice: price,
    attributionStatus: "seller_fallback",
    collapseRule: "lowest_accessible_channel",
    memberSellerEntityIds: [id],
    sourceInterfaceSlugs: slugs,
    sourceInterfaceCount: slugs.length,
  });
  const base = { instrument: VERSIONS.instrument, canonicalRegionCode: "US", calculationDate: "2026-09-13", methodologyVersion: VERSIONS.methodologyVersion, instrumentSpecVersion: VERSIONS.instrumentSpecVersion, prior: null };

  it("N=0 is Unavailable with NO_ELIGIBLE_PARTICIPANT", () => {
    const r = calculateRegion({ ...base, participants: [] });
    expect(r).toMatchObject({ outcome: "unavailable", structuralCondition: "NO_ELIGIBLE_PARTICIPANT", priceLevel: null, participantCount: 0 });
  });

  it("N=1 is Unavailable with SINGLE_PARTICIPANT and no price, however good the participant", () => {
    const r = calculateRegion({ ...base, participants: [participant("a", 2.69)] });
    expect(r).toMatchObject({ outcome: "unavailable", structuralCondition: "SINGLE_PARTICIPANT", priceLevel: null, participantCount: 1 });
  });

  it("N=2 publishes the midpoint at Minimum breadth with dispersion withheld and both participants pivotal", () => {
    const r = calculateRegion({ ...base, participants: [participant("a", 2.69), participant("b", 4.29)] });
    expect(r).toMatchObject({ outcome: "value", marketBreadth: "minimum", participantCount: 2, contributingSourceCount: 2, largestSourceParticipantShare: 0.5, dispersionPublished: false, dispersion: null, changeDisposition: "withheld" });
    expect(r.priceLevel).toBeCloseTo(3.49, 10);
    expect(r.diagnostics).toEqual(expect.arrayContaining(["MARKET_BREADTH_MINIMUM", "ALL_PARTICIPANTS_PIVOTAL"]));
    expect(r).toMatchObject({ windowStart: "2026-09-13T00:00:00.000Z", cutoff: "2026-09-14T00:00:00.000Z", publicationDeadline: "2026-09-15T00:00:00.000Z" });
  });

  it("N=3 publishes the middle participant at Normal breadth with type-7 dispersion", () => {
    const r = calculateRegion({ ...base, participants: [participant("a", 2.0), participant("b", 3.0), participant("c", 10.0)] });
    expect(r).toMatchObject({ outcome: "value", marketBreadth: "normal", priceLevel: 3.0, participantCount: 3, dispersionPublished: true });
    expect(r.dispersion!.p10).toBeCloseTo(2.2, 10);
    expect(r.dispersion!.p50).toBeCloseTo(3.0, 10);
    expect(r.dispersion!.p90).toBeCloseTo(8.6, 10);
    expect(r.dispersion!.iqr).toBeCloseTo(4.0, 10);
    expect(r.diagnostics).toEqual([]);
  });

  it("uses the even-N convention at four participants", () => {
    const r = calculateRegion({ ...base, participants: [participant("a", 1), participant("b", 2), participant("c", 3), participant("d", 10)] });
    expect(r.priceLevel).toBe(2.5);
  });

  it("counts contributing interfaces and the largest-interface share", () => {
    const r = calculateRegion({ ...base, participants: [participant("a", 2, ["venue"]), participant("b", 3, ["venue"]), participant("c", 4, ["other"])] });
    expect(r.contributingSourceCount).toBe(2);
    expect(r.largestSourceParticipantShare).toBeCloseTo(2 / 3, 12);
  });

  it("withholds the percentage change when the preceding date was Unavailable, publishes it when the same participants continue, annotates on breadth change", () => {
    const two = [participant("a", 2.69), participant("b", 4.29)];
    expect(calculateRegion({ ...base, participants: two, prior: { status: "unavailable" } }).changeDisposition).toBe("withheld");
    const same = calculateRegion({ ...base, participants: two, prior: { status: "published", breadth: "minimum", participantSetChanged: false, priceLevel: 3.0 }, priorParticipantIds: ["a", "b"] });
    expect(same.changeDisposition).toBe("published");
    expect(same.percentageChange1d).toBeCloseTo(((3.49 - 3.0) / 3.0) * 100, 10);
    const grew = calculateRegion({ ...base, participants: [...two, participant("c", 3.5)], prior: { status: "published", breadth: "minimum", participantSetChanged: false, priceLevel: 3.49 }, priorParticipantIds: ["a", "b"] });
    expect(grew).toMatchObject({ marketBreadth: "normal", changeDisposition: "annotated" });
  });

  it("quantile type 7 matches the child's closed form", () => {
    expect(quantileType7([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantileType7([5], 0.9)).toBe(5);
    expect(quantileType7([1, 2, 3], 1)).toBe(3);
  });
});
