/**
 * Test fixtures for capacity observations.
 *
 * `observation` takes a measurement that has already been built by the
 * normalize module rather than loose numbers, so a test cannot construct a
 * shape the production path could not produce.
 */

import type { CapacityMeasurement, CapacityObservation } from "@/lib/capacity/domain";

let counter = 0;

export function observation(
  measurement: CapacityMeasurement,
  overrides: Partial<Omit<CapacityObservation, "measurement">> = {},
): CapacityObservation {
  counter += 1;
  return {
    id: `c:test:${counter}`,
    provenance: {
      rawOfferId: `raw:${counter}`,
      retrievalId: "retrieval:1",
      sourceInterfaceSlug: "test-interface",
      methodologyVersion: "0.1.0-draft",
      collectorIdentity: "test-collector@1",
      sourceNativeValue: null,
      sourceNativeField: null,
      sourceUrl: null,
      ...overrides.provenance,
    },
    sellerEntityId: "seller-a",
    operatorEntityId: null,
    marketplaceEntityId: null,
    capacitySourceEntityId: "seller-a",
    canonicalRegionCode: "US",
    sourceNativeRegion: "us-east-1",
    hardware: {
      normalizedGpuType: "H100-SXM",
      gpuVendor: "NVIDIA",
      gpuModel: "H100",
      formFactor: "SXM",
      gpuMemoryGb: 80,
      identityGrade: "A",
      gpusPerUnit: 8,
      ...overrides.hardware,
    },
    serviceTier: null,
    availabilityEvidenceGrade: 2,
    observedAt: "2026-09-17T00:00:00.000Z",
    sourceEffectiveAt: null,
    availabilityObservedAt: null,
    retrievedAt: "2026-09-17T00:00:00.000Z",
    supersededById: null,
    ...overrides,
    measurement,
  };
}
