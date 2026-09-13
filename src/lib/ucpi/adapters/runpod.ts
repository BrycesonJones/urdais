/**
 * Runpod adapter skeleton, from the documented catalog interface
 * (docs/architecture/sources/runpod-launch-readiness.md). Parses and
 * normalizes; never retrieves. Prices, datacenters and availability come only
 * from fixtures or, later, from a permitted production retrieval.
 *
 * Two documented interfaces are needed for a P2 observation: the REST catalog
 * (GET /v2/catalog/gpus with include=AVAILABILITY, product=POD, count, cloud,
 * countryCodes) supplies identity, per-GPU price, and per-datacenter
 * availability; the GraphQL gpuTypes query supplies minPodGpuCount and the
 * per-cloud host bundle (minVcpu, minMemory) that the catalog omits. The second
 * arrives as a companion record. The REST host is configured, not assumed.
 */

import type { ProviderAdapter } from "@/lib/ucpi/collector";
import { regionMappingKey } from "@/lib/ucpi/collector";
import type { AvailabilityState, NormalizedObservation, RawOffer, RequestSpec } from "@/lib/ucpi/domain";

export type RunpodCloud = "SECURE" | "COMMUNITY";

export type RunpodDataCenterAvailability = { id: string; name: string; availability: "NONE" | "LOW" | "MEDIUM" | "HIGH" };

export type RunpodGpuType = {
  id: string;
  name: string;
  manufacturer: "NVIDIA" | "AMD" | "UNKNOWN";
  memory: number;
  secure: boolean;
  community: boolean;
  price: { secure?: number; community?: number; serverless?: number };
  maxCount: { secure: number; community: number };
  availability?: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  dataCenters?: RunpodDataCenterAvailability[];
};

export type RunpodCatalogResponse = { gpus: RunpodGpuType[] };

/** Companion facts from the GraphQL gpuTypes query, per GPU type id. */
export type RunpodGpuTypeDetails = {
  id: string;
  minPodGpuCount: number | null;
  bundle: Partial<Record<RunpodCloud, { minVcpu: number | null; minMemoryGb: number | null }>>;
};

export type RunpodRequestParams = {
  baseUrl: string;
  countryCode: string;
  cloud: RunpodCloud;
  count?: number;
};

export const RUNPOD_H100_SXM_GPU_TYPE_ID = "NVIDIA H100 80GB HBM3";

const TENANCY_EVIDENCE =
  'Runpod documentation, "Zero GPU Pods on restart": "When you deploy a Pod, it\'s assigned to a GPU on a specific physical machine. ... As long as your Pod is running, that GPU is exclusively reserved for you."';
const TAX_EVIDENCE = 'Runpod Terms of Service: "Fees do not include any Sales Tax that may be due in connection with the Service provided under this Agreement."';

