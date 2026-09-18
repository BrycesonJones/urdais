/**
 * The import plan: everything that can be decided about a batch before a
 * transaction is opened.
 *
 * Two kinds of finding come out of here and they are not on a spectrum.
 *
 * An **error** stops the import. Errors are the conditions under which writing
 * would put something false in the database: a duplicated key, a relationship
 * pointing at nothing, a record asking to be published that does not qualify.
 * Nothing partial is written and nothing is quietly downgraded — a facility
 * that asks to publish and cannot is a failure to be fixed in the dataset, not
 * a record silently demoted to research and forgotten.
 *
 * A **review candidate** stops nothing. It is the importer saying: these two
 * records might be the same thing, look at them. It never acts on that
 * suspicion. The single most damaging thing an importer of this dataset could
 * do is merge on similarity, because the dataset's most common legitimate shape
 * is two entities at one address — LUMI inside CSC Kajaani, Horizon 1 inside
 * Childress, a nuclear station beside the campus it powers. Identical
 * coordinates are therefore a remark, never a merge, and there is no code path
 * in this file that joins two records.
 */

import { createHash } from "node:crypto";

import type { ContractFacility, ContractRelationship, FacilityImportDocument } from "@/lib/facilities/contract";
import {
  COMPUTE_CATEGORIES,
  FACILITY_VERIFICATION_HORIZON_DAYS,
  NON_PUBLISHABLE_LIFECYCLE_STATUSES,
  POSITIONING_CLAIM_FIELDS,
  SYMMETRIC_RELATIONSHIP_TYPES,
  isMapEligible,
  type FacilityCategory,
  type FacilityPublicationState,
} from "@/lib/facilities/domain";

export type ImportError = {
  /** The facility the error belongs to, or null for a document-level one. */
  researchKey: string | null;
  code: string;
  message: string;
};

export type ImportReviewCandidate = {
  researchKey: string;
  code: string;
  message: string;
};

export type PlannedFacility = {
  facility: ContractFacility;
  /** What this record will be written as. Equal to the requested state or the import fails. */
  publicationState: FacilityPublicationState;
  mapEligible: boolean;
};

export type PlannedRelationship = {
  relationship: ContractRelationship;
  /** True when the target is already in the database rather than in this batch. */
  targetIsExisting: boolean;
};

export type ImportPlan = {
  datasetName: string;
  researchDocument: string;
  generatedAt: string;
  facilities: readonly PlannedFacility[];
  relationships: readonly PlannedRelationship[];
  errors: readonly ImportError[];
  reviewCandidates: readonly ImportReviewCandidate[];
  /**
   * A stable fingerprint of what this batch would write. Identical input gives
   * an identical digest whatever the key order in the file, so a re-import can
   * be recognised as the same batch without diffing the database.
   */
  digest: string;
  counts: {
    facilities: number;
    byCategory: Record<FacilityCategory, number>;
    published: number;
    mapEligible: number;
    evidence: number;
    claims: number;
    facts: number;
    aliases: number;
    relationships: number;
  };
};

export type PlanOptions = {
  /** Research keys already in the database, so a relationship may point outside the batch. */
  existingResearchKeys?: readonly string[];
  /** Today, for the staleness remark. Defaults to the current date. */
  today?: Date;
};

/** Generic words that carry no identity, removed before two names are compared. */
const GENERIC_NAME_WORDS = new Set([
  "the", "a", "an", "and", "of", "at",
  "data", "datacenter", "datacentre", "center", "centre", "campus", "facility", "site", "plant", "station",
  "inc", "llc", "ltd", "corp", "corporation", "company", "gmbh", "ab", "oy", "plc", "holdings", "group",
]);

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function identityTokens(name: string): Set<string> {
  return new Set(
    normalizeName(name)
      .split(" ")
      .filter((token) => token !== "" && !GENERIC_NAME_WORDS.has(token)),
  );
}

