/**
 * The facility import contract: the machine-readable form of researched
 * facility data.
 *
 * The research package is Markdown, and it stays Markdown — a reviewer reads
 * prose, weighs a permit against a press release, and writes down what is still
 * unresolved. None of that survives a schema. What crosses into the database is
 * this document: a typed, versioned projection of the reviewed research, one
 * object per facility plus the edges between them.
 *
 * ## The unknown rule
 *
 * A value Urdais does not know is `null`, or the key is absent; the two are
 * identical and both are accepted. What is never accepted is a stand-in: an
 * empty string, a zero, "N/A", "unknown", a city centroid passed off as a
 * position. Every validation below exists to make the absence survive the trip
 * rather than being filled in somewhere between the researcher and the map.
 *
 * ## Versioning
 *
 * `contractVersion` is checked against a closed set, never a range. A document
 * written to a later shape is refused rather than partially read, because the
 * failure mode of a tolerant reader here is a silently dropped field — a
 * source, a relationship, a coordinate precision — and a dropped field is what
 * turns a sourced dataset back into an assertion. An earlier shape is read,
 * because every /1 document is a valid /2 document; a /1 document that uses a
 * /2 field is refused, because that is the dropped-field case again.
 */

import {
  isAiRelevance,
  isAliasKind,
  isCoordinateMethod,
  isCoordinatePrecision,
  isEvidenceClaimField,
  isEvidenceDocumentType,
  isEvidenceVerificationState,
  isFacilityCategory,
  isFacilityConfidence,
  isLifecycleStatus,
  isRelationshipType,
  type AiRelevance,
  type CoordinateMethod,
  type CoordinatePrecision,
  type EvidenceClaimField,
  type EvidenceDocumentType,
  type EvidenceVerificationState,
  type FacilityAliasKind,
  type FacilityCategory,
  type FacilityConfidence,
  type FacilityLifecycleStatus,
  type FacilityRelationshipType,
} from "@/lib/facilities/domain";

/** The current contract version. Documents using any field added in it must declare it. */
export const FACILITY_IMPORT_CONTRACT_VERSION = "urdais.map.facility-import/2" as const;

/** The contract version this build also still reads. */
export const FACILITY_IMPORT_CONTRACT_VERSION_1 = "urdais.map.facility-import/1" as const;

/**
 * Every version this build accepts.
 *
 * Two, not one, and the asymmetry is the point. The exact-version check exists
 * so that a document written to a *later* shape is refused rather than
 * partially read — a silently dropped source or relationship is what turns a
 * sourced dataset into an asserted one. A strictly *earlier* shape carries that
 * risk in no direction: every /1 document is a valid /2 document, because
 * everything /2 added is optional. So /1 is read, and /3 is refused.
 *
 * What is not allowed is a /1 document that uses a /2 field. That would mean a
 * /1 reader had dropped it, which is exactly the failure the check defends
 * against, so it is an error naming the field and the version it needs.
 */
export const SUPPORTED_FACILITY_IMPORT_CONTRACT_VERSIONS = [
  FACILITY_IMPORT_CONTRACT_VERSION_1,
  FACILITY_IMPORT_CONTRACT_VERSION,
] as const;
export type FacilityImportContractVersion = (typeof SUPPORTED_FACILITY_IMPORT_CONTRACT_VERSIONS)[number];

/** Fields and vocabulary added in /2; a /1 document may not use them. */
const VERSION_2_FIELDS = ["aiRelevance"] as const;
const VERSION_2_DOCUMENT_TYPES: readonly string[] = ["property_record", "facility_directory"];
const VERSION_2_CLAIM_FIELDS: readonly string[] = ["ai_relevance", "cooling"];

/**
 * The publication state an import may ask for. `withdrawn` is not here: taking
 * a facility off the map is an operator decision about a live surface, not
 * something a dataset file asserts.
 */
export const REQUESTABLE_PUBLICATION_STATES = ["research", "review_required", "published"] as const;
export type RequestedPublicationState = (typeof REQUESTABLE_PUBLICATION_STATES)[number];

export type ContractAlias = {
  alias: string;
  kind?: FacilityAliasKind | null;
  /** Issuing body for a source identifier — a permit's regulator, a filing's registry. */
  authority?: string | null;
};

