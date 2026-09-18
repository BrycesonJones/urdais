/**
 * Projecting the research package into the import contract.
 *
 *   npm run map:project              writes data/map/facilities.v1.json + the rejection register
 *   npm run map:project -- --check   projects and reports, writing nothing
 *
 * The rules below are the whole of the transformation, and they are mechanical
 * on purpose. A projection that "improved" the research — filled a null from
 * model knowledge, promoted a hedge to a figure, guessed which source supported
 * which number — would produce a dataset that looks sourced and is not, and
 * nothing downstream could tell the difference. So every value here comes from
 * the Markdown, and where the Markdown does not support a field the field is
 * null and the record says so in its review notes.
 *
 * Three rules do real work:
 *
 *   **A claim's field is derived from the claim, against the record's own
 *   location strings.** The research lists what each source supports as free
 *   text; the contract needs a field per claim. Matching on the record's own
 *   locality, admin area and street — rather than on a general idea of what an
 *   address looks like — is what keeps a capacity claim from being read as a
 *   positioning one, which would let a facility publish on evidence that never
 *   placed it.
 *
 *   **A fact is emitted only when a source's claims state its value.** The
 *   research records facts on the facility and claims on the sources, and does
 *   not join them. So the projection joins them by value: a megawatt figure is
 *   emitted only if some source's claim list contains that number. Facts with
 *   no such source are dropped and counted, never attached to the nearest
 *   plausible document.
 *
 *   **The publication state is decided, not copied.** `map_ingest_ready` in the
 *   research is a necessary condition, not a sufficient one. A record publishes
 *   only if it is map-eligible, the researcher marked it ingest-ready, §8.6 does
 *   not name it, a source claim placed it, and — for power infrastructure — an
 *   evidenced supply edge reaches compute. Anything that fails a condition it
 *   could plausibly have met becomes `review_required`; anything that cannot be
 *   placed at all becomes `research`.
 *
 * The eighteen facilities curated by hand in Phase 2 are carried through
 * verbatim from `data/map/facilities-sample.v1.json`. They are the established
 * dataset; this script extends it rather than regenerating it.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  FACILITY_IMPORT_CONTRACT_VERSION,
  type ContractEvidence,
  type ContractFacility,
  type ContractFact,
  type ContractRelationship,
  type RequestedPublicationState,
} from "@/lib/facilities/contract";
import {
  COMPUTE_CATEGORIES,
  MAP_ELIGIBLE_PRECISIONS,
  isCoordinateMethod,
  isCoordinatePrecision,
  isEvidenceDocumentType,
  isFacilityCategory,
  isFacilityConfidence,
  isLifecycleStatus,
  isRelationshipType,
  type EvidenceClaimField,
  type FacilityRelationshipType,
} from "@/lib/facilities/domain";
import { parseResearchPackage, type ResearchFacility, type ResearchSource } from "./research-parser";

const RESEARCH_PATH = "URDAIS_MAP_RESEARCH_PHASE_1.md";
const CURATED_PATH = "data/map/facilities-sample.v1.json";
const DATASET_PATH = "data/map/facilities.v1.json";
const REJECTED_PATH = "data/map/rejected-candidates.v1.json";

/* ------------------------------------------------------------------ claims */

const LOCATION_WORDS = /\b(street|st\.|road|rd\.|avenue|ave\.|drive|dr\.|boulevard|blvd|circle|lane|way|highway|fm \d+|township|county|park|district|science park|dateline|address|located|site)\b/i;
const CAPACITY_WORDS = /\b(mw|gw|megawatt|gigawatt|acre|acres|sq ft|square feet|sqft|million|billion|\$|capex|funding|investment|critical it|it load|phase)\b/i;
const HARDWARE_WORDS = /\b(gpu|gpus|nvidia|amd|blackwell|hopper|gb200|gb300|h100|h200|gh200|mi300|a64fx|accelerator|superchip|supercomputer|exascale|cray|bullsequana|nm|n\d|a16|wafer|hbm|dram|nand|cleanroom|packaging|foundry|node|nvl72|liquid-cooled|rack)\b/i;
const RELATIONSHIP_WORDS = /\b(tenant|lease|leased|hosted|hosts|host|colocation|co-located|powered|power purchase|ppa|behind-the-meter|supply|supplies|agreement|partner|contracted|customer|occupan|landlord|copy-exact|model fab|sold|sale)\b/i;
const POWER_WORDS = /\b(nuclear|gas|solar|wind|battery|turbine|grid|ercot|pjm|substation|utility|transmission|interconnect|generation|reactor|combined cycle|zero-carbon|energy)\b/i;
const DATE_WORDS = /\b(19|20)\d{2}\b|\b(january|february|march|april|may|june|july|august|september|october|november|december)\b|\bgroundbreak|\bbroke ground|\bopened\b|\bonline\b|\bh[12] \d{4}\b|\b[12]h \d{4}\b|\bq[1-4]\b/i;
const STATUS_WORDS = /\b(operational|under construction|delivered|accepted|ready for service|rfs|complete|completed|commissioned|restart|in service|energized)\b/i;
const OWNER_WORDS = /\b(llc|inc\.|corporation|corp\.|gmbh|holdings|owner|owns|subsidiary|interest)\b/i;
const CONTACT_WORDS = /\bcontact\b|@/i;
/** A street address: a number followed by words, or a postal code. */
const STREET_ADDRESS = /^\d+[a-z]?\s+\S/i;
const POSTCODE = /\b\d{5}(-\d{4})?\b|\b\d{3}-\d{3}\b/;

