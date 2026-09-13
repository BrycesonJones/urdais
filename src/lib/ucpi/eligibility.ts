/**
 * The UCPI-H100-SXM eligibility engine: the child's P0, P1 and P2 criteria
 * (docs/methodology/ucpi-h100-sxm.md, "Stage Criteria") as executable checks
 * with the child's own exclusion and diagnostic vocabulary. Every failure is
 * named; nothing is a bare boolean.
 */

import { calculationDateOf } from "@/lib/ucpi/calculation-window";
import type { DiagnosticCode, EligibilityAssessment, ExclusionReason, InputStatus, NormalizedObservation } from "@/lib/ucpi/domain";
import { HOST_MEMORY_FLOOR_GB_PER_ACCELERATOR, bundleEnvelope, freshnessOnCalculationDate } from "@/lib/ucpi/launch-parameters";
import { productionCollectionPermitted, type SourceRegistryState } from "@/lib/ucpi/permission-gate";

export type EligibilityContext = {
  calculationDate: string;
  /** Registry state per source interface slug. A source absent here is treated as not permitted. */
  registry: ReadonlyMap<string, SourceRegistryState>;
  /** The index currency. Anything else needs a conversion the child has not yet approved. */
  indexCurrency?: string;
};

const MINIMUM_AVAILABILITY_GRADE = 3;