export type ContractClaim = {
  field: EvidenceClaimField;
  /** What the source says, in its own terms. Not a normalized value. */
  statement: string;
};

export type ContractEvidence = {
  publisher: string;
  title: string;
  url: string;
  documentType: EvidenceDocumentType;
  publishedOn?: string | null;
  verificationState?: EvidenceVerificationState | null;
  verifiedAt?: string | null;
  verificationNotes?: string | null;
  claims: readonly ContractClaim[];
};

export type ContractFact = {
  key: string;
  numericValue?: number | null;
  textValue?: string | null;
  unit?: string | null;
  /** Must match the `url` of one of this facility's evidence records. */
  evidenceUrl: string;
  notes?: string | null;
};

export type ContractLocation = {
  streetAddress?: string | null;
  locality?: string | null;
  adminArea?: string | null;
  countryName?: string | null;
  /** ISO 3166-1 alpha-2. */
  countryCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  coordinatePrecision?: CoordinatePrecision | null;
  coordinateMethod?: CoordinateMethod | null;
  coordinateNotes?: string | null;
};

export type ContractLifecycle = {
  status?: FacilityLifecycleStatus | null;
  announcedDate?: string | null;
  constructionStartDate?: string | null;
  operationalDate?: string | null;
};

export type ContractQuality = {
  confidence: FacilityConfidence;
  lastVerifiedDate?: string | null;
  /** Internal. Carried into the database and never served publicly. */
  reviewNotes?: readonly string[] | null;
};

export type ContractFacility = {
  researchKey: string;
  canonicalName: string;
  category: FacilityCategory;
  ownerName?: string | null;
  operatorName?: string | null;
  aliases?: readonly ContractAlias[] | null;
  location: ContractLocation;
  lifecycle?: ContractLifecycle | null;
  facts?: readonly ContractFact[] | null;
  evidence: readonly ContractEvidence[];
  quality: ContractQuality;
  /**
   * What is known about this facility's relationship to AI (contract /2).
   * Enrichment, never an inclusion gate: absent means `unknown`, and a data
   * centre with no AI evidence at all is an ordinary, publishable record.
   */
  aiRelevance?: AiRelevance | null;
  /** What the dataset asks for. The importer still refuses it if the record does not qualify. */
  requestedPublicationState: RequestedPublicationState;
};

export type ContractRelationship = {
  fromResearchKey: string;
  toResearchKey: string;
  type: FacilityRelationshipType;
  /** The document behind the edge; must match evidence on the `from` facility. */
  evidenceUrl?: string | null;
  notes?: string | null;
};

export type FacilityImportDocument = {
  contractVersion: FacilityImportContractVersion;
  datasetName: string;
  /** Where the reviewed research this was projected from lives. */
  researchDocument: string;
  generatedAt: string;
  facilities: readonly ContractFacility[];
  relationships: readonly ContractRelationship[];
};

/** One thing wrong with a document, addressed by a path a human can follow back to the file. */
export type ContractIssue = { path: string; message: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RESEARCH_KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FACT_KEY = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const COUNTRY_CODE = /^[A-Z]{2}$/;

/** Values a researcher might reach for to mean "not known". None of them may stand for null. */
const PLACEHOLDER_TEXT = new Set(["n/a", "na", "none", "null", "unknown", "tbd", "-", "--"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads an optional string. Absent and null are the same; blank or placeholder text is an error. */
function optionalText(value: unknown, path: string, issues: ContractIssue[]): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    issues.push({ path, message: `expected a string or null, received ${typeof value}` });
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    issues.push({ path, message: "is an empty string; an unknown value is null, never blank" });
    return null;
  }
  if (PLACEHOLDER_TEXT.has(trimmed.toLowerCase())) {
    issues.push({ path, message: `is the placeholder "${trimmed}"; an unknown value is null` });
    return null;
  }
  return trimmed;
}

function requiredText(value: unknown, path: string, issues: ContractIssue[]): string {
  const text = optionalText(value, path, issues);
  if (text === null) {
    if (value === undefined || value === null) issues.push({ path, message: "is required" });
    return "";
  }
  return text;
}

function optionalDate(value: unknown, path: string, issues: ContractIssue[]): string | null {
  const text = optionalText(value, path, issues);
  if (text === null) return null;
  if (!ISO_DATE.test(text)) {
    issues.push({ path, message: `"${text}" is not an ISO date (YYYY-MM-DD)` });
    return null;
  }
  // Rejects 2026-02-30 and friends, which match the pattern and are not days.
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    issues.push({ path, message: `"${text}" is not a real calendar date` });
    return null;
  }
  return text;
}