function significantTokens(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/[,\s]+/)
    .map((token) => token.replace(/[^A-Za-z0-9-]/g, "").toLowerCase())
    .filter((token) => token.length >= 4 && !["united", "states", "data", "center", "centre", "campus", "null"].includes(token));
}

/**
 * The claim field, decided from the claim text against the record's own
 * location strings. Order is significant and is the rule as written: a claim
 * that names this facility's place is positional first, whatever else it also
 * mentions.
 */
export function classifyClaim(statement: string, facility: ResearchFacility): EvidenceClaimField {
  const text = statement.toLowerCase();
  const placeTokens = new Set([
    ...significantTokens(facility.location),
    ...significantTokens(facility.coordinateNotes?.split(".")[0] ?? null),
  ]);
  const namesThisPlace = [...placeTokens].some((token) => text.includes(token));

  if (namesThisPlace || LOCATION_WORDS.test(statement) || POSTCODE.test(statement)) {
    // A street address is what produced the pin; a place name locates the
    // facility without fixing it. Both satisfy the publication gate.
    return STREET_ADDRESS.test(statement.trim()) || POSTCODE.test(statement) ? "coordinates" : "location";
  }
  if (CONTACT_WORDS.test(statement)) return "contact";
  if (RELATIONSHIP_WORDS.test(statement)) return "compute_relationship";
  if (HARDWARE_WORDS.test(statement)) return "compute_hardware";
  if (POWER_WORDS.test(statement)) return "power";
  if (CAPACITY_WORDS.test(statement)) return "capacity";
  if (STATUS_WORDS.test(statement)) return "lifecycle_status";
  if (DATE_WORDS.test(statement)) return "dates";
  if (OWNER_WORDS.test(statement)) return "owner";
  return "identity";
}

/* ------------------------------------------------------------------- facts */

type FactSpec = { key: string; raw: string | null; unit?: string; numeric: boolean };

/** Every numeric form a source might have written the value in, for the join below. */
function numericNeedles(value: number): string[] {
  const needles = [String(value), value.toLocaleString("en-US")];
  if (value >= 1000 && value % 1000 === 0) needles.push(`${value / 1000}`);
  if (value >= 1_000_000 && value % 1_000_000 === 0) needles.push(`${value / 1_000_000}`);
  return needles;
}

/** The first source whose claims state this value, or null. Never the nearest plausible one. */
function sourceStating(facility: ResearchFacility, needles: readonly string[]): ResearchSource | null {
  for (const source of facility.sources) {
    const haystack = source.claims.join(" | ").toLowerCase();
    if (needles.some((needle) => needle !== "" && haystack.includes(needle.toLowerCase()))) return source;
  }
  return null;
}

function firstNumber(raw: string | null): number | null {
  if (raw === null) return null;
  const match = /^-?\d+(\.\d+)?/.exec(raw.replace(/,/g, "").trim());
  return match ? Number(match[0]) : null;
}

