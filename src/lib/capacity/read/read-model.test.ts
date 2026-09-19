import { describe, expect, it } from "vitest";

import { isEligibleSource, type CapacitySignalCapability } from "@/lib/capacity/domain";
import { observation } from "@/lib/capacity/fixtures";
import { availabilityOnly, exactQuantity } from "@/lib/capacity/normalize";
import { buildCapacityReadModel, filterObservations } from "@/lib/capacity/read/load";
import {
  emptyCapacityReadModel,
  emptyCoverage,
  validatePublicCapacity,
} from "@/lib/capacity/read/read-model";

const NOW = new Date("2026-09-17T12:00:00.000Z");

const exact = (n: number) => {
  const result = exactQuantity(n, "accelerator");
  if (!result.ok) throw new Error(result.reason);
  return result.measurement;
};
const state = () => {
  const result = availabilityOnly("available");
  if (!result.ok) throw new Error(result.reason);
  return result.measurement;
};

function capability(overrides: Partial<CapacitySignalCapability & { providerName: string }> = {}) {
  return {
    sourceInterfaceSlug: "test-interface",
    providerName: "Test Provider",
    maxTier: 1 as const,
    supportsExactQuantity: true,
    supportsQuantityRange: false,
    supportsAvailabilityState: true,
    supportsRegion: true,
    supportsConfiguration: true,
    quantityUnit: "accelerator" as const,
    freshnessHorizonSeconds: 86_400,
    assessment: "test",
    termsPermitted: true,
    productionApproved: true,
    termsReviewState: "permitted",
    productionAccessState: "production_approved",
    ...overrides,
  };
}

describe("source eligibility", () => {
  it("requires capability and permission together", () => {
    expect(isEligibleSource(capability())).toBe(true);
    // The compute market's best availability interface is one Urdais was refused.
    expect(isEligibleSource(capability({ termsPermitted: false }))).toBe(false);
    expect(isEligibleSource(capability({ productionApproved: false }))).toBe(false);
  });

  it("rejects a permitted source that publishes no availability signal", () => {
    // Price of Compute: approved, permitted, and carrying nothing.
    expect(
      isEligibleSource(
        capability({
          maxTier: 4,
          supportsExactQuantity: false,
          supportsAvailabilityState: false,
          quantityUnit: null,
        }),
      ),
    ).toBe(false);
  });
});

describe("the read model when nothing is eligible", () => {
  it("reports no eligible source rather than an empty dataset", () => {
    const model = buildCapacityReadModel(
      [capability({ maxTier: 4, supportsExactQuantity: false, supportsAvailabilityState: false, quantityUnit: null })],
      [],
      NOW,
    );
    expect(model.snapshot).toBeNull();
    expect(model.unavailableReason).toBe("no_eligible_source");
    expect(model.publicReason).toMatch(/published price is not evidence/);
    expect(model.coverage.assessedSources).toBe(1);
    expect(model.coverage.eligibleSources).toBe(0);
  });

  it("distinguishes a written refusal from a pending review", () => {
    // These are not the same barrier. One is a decision Urdais has been given and
    // cannot appeal by finding another endpoint; the other is an unanswered
    // question. Reporting them identically would overstate how blocked the
    // sources closest to clearing actually are.
    const model = buildCapacityReadModel(
      [
        capability({ sourceInterfaceSlug: "refused", termsPermitted: false, termsReviewState: "not_permitted" }),
        capability({ sourceInterfaceSlug: "under-review", termsPermitted: false, termsReviewState: "under_review" }),
        capability({
          sourceInterfaceSlug: "awaiting-approval",
          productionApproved: false,
          productionAccessState: "production_review_pending",
        }),
        capability({
          sourceInterfaceSlug: "prices-only",
          maxTier: 4,
          supportsExactQuantity: false,
          supportsAvailabilityState: false,
          quantityUnit: null,
        }),
      ],
      [],
      NOW,
    );
    const reasons = Object.fromEntries(
      model.coverage.sources.map((source) => [source.sourceInterfaceSlug, source.blockedReason]),
    );
    expect(reasons["refused"]).toMatch(/this use was refused/);
    expect(reasons["under-review"]).toMatch(/under review/);
    expect(reasons["refused"]).not.toEqual(reasons["under-review"]);
    expect(reasons["awaiting-approval"]).toMatch(/awaiting production approval/i);
    expect(reasons["prices-only"]).toMatch(/prices only/);
  });

  it("carries no history when there is no snapshot", () => {
    const model = buildCapacityReadModel([capability({ termsPermitted: false })], [], NOW);
    expect(model.history.points).toEqual([]);
    expect(model.history.observedDays).toBe(0);
  });
});