function optionalNumber(value: unknown, path: string, issues: ContractIssue[]): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({ path, message: `expected a finite number or null, received ${JSON.stringify(value)}` });
    return null;
  }
  return value;
}

function parseAlias(raw: unknown, path: string, issues: ContractIssue[]): ContractAlias | null {
  if (!isRecord(raw)) {
    issues.push({ path, message: "expected an object" });
    return null;
  }
  const alias = requiredText(raw.alias, `${path}.alias`, issues);
  const kindRaw = raw.kind ?? null;
  if (kindRaw !== null && !isAliasKind(kindRaw)) {
    issues.push({ path: `${path}.kind`, message: `"${String(kindRaw)}" is not an alias kind` });
    return null;
  }
  if (alias === "") return null;
  return { alias, kind: (kindRaw as FacilityAliasKind | null) ?? "alias", authority: optionalText(raw.authority, `${path}.authority`, issues) };
}

function parseClaim(raw: unknown, path: string, issues: ContractIssue[]): ContractClaim | null {
  if (!isRecord(raw)) {
    issues.push({ path, message: "expected an object" });
    return null;
  }
  if (!isEvidenceClaimField(raw.field)) {
    issues.push({ path: `${path}.field`, message: `"${String(raw.field)}" is not a claim field` });
    return null;
  }
  const statement = requiredText(raw.statement, `${path}.statement`, issues);
  if (statement === "") return null;
  return { field: raw.field, statement };
}

function parseEvidence(raw: unknown, path: string, issues: ContractIssue[]): ContractEvidence | null {
  if (!isRecord(raw)) {
    issues.push({ path, message: "expected an object" });
    return null;
  }
  const publisher = requiredText(raw.publisher, `${path}.publisher`, issues);
  const title = requiredText(raw.title, `${path}.title`, issues);
  const url = requiredText(raw.url, `${path}.url`, issues);
  if (url !== "" && !/^https?:\/\//.test(url)) {
    issues.push({ path: `${path}.url`, message: `"${url}" is not an http(s) URL` });
  }
  if (!isEvidenceDocumentType(raw.documentType)) {
    issues.push({ path: `${path}.documentType`, message: `"${String(raw.documentType)}" is not a document type` });
  }
  const verificationRaw = raw.verificationState ?? null;
  if (verificationRaw !== null && !isEvidenceVerificationState(verificationRaw)) {
    issues.push({ path: `${path}.verificationState`, message: `"${String(verificationRaw)}" is not a verification state` });
  }
  const verifiedAt = optionalText(raw.verifiedAt, `${path}.verifiedAt`, issues);
  if (verificationRaw === "human_verified" && verifiedAt === null) {
    issues.push({ path: `${path}.verifiedAt`, message: "human_verified evidence must say when it was verified" });
  }

  const claimsRaw = raw.claims;
  if (!Array.isArray(claimsRaw) || claimsRaw.length === 0) {
    issues.push({ path: `${path}.claims`, message: "evidence must list at least one claim it supports" });
    return null;
  }
  const claims = claimsRaw.map((claim, index) => parseClaim(claim, `${path}.claims[${index}]`, issues)).filter((c): c is ContractClaim => c !== null);
  if (publisher === "" || title === "" || url === "" || !isEvidenceDocumentType(raw.documentType)) return null;

  return {
    publisher,
    title,
    url,
    documentType: raw.documentType,
    publishedOn: optionalDate(raw.publishedOn, `${path}.publishedOn`, issues),
    verificationState: (verificationRaw as EvidenceVerificationState | null) ?? "unverified",
    verifiedAt,
    verificationNotes: optionalText(raw.verificationNotes, `${path}.verificationNotes`, issues),
    claims,
  };
}

