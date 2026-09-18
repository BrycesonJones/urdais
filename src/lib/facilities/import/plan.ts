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
  AI_RELEVANCE_CLAIM_FIELDS,
  CITATION_CLASSES,
  COMPUTE_CATEGORIES,
  EVIDENCED_AI_RELEVANCE_STATES,
  FACILITY_VERIFICATION_HORIZON_DAYS,
  NON_PUBLISHABLE_LIFECYCLE_STATUSES,
  POSITIONING_CLAIM_FIELDS,
  SYMMETRIC_RELATIONSHIP_TYPES,
  citationClassOf,
  hasAdmissiblePositioning,
  isMapEligible,
  sourceTierOf,
  type CitationClass,
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
    reviewRequired: number;
    research: number;
    mapEligible: number;
    evidence: number;
    claims: number;
    facts: number;
    aliases: number;
    relationships: number;
    /** Distinct source URLs cited across the batch. */
    sourceUrls: number;
    /** Evidence records by citation class, so the rights picture is visible without a query. */
    byCitationClass: Record<CitationClass, number>;
    /** Evidence records by source tier, so the directory share of a batch is visible. */
    bySourceTier: Record<string, number>;
    /** Facilities by AI relevance, which is enrichment and never gates anything. */
    byAiRelevance: Record<string, number>;
    /** Evidence records whose source is on the rights register. */
    rightsReviewFlagged: number;
  };
};