describe("the read model with observations", () => {
  const fresh = { retrievedAt: "2026-09-17T11:00:00.000Z", observedAt: "2026-09-17T11:00:00.000Z" };

  it("publishes a total from eligible, fresh quantitative observations", () => {
    const model = buildCapacityReadModel(
      [capability()],
      [
        observation(exact(120), { ...fresh, capacitySourceEntityId: "a" }),
        observation(exact(96), { ...fresh, capacitySourceEntityId: "b" }),
      ],
      NOW,
    );
    expect(model.snapshot?.aggregate.total).toMatchObject({ lower: 216, upper: 216, exact: true });
    expect(model.unavailableReason).toBeNull();
    expect(model.coverage.contributingSources).toBe(1);
    expect(model.coverage.capacitySources).toBe(2);
  });

  it("ignores observations from an ineligible source however fresh they are", () => {
    const model = buildCapacityReadModel(
      [capability({ sourceInterfaceSlug: "barred", termsPermitted: false })],
      [observation(exact(999), { ...fresh, provenance: { rawOfferId: "r", retrievalId: "t", sourceInterfaceSlug: "barred", methodologyVersion: "0.1.0-draft", collectorIdentity: "x", sourceNativeValue: null, sourceNativeField: null, sourceUrl: null } })],
      NOW,
    );
    expect(model.snapshot).toBeNull();
    expect(model.unavailableReason).toBe("no_eligible_source");
  });

  it("reports availability-only coverage as its own state, not as a number", () => {
    const model = buildCapacityReadModel(
      [capability({ maxTier: 3, supportsExactQuantity: false, quantityUnit: null })],
      [
        observation(state(), { ...fresh, capacitySourceEntityId: "a" }),
        observation(state(), { ...fresh, capacitySourceEntityId: "b", canonicalRegionCode: "DE" }),
      ],
      NOW,
    );
    expect(model.snapshot?.aggregate.total).toBeNull();
    expect(model.unavailableReason).toBe("no_quantitative_coverage");
    expect(model.snapshot?.aggregate.categorical.sources).toBe(2);
  });

  it("excludes stale observations from the snapshot", () => {
    const model = buildCapacityReadModel(
      [capability()],
      [observation(exact(500), { retrievedAt: "2026-09-01T00:00:00.000Z", observedAt: "2026-09-01T00:00:00.000Z" })],
      NOW,
    );
    expect(model.snapshot).toBeNull();
    expect(model.unavailableReason).toBe("no_fresh_observations");
  });

  it("builds history only from days it observed", () => {
    const model = buildCapacityReadModel(
      [capability()],
      [
        observation(exact(100), { observedAt: "2026-09-15T00:00:00.000Z", retrievedAt: "2026-09-17T11:00:00.000Z" }),
        observation(exact(120), { observedAt: "2026-09-17T11:00:00.000Z", retrievedAt: "2026-09-17T11:00:00.000Z" }),
      ],
      NOW,
    );
    // Two observed days, not the three the calendar spans. 16 September is absent
    // rather than interpolated or zero-filled.
    expect(model.history.observedDays).toBe(2);
    expect(model.history.points.map((p) => p.date)).toEqual(["2026-09-15", "2026-09-17"]);
  });

  it("records a day of categorical-only observations with a null quantity, not a zero", () => {
    const model = buildCapacityReadModel(
      [capability()],
      [
        observation(state(), { observedAt: "2026-09-16T00:00:00.000Z", retrievedAt: "2026-09-17T11:00:00.000Z" }),
        observation(exact(50), { observedAt: "2026-09-17T11:00:00.000Z", retrievedAt: "2026-09-17T11:00:00.000Z" }),
      ],
      NOW,
    );
    const day = model.history.points.find((p) => p.date === "2026-09-16");
    expect(day?.lower).toBeNull();
    expect(day?.categoricalObservations).toBe(1);
  });
});