function parseFact(raw: unknown, path: string, issues: ContractIssue[]): ContractFact | null {
  if (!isRecord(raw)) {
    issues.push({ path, message: "expected an object" });
    return null;
  }
  const key = requiredText(raw.key, `${path}.key`, issues);
  if (key !== "" && !FACT_KEY.test(key)) {
    issues.push({ path: `${path}.key`, message: `"${key}" is not a snake_case fact key` });
  }
  const numericValue = optionalNumber(raw.numericValue, `${path}.numericValue`, issues);
  const textValue = optionalText(raw.textValue, `${path}.textValue`, issues);
  if ((numericValue === null) === (textValue === null)) {
    issues.push({ path, message: "a fact carries exactly one of numericValue and textValue" });
    return null;
  }
  const unit = optionalText(raw.unit, `${path}.unit`, issues);
  if (unit !== null && numericValue === null) {
    issues.push({ path: `${path}.unit`, message: "a unit belongs to a number, not to text" });
  }
  const evidenceUrl = requiredText(raw.evidenceUrl, `${path}.evidenceUrl`, issues);
  if (key === "" || evidenceUrl === "") return null;
  return { key, numericValue, textValue, unit, evidenceUrl, notes: optionalText(raw.notes, `${path}.notes`, issues) };
}

function parseLocation(raw: unknown, path: string, issues: ContractIssue[]): ContractLocation {
  if (raw === undefined || raw === null) {
    issues.push({ path, message: "is required; a facility without a location block cannot be placed or refused on purpose" });
    return {};
  }
  if (!isRecord(raw)) {
    issues.push({ path, message: "expected an object" });
    return {};
  }
  const latitude = optionalNumber(raw.latitude, `${path}.latitude`, issues);
  const longitude = optionalNumber(raw.longitude, `${path}.longitude`, issues);
  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    issues.push({ path: `${path}.latitude`, message: `${latitude} is outside −90…90` });
  }
  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    issues.push({ path: `${path}.longitude`, message: `${longitude} is outside −180…180` });
  }
  if ((latitude === null) !== (longitude === null)) {
    issues.push({ path, message: "latitude and longitude are a pair; one alone is not a position" });
  }
  const precisionRaw = raw.coordinatePrecision ?? null;
  if (precisionRaw !== null && !isCoordinatePrecision(precisionRaw)) {
    issues.push({ path: `${path}.coordinatePrecision`, message: `"${String(precisionRaw)}" is not a coordinate precision` });
  }
  if (latitude !== null && precisionRaw === null) {
    issues.push({ path: `${path}.coordinatePrecision`, message: "a position without a stated precision cannot be judged" });
  }
  const methodRaw = raw.coordinateMethod ?? null;
  if (methodRaw !== null && !isCoordinateMethod(methodRaw)) {
    issues.push({ path: `${path}.coordinateMethod`, message: `"${String(methodRaw)}" is not a coordinate method` });
  }
  const countryCode = optionalText(raw.countryCode, `${path}.countryCode`, issues);
  if (countryCode !== null && !COUNTRY_CODE.test(countryCode)) {
    issues.push({ path: `${path}.countryCode`, message: `"${countryCode}" is not an ISO 3166-1 alpha-2 code` });
  }

  return {
    streetAddress: optionalText(raw.streetAddress, `${path}.streetAddress`, issues),
    locality: optionalText(raw.locality, `${path}.locality`, issues),
    adminArea: optionalText(raw.adminArea, `${path}.adminArea`, issues),
    countryName: optionalText(raw.countryName, `${path}.countryName`, issues),
    countryCode,
    latitude,
    longitude,
    coordinatePrecision: isCoordinatePrecision(precisionRaw) ? precisionRaw : null,
    coordinateMethod: isCoordinateMethod(methodRaw) ? methodRaw : null,
    coordinateNotes: optionalText(raw.coordinateNotes, `${path}.coordinateNotes`, issues),
  };
}

