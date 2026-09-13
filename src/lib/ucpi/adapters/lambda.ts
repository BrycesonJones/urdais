/**
 * Lambda adapter skeleton, from the documented instance-types interface
 * (docs/architecture/sources/lambda-launch-readiness.md). Parses and
 * normalizes; never retrieves. Tenancy is Ambiguous unless the normalization
 * context carries a statement from Lambda, so a valid-looking observation is
 * excluded with TENANCY_UNRESOLVED until that evidence arrives.
 *
 * GET /api/v1/instance-types returns every instance type with its
 * regions_with_capacity_available. A region absent from that list while the
 * type exists in the catalog is Sold out for that region at Grade 3, so the
 * adapter emits one raw offer per (instance type, known region), using the
 * region table Lambda publishes.
 */

import type { ProviderAdapter } from "@/lib/ucpi/collector";
import { regionMappingKey } from "@/lib/ucpi/collector";
import type { NormalizedObservation, RawOffer, RequestSpec } from "@/lib/ucpi/domain";

export type LambdaRegion = { name: string; description: string };

export type LambdaInstanceType = {
  name: string;
  description: string;
  gpu_description: string;
  price_cents_per_hour: number;
  specs: { vcpus: number; memory_gib: number; storage_gib: number; gpus: number };
};

export type LambdaInstanceTypesResponse = {
  data: Record<string, { instance_type: LambdaInstanceType; regions_with_capacity_available: LambdaRegion[] }>;
};

/** The regions Lambda publishes, used to express absence. Codes only; countries come from the region mapping. */
export type LambdaKnownRegions = readonly LambdaRegion[];

export type LambdaRequestParams = { baseUrl: string };

const GIB_TO_GB = 1.073741824;
const TAX_EVIDENCE = 'lambda.ai/pricing: prices "plus applicable sales tax/VAT/GST"; billing docs: charges include sales tax based on billing location.';

