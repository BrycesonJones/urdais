/**
 * The provider activation workflow and checklists. Operational visibility only:
 * the database gate (permission grant in force + production-approved interface)
 * and the runtime preflight are the controls; this module describes the
 * transitions and reports pass/fail/pending so a reviewer can see where a
 * provider stands. A checklist that reads "pass" grants nothing.
 */

export type StepStatus = "pass" | "fail" | "pending";

export type ActivationStep = {
  order: number;
  key: string;
  requirement: string;
  /** How the transition is made, and what proves it. */
  transition: string;
};

/** The exact sequence by which a provider moves from blocked to collecting. No single change performs it. */
export const ACTIVATION_WORKFLOW: readonly ActivationStep[] = [
  { order: 1, key: "source_interface_exists", requirement: "Source interface registered", transition: "reference.source_interfaces row (Phase 4A)" },
  { order: 2, key: "terms_review_complete", requirement: "Terms review complete on both axes", transition: "terms_evidence recorded with decisive clauses" },
  { order: 3, key: "collection_permitted", requirement: "Collection permission = permitted", transition: "migration setting terms_review_state on written evidence" },
  { order: 4, key: "index_use_permitted", requirement: "Index/data-use permission = permitted", transition: "migration setting data_use_terms_state on written evidence" },
  { order: 5, key: "grant_recorded", requirement: "Permission grant recorded", transition: "reference.permission_grants row citing the message/agreement, evidence text, both axes" },
  { order: 6, key: "grant_in_force", requirement: "Grant effective and in force", transition: "effective_from <= now < effective_to (or open-ended)" },
  { order: 7, key: "grant_linked_to_retrievals", requirement: "Permission reference linked to every production retrieval", transition: "source_retrievals.permission_grant_id, enforced by CHECK and trigger" },
  { order: 8, key: "product_supported", requirement: "Product technically supported", transition: "adapter parses and normalizes the documented shape; fixture tests green" },
  { order: 9, key: "tenancy_acceptable", requirement: "Tenancy Explicit or Documented", transition: "seller statement or official documentation recorded as observation_evidence role tenancy" },
  { order: 10, key: "availability_acceptable", requirement: "Availability evidence Grade >= 3", transition: "discriminating source field mapped to the family's states" },
  { order: 11, key: "geography_resolvable", requirement: "Geography resolvable to a country", transition: "region_mappings rows with first-party evidence" },
  { order: 12, key: "production_approved", requirement: "production_access_state = production_approved", transition: "migration, guarded on steps 3-4 (CHECK) and reviewed" },
  { order: 13, key: "authenticated_validation_passed", requirement: "First authenticated validation completed", transition: "validation-mode retrievals persisted with purpose validation; report all pass" },
  { order: 14, key: "collector_enabled", requirement: "Collector activated", transition: "UCPI_RUN_MODE=production for the source in the deployed job; first production retrieval carries the grant" },
];

export type ChecklistItem = { key: string; label: string; status: StepStatus; detail: string };

export type ActivationInputs = {
  provider: string;
  collectionRights: StepStatus;
  indexUseRights: StepStatus;
  writtenPermissionOrAgreement: StepStatus;
  attributionRule: StepStatus;
  cachingRule: StepStatus;
  retentionRule: StepStatus;
  rawRedistributionRule: StepStatus;
  aggregatePublicationRule: StepStatus;
  reconstructionRiskAccepted: StepStatus;
  productId: StepStatus;
  canonicalQuantity: StepStatus;
  tenancy: StepStatus;
  availabilityGrade3: StepStatus;
  countryMapping: StepStatus;
  legalEntitySeeded: StepStatus;
  permissionGrantSeeded: StepStatus;
  credentialsAvailable: StepStatus;
  authenticatedValidationPassed: StepStatus;
  collectorEnabled: StepStatus;
  notes: Partial<Record<keyof Omit<ActivationInputs, "provider" | "notes">, string>>;
};

export type ActivationChecklist = { provider: string; items: ChecklistItem[]; readyForValidation: boolean; readyForProduction: boolean };

const LABELS: Record<keyof Omit<ActivationInputs, "provider" | "notes">, string> = {
  collectionRights: "Collection rights",
  indexUseRights: "Index-use rights",
  writtenPermissionOrAgreement: "Written permission or agreement",
  attributionRule: "Attribution rule",
  cachingRule: "Caching rule",
  retentionRule: "Retention rule",
  rawRedistributionRule: "Raw redistribution rule",
  aggregatePublicationRule: "Aggregate publication rule",
  reconstructionRiskAccepted: "Reconstruction risk accepted",
  productId: "Product id",
  canonicalQuantity: "Canonical quantity",
  tenancy: "Tenancy",
  availabilityGrade3: "Availability Grade >= 3",
  countryMapping: "Country mapping",
  legalEntitySeeded: "Legal entity seeded",
  permissionGrantSeeded: "Permission grant seeded",
  credentialsAvailable: "Credentials available",
  authenticatedValidationPassed: "Authenticated validation passed",
  collectorEnabled: "Collector enabled",
};