function parseLifecycle(raw: unknown, path: string, issues: ContractIssue[]): ContractLifecycle {
  if (raw === undefined || raw === null) return {};
  if (!isRecord(raw)) {
    issues.push({ path, message: "expected an object" });
    return {};
  }
  const statusRaw = raw.status ?? null;
  if (statusRaw !== null && !isLifecycleStatus(statusRaw)) {
    issues.push({ path: `${path}.status`, message: `"${String(statusRaw)}" is not a lifecycle status` });
  }
  const announcedDate = optionalDate(raw.announcedDate, `${path}.announcedDate`, issues);
  const constructionStartDate = optionalDate(raw.constructionStartDate, `${path}.constructionStartDate`, issues);
  const operationalDate = optionalDate(raw.operationalDate, `${path}.operationalDate`, issues);
  // A facility cannot open before it is announced or before work starts. Where
  // both are known and ordered wrongly, one of them is wrong.
  if (announcedDate && operationalDate && operationalDate < announcedDate) {
    issues.push({ path: `${path}.operationalDate`, message: `${operationalDate} precedes the announcement on ${announcedDate}` });
  }
  if (constructionStartDate && operationalDate && operationalDate < constructionStartDate) {
    issues.push({ path: `${path}.operationalDate`, message: `${operationalDate} precedes construction starting on ${constructionStartDate}` });
  }
  return {
    status: isLifecycleStatus(statusRaw) ? statusRaw : null,
    announcedDate,
    constructionStartDate,
    operationalDate,
  };
}

function parseQuality(raw: unknown, path: string, issues: ContractIssue[]): ContractQuality {
  if (!isRecord(raw)) {
    issues.push({ path, message: "is required and must be an object" });
    return { confidence: "low" };
  }
  if (!isFacilityConfidence(raw.confidence)) {
    issues.push({ path: `${path}.confidence`, message: `"${String(raw.confidence)}" is not high, medium or low` });
  }
  const notesRaw = raw.reviewNotes ?? [];
  const reviewNotes: string[] = [];
  if (!Array.isArray(notesRaw)) {
    issues.push({ path: `${path}.reviewNotes`, message: "expected an array of strings" });
  } else {
    notesRaw.forEach((note, index) => {
      const text = optionalText(note, `${path}.reviewNotes[${index}]`, issues);
      if (text !== null) reviewNotes.push(text);
    });
  }
  return {
    confidence: isFacilityConfidence(raw.confidence) ? raw.confidence : "low",
    lastVerifiedDate: optionalDate(raw.lastVerifiedDate, `${path}.lastVerifiedDate`, issues),
    reviewNotes,
  };
}