/** Jaccard overlap of identity-bearing tokens. Deterministic and explainable, which a fuzzy score is not. */
export function nameSimilarity(left: string, right: string): number {
  const a = identityTokens(left);
  const b = identityTokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Above this, two records are worth a human's attention. Never enough to merge them. */
export const NAME_SIMILARITY_REVIEW_THRESHOLD = 0.7;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Builds the plan. Pure: it reads the parsed document and a list of research
 * keys the database already holds, and touches nothing.
 */
export function buildImportPlan(document: FacilityImportDocument, options: PlanOptions = {}): ImportPlan {
  const errors: ImportError[] = [];
  const reviewCandidates: ImportReviewCandidate[] = [];
  const existing = new Set(options.existingResearchKeys ?? []);
  const today = options.today ?? new Date();

  // ---- identity within the batch ----------------------------------------
  const byKey = new Map<string, ContractFacility>();
  for (const facility of document.facilities) {
    if (byKey.has(facility.researchKey)) {
      errors.push({
        researchKey: facility.researchKey,
        code: "duplicate_research_key",
        message: `appears more than once in this batch; a research key identifies exactly one facility`,
      });
      continue;
    }
    byKey.set(facility.researchKey, facility);
  }

  // ---- per-facility decisions -------------------------------------------
  const planned: PlannedFacility[] = [];
  for (const facility of byKey.values()) {
    const mapEligible = isMapEligible({
      latitude: facility.location.latitude ?? null,
      longitude: facility.location.longitude ?? null,
      coordinatePrecision: facility.location.coordinatePrecision ?? null,
    });
    const wantsPublication = facility.requestedPublicationState === "published";

    if (wantsPublication) {
      if (!mapEligible) {
        errors.push({
          researchKey: facility.researchKey,
          code: "publication_needs_position",
          message:
            facility.location.latitude === null || facility.location.latitude === undefined
              ? "asks to be published with no coordinates; a researched facility without a position is a research record, never a placed dot"
              : `asks to be published at ${facility.location.coordinatePrecision} precision; a city centroid is a location, not a position`,
        });
      }
      if (facility.quality.confidence === "low") {
        errors.push({
          researchKey: facility.researchKey,
          code: "publication_needs_confidence",
          message: "asks to be published at low confidence",
        });
      }
      if (!facility.quality.lastVerifiedDate) {
        errors.push({
          researchKey: facility.researchKey,
          code: "publication_needs_verification_date",
          message: "asks to be published without a last-verified date",
        });
      }
      const status = facility.lifecycle?.status ?? null;
      if (status !== null && (NON_PUBLISHABLE_LIFECYCLE_STATUSES as readonly string[]).includes(status)) {
        errors.push({
          researchKey: facility.researchKey,
          code: "publication_needs_live_lifecycle",
          message: `asks to be published while ${status}`,
        });
      }
      const hasPositioningEvidence = facility.evidence.some((item) =>
        item.claims.some((claim) => (POSITIONING_CLAIM_FIELDS as readonly string[]).includes(claim.field)),
      );
      if (!hasPositioningEvidence) {
        errors.push({
          researchKey: facility.researchKey,
          code: "publication_needs_positioning_evidence",
          message: "asks to be published with no source that supports its location or coordinates",
        });
      }
    }

    // ---- review candidates ----
    for (const note of facility.quality.reviewNotes ?? []) {
      reviewCandidates.push({ researchKey: facility.researchKey, code: "unresolved_research_note", message: note });
    }
    if (facility.location.coordinatePrecision === "city") {
      reviewCandidates.push({
        researchKey: facility.researchKey,
        code: "city_level_coordinates",
        message: "is positioned at city precision, which never reaches the map",
      });
    }
    if (!mapEligible && facility.requestedPublicationState !== "published") {
      reviewCandidates.push({
        researchKey: facility.researchKey,
        code: "not_map_eligible",
        message: "has no map-eligible position and is stored as a research record",
      });
    }
    if (facility.evidence.every((item) => (item.verificationState ?? "unverified") === "unverified") && wantsPublication) {
      reviewCandidates.push({
        researchKey: facility.researchKey,
        code: "no_human_verified_evidence",
        message: "publishes on evidence no person has checked",
      });
    }
    if (facility.evidence.some((item) => item.verificationState === "disputed")) {
      reviewCandidates.push({ researchKey: facility.researchKey, code: "disputed_evidence", message: "cites a document marked disputed" });
    }
    if ((facility.facts ?? []).length === 0 && (COMPUTE_CATEGORIES as readonly string[]).includes(facility.category)) {
      reviewCandidates.push({
        researchKey: facility.researchKey,
        code: "no_capacity_facts",
        message: "carries no sourced capacity or hardware facts",
      });
    }
    if (facility.quality.lastVerifiedDate) {
      const age = daysBetween(new Date(`${facility.quality.lastVerifiedDate}T00:00:00Z`), today);
      if (age > FACILITY_VERIFICATION_HORIZON_DAYS) {
        reviewCandidates.push({
          researchKey: facility.researchKey,
          code: "verification_stale",
          message: `was last verified ${age} days ago, past the ${FACILITY_VERIFICATION_HORIZON_DAYS}-day horizon; the public map will not show it`,
        });
      }
    }

    planned.push({ facility, publicationState: facility.requestedPublicationState, mapEligible });
  }

  // ---- cross-record review candidates ------------------------------------
  const records = planned.map((entry) => entry.facility);
  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      const left = records[i]!;
      const right = records[j]!;

      if (
        left.location.latitude !== null &&
        left.location.latitude !== undefined &&
        left.location.latitude === right.location.latitude &&
        left.location.longitude === right.location.longitude
      ) {
        reviewCandidates.push({
          researchKey: left.researchKey,
          code: "shared_coordinates",
          message: `shares its position with ${right.researchKey}; distinct entities at one site are expected and are not merged`,
        });
      }

      const similarity = nameSimilarity(left.canonicalName, right.canonicalName);
      if (similarity >= NAME_SIMILARITY_REVIEW_THRESHOLD) {
        reviewCandidates.push({
          researchKey: left.researchKey,
          code: "similar_name",
          message: `has a name ${Math.round(similarity * 100)}% similar to ${right.researchKey} ("${right.canonicalName}")`,
        });
      }

      const rightNames = new Set([normalizeName(right.canonicalName), ...(right.aliases ?? []).map((alias) => normalizeName(alias.alias))]);
      for (const alias of left.aliases ?? []) {
        if (rightNames.has(normalizeName(alias.alias))) {
          reviewCandidates.push({
            researchKey: left.researchKey,
            code: "alias_collision",
            message: `is also known as "${alias.alias}", which names ${right.researchKey}`,
          });
        }
      }
    }
  }

  // ---- relationships ------------------------------------------------------
  const plannedRelationships: PlannedRelationship[] = [];
  const seenEdges = new Set<string>();
  for (const relationship of document.relationships) {
    const label = `${relationship.fromResearchKey} -${relationship.type}-> ${relationship.toResearchKey}`;
    const fromInBatch = byKey.get(relationship.fromResearchKey);
    const toInBatch = byKey.get(relationship.toResearchKey);
    const fromKnown = fromInBatch !== undefined || existing.has(relationship.fromResearchKey);
    const toKnown = toInBatch !== undefined || existing.has(relationship.toResearchKey);

    if (!fromKnown) {
      errors.push({ researchKey: relationship.fromResearchKey, code: "relationship_source_missing", message: `${label}: its source facility is neither in this batch nor in the database` });
      continue;
    }
    if (!toKnown) {
      errors.push({ researchKey: relationship.fromResearchKey, code: "relationship_target_missing", message: `${label}: its target facility is neither in this batch nor in the database` });
      continue;
    }

    const directed = `${relationship.type}:${relationship.fromResearchKey}->${relationship.toResearchKey}`;
    const unordered = `${relationship.type}:${[relationship.fromResearchKey, relationship.toResearchKey].sort().join("<->")}`;
    const key = (SYMMETRIC_RELATIONSHIP_TYPES as readonly string[]).includes(relationship.type) ? unordered : directed;
    if (seenEdges.has(key)) {
      errors.push({
        researchKey: relationship.fromResearchKey,
        code: "duplicate_relationship",
        message: `${label}: this edge is stated more than once (a ${relationship.type} edge is stored once, in its canonical direction)`,
      });
      continue;
    }
    seenEdges.add(key);

    if (relationship.evidenceUrl && fromInBatch && !fromInBatch.evidence.some((item) => item.url === relationship.evidenceUrl)) {
      errors.push({
        researchKey: relationship.fromResearchKey,
        code: "relationship_evidence_missing",
        message: `${label}: cites ${relationship.evidenceUrl}, which is not evidence on ${relationship.fromResearchKey}`,
      });
      continue;
    }
    if (!relationship.evidenceUrl) {
      reviewCandidates.push({
        researchKey: relationship.fromResearchKey,
        code: "relationship_without_evidence",
        message: `${label}: has no document behind it and cannot support a publication decision`,
      });
    }

    plannedRelationships.push({ relationship, targetIsExisting: toInBatch === undefined });
  }

  // ---- the power rule -----------------------------------------------------
  // A power asset publishes only where a document ties it to compute. Checked
  // here as well as in the database so the dataset is told which record is
  // wrong, rather than the transaction failing on a trigger at commit.
  for (const entry of planned) {
    if (entry.facility.category !== "power_infrastructure" || entry.publicationState !== "published") continue;
    const qualifying = plannedRelationships.filter((edge) => {
      if (edge.relationship.type !== "supplies_power_to") return false;
      if (edge.relationship.fromResearchKey !== entry.facility.researchKey) return false;
      if (!edge.relationship.evidenceUrl) return false;
      const target = byKey.get(edge.relationship.toResearchKey);
      // A target already in the database is checked by the commit-time trigger;
      // the plan can only judge what it can see.
      return target === undefined || (COMPUTE_CATEGORIES as readonly string[]).includes(target.category);
    });
    if (qualifying.length === 0) {
      errors.push({
        researchKey: entry.facility.researchKey,
        code: "power_publication_needs_compute_link",
        message:
          "is power infrastructure asking to be published with no evidenced supplies_power_to relationship into a data center, GPU cluster or fab; generation is on this map because of what it powers",
      });
    }
  }

  // ---- counts and digest --------------------------------------------------
  const byCategory: Record<FacilityCategory, number> = {
    data_center: 0,
    gpu_compute_cluster: 0,
    semiconductor_fab: 0,
    power_infrastructure: 0,
  };
  let evidence = 0;
  let claims = 0;
  let facts = 0;
  let aliases = 0;
  for (const entry of planned) {
    byCategory[entry.facility.category] += 1;
    evidence += entry.facility.evidence.length;
    claims += entry.facility.evidence.reduce((total, item) => total + item.claims.length, 0);
    facts += (entry.facility.facts ?? []).length;
    aliases += (entry.facility.aliases ?? []).length;
  }

  const digest = createHash("sha256")
    .update(
      canonicalJson({
        facilities: planned.map((entry) => ({ ...entry.facility, publicationState: entry.publicationState })),
        relationships: plannedRelationships.map((entry) => entry.relationship),
      }),
    )
    .digest("hex");

  return {
    datasetName: document.datasetName,
    researchDocument: document.researchDocument,
    generatedAt: document.generatedAt,
    facilities: planned,
    relationships: plannedRelationships,
    errors,
    reviewCandidates,
    digest,
    counts: {
      facilities: planned.length,
      byCategory,
      published: planned.filter((entry) => entry.publicationState === "published").length,
      mapEligible: planned.filter((entry) => entry.mapEligible).length,
      evidence,
      claims,
      facts,
      aliases,
      relationships: plannedRelationships.length,
    },
  };
}
