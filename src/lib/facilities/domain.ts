/**
 * The facility vocabulary, in one place.
 *
 * Every allowed value here also exists as a check constraint in
 * supabase/migrations/20260917260000_map_facility_foundation.sql. The two are
 * deliberately redundant: the database refuses a bad row whoever writes it, and
 * these lists let the importer refuse a bad *record* before a transaction is
 * ever opened, naming the field instead of surfacing a Postgres error code.
 */

/**
 * The four public infrastructure categories. `gpu_compute_cluster` is the
 * canonical machine value; the map's public label for it is "GPU Compute
 * Cluster". It replaced `compute_cluster`, which was too broad for a category
 * whose members are all accelerator fleets.
 */
export const FACILITY_CATEGORIES = ["data_center", "gpu_compute_cluster", "power_infrastructure", "semiconductor_fab"] as const;
export type FacilityCategory = (typeof FACILITY_CATEGORIES)[number];

/** The categories a power asset must supply for that power asset to be publishable. */
export const COMPUTE_CATEGORIES: readonly FacilityCategory[] = ["data_center", "gpu_compute_cluster", "semiconductor_fab"];

export const FACILITY_LIFECYCLE_STATUSES = [
  "announced",
  "planned",
  "under_construction",
  "operational",
  "expansion",
  "suspended",
  "cancelled",
  "retired",
] as const;
export type FacilityLifecycleStatus = (typeof FACILITY_LIFECYCLE_STATUSES)[number];

/** A published facility must be current infrastructure, not a closed or abandoned one. */
export const NON_PUBLISHABLE_LIFECYCLE_STATUSES: readonly FacilityLifecycleStatus[] = ["cancelled", "retired"];

/**
 * How precisely the position is known. `city` is the one that matters: a city
 * centroid is a location, not a position, and placing a dot there asserts a
 * building stands in the middle of a town.
 */
export const COORDINATE_PRECISIONS = ["building", "campus", "street", "city"] as const;
export type CoordinatePrecision = (typeof COORDINATE_PRECISIONS)[number];

/** The precisions that may be drawn. Mirrors reference.facility_is_map_eligible. */
export const MAP_ELIGIBLE_PRECISIONS: readonly CoordinatePrecision[] = ["building", "campus", "street"];

export const COORDINATE_METHODS = ["official_record", "documented_address_geocode", "campus_centroid", "city_centroid"] as const;
export type CoordinateMethod = (typeof COORDINATE_METHODS)[number];

export const PUBLICATION_STATES = ["research", "review_required", "published", "withdrawn"] as const;
export type FacilityPublicationState = (typeof PUBLICATION_STATES)[number];

export const FACILITY_CONFIDENCES = ["high", "medium", "low"] as const;
export type FacilityConfidence = (typeof FACILITY_CONFIDENCES)[number];

export const ALIAS_KINDS = ["alias", "former_name", "source_identifier"] as const;
export type FacilityAliasKind = (typeof ALIAS_KINDS)[number];

export const EVIDENCE_DOCUMENT_TYPES = [
  "company_facility_page",
  "company_press_release",
  "sec_filing",
  "government_record",
  "permit",
  "planning",
  "utility_filing",
  "economic_development",
  "industry_press",
  "financial_press",
] as const;
export type EvidenceDocumentType = (typeof EVIDENCE_DOCUMENT_TYPES)[number];

/**
 * What kind of evidence a document is, for the purpose of deciding whether
 * citing it raises a rights question.
 *
 * The distinction is between *citing a fact* and *republishing content*. A
 * company page stating its own campus address, a permit, a filing: Urdais
 * records the fact and links to the document, which is ordinary citation and
 * is not the thing source-terms review exists for. A commercial data feed whose
 * values Urdais would redistribute is, and stays under the existing terms
 * controls in reference.source_interfaces.
 *
 * Secondary press sits between the two: citing it is ordinary, but it is the
 * class where a paywall or a licence can make Urdais's intended use a real
 * question, so it is named separately rather than folded into either side.
 */
export const CITATION_CLASSES = ["public_primary_evidence", "government_evidence", "secondary_corroboration"] as const;
export type CitationClass = (typeof CITATION_CLASSES)[number];

const CITATION_CLASS_BY_DOCUMENT_TYPE: Record<EvidenceDocumentType, CitationClass> = {
  company_facility_page: "public_primary_evidence",
  company_press_release: "public_primary_evidence",
  sec_filing: "government_evidence",
  government_record: "government_evidence",
  permit: "government_evidence",
  planning: "government_evidence",
  utility_filing: "government_evidence",
  economic_development: "government_evidence",
  industry_press: "secondary_corroboration",
  financial_press: "secondary_corroboration",
};