export function assessEligibility(obs: NormalizedObservation, ctx: EligibilityContext): EligibilityAssessment {
  const exclusions = new Set<ExclusionReason>();
  const diagnostics = new Set<DiagnosticCode>();
  const indexCurrency = ctx.indexCurrency ?? "USD";

  // P0: identity qualification -------------------------------------------------
  if (obs.fullDevice === false || obs.tenancyGrade === "shared_or_fractional") exclusions.add("FRACTIONAL_OR_SHARED_DEVICE");
  if (obs.gpuVendor !== "NVIDIA" || obs.gpuModel !== "H100") {
    exclusions.add("WRONG_HARDWARE");
  } else if (obs.formFactor === null || obs.hardwareIdentityGrade === "insufficient") {
    exclusions.add("HARDWARE_VARIANT_UNRESOLVED");
  } else if (obs.formFactor !== "SXM" || obs.gpuMemoryGb !== 80) {
    // NVL and PCIe are different instruments, as is any non-80 GB device.
    exclusions.add("WRONG_HARDWARE");
  }
  const p0 = exclusions.size === 0;

  // P1: selected-product eligibility --------------------------------------------
  if (obs.serviceProduct !== "full_device_rental") exclusions.add("WRONG_SERVICE_PRODUCT");
  if (obs.procurementMode !== "on_demand") exclusions.add("WRONG_PROCUREMENT_MODE");
  if (obs.preemptible === true) exclusions.add("PREEMPTIBLE");
  if (obs.promotional) exclusions.add("PROMOTIONAL_PRICE");
  if (obs.minimumGpuCount === null || obs.minimumTopologySourceField === null) exclusions.add("MINIMUM_TOPOLOGY_UNKNOWN");
  if (obs.topologyClass === "whole_node" || obs.wholeNodeRequired === true) exclusions.add("WHOLE_NODE_REQUIRED");
  if (obs.tenancyGrade === "ambiguous" || obs.tenancyGrade === "unknown") exclusions.add("TENANCY_UNRESOLVED");
  const p1 = p0 && exclusions.size === 0;

  // P2: headline eligibility ----------------------------------------------------
  if (obs.canonicalRegionCode === null) exclusions.add("REGION_UNRESOLVED");

  switch (obs.availabilityState) {
    case "unknown":
      exclusions.add("AVAILABILITY_UNKNOWN");
      break;
    case "sold_out":
      exclusions.add("UNAVAILABLE");
      break;
    case "waitlisted":
      exclusions.add("WAITLISTED");
      break;
    case "quote_required":
      exclusions.add("QUOTE_REQUIRED");
      break;
    default:
      break;
  }
  if (obs.availabilityEvidenceGrade === null || obs.availabilityEvidenceGrade > MINIMUM_AVAILABILITY_GRADE) {
    exclusions.add("AVAILABILITY_EVIDENCE_INSUFFICIENT");
  } else if (obs.availabilityEvidenceGrade === MINIMUM_AVAILABILITY_GRADE) {
    diagnostics.add("AVAILABILITY_GRADE_3");
  }

  const fresh = freshnessOnCalculationDate({
    calculationDate: ctx.calculationDate,
    priceObservedOn: calculationDateOf(obs.observedAt),
    availabilityObservedOn: obs.availabilityObservedAt === null ? null : calculationDateOf(obs.availabilityObservedAt),
  });
  if (fresh === "PRICE_STALE") exclusions.add("PRICE_STALE");
  if (fresh === "AVAILABILITY_STALE") exclusions.add("AVAILABILITY_STALE");
  if (fresh === "SOURCE_UNAVAILABLE") exclusions.add("SOURCE_UNRETRIEVABLE");

  if (obs.normalizedPrice === null || !(obs.normalizedPrice > 0)) exclusions.add("SOURCE_INSUFFICIENT");
  if (obs.normalizedCurrency !== indexCurrency && obs.priceConversion === null) exclusions.add("CURRENCY_RATE_UNAVAILABLE");
  if (obs.normalizedUnit !== "accelerator_hour") exclusions.add("UNIT_UNRESOLVED");

  switch (bundleEnvelope(obs.hostMemoryGbPerAccelerator)) {
    case "outside":
      exclusions.add("BUNDLE_OUT_OF_ENVELOPE");
      break;
    case "unknown":
      // Host memory is nullable but blocks P2 now that the floor is declared.
      exclusions.add("SOURCE_INSUFFICIENT");
      break;
    default:
      break;
  }

  if (obs.taxBasis === "inclusive") exclusions.add("TAX_BASIS_INCLUSIVE");
  if (obs.taxBasis === "unresolved") diagnostics.add("TAX_BASIS_UNRESOLVED");

  if (obs.observationType !== "current_accessible_offer") exclusions.add("SOURCE_INSUFFICIENT");

  const registry = ctx.registry.get(obs.sourceInterfaceSlug);
  if (registry === undefined || !productionCollectionPermitted(registry).permitted) exclusions.add("COLLECTION_NOT_PERMITTED");

  // Diagnostics that never exclude.
  if (obs.operatorEntityId === null) diagnostics.add("OPERATOR_UNDETERMINED");
  if (obs.sourceEffectiveAt === null) diagnostics.add("SOURCE_EFFECTIVE_TIME_ABSENT");
  if (obs.enumerationAssessment !== "complete") diagnostics.add("ENUMERATION_INCOMPLETE");
  if (obs.marketplaceEntityId !== null) diagnostics.add("MARKETPLACE_SELLER_ID_STABILITY_UNRESOLVED");

  const p2 = p1 && exclusions.size === 0;

  return {
    observationId: obs.id,
    calculationDate: ctx.calculationDate,
    p0,
    p1,
    p2,
    inputStatus: inputStatusFor(p2, exclusions),
    exclusions: [...exclusions],
    diagnostics: [...diagnostics],
  };
}

function inputStatusFor(p2: boolean, exclusions: ReadonlySet<ExclusionReason>): InputStatus {
  if (p2) return "valid";
  if (exclusions.has("SOURCE_UNRETRIEVABLE")) return "unavailable";
  if (exclusions.has("SOURCE_CONFLICT")) return "conflicted";
  const onlyFreshness = [...exclusions].every((e) => e === "PRICE_STALE" || e === "AVAILABILITY_STALE");
  return onlyFreshness ? "stale" : "ineligible";
}

export { HOST_MEMORY_FLOOR_GB_PER_ACCELERATOR, MINIMUM_AVAILABILITY_GRADE };
