/**
 * Synthetic fixtures shaped like the documented provider interfaces. Every
 * number here is invented for tests and is not a price Urdais has observed or
 * published. Nothing in this file is retrieved from a provider.
 */

import type { LambdaInstanceTypesResponse, LambdaRegion } from "@/lib/ucpi/adapters/lambda";
import type { RunpodCatalogResponse, RunpodGpuTypeDetails } from "@/lib/ucpi/adapters/runpod";
import { RUNPOD_H100_SXM_GPU_TYPE_ID } from "@/lib/ucpi/adapters/runpod";
import type { NormalizationContext, RegionMapping } from "@/lib/ucpi/collector";
import { regionMappingKey } from "@/lib/ucpi/collector";
import type { MarketEntity, NormalizedObservation, RequestSpec, Retrieval } from "@/lib/ucpi/domain";
import { REGISTRY_SNAPSHOT_2026_09_13, type SourceRegistryState } from "@/lib/ucpi/permission-gate";

export const VERSIONS = { methodologyVersion: "0.1.2-draft", instrumentSpecVersion: "0.1.4-draft", instrument: "UCPI-H100-SXM" } as const;

export const ENTITIES: readonly MarketEntity[] = [
  { id: "ent-runpod", slug: "runpod", name: "Runpod", legalName: "Runpod, Inc.", legalIdentifier: null, controllingEntityId: null },
  { id: "ent-lambda", slug: "lambda", name: "Lambda", legalName: "Lambda, Inc.", legalIdentifier: null, controllingEntityId: null },
  { id: "ent-c", slug: "cloud-c", name: "Cloud C", legalName: "Cloud C GmbH", legalIdentifier: null, controllingEntityId: null },
  { id: "ent-d", slug: "cloud-d", name: "Cloud D", legalName: "Cloud D Ltd", legalIdentifier: null, controllingEntityId: null },
  // A brand that is a distinct legal entity under Cloud C's control, on evidence.
  { id: "ent-c-brand", slug: "cloud-c-brand", name: "C Brand", legalName: "C Brand LLC", legalIdentifier: null, controllingEntityId: "ent-c" },
];

export const ENTITY_MAP: ReadonlyMap<string, MarketEntity> = new Map(ENTITIES.map((e) => [e.id, e]));

/** The registry as recorded; neither candidate is permitted. */
export const REGISTRY_TODAY: readonly SourceRegistryState[] = REGISTRY_SNAPSHOT_2026_09_13;

/** A hypothetical registry in which a source has been cleared on both axes and approved. Test-only. */
export function permitted(slug: string): SourceRegistryState {
  return { slug, termsReviewState: "permitted", dataUseTermsState: "permitted", productionAccessState: "production_approved", writtenAgreementRequired: true };
}

export const RUNPOD_CATALOG_FIXTURE: RunpodCatalogResponse = {
  gpus: [
    {
      id: RUNPOD_H100_SXM_GPU_TYPE_ID,
      name: "H100 SXM",
      manufacturer: "NVIDIA",
      memory: 80,
      secure: true,
      community: true,
      price: { secure: 3.49, community: 2.69 },
      maxCount: { secure: 8, community: 8 },
      availability: "HIGH",
      dataCenters: [
        { id: "US-KS-2", name: "US Kansas 2", availability: "HIGH" },
        { id: "US-GA-1", name: "US Georgia 1", availability: "LOW" },
      ],
    },
    {
      id: "NVIDIA H100 PCIe",
      name: "H100 PCIe",
      manufacturer: "NVIDIA",
      memory: 80,
      secure: true,
      community: true,
      price: { secure: 2.89, community: 1.99 },
      maxCount: { secure: 8, community: 8 },
      availability: "HIGH",
      dataCenters: [{ id: "US-KS-2", name: "US Kansas 2", availability: "HIGH" }],
    },
  ],
};