export function citationClassOf(documentType: EvidenceDocumentType): CitationClass {
  return CITATION_CLASS_BY_DOCUMENT_TYPE[documentType];
}

/**
 * Which part of a facility record a document supports. The whole reason the
 * claims table exists: a press release that states an address has not stated a
 * GPU count, and nothing downstream may treat it as if it had.
 */
export const EVIDENCE_CLAIM_FIELDS = [
  "identity",
  "location",
  "coordinates",
  "owner",
  "operator",
  "lifecycle_status",
  "dates",
  "capacity",
  "compute_hardware",
  "power",
  "compute_relationship",
  "contact",
] as const;
export type EvidenceClaimField = (typeof EVIDENCE_CLAIM_FIELDS)[number];

/** A published facility needs a document that placed it. */
export const POSITIONING_CLAIM_FIELDS: readonly EvidenceClaimField[] = ["location", "coordinates"];

export const EVIDENCE_VERIFICATION_STATES = ["unverified", "human_verified", "disputed"] as const;
export type EvidenceVerificationState = (typeof EVIDENCE_VERIFICATION_STATES)[number];

/**
 * Relationship types, each stored once in its canonical direction. The research
 * package lists many edges twice; an inverse is a way of reading a row rather
 * than a second row, so there is no `hosts` and no `powered_by` here.
 */
export const RELATIONSHIP_TYPES = [
  /** from = the tenant or cluster, to = the campus it sits in. */
  "hosted_by",
  /** One site, two entities. Unordered. */
  "same_campus",
  /** One company or programme, different sites. Unordered. */
  "same_program",
  /** from generates, to consumes. */
  "supplies_power_to",
  /** from packages or tests what to fabricates. */
  "packaging_for",
  /** from is a later phase of to. */
  "expansion_of",
] as const;
export type FacilityRelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/** The types describing an unordered pair, which must not be stored in both directions. */
export const SYMMETRIC_RELATIONSHIP_TYPES: readonly FacilityRelationshipType[] = ["same_campus", "same_program"];

/**
 * How long a verification stands before the public map stops showing the
 * record. Facilities change slowly — a campus does not move — so this is a
 * staleness guard against an abandoned dataset rather than a freshness
 * requirement, and it is deliberately generous. The read path applies it; the
 * database only insists that a published record carries a date at all.
 */
export const FACILITY_VERIFICATION_HORIZON_DAYS = 365;

/**
 * The methodology whose version a published facility names. Facilities are not
 * an index — nothing is calculated — so what the version governs is the rules:
 * the categories, the precision meanings, the publication gates, the power
 * requirement. See docs/methodology/map-facilities.md.
 */
export const FACILITY_METHODOLOGY_SLUG = "map-facilities";

function isMember<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export const isFacilityCategory = (value: unknown): value is FacilityCategory => isMember(FACILITY_CATEGORIES, value);
export const isLifecycleStatus = (value: unknown): value is FacilityLifecycleStatus => isMember(FACILITY_LIFECYCLE_STATUSES, value);
export const isCoordinatePrecision = (value: unknown): value is CoordinatePrecision => isMember(COORDINATE_PRECISIONS, value);
export const isCoordinateMethod = (value: unknown): value is CoordinateMethod => isMember(COORDINATE_METHODS, value);
export const isPublicationState = (value: unknown): value is FacilityPublicationState => isMember(PUBLICATION_STATES, value);
export const isFacilityConfidence = (value: unknown): value is FacilityConfidence => isMember(FACILITY_CONFIDENCES, value);
export const isAliasKind = (value: unknown): value is FacilityAliasKind => isMember(ALIAS_KINDS, value);
export const isEvidenceDocumentType = (value: unknown): value is EvidenceDocumentType => isMember(EVIDENCE_DOCUMENT_TYPES, value);
export const isEvidenceClaimField = (value: unknown): value is EvidenceClaimField => isMember(EVIDENCE_CLAIM_FIELDS, value);
export const isEvidenceVerificationState = (value: unknown): value is EvidenceVerificationState =>
  isMember(EVIDENCE_VERIFICATION_STATES, value);
export const isRelationshipType = (value: unknown): value is FacilityRelationshipType => isMember(RELATIONSHIP_TYPES, value);

export const isComputeCategory = (value: FacilityCategory): boolean => COMPUTE_CATEGORIES.includes(value);

/** Mirrors reference.facility_is_map_eligible: a position exists and beats a city centroid. */
export function isMapEligible(input: {
  latitude: number | null;
  longitude: number | null;
  coordinatePrecision: CoordinatePrecision | null;
}): boolean {
  return (
    input.latitude !== null &&
    input.longitude !== null &&
    input.coordinatePrecision !== null &&
    MAP_ELIGIBLE_PRECISIONS.includes(input.coordinatePrecision)
  );
}
