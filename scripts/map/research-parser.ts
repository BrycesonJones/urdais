/**
 * Reading the research package.
 *
 * `URDAIS_MAP_RESEARCH_PHASE_1.md` is the human system of record and it stays
 * Markdown. This module reads the parts of it that are structured enough to be
 * read mechanically — §4's per-facility evidence records, §5's relationship
 * table, §8.6's not-yet-mappable list and §8.7's rejected candidates — and hands
 * back exactly what is written there, with no interpretation.
 *
 * The distinction this file holds to: parsing is not projection. Nothing here
 * decides a category, a publication state or a claim field. It returns the
 * research's own strings, and `project-research.ts` turns them into the import
 * contract under rules that are written down. Keeping the two apart is what
 * makes it possible to check that the dataset says what the research says.
 *
 * `null` in the Markdown means unknown, and comes back as `null`.
 */

export type ResearchSource = {
  organization: string;
  title: string;
  url: string;
  sourceType: string;
  publishedOn: string | null;
  /** Exactly the statements the research lists under "claims supported by this source only". */
  claims: readonly string[];
};

export type ResearchFacility = {
  researchKey: string;
  canonicalName: string;
  aliases: readonly string[];
  category: string;
  owner: string | null;
  operator: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinatePrecision: string | null;
  coordinateMethod: string | null;
  coordinateNotes: string | null;
  lifecycleStatus: string | null;
  announcedDate: string | null;
  constructionStartDate: string | null;
  operationalDate: string | null;
  /** The "key=value; key=value" blocks, parsed into maps and kept per block. */
  computeFacts: Record<string, string | null>;
  facilityFacts: Record<string, string | null>;
  powerFacts: Record<string, string | null>;
  fabProductionRole: string | null;
  processNodes: string | null;
  waferSize: string | null;
  capacityNote: string | null;
  documentedComputeRelationship: string | null;
  relatedFacilityIds: readonly string[];
  relationshipNotes: string | null;
  unresolvedQuestions: readonly string[];
  confidence: string;
  researchIngestReady: boolean;
  derivedMapIngestReady: boolean;
  lastVerifiedDate: string | null;
  officialWebsite: string | null;
  facilityWebpage: string | null;
  contactEmail: string | null;
  missingFields: readonly string[];
  sources: readonly ResearchSource[];
};

export type ResearchRelationship = {
  from: string;
  to: string;
  type: string;
  notes: string | null;
};

export type RejectedCandidate = {
  candidate: string;
  reason: string;
  slice: string;
};

export type ResearchPackage = {
  facilities: readonly ResearchFacility[];
  relationships: readonly ResearchRelationship[];
  /** §8.6: research keys the package says must not become mapped points yet, with the stated reason. */
  notMapIngestable: ReadonlyMap<string, string>;
  rejected: readonly RejectedCandidate[];
};

/** The research writes an unknown value as the bare word `null`. */
function value(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const text = raw.trim().replace(/^`|`$/g, "").trim();
  return text === "" || text === "null" ? null : text;
}

/** A "a, b, c" list, or null. Splits on commas that separate items, not on commas inside one. */
function list(raw: string | undefined): string[] {
  const text = value(raw);
  if (text === null) return [];
  return text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "" && item !== "null");
}

/** The unresolved-questions field separates sentences with ", " after a full stop. */
function sentenceList(raw: string | undefined): string[] {
  const text = value(raw);
  if (text === null) return [];
  return text
    .split(/(?<=\.)\s*,\s*/)
    .map((item) => item.trim())
    .filter((item) => item !== "" && item !== "null");
}

/** A "k=v; k=v" block. Values are kept verbatim; `null` becomes null. */
function keyValues(raw: string | undefined): Record<string, string | null> {
  const text = value(raw);
  const out: Record<string, string | null> = {};
  if (text === null) return out;
  // Split on "; " only where the next token looks like a key, so prose
  // containing a semicolon stays with its value.
  const parts = text.split(/;\s*(?=[A-Za-z_]+=)/);
  for (const part of parts) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    out[part.slice(0, index).trim()] = value(part.slice(index + 1));
  }
  return out;
}