export const RUNPOD_DETAILS_FIXTURE: ReadonlyMap<string, RunpodGpuTypeDetails> = new Map([
  [RUNPOD_H100_SXM_GPU_TYPE_ID, { id: RUNPOD_H100_SXM_GPU_TYPE_ID, minPodGpuCount: 1, bundle: { SECURE: { minVcpu: 20, minMemoryGb: 125 }, COMMUNITY: { minVcpu: 20, minMemoryGb: 125 } } }],
  ["NVIDIA H100 PCIe", { id: "NVIDIA H100 PCIe", minPodGpuCount: 1, bundle: { SECURE: { minVcpu: 16, minMemoryGb: 188 }, COMMUNITY: { minVcpu: 16, minMemoryGb: 188 } } }],
]);

export const LAMBDA_REGIONS: readonly LambdaRegion[] = [
  { name: "asia-northeast-1", description: "Tokyo, Japan" },
  { name: "asia-northeast-2", description: "Osaka, Japan" },
  { name: "asia-south-1", description: "India" },
  { name: "europe-central-1", description: "Germany" },
  { name: "me-west-1", description: "Israel" },
  { name: "us-east-1", description: "Virginia, USA" },
  { name: "us-east-2", description: "Washington DC, USA" },
  { name: "us-midwest-1", description: "Illinois, USA" },
  { name: "us-south-1", description: "Texas, USA" },
  { name: "us-south-2", description: "North Texas, USA" },
  { name: "us-south-3", description: "Central Texas, USA" },
  { name: "us-west-1", description: "California, USA" },
  { name: "us-west-2", description: "Arizona, USA" },
  { name: "us-west-3", description: "Utah, USA" },
];

const LAMBDA_COUNTRY: Record<string, string> = {
  "asia-northeast-1": "JP",
  "asia-northeast-2": "JP",
  "asia-south-1": "IN",
  "europe-central-1": "DE",
  "me-west-1": "IL",
  "us-east-1": "US",
  "us-east-2": "US",
  "us-midwest-1": "US",
  "us-south-1": "US",
  "us-south-2": "US",
  "us-south-3": "US",
  "us-west-1": "US",
  "us-west-2": "US",
  "us-west-3": "US",
};

function lambdaType(name: string, description: string, gpus: number, centsPerGpuHour: number, vcpus: number, memoryGib: number, storageGib: number) {
  return { name, description, gpu_description: description.replace(/^\d+x\s*/, ""), price_cents_per_hour: centsPerGpuHour * gpus, specs: { vcpus, memory_gib: memoryGib, storage_gib: storageGib, gpus } };
}

export const LAMBDA_INSTANCE_TYPES_FIXTURE: LambdaInstanceTypesResponse = {
  data: {
    gpu_1x_h100_sxm5: { instance_type: lambdaType("gpu_1x_h100_sxm5", "1x H100 (80 GB SXM5)", 1, 429, 26, 225, 2816), regions_with_capacity_available: [{ name: "us-west-1", description: "California, USA" }, { name: "us-east-1", description: "Virginia, USA" }] },
    gpu_2x_h100_sxm5: { instance_type: lambdaType("gpu_2x_h100_sxm5", "2x H100 (80 GB SXM5)", 2, 419, 52, 450, 5632), regions_with_capacity_available: [{ name: "us-west-1", description: "California, USA" }] },
    gpu_4x_h100_sxm5: { instance_type: lambdaType("gpu_4x_h100_sxm5", "4x H100 (80 GB SXM5)", 4, 409, 104, 900, 11264), regions_with_capacity_available: [{ name: "us-west-1", description: "California, USA" }] },
    gpu_8x_h100_sxm5: { instance_type: lambdaType("gpu_8x_h100_sxm5", "8x H100 (80 GB SXM5)", 8, 399, 208, 1800, 22528), regions_with_capacity_available: [{ name: "us-west-1", description: "California, USA" }, { name: "us-east-1", description: "Virginia, USA" }] },
    gpu_1x_gh200: { instance_type: lambdaType("gpu_1x_gh200", "1x GH200 (96 GB)", 1, 149, 64, 432, 4096), regions_with_capacity_available: [{ name: "us-east-1", description: "Virginia, USA" }] },
  },
};

