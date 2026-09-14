/**
 * Price of Compute adapter: a licensed upstream market-data source that
 * redistributes provider-level listed prices with attribution.
 *
 * The aggregator is the technical source, never the participant. Each provider
 * row becomes one raw offer whose seller is the underlying cloud, mapped to a
 * Urdais market entity by the source-native provider slug. The economic object
 * is a listed on-demand price ("listed prices, not guaranteed availability"),
 * so normalized observations carry observation type indicative_or_list_price
 * at availability Grade 5, which only the LISTED sibling admits.
 *
 * GET /api/v1/prices/{sku}: latest daily medians per pricing type plus current
 * per-provider rows. No key below 1,000 requests/day; attribution
 * "Data: Price of Compute — priceofcompute.com" is required and is carried in
 * the response itself. Responses are cached upstream for an hour; the adapter
 * asks for one request per calculation day.
 */

import type { ProviderAdapter } from "@/lib/ucpi/collector";
import type { AvailabilityState, NormalizedObservation, ProcurementMode, RawOffer, RequestSpec } from "@/lib/ucpi/domain";

export type PocPricingType = "on_demand" | "spot" | "community" | "serverless" | "reserved";

export type PocProviderRow = {
  provider: string;
  pricing_type: string;
  usd_per_gpu_hr: number;
  region: string | null;
  observed_at: string;
};

export type PocPricesResponse = {
  sku: string;
  day: string;
  prices: Record<string, { usd_per_gpu_hr: number; providers: number }>;
  providers: PocProviderRow[];
  updated_at: string;
  attribution: string;
};

export type PocRequestParams = { baseUrl: string; sku: string };

export const PRICE_OF_COMPUTE_SLUG = "price-of-compute-prices";
export const PRICE_OF_COMPUTE_ATTRIBUTION = "Data: Price of Compute — priceofcompute.com";
export const PRICE_OF_COMPUTE_ATTRIBUTION_URL = "https://priceofcompute.com";
/** The upstream asks for responses to be cached an hour or more; Urdais asks once per calculation day. */
export const PRICE_OF_COMPUTE_MIN_INTERVAL_MS = 60 * 60 * 1000;
export const PRICE_OF_COMPUTE_DAILY_LIMIT = 1000;

/**
 * Facts about each underlying seller that Urdais established from its own
 * research, not from the aggregator: whether the seller offers the product in
 * the per-accelerator allocation class, what kind of party it is, and the
 * evidence. A seller absent here has MINIMUM_TOPOLOGY_UNKNOWN.
 */
/** Urdais's evidence about how one seller sells one upstream SKU: its minimum quantity and where that was read. */
export type PocSellerTopology = {
  /** Smallest quantity the seller sells the product in; null where Urdais has not established it. */
  minimumGpuCount: number | null;
  evidence: string | null;
  /** True when the seller's price differs by instance quantity, so a provider-level figure may not be the canonical-quantity price. */
  quantityTiered?: boolean;
};

export type PocSellerProfile = {
  /** Urdais market entity id. */
  entityId: string;
  kind: "vertically_integrated_cloud" | "marketplace_aggregate" | "reseller" | "hyperscaler";
  /** Topology evidence per upstream SKU (e.g. "H100-SXM"). A SKU absent here has MINIMUM_TOPOLOGY_UNKNOWN for this seller. */
  topology: ReadonlyMap<string, PocSellerTopology>;
  tenancyGrade: NormalizedObservation["tenancyGrade"];
  tenancyEvidence: string | null;
  legalNameEvidenced: boolean;
};

export type PocSellerProfiles = ReadonlyMap<string, PocSellerProfile>;