export const lambdaAdapter: ProviderAdapter<LambdaRequestParams, LambdaInstanceTypesResponse, LambdaKnownRegions> = {
  providerSlug: "lambda",
  sourceInterfaceSlug: "lambda-instance-types",

  buildRequest(params): RequestSpec {
    return {
      method: "GET",
      url: `${params.baseUrl.replace(/\/$/, "")}/api/v1/instance-types`,
      parameters: {},
      requiredHeaders: ["Authorization"],
    };
  },

  parse(retrieval, response, knownRegions): RawOffer[] {
    const observedAt = retrieval.completedAt ?? retrieval.requestedAt;
    const out: RawOffer[] = [];
    let ordinal = 0;
    // The smallest accelerator count among the H100 SXM5 instance types is the source field for minimum topology.
    const sxm5Counts = Object.values(response.data)
      .filter((e) => /h100_sxm5/.test(e.instance_type.name))
      .map((e) => e.instance_type.specs.gpus);
    const minimumSxm5 = sxm5Counts.length ? Math.min(...sxm5Counts) : null;

    for (const entry of Object.values(response.data)) {
      const t = entry.instance_type;
      const available = new Set(entry.regions_with_capacity_available.map((r) => r.name));
      const isSxm5 = /h100_sxm5/.test(t.name);
      for (const region of knownRegions) {
        out.push({
          id: `${retrieval.id}:${ordinal}`,
          retrievalId: retrieval.id,
          rowOrdinal: ordinal++,
          sourceNativeOfferId: `${t.name}|${region.name}`,
          sourceNativeProductId: t.name,
          rawPayload: { instance_type: t, region, capacity_available: available.has(region.name) },
          observedAt,
          sourceEffectiveAt: null,
          availabilityObservedAt: observedAt,
          nativeProductLabel: t.description,
          nativeGpuModel: t.gpu_description,
          nativeFormFactor: null,
          nativeGpuMemoryMb: parseMemoryGb(t.description) === null ? null : parseMemoryGb(t.description)! * 1024,
          nativeSellerId: "lambda",
          nativeOperatorId: null,
          nativePrice: t.price_cents_per_hour / 100,
          nativeCurrency: "USD",
          nativeBillingUnit: "usd_cents_per_instance_hour",
          nativePriceComponents: { instance_rate_cents_per_hour: t.price_cents_per_hour, root_volume_gib_included: t.specs.storage_gib },
          nativeProcurementMode: "on_demand",
          nativePreemptible: false,
          nativeTenancyFields: null,
          nativeGpuCount: t.specs.gpus,
          nativeMinimumGpuCount: isSxm5 ? minimumSxm5 : null,
          nativeRegion: region.name,
          nativeGeolocation: region.description,
          nativeAvailabilityValue: available.has(region.name) ? "listed_in_regions_with_capacity_available" : "absent_from_regions_with_capacity_available",
          nativeVcpu: t.specs.vcpus,
          nativeHostMemoryMb: Math.round(t.specs.memory_gib * GIB_TO_GB * 1024),
          nativeStorageGb: t.specs.storage_gib * GIB_TO_GB,
          nativeServiceTier: null,
          nativeServiceFields: { billing: "one-minute increments while running", filesystems: "optional, billed separately" },
        });
      }
    }
    return out;
  },

  normalize(raw, retrieval, ctx): NormalizedObservation {
    const identity = identifyLambdaInstance(raw.nativeProductLabel ?? "", raw.nativeGpuModel ?? "");
    const gpus = raw.nativeGpuCount ?? 0;
    const mapping = raw.nativeRegion === null ? undefined : ctx.regionMappings.get(regionMappingKey("lambda-instance-types", raw.nativeRegion));
    const tenancy = ctx.tenancyEvidence.get("lambda");
    const sellerEntityId = ctx.sellerEntityIdByProvider.get("lambda");
    if (sellerEntityId === undefined) throw new Error("no seller entity registered for lambda");
    const available = raw.nativeAvailabilityValue === "listed_in_regions_with_capacity_available";
    const pricePerAccelerator = raw.nativePrice === null || gpus === 0 ? null : raw.nativePrice / gpus;
    return {
      id: `n:${raw.id}`,
      rawOfferId: raw.id,
      retrievalId: raw.retrievalId,
      sourceInterfaceSlug: "lambda-instance-types",
      instrumentSpecVersion: ctx.instrumentSpecVersion,
      methodologyVersion: ctx.methodologyVersion,
      sellerEntityId,
      operatorEntityId: null,
      operatorAttributionBasis: "undetermined: operator not disclosed",
      marketplaceEntityId: null,
      canonicalRegionCode: mapping?.canonicalRegionCode ?? null,
      regionMappingEvidence: mapping?.evidence ?? null,
      observedAt: raw.observedAt,
      sourceEffectiveAt: null,
      availabilityObservedAt: raw.availabilityObservedAt,
      normalizedPrice: pricePerAccelerator,
      normalizedCurrency: "USD",
      normalizedUnit: "accelerator_hour",
      priceConversion: { rule: "instance price divided by specs.gpus, a unit conversion within the per-accelerator class", divisor: gpus },
      taxBasis: "exclusive",
      mandatoryFeeInterpretation: {
        instance_rate_is_price: true,
        root_volume: "included in the instance rate",
        filesystems: "optional, outside the price",
        egress: "no fees",
        tax_evidence: TAX_EVIDENCE,
      },
      promotional: false,
      hardwareIdentityGrade: identity.grade,
      gpuVendor: identity.vendor,
      gpuModel: identity.model,
      formFactor: identity.formFactor,
      gpuMemoryGb: identity.memoryGb,
      fullDevice: true,
      gpuCount: gpus || null,
      minimumGpuCount: raw.nativeMinimumGpuCount,
      minimumTopologySourceField: raw.nativeMinimumGpuCount === null ? null : "specs.gpus, smallest H100 SXM5 instance type",
      wholeNodeRequired: raw.nativeMinimumGpuCount === null ? null : raw.nativeMinimumGpuCount >= 8,
      topologyClass: raw.nativeMinimumGpuCount === null ? "unknown" : raw.nativeMinimumGpuCount >= 8 ? "whole_node" : "per_accelerator_allocation",
      procurementMode: "on_demand",
      preemptible: false,
      serviceProduct: "full_device_rental",
      // Ambiguous until Lambda states it: silence is not converted into certainty.
      tenancyGrade: tenancy?.grade ?? "ambiguous",
      tenancyEvidence: tenancy?.evidence ?? 'No statement for H100 on-demand instances; only "Lambda GH200s are single-tenant instances" is documented.',
      availabilityState: available ? "available" : "sold_out",
      availabilityEvidenceGrade: 3,
      availabilityQuantity: gpus || null,
      vcpuPerAccelerator: raw.nativeVcpu === null || gpus === 0 ? null : raw.nativeVcpu / gpus,
      hostMemoryGbPerAccelerator: raw.nativeHostMemoryMb === null || gpus === 0 ? null : raw.nativeHostMemoryMb / 1024 / gpus,
      storageGbPerAccelerator: raw.nativeStorageGb === null || gpus === 0 ? null : raw.nativeStorageGb / gpus,
      serviceTier: {
        tier_label: "on_demand",
        operator_class: "undetermined",
        interruption_policy: "none",
        storage_included_gb: raw.nativeStorageGb,
      },
      observationType: available ? "current_accessible_offer" : "advertised_non_accessible_price",
      sourceQualityGrade: 2,
      enumerationAssessment: retrieval.enumerationAssessment,
    };
  },
};

function parseMemoryGb(description: string): number | null {
  const m = /\((\d+)\s*GB\b/i.exec(description);
  return m ? Number(m[1]) : null;
}

/** Identity from the instance description, e.g. "1x H100 (80 GB SXM5)". SXM5 stated is Grade A. */
export function identifyLambdaInstance(description: string, gpuDescription: string): {
  grade: "A" | "insufficient";
  vendor: string | null;
  model: string | null;
  formFactor: "SXM" | "PCIe" | null;
  memoryGb: number | null;
} {
  const text = `${description} ${gpuDescription}`;
  const isH100 = /\bH100\b/.test(text);
  const formFactor: "SXM" | "PCIe" | null = /SXM/i.test(text) ? "SXM" : /PCIe/i.test(text) ? "PCIe" : null;
  const memoryGb = parseMemoryGb(description);
  const model = isH100 ? "H100" : (/\b(GH200|H200|B200|A100|A10|A6000)\b/.exec(text)?.[1] ?? null);
  const grade = isH100 && formFactor !== null && memoryGb !== null ? "A" : "insufficient";
  return { grade, vendor: model ? "NVIDIA" : null, model, formFactor, memoryGb };
}