function parseFacility(raw: unknown, path: string, issues: ContractIssue[]): ContractFacility | null {
  if (!isRecord(raw)) {
    issues.push({ path, message: "expected an object" });
    return null;
  }
  const researchKey = requiredText(raw.researchKey, `${path}.researchKey`, issues);
  if (researchKey !== "" && !RESEARCH_KEY.test(researchKey)) {
    issues.push({ path: `${path}.researchKey`, message: `"${researchKey}" is not a kebab-case research key` });
  }
  const canonicalName = requiredText(raw.canonicalName, `${path}.canonicalName`, issues);
  if (!isFacilityCategory(raw.category)) {
    issues.push({
      path: `${path}.category`,
      message: `"${String(raw.category)}" is not one of the four public categories (note: compute_cluster was renamed gpu_compute_cluster)`,
    });
  }

  const aliasesRaw = raw.aliases ?? [];
  const aliases: ContractAlias[] = [];
  if (!Array.isArray(aliasesRaw)) {
    issues.push({ path: `${path}.aliases`, message: "expected an array" });
  } else {
    aliasesRaw.forEach((alias, index) => {
      const parsed = parseAlias(alias, `${path}.aliases[${index}]`, issues);
      if (parsed) aliases.push(parsed);
    });
  }

  const evidenceRaw = raw.evidence;
  const evidence: ContractEvidence[] = [];
  if (!Array.isArray(evidenceRaw) || evidenceRaw.length === 0) {
    issues.push({ path: `${path}.evidence`, message: "a facility carries at least one source document" });
  } else {
    evidenceRaw.forEach((item, index) => {
      const parsed = parseEvidence(item, `${path}.evidence[${index}]`, issues);
      if (parsed) evidence.push(parsed);
    });
    const urls = new Set<string>();
    for (const item of evidence) {
      if (urls.has(item.url)) issues.push({ path: `${path}.evidence`, message: `cites ${item.url} more than once` });
      urls.add(item.url);
    }
  }

  const factsRaw = raw.facts ?? [];
  const facts: ContractFact[] = [];
  if (!Array.isArray(factsRaw)) {
    issues.push({ path: `${path}.facts`, message: "expected an array" });
  } else {
    factsRaw.forEach((fact, index) => {
      const parsed = parseFact(fact, `${path}.facts[${index}]`, issues);
      if (parsed) facts.push(parsed);
    });
    const keys = new Set<string>();
    for (const fact of facts) {
      if (keys.has(fact.key)) issues.push({ path: `${path}.facts`, message: `states ${fact.key} more than once` });
      keys.add(fact.key);
      // The rule the facts table exists for: a number with no document behind it
      // is not a fact Urdais holds.
      if (!evidence.some((item) => item.url === fact.evidenceUrl)) {
        issues.push({ path: `${path}.facts`, message: `fact ${fact.key} cites ${fact.evidenceUrl}, which is not evidence on this facility` });
      }
    }
  }

  const requested = raw.requestedPublicationState;
  if (typeof requested !== "string" || !(REQUESTABLE_PUBLICATION_STATES as readonly string[]).includes(requested)) {
    issues.push({
      path: `${path}.requestedPublicationState`,
      message: `"${String(requested)}" is not research, review_required or published`,
    });
  }

  const location = parseLocation(raw.location, `${path}.location`, issues);
  const lifecycle = parseLifecycle(raw.lifecycle, `${path}.lifecycle`, issues);
  const quality = parseQuality(raw.quality, `${path}.quality`, issues);

  // Enrichment, and optional by design: a data centre exists whether or not
  // anybody has looked at what it runs. Absent means `unknown`.
  const aiRelevanceRaw = raw.aiRelevance ?? null;
  if (aiRelevanceRaw !== null && !isAiRelevance(aiRelevanceRaw)) {
    issues.push({ path: `${path}.aiRelevance`, message: `"${String(aiRelevanceRaw)}" is not an AI relevance state` });
  }

  if (researchKey === "" || canonicalName === "" || !isFacilityCategory(raw.category)) return null;
  if (typeof requested !== "string" || !(REQUESTABLE_PUBLICATION_STATES as readonly string[]).includes(requested)) return null;

  return {
    researchKey,
    canonicalName,
    category: raw.category as FacilityCategory,
    ownerName: optionalText(raw.ownerName, `${path}.ownerName`, issues),
    operatorName: optionalText(raw.operatorName, `${path}.operatorName`, issues),
    aliases,
    location,
    lifecycle,
    facts,
    evidence,
    quality,
    aiRelevance: isAiRelevance(aiRelevanceRaw) ? aiRelevanceRaw : null,
    requestedPublicationState: requested as RequestedPublicationState,
  };
}

/**
 * Fields and vocabulary a /1 document may not use. Reading them out of a /1
 * document would be the silent-drop failure in reverse: the file would say one
 * thing and the database hold another, with the version claiming they agreed.
 */
function checkVersionedFields(raw: Record<string, unknown>, declared: string, issues: ContractIssue[]): void {
  if (declared !== FACILITY_IMPORT_CONTRACT_VERSION_1) return;
  const facilities = Array.isArray(raw.facilities) ? raw.facilities : [];
  facilities.forEach((facility, index) => {
    if (!isRecord(facility)) return;
    for (const field of VERSION_2_FIELDS) {
      if (facility[field] !== undefined) {
        issues.push({
          path: `$.facilities[${index}].${field}`,
          message: `is a ${FACILITY_IMPORT_CONTRACT_VERSION} field; a document using it must declare that version`,
        });
      }
    }
    const evidence = Array.isArray(facility.evidence) ? facility.evidence : [];
    evidence.forEach((item, evidenceIndex) => {
      if (!isRecord(item)) return;
      if (typeof item.documentType === "string" && VERSION_2_DOCUMENT_TYPES.includes(item.documentType)) {
        issues.push({
          path: `$.facilities[${index}].evidence[${evidenceIndex}].documentType`,
          message: `"${item.documentType}" was added in ${FACILITY_IMPORT_CONTRACT_VERSION}; a document using it must declare that version`,
        });
      }
      const claims = Array.isArray(item.claims) ? item.claims : [];
      claims.forEach((claim, claimIndex) => {
        if (!isRecord(claim)) return;
        if (typeof claim.field === "string" && VERSION_2_CLAIM_FIELDS.includes(claim.field)) {
          issues.push({
            path: `$.facilities[${index}].evidence[${evidenceIndex}].claims[${claimIndex}].field`,
            message: `"${claim.field}" was added in ${FACILITY_IMPORT_CONTRACT_VERSION}; a document using it must declare that version`,
          });
        }
      });
    });
  });
}