function factSpecs(facility: ResearchFacility): FactSpec[] {
  const f = facility.facilityFacts;
  const p = facility.powerFacts;
  const c = facility.computeFacts;
  return [
    { key: "facility_capacity_mw", raw: f.facility_MW ?? null, unit: "MW", numeric: true },
    { key: "critical_it_capacity_mw", raw: f.IT_MW ?? null, unit: "MW", numeric: true },
    { key: "building_count", raw: f.buildings ?? null, numeric: true },
    { key: "floor_area_sqft", raw: f.sqft ?? null, unit: "sqft", numeric: true },
    { key: "generation_capacity_mw", raw: p.MW ?? null, unit: "MW", numeric: true },
    { key: "generation_source", raw: p.source ?? null, numeric: false },
    { key: "grid_or_utility", raw: p.utility ?? null, numeric: false },
    { key: "accelerator_vendor", raw: c.vendor ?? null, numeric: false },
    { key: "accelerator_platform", raw: c.models ?? null, numeric: false },
    { key: "accelerator_count", raw: c.accelerator_count ?? null, numeric: true },
    { key: "process_nodes", raw: facility.processNodes, numeric: false },
    { key: "wafer_size", raw: facility.waferSize, numeric: false },
  ];
}

/** Facts the research states *and* a cited source's claims support. The rest are counted, not guessed. */
function projectFacts(facility: ResearchFacility): { facts: ContractFact[]; unsupported: string[] } {
  const facts: ContractFact[] = [];
  const unsupported: string[] = [];

  for (const spec of factSpecs(facility)) {
    if (spec.raw === null) continue;
    if (spec.numeric) {
      const numeric = firstNumber(spec.raw);
      if (numeric === null) {
        unsupported.push(`${spec.key} (${spec.raw}) is not a number`);
        continue;
      }
      const source = sourceStating(facility, numericNeedles(numeric));
      if (!source) {
        unsupported.push(`${spec.key} = ${numeric}`);
        continue;
      }
      const stated = /^\s*-?[\d.,]+\s*$/.test(spec.raw.trim());
      facts.push({
        key: spec.key,
        numericValue: numeric,
        unit: spec.unit ?? null,
        evidenceUrl: source.url,
        // Where the research wrote prose around the figure, the prose is the
        // source's own qualification and is kept beside the number.
        notes: stated ? null : `As stated in the research package: ${spec.raw}`,
      });
    } else {
      const source = sourceStating(facility, significantTokens(spec.raw).slice(0, 4));
      if (!source) {
        unsupported.push(`${spec.key} = ${spec.raw}`);
        continue;
      }
      facts.push({ key: spec.key, textValue: spec.raw, evidenceUrl: source.url, notes: null });
    }
  }
  return { facts, unsupported };
}

/* ------------------------------------------------------------- relationships */

/** The research's residual `related` type carries no semantics worth storing. */
const PROJECTED_RELATIONSHIP_TYPES = new Set(["hosted_by", "same_campus", "same_program", "supplies_power_to", "packaging_for"]);

function relationshipEvidenceUrl(from: ResearchFacility, targetName: string | null): string | null {
  const targetTokens = significantTokens(targetName);
  for (const source of from.sources) {
    const haystack = source.claims.join(" | ").toLowerCase();
    if (targetTokens.some((token) => haystack.includes(token))) return source.url;
  }
  for (const source of from.sources) {
    if (source.claims.some((claim) => RELATIONSHIP_WORDS.test(claim))) return source.url;
  }
  return null;
}

/* -------------------------------------------------------------- projection */

function projectEvidence(facility: ResearchFacility): { evidence: ContractEvidence[]; skipped: string[] } {
  const evidence: ContractEvidence[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const source of facility.sources) {
    if (!isEvidenceDocumentType(source.sourceType)) {
      skipped.push(`${source.url} has source type ${source.sourceType}`);
      continue;
    }
    if (seen.has(source.url)) {
      // The research cites one document twice on a record only where it split
      // the claims; merge them rather than dropping half.
      const existing = evidence.find((item) => item.url === source.url)!;
      const merged = new Set(existing.claims.map((claim) => `${claim.field} ${claim.statement}`));
      for (const statement of source.claims) {
        const field = classifyClaim(statement, facility);
        const key = `${field} ${statement}`;
        if (!merged.has(key)) {
          merged.add(key);
          (existing.claims as ContractEvidence["claims"][number][]).push({ field, statement });
        }
      }
      continue;
    }
    seen.add(source.url);

    const claims = source.claims.map((statement) => ({ field: classifyClaim(statement, facility), statement }));
    if (claims.length === 0) {
      // A source with nothing listed against it supports the facility's
      // identity and nothing else; that is what the research asserts by citing it.
      claims.push({ field: "identity" as EvidenceClaimField, statement: source.title });
    }
    const published = normalizeDate(source.publishedOn);
    if (source.publishedOn !== null && published.date === null) {
      skipped.push(`${source.url} has an unreadable publication date "${source.publishedOn}", recorded as unknown`);
    }
    evidence.push({
      publisher: source.organization,
      title: source.title,
      url: source.url,
      documentType: source.sourceType,
      publishedOn: published.date,
      verificationState: "unverified",
      verifiedAt: null,
      verificationNotes: null,
      claims,
    });
  }
  return { evidence, skipped };
}

