/**
 * The production-permission gate, in code.
 *
 * Three things are kept apart and must never be conflated: an adapter exists
 * for a source; the source is technically supported (its fields satisfy the
 * child's contract); and production collection is permitted. Only the third
 * allows a live production retrieval, and it is decided by the source registry's
 * two-axis terms review plus production approval, never by the adapter.
 *
 * The database enforces the same rule independently (see migration
 * 20260913140000): a production retrieval requires a permission grant and a
 * production-approved interface. This module lets the collector refuse before
 * it ever reaches the network.
 */

export type TermsState = "not_reviewed" | "under_review" | "permitted" | "not_permitted";
export type ProductionAccessState = "research_usable" | "production_review_pending" | "production_approved" | "production_blocked";

/** The registry row fields the gate reads. Mirrors reference.source_interfaces. */
export type SourceRegistryState = {
  slug: string;
  termsReviewState: TermsState;
  dataUseTermsState: TermsState;
  productionAccessState: ProductionAccessState;
  writtenAgreementRequired: boolean | null;
};

export type ProductionEligibility =
  | { permitted: true; basis: "both_axes_permitted_and_production_approved" }
  | { permitted: false; reason: "COLLECTION_NOT_PERMITTED"; detail: string };

/** True only when both terms axes are permitted and the registry has approved production. */
export function productionCollectionPermitted(state: SourceRegistryState): ProductionEligibility {
  const bothAxes = state.termsReviewState === "permitted" && state.dataUseTermsState === "permitted";
  if (bothAxes && state.productionAccessState === "production_approved") {
    return { permitted: true, basis: "both_axes_permitted_and_production_approved" };
  }
  const parts = [
    `collection ${state.termsReviewState}`,
    `index use ${state.dataUseTermsState}`,
    `production ${state.productionAccessState}`,
  ];
  if (state.writtenAgreementRequired) parts.push("written agreement required");
  return { permitted: false, reason: "COLLECTION_NOT_PERMITTED", detail: `${state.slug}: ${parts.join(", ")}` };
}

/** Throws unless production collection is permitted. Collectors call this before any live production request. */
export function assertProductionCollectionPermitted(state: SourceRegistryState): void {
  const e = productionCollectionPermitted(state);
  if (!e.permitted) throw new Error(`production collection refused: ${e.detail}`);
}

export type AdapterCapability = {
  /** An adapter module exists for the source. */
  adapterExists: boolean;
  /** The adapter can produce every field the child's P2 criteria need from the documented interface. */
  technicallySupported: boolean;
  /** The registry permits production collection today. Independent of the two above. */
  productionCollectionPermitted: boolean;
  registryDetail: string;
};

export function describeCapability(input: { adapterExists: boolean; technicallySupported: boolean; registry: SourceRegistryState }): AdapterCapability {
  const e = productionCollectionPermitted(input.registry);
  return {
    adapterExists: input.adapterExists,
    technicallySupported: input.technicallySupported,
    productionCollectionPermitted: e.permitted,
    registryDetail: e.permitted ? e.basis : e.detail,
  };
}

/**
 * The registry as recorded in UrdaisDev on 13 September 2026. A fixture for
 * tests, not a source of truth: the database is. Neither Runpod nor Lambda is
 * permitted on both axes and neither is production-approved.
 */
export const REGISTRY_SNAPSHOT_2026_09_13: readonly SourceRegistryState[] = [
  { slug: "runpod-gpu-types", termsReviewState: "not_permitted", dataUseTermsState: "not_permitted", productionAccessState: "production_blocked", writtenAgreementRequired: true },
  { slug: "lambda-instance-types", termsReviewState: "under_review", dataUseTermsState: "not_permitted", productionAccessState: "production_blocked", writtenAgreementRequired: true },
  { slug: "vast-ai-offer-search", termsReviewState: "not_permitted", dataUseTermsState: "not_permitted", productionAccessState: "production_blocked", writtenAgreementRequired: true },
  { slug: "aws-price-list-bulk", termsReviewState: "permitted", dataUseTermsState: "under_review", productionAccessState: "production_review_pending", writtenAgreementRequired: null },
  { slug: "azure-retail-prices", termsReviewState: "permitted", dataUseTermsState: "under_review", productionAccessState: "production_review_pending", writtenAgreementRequired: null },
  { slug: "digitalocean-sizes", termsReviewState: "under_review", dataUseTermsState: "under_review", productionAccessState: "production_review_pending", writtenAgreementRequired: null },
];
