/**
 * Domain types for the UCPI ingestion and calculation pipeline. Each mirrors a
 * row of the pipeline schema closely enough that a future persistence layer is
 * a mapping, not a redesign. Nothing here touches a database or a network.
 *
 *   Provider API -> Retrieval -> Raw Offer -> Normalized Observation
 *   -> Eligibility -> Seller Reduction -> Capacity-Source Collapse -> Regional Calculation
 */

/** A request a collector would make. Contains no secrets: credentials are supplied by the runtime, never by the adapter. */
export type RequestSpec = {
  method: "GET" | "POST";
  url: string;
  parameters: Record<string, string>;
  /** Names of headers the runtime must supply, e.g. Authorization. Values never appear here. */
  requiredHeaders: readonly string[];
};

/** One interaction with a source interface. Mirrors pipeline.source_retrievals. */
export type Retrieval = {
  id: string;
  sourceInterfaceSlug: string;
  requestedAt: string;
  /** When the response was received and recorded. Controls calculation-date eligibility. Null if never completed. */
  completedAt: string | null;
  responseStatus: number | null;
  request: RequestSpec;
  enumerationAssessment: "complete" | "incomplete" | "unknown" | "claimed_complete_observed_incomplete";
  retrievalPurpose: "research" | "validation" | "production";
  permissionGrantId: string | null;
};

/** One record from one retrieval, as the source expressed it. Mirrors pipeline.raw_offers. */
export type RawOffer = {
  id: string;
  retrievalId: string;
  rowOrdinal: number;
  sourceNativeOfferId: string | null;
  sourceNativeProductId: string | null;
  rawPayload: unknown;
  observedAt: string;
  sourceEffectiveAt: string | null;
  availabilityObservedAt: string | null;
  nativeProductLabel: string | null;
  nativeGpuModel: string | null;
  nativeFormFactor: string | null;
  nativeGpuMemoryMb: number | null;
  nativeSellerId: string | null;
  nativeOperatorId: string | null;
  nativePrice: number | null;
  nativeCurrency: string | null;
  nativeBillingUnit: string | null;
  nativePriceComponents: unknown;
  nativeProcurementMode: string | null;
  nativePreemptible: boolean | null;
  nativeTenancyFields: unknown;
  nativeGpuCount: number | null;
  nativeMinimumGpuCount: number | null;
  nativeRegion: string | null;
  nativeGeolocation: string | null;
  nativeAvailabilityValue: string | null;
  nativeVcpu: number | null;
  nativeHostMemoryMb: number | null;
  nativeStorageGb: number | null;
  nativeServiceTier: string | null;
  nativeServiceFields: unknown;
};

export type HardwareIdentityGrade = "A" | "B" | "C" | "insufficient";
export type TopologyClass = "per_accelerator_allocation" | "whole_node" | "unknown";
export type ProcurementMode = "on_demand" | "interruptible" | "reserved" | "negotiated" | "unknown";
export type ServiceProduct = "full_device_rental" | "serverless" | "managed_inference" | "other" | "unknown";
export type TenancyGrade = "explicit" | "documented" | "ambiguous" | "shared_or_fractional" | "unknown";
export type AvailabilityState = "available" | "limited" | "waitlisted" | "sold_out" | "quote_required" | "unknown";
export type TaxBasis = "exclusive" | "inclusive" | "unresolved";
export type ObservationType = "current_accessible_offer" | "firm_written_quote" | "concluded_transaction" | "advertised_non_accessible_price" | "indicative_or_list_price";

/** Normalized service characteristics. Keys documented on pipeline.normalized_observations.service_tier. */
export type ServiceTier = {
  tier_label?: string | null;
  operator_class?: "first_party_datacenter" | "community_host" | "undetermined" | null;
  interruption_policy?: "none" | "reclaimable" | null;
  uptime_commitment?: string | null;
  provisioning_model?: string | null;
  support_commitment?: string | null;
  intra_node_interconnect?: string | null;
  inter_node_fabric?: string | null;
  storage_included_gb?: number | null;
  compliance?: readonly string[] | null;
};

/** A market entity by legal identity. Mirrors reference.market_entities. */
export type MarketEntity = {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  legalIdentifier: string | null;
  /** Evidenced common control; drives collapse. Never inferred from prices. */
  controllingEntityId: string | null;
};