export const priceOfComputeAdapter: ProviderAdapter<PocRequestParams, PocPricesResponse, PocSellerProfiles> = {
  providerSlug: "price-of-compute",
  sourceInterfaceSlug: PRICE_OF_COMPUTE_SLUG,

  buildRequest(params): RequestSpec {
    return {
      method: "GET",
      url: `${params.baseUrl.replace(/\/$/, "")}/api/v1/prices/${encodeURIComponent(params.sku)}`,
      parameters: {},
      // No key below the free limit; nothing to supply.
      requiredHeaders: [],
    };
  },

  parse(retrieval, response, profiles): RawOffer[] {
    const observedAt = retrieval.completedAt ?? retrieval.requestedAt;
    return response.providers.map((row, ordinal) => {
      const profile = profiles.get(row.provider);
      return {
        id: `${retrieval.id}:${ordinal}`,
        retrievalId: retrieval.id,
        rowOrdinal: ordinal,
        sourceNativeOfferId: `${response.sku}|${row.provider}|${row.pricing_type}|${row.region ?? ""}`,
        sourceNativeProductId: response.sku,
        rawPayload: { row, sku: response.sku, day: response.day, updated_at: response.updated_at, attribution: response.attribution },
        observedAt,
        // The vendor's own observation time is the source-effective time; Urdais's retrieval time controls eligibility.
        sourceEffectiveAt: row.observed_at,
        availabilityObservedAt: null,
        nativeProductLabel: response.sku,
        nativeGpuModel: response.sku,
        nativeFormFactor: response.sku.endsWith("-SXM") ? "SXM" : response.sku.endsWith("-PCIE") ? "PCIe" : response.sku.endsWith("-NVL") ? "NVL" : null,
        nativeGpuMemoryMb: null,
        nativeSellerId: row.provider,
        nativeOperatorId: null,
        nativePrice: row.usd_per_gpu_hr,
        nativeCurrency: "USD",
        nativeBillingUnit: "usd_per_gpu_hr",
        nativePriceComponents: { note: "vendor-normalized per GPU-hour; multi-GPU instance prices divided by GPU count upstream" },
        nativeProcurementMode: row.pricing_type,
        nativePreemptible: row.pricing_type === "spot" ? true : row.pricing_type === "on_demand" ? false : null,
        nativeTenancyFields: null,
        nativeGpuCount: null,
        nativeMinimumGpuCount: profile?.topology.get(response.sku)?.minimumGpuCount ?? null,
        nativeRegion: row.region,
        nativeGeolocation: null,
        nativeAvailabilityValue: null,
        nativeVcpu: null,
        nativeHostMemoryMb: null,
        nativeStorageGb: null,
        nativeServiceTier: row.pricing_type,
        nativeServiceFields: { pricing_type: row.pricing_type, vendor_note: "listed prices, not guaranteed availability" },
      };
    });
  },

  normalize(raw, retrieval, ctx): NormalizedObservation {
    const profiles = ctx.sellerProfiles ?? new Map<string, PocSellerProfile>();
    const profile = raw.nativeSellerId === null ? undefined : profiles.get(raw.nativeSellerId);
    const sku = raw.nativeGpuModel ?? "";
    const identity = identifyPocSku(sku);
    const topo = profile?.topology.get(sku);
    const minimumGpuCount = topo?.minimumGpuCount ?? null;
    const procurement = mapPocPricingType(raw.nativeProcurementMode);
    const isAggregate = profile?.kind === "marketplace_aggregate";
    const regionMapping = raw.nativeRegion === null ? undefined : ctx.regionMappings.get(`${PRICE_OF_COMPUTE_SLUG}|${raw.nativeRegion}`);
    return {
      id: `n:${raw.id}`,
      rawOfferId: raw.id,
      retrievalId: raw.retrievalId,
      sourceInterfaceSlug: PRICE_OF_COMPUTE_SLUG,
      instrumentSpecVersion: ctx.instrumentSpecVersion,
      methodologyVersion: ctx.methodologyVersion,
      // An unmapped provider still needs a seller identity so the exclusion is attributable; the pseudo id is never a participant.
      sellerEntityId: profile?.entityId ?? `unmapped:${raw.nativeSellerId ?? "unknown"}`,
      operatorEntityId: null,
      operatorAttributionBasis: profile?.kind === "reseller" ? "undetermined: reseller of rented capacity" : "undetermined: operator not disclosed",
      // A marketplace provider row is a platform median across hosts, not a seller; the sibling excludes it as a service-product mismatch.
      marketplaceEntityId: isAggregate ? (profile?.entityId ?? null) : null,
      canonicalRegionCode: regionMapping?.canonicalRegionCode ?? null,
      regionMappingEvidence: regionMapping?.evidence ?? (raw.nativeRegion === null ? "vendor region field null; provider publishes one list price without regional differentiation" : null),
      observedAt: raw.observedAt,
      sourceEffectiveAt: raw.sourceEffectiveAt,
      availabilityObservedAt: null,
      normalizedPrice: raw.nativePrice,
      normalizedCurrency: "USD",
      normalizedUnit: "accelerator_hour",
      priceConversion: null,
      taxBasis: "unresolved",
      mandatoryFeeInterpretation: { vendor_normalization: "per GPU-hour; components not itemized by the vendor", attribution: PRICE_OF_COMPUTE_ATTRIBUTION },
      promotional: false,
      hardwareIdentityGrade: identity.grade,
      gpuVendor: identity.vendor,
      gpuModel: identity.model,
      formFactor: identity.formFactor,
      gpuMemoryGb: identity.memoryGb,
      fullDevice: identity.fullDevice,
      gpuCount: minimumGpuCount,
      minimumGpuCount,
      minimumTopologySourceField: minimumGpuCount === null ? null : `Urdais seller evidence: ${topo?.evidence ?? "unstated"}`,
      wholeNodeRequired: minimumGpuCount === null ? null : minimumGpuCount >= 8,
      topologyClass: minimumGpuCount === null ? "unknown" : minimumGpuCount >= 8 ? "whole_node" : "per_accelerator_allocation",
      procurementMode: procurement,
      preemptible: raw.nativePreemptible,
      serviceProduct: isAggregate ? "other" : "full_device_rental",
      tenancyGrade: profile?.tenancyGrade ?? "unknown",
      tenancyEvidence: profile?.tenancyEvidence ?? null,
      // Listed presence only: the vendor says so itself.
      availabilityState: "unknown" as AvailabilityState,
      availabilityEvidenceGrade: 5,
      availabilityQuantity: null,
      vcpuPerAccelerator: null,
      hostMemoryGbPerAccelerator: null,
      storageGbPerAccelerator: null,
      serviceTier: { tier_label: raw.nativeServiceTier, operator_class: profile?.kind === "marketplace_aggregate" ? "community_host" : "undetermined", interruption_policy: procurement === "interruptible" ? "reclaimable" : procurement === "on_demand" ? "none" : null },
      observationType: "indicative_or_list_price",
      sourceQualityGrade: 6,
      sourceAttribution: PRICE_OF_COMPUTE_ATTRIBUTION,
      sellerPricesByQuantityTier: topo?.quantityTiered ?? null,
      enumerationAssessment: retrieval.enumerationAssessment,
    };
  },
};