const COUNTRY_CODES: Record<string, string> = {
  "United States": "US",
  Finland: "FI",
  Germany: "DE",
  Taiwan: "TW",
  Japan: "JP",
  "South Korea": "KR",
  Singapore: "SG",
  Ireland: "IE",
  Sweden: "SE",
  Australia: "AU",
  "United Kingdom": "GB",
  "United Arab Emirates": "AE",
  Israel: "IL",
  Netherlands: "NL",
  Canada: "CA",
  China: "CN",
  France: "FR",
  Italy: "IT",
  Spain: "ES",
  Poland: "PL",
  Norway: "NO",
  Denmark: "DK",
  India: "IN",
  Malaysia: "MY",
  Brazil: "BR",
};

/** The research writes location as "street, city, admin, country" with parts omitted where unknown. */
function splitLocation(facility: ResearchFacility): {
  streetAddress: string | null;
  locality: string | null;
  adminArea: string | null;
  countryName: string | null;
  countryCode: string | null;
} {
  const parts = (facility.location ?? "").split(",").map((part) => part.trim()).filter((part) => part !== "" && part !== "null");
  if (parts.length === 0) return { streetAddress: null, locality: null, adminArea: null, countryName: null, countryCode: null };
  const countryName = parts.length >= 2 ? parts[parts.length - 1]! : null;
  const rest = countryName === null ? parts : parts.slice(0, -1);
  const adminArea = rest.length >= 2 ? rest[rest.length - 1]! : null;
  const head = adminArea === null ? rest : rest.slice(0, -1);
  // A leading part that starts with a house number is a street; otherwise the
  // first part is the locality.
  const streetAddress = head.length >= 2 || (head.length === 1 && STREET_ADDRESS.test(head[0]!)) ? head.slice(0, -1).join(", ") || head[0]! : null;
  const locality = head.length === 0 ? null : streetAddress !== null && head.length >= 2 ? head[head.length - 1]! : streetAddress === null ? head[head.length - 1]! : null;
  return {
    streetAddress: streetAddress === locality ? null : streetAddress,
    locality,
    adminArea,
    countryName,
    countryCode: countryName ? (COUNTRY_CODES[countryName] ?? null) : null,
  };
}

export type ProjectionNote = { researchKey: string; note: string };

export type ProjectionResult = {
  facilities: ContractFacility[];
  relationships: ContractRelationship[];
  /** What the projection could not carry, so it can be reported rather than lost. */
  notes: ProjectionNote[];
};