export function regionMappings(): Map<string, RegionMapping> {
  const m = new Map<string, RegionMapping>();
  for (const r of LAMBDA_REGIONS) {
    m.set(regionMappingKey("lambda-instance-types", r.name), { canonicalRegionCode: LAMBDA_COUNTRY[r.name]!, evidence: `Lambda regions table: ${r.name} = ${r.description}` });
  }
  m.set(regionMappingKey("runpod-gpu-types", "US-KS-2"), { canonicalRegionCode: "US", evidence: "returned under countryCodes=US; name 'US Kansas 2'" });
  m.set(regionMappingKey("runpod-gpu-types", "US-GA-1"), { canonicalRegionCode: "US", evidence: "returned under countryCodes=US; name 'US Georgia 1'" });
  return m;
}

export function normalizationContext(overrides: Partial<NormalizationContext> = {}): NormalizationContext {
  return {
    instrumentSpecVersion: VERSIONS.instrumentSpecVersion,
    methodologyVersion: VERSIONS.methodologyVersion,
    sellerEntityIdByProvider: new Map([
      ["runpod", "ent-runpod"],
      ["lambda", "ent-lambda"],
    ]),
    regionMappings: regionMappings(),
    tenancyEvidence: new Map(),
    entities: ENTITY_MAP,
    ...overrides,
  };
}

export const LAMBDA_TENANCY_DOCUMENTED_SYNTHETIC = {
  grade: "documented" as const,
  evidence: "SYNTHETIC TEST EVIDENCE, not a statement Lambda has made: on-demand H100 instances hold their GPU exclusively.",
};

export function makeRetrieval(input: { id: string; slug: string; completedAt: string | null; request: RequestSpec; requestedAt?: string }): Retrieval {
  return {
    id: input.id,
    sourceInterfaceSlug: input.slug,
    requestedAt: input.requestedAt ?? (input.completedAt ?? "2026-09-13T10:00:00Z"),
    completedAt: input.completedAt,
    responseStatus: input.completedAt === null ? null : 200,
    request: input.request,
    enumerationAssessment: "complete",
    retrievalPurpose: "research",
    permissionGrantId: null,
  };
}

/** A fully eligible synthetic observation, for eligibility and aggregation tests to mutate. */
export function eligibleObservation(overrides: Partial<NormalizedObservation> = {}): NormalizedObservation {
  return {
    id: "obs-1",
    rawOfferId: "raw-1",
    retrievalId: "ret-1",
    sourceInterfaceSlug: "synthetic-interface",
    instrumentSpecVersion: VERSIONS.instrumentSpecVersion,
    methodologyVersion: VERSIONS.methodologyVersion,
    sellerEntityId: "ent-c",
    operatorEntityId: null,
    operatorAttributionBasis: "undetermined",
    marketplaceEntityId: null,
    canonicalRegionCode: "US",
    regionMappingEvidence: "synthetic",
    observedAt: "2026-09-13T10:00:00Z",
    sourceEffectiveAt: null,
    availabilityObservedAt: "2026-09-13T10:00:00Z",
    normalizedPrice: 3.0,
    normalizedCurrency: "USD",
    normalizedUnit: "accelerator_hour",
    priceConversion: null,
    taxBasis: "exclusive",
    mandatoryFeeInterpretation: null,
    promotional: false,
    hardwareIdentityGrade: "A",
    gpuVendor: "NVIDIA",
    gpuModel: "H100",
    formFactor: "SXM",
    gpuMemoryGb: 80,
    fullDevice: true,
    gpuCount: 1,
    minimumGpuCount: 1,
    minimumTopologySourceField: "synthetic",
    wholeNodeRequired: false,
    topologyClass: "per_accelerator_allocation",
    procurementMode: "on_demand",
    preemptible: false,
    serviceProduct: "full_device_rental",
    tenancyGrade: "documented",
    tenancyEvidence: "synthetic",
    availabilityState: "available",
    availabilityEvidenceGrade: 3,
    availabilityQuantity: 1,
    vcpuPerAccelerator: 16,
    hostMemoryGbPerAccelerator: 128,
    storageGbPerAccelerator: 500,
    serviceTier: { tier_label: "standard", operator_class: "undetermined", interruption_policy: "none" },
    observationType: "current_accessible_offer",
    sourceQualityGrade: 2,
    enumerationAssessment: "complete",
    sourceAttribution: null,
    sellerPricesByQuantityTier: null,
    ...overrides,
  };
}