export function mapPocPricingType(value: string | null): ProcurementMode {
  switch (value) {
    case "on_demand":
      return "on_demand";
    case "spot":
    case "community":
      return "interruptible";
    case "reserved":
      return "reserved";
    default:
      return "unknown";
  }
}

/**
 * Identity from the vendor's canonical SKU. The vendor separates SXM, PCIe and NVL
 * and memory classes as distinct SKUs; Urdais admits that as Grade C identity
 * and records device memory from NVIDIA's specification of the part. A SKU
 * absent here is unsupported: grade insufficient, so it fails identity.
 */
export type PocSkuIdentity = { vendor: "NVIDIA"; model: string; formFactor: "SXM" | "PCIe" | "NVL"; memoryGb: number | null };

export const POC_SKU_IDENTITY: Readonly<Record<string, PocSkuIdentity>> = {
  "H100-SXM": { vendor: "NVIDIA", model: "H100", formFactor: "SXM", memoryGb: 80 },
  "H100-PCIE": { vendor: "NVIDIA", model: "H100", formFactor: "PCIe", memoryGb: 80 },
  "H100-NVL": { vendor: "NVIDIA", model: "H100", formFactor: "NVL", memoryGb: 94 },
  "H200-SXM": { vendor: "NVIDIA", model: "H200", formFactor: "SXM", memoryGb: 141 },
  "H200-NVL": { vendor: "NVIDIA", model: "H200", formFactor: "NVL", memoryGb: 141 },
  // HGX B200 module (SXM6). Sellers label the same part 180 GB or 192 GB; the instrument does not gate memory.
  "B200": { vendor: "NVIDIA", model: "B200", formFactor: "SXM", memoryGb: 180 },
  "B300": { vendor: "NVIDIA", model: "B300", formFactor: "SXM", memoryGb: 288 },
  "A100-SXM-80GB": { vendor: "NVIDIA", model: "A100", formFactor: "SXM", memoryGb: 80 },
  "A100-SXM-40GB": { vendor: "NVIDIA", model: "A100", formFactor: "SXM", memoryGb: 40 },
  "A100-PCIE-80GB": { vendor: "NVIDIA", model: "A100", formFactor: "PCIe", memoryGb: 80 },
  "A100-PCIE-40GB": { vendor: "NVIDIA", model: "A100", formFactor: "PCIe", memoryGb: 40 },
  // A consumer card on a PCIe board, rented as a whole device.
  "RTX-5090": { vendor: "NVIDIA", model: "RTX 5090", formFactor: "PCIe", memoryGb: 32 },
};

export function identifyPocSku(sku: string): { grade: "C" | "insufficient"; vendor: string | null; model: string | null; formFactor: "SXM" | "PCIe" | "NVL" | null; memoryGb: number | null; fullDevice: boolean } {
  const known = POC_SKU_IDENTITY[sku.toUpperCase()];
  if (known) return { grade: "C", vendor: known.vendor, model: known.model, formFactor: known.formFactor, memoryGb: known.memoryGb, fullDevice: true };
  return { grade: "insufficient", vendor: null, model: sku === "" ? null : sku.split("-")[0] || null, formFactor: null, memoryGb: null, fullDevice: true };
}