export function evaluateActivation(inputs: ActivationInputs): ActivationChecklist {
  const items: ChecklistItem[] = (Object.keys(LABELS) as (keyof typeof LABELS)[]).map((key) => ({
    key,
    label: LABELS[key],
    status: inputs[key],
    detail: inputs.notes[key] ?? "",
  }));
  const rightsCleared = ["collectionRights", "indexUseRights", "writtenPermissionOrAgreement", "retentionRule", "aggregatePublicationRule", "permissionGrantSeeded"].every(
    (k) => inputs[k as keyof typeof LABELS] === "pass",
  );
  const productReady = ["productId", "canonicalQuantity", "tenancy", "availabilityGrade3", "countryMapping", "legalEntitySeeded"].every((k) => inputs[k as keyof typeof LABELS] === "pass");
  const readyForValidation = rightsCleared && productReady && inputs.credentialsAvailable === "pass";
  const readyForProduction = readyForValidation && inputs.authenticatedValidationPassed === "pass";
  return { provider: inputs.provider, items, readyForValidation, readyForProduction };
}

/** Runpod as at 13 September 2026: no reply beyond an automated ticket acknowledgement. */
export const RUNPOD_ACTIVATION_2026_09_13: ActivationInputs = {
  provider: "runpod",
  collectionRights: "fail",
  indexUseRights: "fail",
  writtenPermissionOrAgreement: "pending",
  attributionRule: "pending",
  cachingRule: "pending",
  retentionRule: "pending",
  rawRedistributionRule: "pending",
  aggregatePublicationRule: "pending",
  reconstructionRiskAccepted: "pending",
  productId: "pass",
  canonicalQuantity: "pending",
  tenancy: "pass",
  availabilityGrade3: "pass",
  countryMapping: "pass",
  legalEntitySeeded: "pass",
  permissionGrantSeeded: "pending",
  credentialsAvailable: "pending",
  authenticatedValidationPassed: "pending",
  collectorEnabled: "fail",
  notes: {
    collectionRights: "Terms prohibit automated retrieval; not_permitted; request pending (ticket #47829)",
    indexUseRights: "Terms prohibit index construction; not_permitted; request pending",
    productId: "NVIDIA H100 80GB HBM3, display H100 SXM, 80 GB (Grade A)",
    canonicalQuantity: "count=1 availability by design; minPodGpuCount value is read at first authenticated call",
    tenancy: "Documented: a running Pod's GPU 'is exclusively reserved for you'",
    availabilityGrade3: "NONE/LOW/MEDIUM/HIGH per datacenter at count=1, per cloud tier",
    countryMapping: "countryCodes filter is the first-party route; US-KS-2 and US-GA-1 evidenced as US; full list at first call",
    legalEntitySeeded: "Runpod, Inc. seeded as the seller entity",
    collectorEnabled: "Blocked by the registry and the database gate",
  },
};

/** Lambda as at 13 September 2026: no reply to the permission request or the tenancy addendum. */
export const LAMBDA_ACTIVATION_2026_09_13: ActivationInputs = {
  provider: "lambda",
  collectionRights: "pending",
  indexUseRights: "fail",
  writtenPermissionOrAgreement: "pending",
  attributionRule: "pending",
  cachingRule: "pending",
  retentionRule: "pending",
  rawRedistributionRule: "pending",
  aggregatePublicationRule: "pending",
  reconstructionRiskAccepted: "pending",
  productId: "pass",
  canonicalQuantity: "pass",
  tenancy: "pending",
  availabilityGrade3: "pass",
  countryMapping: "pass",
  legalEntitySeeded: "pass",
  permissionGrantSeeded: "pending",
  credentialsAvailable: "pending",
  authenticatedValidationPassed: "pending",
  collectorEnabled: "fail",
  notes: {
    collectionRights: "under_review: no anti-scraping clause; purpose clause is the question; request pending",
    indexUseRights: "not_permitted on the conservative reading of 'benchmarking'; carve-out requested",
    productId: "gpu_1x_h100_sxm5, '1x H100 (80 GB SXM5)' (Grade A)",
    canonicalQuantity: "1x offered; specs.gpus is the source field",
    tenancy: "Ambiguous: only GH200 is stated single-tenant; clarification sent 13 Sept (message 1a09d05f8dbdd35e)",
    availabilityGrade3: "regions_with_capacity_available, required array, can be empty",
    countryMapping: "All 14 regions mapped from Lambda's own table",
    legalEntitySeeded: "Lambda, Inc. seeded as the seller entity",
    collectorEnabled: "Blocked by the registry and the database gate",
  },
};
