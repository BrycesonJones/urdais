/**
 * The rule this whole dataset exists to protect: a price observation must
 * never become a capacity observation.
 *
 * This is the failure that would be invisible. Urdais's only production-approved
 * compute source publishes listed prices for sixteen providers; if any of that
 * leaked into the capacity pipeline, the surface would report sixteen providers
 * of observed supply and every number on it would be fabricated while looking
 * entirely plausible.
 *
 * The defence is structural rather than procedural, and these tests assert the
 * structure: the two pipelines share raw offers and share nothing else, and the
 * capacity module exports no function that accepts a price.
 */

import { describe, expect, it } from "vitest";

import { aggregate } from "@/lib/capacity/aggregation";
import * as normalize from "@/lib/capacity/normalize";
import { PRICE_OF_COMPUTE_SLUG } from "@/lib/ucpi/adapters/price-of-compute";
import { buildObservations } from "@/lib/capacity/collector";
import type { RawOffer, Retrieval } from "@/lib/ucpi/domain";

const retrieval: Retrieval = {
  id: "retrieval:price",
  sourceInterfaceSlug: PRICE_OF_COMPUTE_SLUG,
  requestedAt: "2026-09-17T00:00:00.000Z",
  completedAt: "2026-09-17T00:00:05.000Z",
  responseStatus: 200,
  request: { method: "GET", url: "https://example.invalid/prices", parameters: {}, requiredHeaders: [] },
  enumerationAssessment: "complete",
  retrievalPurpose: "production",
  permissionGrantId: null,
};

/** A raw offer carrying a price and nothing else. Exactly the shape of a listed-price row. */
function priceOnlyOffer(): RawOffer {
  return {
    id: "raw:price:1",
    retrievalId: retrieval.id,
    rowOrdinal: 0,
    sourceNativeOfferId: null,
    sourceNativeProductId: "h100-sxm",
    rawPayload: { provider: "someprovider", usd_per_gpu_hr: 3.62 },
    observedAt: "2026-09-17T00:00:00.000Z",
    sourceEffectiveAt: null,
    availabilityObservedAt: null,
    nativeProductLabel: "H100 SXM",
    nativeGpuModel: "H100",
    nativeFormFactor: "SXM",
    nativeGpuMemoryMb: 81_920,
    nativeSellerId: "someprovider",
    nativeOperatorId: null,
    nativePrice: 3.62,
    nativeCurrency: "USD",
    nativeBillingUnit: "usd_per_gpu_hour",
    nativePriceComponents: null,
    nativeProcurementMode: "on_demand",
    nativePreemptible: false,
    nativeTenancyFields: null,
    nativeGpuCount: 8,
    nativeMinimumGpuCount: null,
    nativeRegion: null,
    nativeGeolocation: null,
    // The decisive field: the source states no availability at all.
    nativeAvailabilityValue: null,
    nativeVcpu: null,
    nativeHostMemoryMb: null,
    nativeStorageGb: null,
    nativeServiceTier: null,
    nativeServiceFields: null,
  };
}

describe("a price cannot become a capacity", () => {
  it("exposes no constructor that turns a price into a quantity", () => {
    const exported = Object.keys(normalize);
    expect(exported).not.toContain("fromPrice");
    expect(exported).not.toContain("fromPriceObservation");
    expect(exported).not.toContain("fromListing");
    // Every quantity-bearing entry point demands a number the source stated.
    expect(exported).toEqual(
      expect.arrayContaining(["exactQuantity", "quantityRange", "availabilityOnly", "unknownCapacity"]),
    );
  });

  it("does not turn a priced row's GPU count into available capacity", () => {
    const offer = priceOnlyOffer();
    // nativeGpuCount is 8 — accelerators per instance, a configuration field.
    // Reading it as inventory is the specific mistake; the capacity model has
    // no path that consults it.
    expect(offer.nativeGpuCount).toBe(8);

    const observations = buildObservations([], retrieval, {
      methodologyVersion: "0.1.0-draft",
      collectorIdentity: "test@1",
      sellerEntityIdByProvider: new Map([["someprovider", "entity-1"]]),
      regionMappings: new Map(),
    });
    expect(observations).toHaveLength(0);
    expect(aggregate(observations).total).toBeNull();
  });

  it("yields no total from a population of priced rows carrying no availability", () => {
    // The production shape today: 153 price observations, availability unknown.
    const rows = Array.from({ length: 153 }, () => ({
      raw: priceOnlyOffer(),
      reading: {
        measurement: normalize.unknownCapacity(),
        evidenceGrade: 5 as const,
        sourceNativeValue: null,
        sourceNativeField: null,
        hardware: {
          normalizedGpuType: "H100-SXM",
          gpuVendor: "NVIDIA",
          gpuModel: "H100",
          formFactor: "SXM",
          gpuMemoryGb: 80,
          identityGrade: "A" as const,
          gpusPerUnit: null,
        },
        sourceNativeRegion: null,
      },
    }));

    const observations = buildObservations(rows, retrieval, {
      methodologyVersion: "0.1.0-draft",
      collectorIdentity: "test@1",
      sellerEntityIdByProvider: new Map([["someprovider", "entity-1"]]),
      regionMappings: new Map(),
    });

    const result = aggregate(observations);
    // 153 priced rows produce no capacity figure and no provider count.
    expect(result.total).toBeNull();
    expect(result.categorical.observations).toBe(0);
    expect(result.categorical.sources).toBe(0);
    expect(result.unknownObservations).toBe(153);
  });
});