export const runpodAdapter: ProviderAdapter<RunpodRequestParams, RunpodCatalogResponse, ReadonlyMap<string, RunpodGpuTypeDetails>> = {
  providerSlug: "runpod",
  sourceInterfaceSlug: "runpod-gpu-types",

  buildRequest(params): RequestSpec {
    return {
      method: "GET",
      url: `${params.baseUrl.replace(/\/$/, "")}/v2/catalog/gpus`,
      parameters: {
        include: "AVAILABILITY",
        product: "POD",
        count: String(params.count ?? 1),
        cloud: params.cloud,
        countryCodes: params.countryCode,
      },
      requiredHeaders: ["Authorization"],
    };
  },

  parse(retrieval, response, details): RawOffer[] {
    const cloud = retrieval.request.parameters.cloud as RunpodCloud;
    const count = Number(retrieval.request.parameters.count ?? "1");
    const observedAt = retrieval.completedAt ?? retrieval.requestedAt;
    const out: RawOffer[] = [];
    let ordinal = 0;
    for (const gpu of response.gpus) {
      const d = details.get(gpu.id);
      const price = cloud === "SECURE" ? gpu.price.secure : gpu.price.community;
      const bundle = d?.bundle[cloud];
      for (const dc of gpu.dataCenters ?? []) {
        out.push({
          id: `${retrieval.id}:${ordinal}`,
          retrievalId: retrieval.id,
          rowOrdinal: ordinal++,
          sourceNativeOfferId: `${gpu.id}|${dc.id}|${cloud}`,
          sourceNativeProductId: gpu.id,
          rawPayload: { gpu, dataCenter: dc, cloud, details: d ?? null },
          observedAt,
          sourceEffectiveAt: null,
          availabilityObservedAt: observedAt,
          nativeProductLabel: gpu.name,
          nativeGpuModel: gpu.id,
          nativeFormFactor: null,
          nativeGpuMemoryMb: gpu.memory * 1024,
          nativeSellerId: "runpod",
          nativeOperatorId: null,
          nativePrice: price ?? null,
          nativeCurrency: "USD",
          nativeBillingUnit: "usd_per_gpu_hour",
          nativePriceComponents: { gpuRate: price ?? null, storage: "billed separately per GB, buyer-sized" },
          nativeProcurementMode: "on_demand_uninterruptable",
          nativePreemptible: false,
          nativeTenancyFields: { documentation: TENANCY_EVIDENCE },
          nativeGpuCount: count,
          nativeMinimumGpuCount: d?.minPodGpuCount ?? null,
          nativeRegion: dc.id,
          nativeGeolocation: dc.name,
          nativeAvailabilityValue: dc.availability,
          nativeVcpu: bundle?.minVcpu ?? null,
          nativeHostMemoryMb: bundle?.minMemoryGb == null ? null : bundle.minMemoryGb * 1024,
          nativeStorageGb: null,
          nativeServiceTier: cloud,
          nativeServiceFields: cloud === "SECURE" ? { dataCenterTier: "T3/T4", redundancy: "High redundancy" } : { providers: "Peer-to-peer providers", reliability: "Variable" },
        });
      }
    }
    return out;
  },

  normalize(raw, retrieval, ctx): NormalizedObservation {
    const identity = identifyRunpodGpu(raw.nativeGpuModel ?? "", raw.nativeProductLabel ?? "", raw.nativeGpuMemoryMb);
    const cloud = raw.nativeServiceTier as RunpodCloud;
    const countryCode = retrieval.request.parameters.countryCodes ?? "";
    const mapping = raw.nativeRegion === null ? undefined : ctx.regionMappings.get(regionMappingKey("runpod-gpu-types", raw.nativeRegion));
    // The country filter on the request is first-party evidence of the datacenter's country, and it is
    // the only mapping route used: never the identifier's prefix.
    const canonicalRegionCode = mapping?.canonicalRegionCode ?? (countryCode && !countryCode.includes(",") ? countryCode : null);
    const tenancy = ctx.tenancyEvidence.get("runpod");
    const sellerEntityId = ctx.sellerEntityIdByProvider.get("runpod");
    if (sellerEntityId === undefined) throw new Error("no seller entity registered for runpod");
    return {
      id: `n:${raw.id}`,
      rawOfferId: raw.id,
      retrievalId: raw.retrievalId,
      sourceInterfaceSlug: "runpod-gpu-types",
      instrumentSpecVersion: ctx.instrumentSpecVersion,
      methodologyVersion: ctx.methodologyVersion,
      sellerEntityId,
      operatorEntityId: null,
      operatorAttributionBasis: cloud === "COMMUNITY" ? "undetermined: peer-to-peer host not disclosed" : "undetermined: operator not disclosed",
      marketplaceEntityId: null,
      canonicalRegionCode,
      regionMappingEvidence: mapping?.evidence ?? (canonicalRegionCode ? `countryCodes=${countryCode} filter on the request` : null),
      observedAt: raw.observedAt,
      sourceEffectiveAt: null,
      availabilityObservedAt: raw.availabilityObservedAt,
      normalizedPrice: raw.nativePrice,
      normalizedCurrency: "USD",
      normalizedUnit: "accelerator_hour",
      priceConversion: null,
      taxBasis: "exclusive",
      mandatoryFeeInterpretation: {
        gpu_rate_is_price: true,
        storage: "buyer-sized, billed separately per second; usage-dependent, outside the price",
        egress: "no fees",
        credit_prerequisite: "at least one hour of credits to deploy; a commercial constraint, not a charge",
        tax_evidence: TAX_EVIDENCE,
      },
      promotional: false,
      hardwareIdentityGrade: identity.grade,
      gpuVendor: identity.vendor,
      gpuModel: identity.model,
      formFactor: identity.formFactor,
      gpuMemoryGb: raw.nativeGpuMemoryMb === null ? null : raw.nativeGpuMemoryMb / 1024,
      fullDevice: identity.fullDevice,
      gpuCount: raw.nativeGpuCount,
      minimumGpuCount: raw.nativeMinimumGpuCount,
      minimumTopologySourceField: raw.nativeMinimumGpuCount === null ? null : "gpuTypes.minPodGpuCount",
      wholeNodeRequired: raw.nativeMinimumGpuCount === null ? null : raw.nativeMinimumGpuCount >= 8,
      topologyClass: raw.nativeMinimumGpuCount === null ? "unknown" : raw.nativeMinimumGpuCount >= 8 ? "whole_node" : "per_accelerator_allocation",
      procurementMode: "on_demand",
      preemptible: false,
      serviceProduct: "full_device_rental",
      tenancyGrade: tenancy?.grade ?? "documented",
      tenancyEvidence: tenancy?.evidence ?? TENANCY_EVIDENCE,
      availabilityState: mapRunpodAvailability(raw.nativeAvailabilityValue),
      availabilityEvidenceGrade: 3,
      availabilityQuantity: raw.nativeGpuCount,
      vcpuPerAccelerator: raw.nativeVcpu,
      hostMemoryGbPerAccelerator: raw.nativeHostMemoryMb === null ? null : raw.nativeHostMemoryMb / 1024,
      storageGbPerAccelerator: null,
      serviceTier: {
        tier_label: cloud,
        operator_class: cloud === "SECURE" ? "first_party_datacenter" : "community_host",
        interruption_policy: "none",
        uptime_commitment: cloud === "SECURE" ? "T3/T4 data centers, high redundancy" : "variable",
        storage_included_gb: 0,
      },
      observationType: mapRunpodAvailability(raw.nativeAvailabilityValue) === "sold_out" ? "advertised_non_accessible_price" : "current_accessible_offer",
      sourceQualityGrade: 2,
      enumerationAssessment: retrieval.enumerationAssessment,
    };
  },
};