function field(block: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^- \\*\\*${escaped}:\\*\\*[ ]?(.*)$`, "m").exec(block);
  return match?.[1];
}

function parseCoordinates(raw: string | undefined): { latitude: number | null; longitude: number | null } {
  const text = value(raw);
  if (text === null) return { latitude: null, longitude: null };
  const parts = text.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) return { latitude: null, longitude: null };
  return { latitude: parts[0]!, longitude: parts[1]! };
}

/** "campus (documented_address_geocode)" → precision and method. "null (null)" → both null. */
function parsePrecision(raw: string | undefined): { precision: string | null; method: string | null } {
  const text = value(raw);
  if (text === null) return { precision: null, method: null };
  const match = /^(\S+)(?:\s*\((.*)\))?$/.exec(text);
  const precision = value(match?.[1]);
  const method = value(match?.[2]);
  return { precision, method };
}

/** "operational; announced=2024-05-08; construction_start=null; operational_date=2026-06-23" */
function parseLifecycle(raw: string | undefined): {
  status: string | null;
  announced: string | null;
  constructionStart: string | null;
  operational: string | null;
} {
  const text = value(raw);
  if (text === null) return { status: null, announced: null, constructionStart: null, operational: null };
  const [head, ...rest] = text.split(";");
  const dates = keyValues(rest.join(";"));
  return {
    status: value(head),
    announced: dates.announced ?? null,
    constructionStart: dates.construction_start ?? null,
    operational: dates.operational_date ?? null,
  };
}

function parseSources(block: string): ResearchSource[] {
  const marker = block.indexOf("**Sources (do not impute unlisted claims):**");
  if (marker === -1) return [];
  const body = block.slice(marker);
  const sources: ResearchSource[] = [];
  // Each source is a top-level bullet "- **Org** — Title" followed by indented fields.
  const entries = body.split(/\n- \*\*/).slice(1);
  for (const entry of entries) {
    const headline = entry.split("\n")[0]!;
    const headMatch = /^(.*?)\*\*\s*(?:—|-)\s*(.*)$/.exec(headline);
    const organization = value(headMatch?.[1]) ?? value(headline.replace(/\*\*.*$/, "")) ?? "";
    const title = value(headMatch?.[2]) ?? "";
    const url = value(/^\s*- URL: (.*)$/m.exec(entry)?.[1]);
    const declaredOrg = value(/^\s*- Organization: (.*)$/m.exec(entry)?.[1]);
    const sourceType = value(/^\s*- Source type: (.*)$/m.exec(entry)?.[1]);
    const publishedOn = value(/^\s*- Publication\/document date: (.*)$/m.exec(entry)?.[1]);
    const claimsRaw = value(/^\s*- Claims supported by \*\*this\*\* source only: (.*)$/m.exec(entry)?.[1]);
    if (!url || !sourceType) continue;
    sources.push({
      organization: declaredOrg ?? organization,
      title: title === "" ? (declaredOrg ?? organization) : title,
      url,
      sourceType,
      publishedOn,
      claims: (claimsRaw ?? "")
        .split(";")
        .map((claim) => claim.trim())
        .filter((claim) => claim !== "" && claim !== "null"),
    });
  }
  return sources;
}

function parseFacility(block: string): ResearchFacility {
  const { latitude, longitude } = parseCoordinates(field(block, "Coordinates"));
  const { precision, method } = parsePrecision(field(block, "Coordinate precision"));
  const lifecycle = parseLifecycle(field(block, "Lifecycle status"));
  const ownerOperator = keyValues(field(block, "Owner/operator"));

  return {
    researchKey: value(field(block, "Stable research ID")) ?? block.split("\n")[0]!.trim(),
    canonicalName: value(field(block, "Canonical name")) ?? "",
    aliases: list(field(block, "Aliases")),
    category: value(field(block, "Category")) ?? "",
    owner: ownerOperator.owner ?? null,
    operator: ownerOperator.operator ?? null,
    location: value(field(block, "Location")),
    latitude,
    longitude,
    coordinatePrecision: precision,
    coordinateMethod: method,
    coordinateNotes: value(field(block, "Coordinate notes")),
    lifecycleStatus: lifecycle.status,
    announcedDate: lifecycle.announced,
    constructionStartDate: lifecycle.constructionStart,
    operationalDate: lifecycle.operational,
    computeFacts: keyValues(field(block, "Compute facts")),
    facilityFacts: keyValues(field(block, "Facility facts")),
    powerFacts: keyValues(field(block, "Power facts")),
    fabProductionRole: value(field(block, "Fab production role")),
    processNodes: value(field(block, "Process nodes (as sourced)")),
    waferSize: value(field(block, "Wafer size")),
    capacityNote: value(field(block, "Capacity note")),
    documentedComputeRelationship: value(field(block, "Documented compute relationship")),
    relatedFacilityIds: list(field(block, "Related facility IDs")),
    relationshipNotes: value(field(block, "Relationship notes")),
    unresolvedQuestions: sentenceList(field(block, "Unresolved questions")),
    confidence: value(field(block, "Verification confidence")) ?? "low",
    researchIngestReady: (value(field(block, "Research ingest_ready flag")) ?? "").toLowerCase() === "true",
    derivedMapIngestReady: (value(field(block, "Derived map_ingest_ready")) ?? "").toLowerCase() === "true",
    lastVerifiedDate: value(field(block, "Last verified date")),
    officialWebsite: value(field(block, "Official website")),
    facilityWebpage: value(field(block, "Facility webpage")),
    contactEmail: value(field(block, "Public contact email")),
    missingFields: list(field(block, "Missing important fields")),
    sources: parseSources(block),
  };
}

function section(markdown: string, start: string, end: string): string {
  const from = markdown.indexOf(start);
  if (from === -1) throw new Error(`the research package has no section "${start}"`);
  const rest = markdown.slice(from + start.length);
  const to = rest.indexOf(end);
  return to === -1 ? rest : rest.slice(0, to);
}

/** Strips a Markdown link, backticks and bold, leaving the text. */
function cellText(cell: string): string {
  return cell
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*]/g, "")
    .trim();
}

export function parseResearchPackage(markdown: string): ResearchPackage {
  const facilitiesSection = section(markdown, "## 4. Facility Evidence Records", "## 5. Facility Relationships");
  const facilities = facilitiesSection
    .split(/\n#### /)
    .slice(1)
    .map(parseFacility);

  const relationshipsSection = section(markdown, "## 5. Facility Relationships", "## 6. Source Register");
  const relationships: ResearchRelationship[] = [];
  for (const line of relationshipsSection.split("\n")) {
    if (!line.startsWith("| `")) continue;
    const cells = line.split("|").slice(1, -1).map(cellText);
    if (cells.length < 3) continue;
    const [from, to, type, notes] = cells;
    relationships.push({ from: from!, to: to!, type: type!, notes: notes && notes !== "" ? notes : null });
  }

  const notMapIngestable = new Map<string, string>();
  const notMapSection = section(markdown, "### 8.6 Records that should NOT be ingested yet (mapped points)", "### 8.7");
  for (const line of notMapSection.split("\n")) {
    if (!line.startsWith("| `")) continue;
    const cells = line.split("|").slice(1, -1).map(cellText);
    if (cells.length < 2) continue;
    notMapIngestable.set(cells[0]!, cells[1]!);
  }

  const rejected: RejectedCandidate[] = [];
  const rejectedSection = section(markdown, "### 8.7 Rejected candidates (do not add silently)", "### 8.8");
  let slice = "unspecified";
  for (const line of rejectedSection.split("\n")) {
    const heading = /^\*\*(.+?):\*\*$/.exec(line.trim());
    if (heading) {
      slice = heading[1]!;
      continue;
    }
    if (!line.startsWith("- ")) continue;
    const body = line.slice(2).trim();
    const split = body.indexOf(" — ");
    if (split === -1) continue;
    rejected.push({ candidate: cellText(body.slice(0, split)), reason: body.slice(split + 3).trim(), slice });
  }

  return { facilities, relationships, notMapIngestable, rejected };
}