/** Urdais's interpretation of one raw offer under one child version. Mirrors pipeline.normalized_observations. */
export type NormalizedObservation = {
  id: string;
  rawOfferId: string;
  retrievalId: string;
  sourceInterfaceSlug: string;
  instrumentSpecVersion: string;
  methodologyVersion: string;
  sellerEntityId: string;
  operatorEntityId: string | null;
  operatorAttributionBasis: string | null;
  marketplaceEntityId: string | null;
  canonicalRegionCode: string | null;
  regionMappingEvidence: string | null;
  observedAt: string;
  sourceEffectiveAt: string | null;
  availabilityObservedAt: string | null;
  normalizedPrice: number | null;
  normalizedCurrency: string;
  normalizedUnit: "accelerator_hour";
  priceConversion: Record<string, unknown> | null;
  taxBasis: TaxBasis;
  mandatoryFeeInterpretation: Record<string, unknown> | null;
  promotional: boolean;
  hardwareIdentityGrade: HardwareIdentityGrade;
  gpuVendor: string | null;
  gpuModel: string | null;
  formFactor: string | null;
  gpuMemoryGb: number | null;
  fullDevice: boolean | null;
  gpuCount: number | null;
  minimumGpuCount: number | null;
  minimumTopologySourceField: string | null;
  wholeNodeRequired: boolean | null;
  topologyClass: TopologyClass;
  procurementMode: ProcurementMode;
  preemptible: boolean | null;
  serviceProduct: ServiceProduct;
  tenancyGrade: TenancyGrade;
  tenancyEvidence: string | null;
  availabilityState: AvailabilityState;
  availabilityEvidenceGrade: 1 | 2 | 3 | 4 | 5 | 6 | null;
  availabilityQuantity: number | null;
  vcpuPerAccelerator: number | null;
  hostMemoryGbPerAccelerator: number | null;
  storageGbPerAccelerator: number | null;
  serviceTier: ServiceTier | null;
  observationType: ObservationType;
  sourceQualityGrade: number;
  enumerationAssessment: Retrieval["enumerationAssessment"];
  /** Attribution the upstream source requires wherever its data is used; null for first-party sources. */
  sourceAttribution?: string | null;
};

/** The child's exclusion vocabulary. Mirrors reference.exclusion_reasons. */
export type ExclusionReason =
  | "WRONG_HARDWARE"
  | "HARDWARE_VARIANT_UNRESOLVED"
  | "FRACTIONAL_OR_SHARED_DEVICE"
  | "WRONG_SERVICE_PRODUCT"
  | "WRONG_PROCUREMENT_MODE"
  | "PREEMPTIBLE"
  | "PROMOTIONAL_PRICE"
  | "MINIMUM_TOPOLOGY_UNKNOWN"
  | "WHOLE_NODE_REQUIRED"
  | "TENANCY_UNRESOLVED"
  | "REGION_UNRESOLVED"
  | "AVAILABILITY_UNKNOWN"
  | "UNAVAILABLE"
  | "WAITLISTED"
  | "QUOTE_REQUIRED"
  | "AVAILABILITY_EVIDENCE_INSUFFICIENT"
  | "PRICE_STALE"
  | "AVAILABILITY_STALE"
  | "BUNDLE_OUT_OF_ENVELOPE"
  | "TAX_BASIS_INCLUSIVE"
  | "UNIT_UNRESOLVED"
  | "CURRENCY_RATE_UNAVAILABLE"
  | "SOURCE_INSUFFICIENT"
  | "SOURCE_UNRETRIEVABLE"
  | "SOURCE_CONFLICT"
  | "COLLECTION_NOT_PERMITTED";

/** The child's diagnostic vocabulary. Mirrors reference.diagnostic_codes. */
export type DiagnosticCode =
  | "TAX_BASIS_UNRESOLVED"
  | "OPERATOR_UNDETERMINED"
  | "ENUMERATION_INCOMPLETE"
  | "MARKETPLACE_SELLER_ID_STABILITY_UNRESOLVED"
  | "AVAILABILITY_GRADE_3"
  | "SOURCE_EFFECTIVE_TIME_ABSENT"
  | "PRICE_CARRIED";

export type InputStatus = "valid" | "stale" | "ineligible" | "unavailable" | "conflicted";

/** The P0/P1/P2 outcome for one observation. Mirrors pipeline.eligibility_assessments and its children. */
export type EligibilityAssessment = {
  observationId: string;
  calculationDate: string;
  p0: boolean;
  p1: boolean;
  p2: boolean;
  inputStatus: InputStatus;
  exclusions: readonly ExclusionReason[];
  diagnostics: readonly DiagnosticCode[];
};