export function projectResearch(markdown: string, curated: readonly ContractFacility[], curatedRelationships: readonly ContractRelationship[]): ProjectionResult {
  const pkg = parseResearchPackage(markdown);
  const notes: ProjectionNote[] = [];
  const curatedKeys = new Set(curated.map((facility) => facility.researchKey));
  const byKey = new Map(pkg.facilities.map((facility) => [facility.researchKey, facility]));

  // ---- relationships first: the power rule needs them to decide publication.
  const relationships: ContractRelationship[] = [...curatedRelationships];
  const seen = new Set(
    curatedRelationships.map((relationship) =>
      ["same_campus", "same_program"].includes(relationship.type)
        ? `${relationship.type}:${[relationship.fromResearchKey, relationship.toResearchKey].sort().join("<->")}`
        : `${relationship.type}:${relationship.fromResearchKey}->${relationship.toResearchKey}`,
    ),
  );

  for (const edge of pkg.relationships) {
    if (!PROJECTED_RELATIONSHIP_TYPES.has(edge.type) || !isRelationshipType(edge.type)) continue;
    const from = byKey.get(edge.from);
    const to = byKey.get(edge.to);
    if (!from) continue;
    if (!to) {
      // §5 keeps unmapped offtakers as narrative entities rather than inventing
      // facility ids for them. Those edges cannot be stored.
      notes.push({ researchKey: edge.from, note: `${edge.type} → ${edge.to}: the target is not a researched facility, so the edge is not projected` });
      continue;
    }
    const type = edge.type as FacilityRelationshipType;
    const key = ["same_campus", "same_program"].includes(type)
      ? `${type}:${[edge.from, edge.to].sort().join("<->")}`
      : `${type}:${edge.from}->${edge.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (curatedKeys.has(edge.from)) {
      // A curated facility's edges were decided by hand in Phase 2; do not add
      // machine-projected ones alongside them.
      continue;
    }
    relationships.push({
      fromResearchKey: edge.from,
      toResearchKey: edge.to,
      type,
      evidenceUrl: relationshipEvidenceUrl(from, to.canonicalName),
      notes: edge.notes,
    });
  }

  // ---- facilities
  const facilities: ContractFacility[] = [...curated];
  for (const research of pkg.facilities) {
    if (curatedKeys.has(research.researchKey)) continue;

    if (!isFacilityCategory(research.category)) {
      notes.push({ researchKey: research.researchKey, note: `category "${research.category}" is not a public category; the record is not projected` });
      continue;
    }

    const { evidence, skipped } = projectEvidence(research);
    for (const reason of skipped) notes.push({ researchKey: research.researchKey, note: `source skipped: ${reason}` });
    if (evidence.length === 0) {
      notes.push({ researchKey: research.researchKey, note: "no usable source; the record is not projected" });
      continue;
    }

    const { facts, unsupported } = projectFacts(research);
    for (const fact of unsupported) notes.push({ researchKey: research.researchKey, note: `fact dropped, no cited source states it: ${fact}` });

    const location = splitLocation(research);
    const precision = isCoordinatePrecision(research.coordinatePrecision) ? research.coordinatePrecision : null;
    const method = isCoordinateMethod(research.coordinateMethod) ? research.coordinateMethod : null;
    const mapEligible =
      research.latitude !== null && research.longitude !== null && precision !== null && MAP_ELIGIBLE_PRECISIONS.includes(precision);

    const reviewNotes = [...research.unresolvedQuestions];
    const announced = normalizeDate(research.announcedDate);
    const constructionStart = normalizeDate(research.constructionStartDate);
    const operational = normalizeDate(research.operationalDate);
    for (const [label, widened, raw] of [
      ["announced", announced.widened, research.announcedDate],
      ["construction start", constructionStart.widened, research.constructionStartDate],
      ["operational", operational.widened, research.operationalDate],
    ] as const) {
      if (widened) reviewNotes.push(`The ${label} date is recorded as the first of the period: the research gives ${raw}.`);
    }
    const blocked = pkg.notMapIngestable.get(research.researchKey) ?? null;

    const hasPositioningClaim = evidence.some((item) => item.claims.some((claim) => claim.field === "location" || claim.field === "coordinates"));
    const powerEdges = relationships.filter(
      (edge) =>
        edge.fromResearchKey === research.researchKey &&
        edge.type === "supplies_power_to" &&
        edge.evidenceUrl !== null &&
        COMPUTE_CATEGORIES.includes((byKey.get(edge.toResearchKey)?.category ?? "") as never),
    );
    const powerSatisfied = research.category !== "power_infrastructure" || powerEdges.length > 0;

    let requested: RequestedPublicationState;
    if (!mapEligible) {
      requested = "research";
    } else if (blocked !== null) {
      // The researcher stopped this one even though it can be placed. That is a
      // person's judgement and it stands until another person lifts it.
      requested = "review_required";
      reviewNotes.push(`Research §8.6 holds this record back from the map: ${blocked}`);
    } else if (!research.researchIngestReady) {
      requested = "review_required";
      reviewNotes.push("The research package's own ingest_ready flag is false.");
    } else if (!hasPositioningClaim) {
      requested = "review_required";
      reviewNotes.push("No cited source claim states this facility's location, so nothing placed it.");
    } else if (!powerSatisfied) {
      requested = "review_required";
      reviewNotes.push("Power infrastructure with no evidenced supply relationship into a compute facility.");
    } else if (research.confidence === "low") {
      requested = "review_required";
      reviewNotes.push("Confidence is low.");
    } else {
      requested = "published";
    }

    facilities.push({
      researchKey: research.researchKey,
      canonicalName: research.canonicalName,
      category: research.category,
      ownerName: research.owner,
      operatorName: research.operator,
      aliases: research.aliases.map((alias) => ({ alias, kind: "alias" as const, authority: null })),
      location: {
        ...location,
        latitude: research.latitude,
        longitude: research.longitude,
        coordinatePrecision: precision,
        coordinateMethod: method,
        coordinateNotes: research.coordinateNotes,
      },
      lifecycle: {
        status: isLifecycleStatus(research.lifecycleStatus) ? research.lifecycleStatus : null,
        announcedDate: announced.date,
        constructionStartDate: constructionStart.date,
        operationalDate: operational.date,
      },
      facts,
      evidence,
      quality: {
        confidence: isFacilityConfidence(research.confidence) ? research.confidence : "low",
        lastVerifiedDate: research.lastVerifiedDate,
        reviewNotes,
      },
      requestedPublicationState: requested,
    });
  }

  return { facilities, relationships, notes };
}

/**
 * The research writes some dates as a year or a year-month; the contract takes
 * ISO days. Widening to the first of the period keeps the date rather than
 * losing it, and `widened` is true so the record can say it was a month or a
 * year in the source — a date silently made more precise than its source is
 * exactly the kind of quiet improvement this projection refuses.
 */
export function normalizeDate(raw: string | null): { date: string | null; widened: boolean } {
  if (raw === null) return { date: null, widened: false };
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { date: raw, widened: false };
  if (/^\d{4}-\d{2}$/.test(raw)) return { date: `${raw}-01`, widened: true };
  if (/^\d{4}$/.test(raw)) return { date: `${raw}-01-01`, widened: true };
  return { date: null, widened: false };
}

/* ------------------------------------------------------------------- entry */

function main(): void {
  const check = process.argv.includes("--check");
  const root = process.cwd();
  const markdown = readFileSync(resolve(root, RESEARCH_PATH), "utf8");
  const curatedDoc = JSON.parse(readFileSync(resolve(root, CURATED_PATH), "utf8")) as {
    facilities: ContractFacility[];
    relationships: ContractRelationship[];
  };

  const projected = projectResearch(markdown, curatedDoc.facilities, curatedDoc.relationships);
  const pkg = parseResearchPackage(markdown);

  const dataset = {
    contractVersion: FACILITY_IMPORT_CONTRACT_VERSION,
    datasetName: "Urdais Map Phase 1 research, complete projection",
    researchDocument: RESEARCH_PATH,
    generatedAt: "2026-09-17",
    facilities: projected.facilities,
    relationships: projected.relationships,
  };

  const rejected = {
    registerVersion: "urdais.map.rejected-candidates/1",
    researchDocument: RESEARCH_PATH,
    researchedOn: "2026-09-17",
    candidates: pkg.rejected.map((candidate) => ({
      candidate: candidate.candidate,
      slice: candidate.slice,
      reason: candidate.reason,
      // Where the stated reason names what was missing, that is the condition
      // under which the candidate may be reconsidered. Nothing is inferred
      // beyond the research's own words.
      reconsiderationCondition: /not fetched|not verified|not researched|not pulled|not established|was not/i.test(candidate.reason)
        ? candidate.reason
        : null,
    })),
  };

  const byState = projected.facilities.reduce<Record<string, number>>((counts, facility) => {
    counts[facility.requestedPublicationState] = (counts[facility.requestedPublicationState] ?? 0) + 1;
    return counts;
  }, {});

  const summary = {
    mode: check ? "check" : "write",
    researchFacilities: pkg.facilities.length,
    projectedFacilities: projected.facilities.length,
    carriedFromPhase2: curatedDoc.facilities.length,
    newlyProjected: projected.facilities.length - curatedDoc.facilities.length,
    requestedPublicationState: byState,
    relationships: projected.relationships.length,
    evidence: projected.facilities.reduce((n, facility) => n + facility.evidence.length, 0),
    claims: projected.facilities.reduce((n, facility) => n + facility.evidence.reduce((m, e) => m + e.claims.length, 0), 0),
    facts: projected.facilities.reduce((n, facility) => n + (facility.facts?.length ?? 0), 0),
    aliases: projected.facilities.reduce((n, facility) => n + (facility.aliases?.length ?? 0), 0),
    rejectedCandidates: rejected.candidates.length,
    projectionNotes: projected.notes.length,
  };

  if (!check) {
    writeFileSync(resolve(root, DATASET_PATH), `${JSON.stringify(dataset, null, 2)}\n`);
    writeFileSync(resolve(root, REJECTED_PATH), `${JSON.stringify(rejected, null, 2)}\n`);
  }

  console.log(JSON.stringify({ ...summary, notes: projected.notes }, null, 2));
}

// Only when run as a command. The rules above are imported by tests, and a
// module that wrote two files on import would make reading it a side effect.
if (process.argv[1]?.endsWith("project-research.ts")) main();