describe("filters", () => {
  const rows = [
    observation(exact(100), { capacitySourceEntityId: "a", canonicalRegionCode: "US" }),
    observation(exact(40), {
      capacitySourceEntityId: "b",
      canonicalRegionCode: "DE",
      hardware: { normalizedGpuType: "A100-SXM4", gpuVendor: null, gpuModel: null, formFactor: null, gpuMemoryGb: null, identityGrade: "A", gpusPerUnit: null },
    }),
  ];

  it("filters by GPU type", () => {
    expect(filterObservations(rows, { gpu: "A100-SXM4" })).toHaveLength(1);
  });

  it("filters by region", () => {
    expect(filterObservations(rows, { region: "US" })).toHaveLength(1);
  });

  it("filters by provider", () => {
    expect(filterObservations(rows, { provider: "b" })).toHaveLength(1);
  });

  it("yields an empty population, not a zero, when nothing matches", () => {
    expect(filterObservations(rows, { gpu: "B200" })).toHaveLength(0);
  });
});

describe("the response contract", () => {
  it("accepts an honest empty response", () => {
    expect(validatePublicCapacity(emptyCapacityReadModel("no_eligible_source", emptyCoverage()))).toEqual([]);
  });

  it("rejects a total that nothing contributed to", () => {
    const model = emptyCapacityReadModel("no_eligible_source", emptyCoverage()) as Record<string, unknown>;
    model.snapshot = {
      observedAt: "2026-09-17T00:00:00.000Z",
      aggregate: {
        total: { lower: 0, upper: 0, exact: true, unit: "accelerator", quantitativeObservations: 0, quantitativeSources: 0 },
        categorical: { observations: 0, sources: 0, byState: {} },
        unknownObservations: 0,
      },
      byGpuType: [],
      byRegion: [],
      byProvider: [],
    };
    expect(validatePublicCapacity(model)).toEqual(
      expect.arrayContaining([expect.stringMatching(/no quantitative observation/)]),
    );
  });

  it("refuses to serve a quantitative total under a draft methodology", () => {
    const model = emptyCapacityReadModel("no_eligible_source", emptyCoverage()) as Record<string, unknown>;
    model.snapshot = {
      observedAt: "2026-09-17T00:00:00.000Z",
      aggregate: {
        total: { lower: 100, upper: 100, exact: true, unit: "accelerator", quantitativeObservations: 1, quantitativeSources: 1 },
        categorical: { observations: 0, sources: 0, byState: {} },
        unknownObservations: 0,
      },
      byGpuType: [],
      byRegion: [],
      byProvider: [],
    };
    expect(validatePublicCapacity(model)).toEqual(
      expect.arrayContaining([expect.stringMatching(/draft methodology/)]),
    );
  });

  it("rejects a history point reporting zero capacity from zero sources", () => {
    const model = emptyCapacityReadModel("no_eligible_source", emptyCoverage()) as Record<string, unknown>;
    (model.history as Record<string, unknown>).points = [
      { date: "2026-09-17", lower: 0, upper: 0, exact: true, categoricalObservations: 0, capacitySources: 0 },
    ];
    expect(validatePublicCapacity(model)).toEqual(
      expect.arrayContaining([expect.stringMatching(/zero capacity from zero sources/)]),
    );
  });

  it("requires the mandatory disclaimers", () => {
    const model = emptyCapacityReadModel("no_eligible_source", emptyCoverage()) as Record<string, unknown>;
    model.disclaimers = [];
    expect(validatePublicCapacity(model)).toEqual(
      expect.arrayContaining([expect.stringMatching(/mandatory disclaimers/)]),
    );
  });
});