export function mapRunpodAvailability(value: string | null): AvailabilityState {
  switch (value) {
    case "HIGH":
    case "MEDIUM":
      return "available";
    case "LOW":
      return "limited";
    case "NONE":
      return "sold_out";
    default:
      return "unknown";
  }
}

/** Identity from the catalog id and display name. SXM stated in the display name is Grade A. */
export function identifyRunpodGpu(id: string, name: string, memoryMb: number | null): {
  grade: "A" | "insufficient";
  vendor: string | null;
  model: string | null;
  formFactor: "SXM" | "PCIe" | "NVL" | null;
  fullDevice: boolean;
} {
  const vendor = id.startsWith("NVIDIA") ? "NVIDIA" : null;
  const isH100 = /\bH100\b/.test(id);
  const formFactor: "SXM" | "PCIe" | "NVL" | null = /\bSXM\b/i.test(name) ? "SXM" : /PCIe/i.test(id) ? "PCIe" : /\bNVL\b/.test(id) ? "NVL" : null;
  const memoryGb = memoryMb === null ? null : memoryMb / 1024;
  const grade = vendor && isH100 && formFactor !== null && memoryGb !== null ? "A" : "insufficient";
  return { grade, vendor, model: isH100 ? "H100" : id.replace(/^NVIDIA\s+/, "") || null, formFactor, fullDevice: true };
}