function parseRelationship(raw: unknown, path: string, issues: ContractIssue[]): ContractRelationship | null {
  if (!isRecord(raw)) {
    issues.push({ path, message: "expected an object" });
    return null;
  }
  const fromResearchKey = requiredText(raw.fromResearchKey, `${path}.fromResearchKey`, issues);
  const toResearchKey = requiredText(raw.toResearchKey, `${path}.toResearchKey`, issues);
  if (!isRelationshipType(raw.type)) {
    issues.push({ path: `${path}.type`, message: `"${String(raw.type)}" is not a relationship type` });
    return null;
  }
  if (fromResearchKey !== "" && fromResearchKey === toResearchKey) {
    issues.push({ path, message: `relates ${fromResearchKey} to itself` });
    return null;
  }
  if (fromResearchKey === "" || toResearchKey === "") return null;
  return {
    fromResearchKey,
    toResearchKey,
    type: raw.type as FacilityRelationshipType,
    evidenceUrl: optionalText(raw.evidenceUrl, `${path}.evidenceUrl`, issues),
    notes: optionalText(raw.notes, `${path}.notes`, issues),
  };
}

/**
 * Structural validation: is this a document of this contract version, and is
 * every field the shape and vocabulary it claims to be?
 *
 * Semantic validation — duplicate keys, relationship targets, whether a record
 * qualifies for the publication it asks for — happens next, in the import plan,
 * because those questions are about the batch rather than about a field.
 */
export function parseFacilityImportDocument(raw: unknown): { document: FacilityImportDocument | null; issues: readonly ContractIssue[] } {
  const issues: ContractIssue[] = [];
  if (!isRecord(raw)) return { document: null, issues: [{ path: "$", message: "the import document is not an object" }] };

  if (typeof raw.contractVersion !== "string" || !(SUPPORTED_FACILITY_IMPORT_CONTRACT_VERSIONS as readonly string[]).includes(raw.contractVersion)) {
    return {
      document: null,
      issues: [
        {
          path: "$.contractVersion",
          message: `expected one of ${SUPPORTED_FACILITY_IMPORT_CONTRACT_VERSIONS.map((version) => `"${version}"`).join(", ")}, received ${JSON.stringify(raw.contractVersion)}; this build reads a closed set of versions and will not partially read a later one`,
        },
      ],
    };
  }
  const declaredVersion = raw.contractVersion as FacilityImportContractVersion;
  checkVersionedFields(raw, declaredVersion, issues);

  const datasetName = requiredText(raw.datasetName, "$.datasetName", issues);
  const researchDocument = requiredText(raw.researchDocument, "$.researchDocument", issues);
  const generatedAt = optionalDate(raw.generatedAt, "$.generatedAt", issues);
  if (generatedAt === null) issues.push({ path: "$.generatedAt", message: "is required" });

  const facilitiesRaw = raw.facilities;
  const facilities: ContractFacility[] = [];
  if (!Array.isArray(facilitiesRaw)) {
    issues.push({ path: "$.facilities", message: "expected an array" });
  } else {
    facilitiesRaw.forEach((facility, index) => {
      const parsed = parseFacility(facility, `$.facilities[${index}]`, issues);
      if (parsed) facilities.push(parsed);
    });
  }

  const relationshipsRaw = raw.relationships ?? [];
  const relationships: ContractRelationship[] = [];
  if (!Array.isArray(relationshipsRaw)) {
    issues.push({ path: "$.relationships", message: "expected an array" });
  } else {
    relationshipsRaw.forEach((relationship, index) => {
      const parsed = parseRelationship(relationship, `$.relationships[${index}]`, issues);
      if (parsed) relationships.push(parsed);
    });
  }

  if (issues.length > 0) return { document: null, issues };

  return {
    document: {
      contractVersion: declaredVersion,
      datasetName,
      researchDocument,
      generatedAt: generatedAt as string,
      facilities,
      relationships,
    },
    issues: [],
  };
}