export type PlanOptions = {
  /** Research keys already in the database, so a relationship may point outside the batch. */
  existingResearchKeys?: readonly string[];
  /** Today, for the staleness remark. Defaults to the current date. */
  today?: Date;
  /**
   * Candidates an earlier research pass examined and rejected. A batch that
   * re-adds one is not refused — new evidence is exactly how a rejection should
   * be overturned — but it is always remarked on, so the overturning is a
   * decision somebody made rather than a name quietly reappearing.
   */
  rejectedCandidates?: readonly { candidate: string; reason: string }[];
  /**
   * Sources whose intended use raises a rights or terms question. Ordinary
   * factual citation of a public primary or government document is not on this
   * list and is not meant to be; see docs/methodology/map-facilities.md §4.
   */
  rightsRegister?: readonly { domain: string; state: string; note: string }[];
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

/**
 * Two positions this close are worth a look. Not because proximity implies
 * identity — a campus and the station feeding it are neighbours by design — but
 * because a campus geocoded twice from two addresses lands a few hundred metres
 * apart, and that is the shape of an accidental duplicate. Two kilometres is
 * wide enough to catch a re-geocode and narrow enough that two genuine
 * facilities in one metro do not fill the queue.
 */
export const NEAR_COORDINATE_REVIEW_METRES = 2000;

/** Great-circle distance in metres. */
export function distanceMetres(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

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
      const positioningSources = facility.evidence.filter((item) =>
        item.claims.some((claim) => (POSITIONING_CLAIM_FIELDS as readonly string[]).includes(claim.field)),
      );
      if (positioningSources.length === 0) {
        errors.push({
          researchKey: facility.researchKey,
          code: "publication_needs_positioning_evidence",
          message: "asks to be published with no source that supports its location or coordinates",
        });
      } else if (!hasAdmissiblePositioning(positioningSources)) {
        // Methodology 2.0.0 section 4: directories find facilities, they do not
        // place dots. One directory entry is a lead; two directories built from
        // each other are one lead wearing two names, which is why the rule
        // counts publishers rather than rows.
        errors.push({
          researchKey: facility.researchKey,
          code: "publication_needs_admissible_positioning",
          message:
            "asks to be published on directory evidence alone; a public dot needs a primary or corroborating source, or two independent directories",
        });
      }
    }

    // ---- review candidates ----
    // A positive AI classification is a claim about the world, so it needs a
    // document. The negative and unknown states assert nothing and need none —
    // which is the whole point of keeping them apart.
    const aiRelevance = facility.aiRelevance ?? "unknown";
    if ((EVIDENCED_AI_RELEVANCE_STATES as readonly string[]).includes(aiRelevance)) {
      const stated = facility.evidence.some((item) =>
        item.claims.some((claim) => (AI_RELEVANCE_CLAIM_FIELDS as readonly string[]).includes(claim.field)),
      );
      if (!stated) {
        errors.push({
          researchKey: facility.researchKey,
          code: "ai_relevance_needs_evidence",
          message: `claims AI relevance "${aiRelevance}" with no cited source that states it`,
        });
      }
    }
    if (facility.category === "data_center" && aiRelevance === "unknown") {
      reviewCandidates.push({
        researchKey: facility.researchKey,
        code: "ai_relevance_unassessed",
        message: "is a data center whose AI relevance nobody has assessed; this never blocks publication",
      });
    }

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

    for (const rejected of options.rejectedCandidates ?? []) {
      if (nameSimilarity(facility.canonicalName, rejected.candidate) >= NAME_SIMILARITY_REVIEW_THRESHOLD) {
        reviewCandidates.push({
          researchKey: facility.researchKey,
          code: "previously_rejected",
          message: `resembles the rejected candidate "${rejected.candidate}" (${rejected.reason}); it may only be added on evidence that answers the rejection`,
        });
      }
    }

    for (const evidence of facility.evidence) {
      const flagged = (options.rightsRegister ?? []).find((entry) => evidence.url.toLowerCase().includes(entry.domain.toLowerCase()));
      if (flagged && flagged.state !== "clear") {
        reviewCandidates.push({
          researchKey: facility.researchKey,
          code: "source_rights_review",
          message: `cites ${flagged.domain} (${flagged.state}): ${flagged.note}`,
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

      const leftAt =
        left.location.latitude !== null && left.location.latitude !== undefined && left.location.longitude !== null && left.location.longitude !== undefined
          ? { latitude: left.location.latitude, longitude: left.location.longitude }
          : null;
      const rightAt =
        right.location.latitude !== null && right.location.latitude !== undefined && right.location.longitude !== null && right.location.longitude !== undefined
          ? { latitude: right.location.latitude, longitude: right.location.longitude }
          : null;

      if (leftAt && rightAt && leftAt.latitude === rightAt.latitude && leftAt.longitude === rightAt.longitude) {
        reviewCandidates.push({
          researchKey: left.researchKey,
          code: "shared_coordinates",
          message: `shares its position with ${right.researchKey}; distinct entities at one site are expected and are not merged`,
        });
      } else if (leftAt && rightAt) {
        const metres = distanceMetres(leftAt, rightAt);
        if (metres <= NEAR_COORDINATE_REVIEW_METRES) {
          reviewCandidates.push({
            researchKey: left.researchKey,
            code: "near_coordinates",
            message: `sits ${Math.round(metres)} m from ${right.researchKey}; close enough to be one campus geocoded twice, and not merged on that`,
          });
        }
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
  const sourceUrls = new Set<string>();
  const byCitationClass = Object.fromEntries(CITATION_CLASSES.map((cls) => [cls, 0])) as Record<CitationClass, number>;
  const bySourceTier: Record<string, number> = { tier1: 0, tier2: 0, tier3: 0 };
  const byAiRelevance: Record<string, number> = { documented_ai: 0, ai_capable_or_high_density: 0, no_documented_ai: 0, unknown: 0 };
  for (const entry of planned) {
    byCategory[entry.facility.category] += 1;
    evidence += entry.facility.evidence.length;
    claims += entry.facility.evidence.reduce((total, item) => total + item.claims.length, 0);
    facts += (entry.facility.facts ?? []).length;
    aliases += (entry.facility.aliases ?? []).length;
    const relevance = entry.facility.aiRelevance ?? "unknown";
    byAiRelevance[relevance] = (byAiRelevance[relevance] ?? 0) + 1;
    for (const item of entry.facility.evidence) {
      sourceUrls.add(item.url);
      byCitationClass[citationClassOf(item.documentType)] += 1;
      const tier = `tier${sourceTierOf(item.documentType)}`;
      bySourceTier[tier] = (bySourceTier[tier] ?? 0) + 1;
    }
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
      reviewRequired: planned.filter((entry) => entry.publicationState === "review_required").length,
      research: planned.filter((entry) => entry.publicationState === "research").length,
      mapEligible: planned.filter((entry) => entry.mapEligible).length,
      evidence,
      claims,
      facts,
      aliases,
      relationships: plannedRelationships.length,
      sourceUrls: sourceUrls.size,
      byCitationClass,
      bySourceTier,
      byAiRelevance,
      rightsReviewFlagged: reviewCandidates.filter((entry) => entry.code === "source_rights_review").length,
    },
  };
}
