import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type WorkbookReadyRow = {
  ID: string;
  Facility: string;
  Operator: string | null;
  Country: string | null;
  "Prior Location": string | null;
  "Address / Campus": string;
  Latitude: number;
  Longitude: number;
  Precision: "building" | "campus" | "street" | "city";
  Outcome: string;
  "Evidence Tier": string | null;
  Sources: string;
  Notes: string | null;
  "Research Batch": string;
};

type WorkbookManifest = {
  manifestVersion: string;
  sourceWorkbook: string;
  generatedAt: string;
  ready: WorkbookReadyRow[];
  manualLookup: Array<{ ID: string; "Current Outcome": string }>;
};

type Evidence = {
  publisher: string;
  title: string;
  url: string;
  documentType:
    | "company_facility_page"
    | "government_record"
    | "industry_press"
    | "facility_directory";
  publishedOn: null;
  verificationState: "unverified";
  verifiedAt: null;
  verificationNotes: string | null;
  claims: Array<{ field: "identity" | "location" | "coordinates"; statement: string }>;
};

type Facility = {
  researchKey: string;
  canonicalName: string;
  category: "data_center" | "gpu_compute_cluster" | "semiconductor_fab" | "power_infrastructure";
  ownerName?: string | null;
  operatorName?: string | null;
  aliases?: Array<{ alias: string; kind: string; authority: string | null }>;
  location: {
    streetAddress?: string | null;
    locality?: string | null;
    adminArea?: string | null;
    countryName?: string | null;
    countryCode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    coordinatePrecision?: "building" | "campus" | "street" | "city" | null;
    coordinateMethod?: "official_record" | "documented_address_geocode" | "campus_centroid" | "city_centroid" | null;
    coordinateNotes?: string | null;
  };
  lifecycle?: {
    status?: string | null;
    announcedDate?: string | null;
    constructionStartDate?: string | null;
    operationalDate?: string | null;
  } | null;
  facts?: unknown[];
  evidence: Evidence[];
  quality: {
    confidence: "high" | "medium" | "low";
    lastVerifiedDate?: string | null;
    reviewNotes?: string[] | null;
  };
  aiRelevance?: string | null;
  requestedPublicationState: "research" | "review_required" | "published";
};

type FacilityDocument = {
  contractVersion: string;
  datasetName: string;
  researchDocument: string;
  generatedAt: string;
  facilities: Facility[];
  relationships: unknown[];
};

const ROOT = process.cwd();
const MANIFEST_PATH = resolve(ROOT, "data/map/phase4b-workbook-manifest.v1.json");
const FACILITIES_PATH = resolve(ROOT, "data/map/facilities.v1.json");
const EXPECTED_READY = 107;
const EXPECTED_MANUAL = 312;
const COUNTRY_CODES: Record<string, string> = {
  Australia: "AU",
  Canada: "CA",
  Croatia: "HR",
  "Côte d’Ivoire": "CI",
  France: "FR",
  Germany: "DE",
  Ghana: "GH",
  India: "IN",
  Italy: "IT",
  Japan: "JP",
  Netherlands: "NL",
  Peru: "PE",
  Poland: "PL",
  Spain: "ES",
  Switzerland: "CH",
  "United Kingdom": "GB",
  "United States": "US",
};
const NEW_DATA_CENTER_OPERATORS = new Set(["Digital Realty", "Equinix", "Hetzner Online", "QTS"]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function validateManifest(manifest: WorkbookManifest): void {
  assert(manifest.manifestVersion === "urdais.map.phase4b-workbook-manifest/1", "unsupported Phase 4B manifest version");
  assert(manifest.ready.length === EXPECTED_READY, `Ready for Map must contain ${EXPECTED_READY} rows, received ${manifest.ready.length}`);
  assert(manifest.manualLookup.length === EXPECTED_MANUAL, `Manual Lookup must contain ${EXPECTED_MANUAL} rows, received ${manifest.manualLookup.length}`);

  const readyIds = manifest.ready.map((row) => row.ID);
  const manualIds = manifest.manualLookup.map((row) => row.ID);
  assert(unique(readyIds).length === EXPECTED_READY, "Ready for Map IDs are not unique");
  assert(unique(manualIds).length === EXPECTED_MANUAL, "Manual Lookup IDs are not unique");
  const manual = new Set(manualIds);
  const overlap = readyIds.filter((id) => manual.has(id));
  assert(overlap.length === 0, `workbook sheets overlap: ${overlap.join(", ")}`);
  assert(new Set([...readyIds, ...manualIds]).size === 419, "workbook must contain exactly 419 unique IDs");

  for (const row of manifest.ready) {
    assert(Number.isFinite(row.Latitude) && row.Latitude >= -90 && row.Latitude <= 90, `${row.ID} has an invalid latitude`);
    assert(Number.isFinite(row.Longitude) && row.Longitude >= -180 && row.Longitude <= 180, `${row.ID} has an invalid longitude`);
    assert(row.Precision !== "city", `${row.ID} is city precision and cannot enter the ready set`);
    assert(["building", "campus", "street"].includes(row.Precision), `${row.ID} has invalid precision ${row.Precision}`);
    assert(row.Outcome === "resolved_map_ready", `${row.ID} has non-ready outcome ${row.Outcome}`);
    assert(row.Sources.trim() !== "", `${row.ID} has no provenance`);
  }
}

function stripTrailingCountry(address: string, country: string): string {
  const escaped = country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return address.replace(new RegExp(`,?\\s*${escaped}\\s*$`, "iu"), "").trim();
}

function sourceParts(value: string): string[] {
  return value.split(";").map((part) => part.trim()).filter(Boolean);
}

function firstHttpUrl(reference: string): string | null {
  const match = reference.match(/https?:\/\/[^\s;]+/iu);
  return match ? match[0].replace(/[),.]+$/u, "") : null;
}

function sourceUrl(reference: string, facilityName: string): string {
  const explicit = firstHttpUrl(reference);
  if (explicit) return explicit;

  const peering = reference.match(/(?:peeringdb(?:\.com)?(?:\/fac\/|\s+fac\s*)|PDB\s+fac\s*)(\d+)/iu);
  if (peering) return `https://www.peeringdb.com/fac/${peering[1]}`;

  const osm = reference.match(/OSM\s+(way|node|relation)\s+(\d+)/iu);
  if (osm) return `https://www.openstreetmap.org/${osm[1]!.toLowerCase()}/${osm[2]}`;
  if (/\bOSM\b|OpenStreetMap/iu.test(reference)) {
    return `https://www.openstreetmap.org/search?query=${encodeURIComponent(facilityName)}`;
  }

  const bareDomain = reference.match(/\b((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[a-z0-9._~:/?#[\]@!$&'()*+,;=%-]*)?)/iu);
  if (bareDomain) return `https://${bareDomain[1]}`;

  if (/QTS Compliance Matrix/iu.test(reference)) return "https://q.com/wp-content/uploads/2025/03/QTS_ComplianceMatrix.pdf";
  if (/Data Center Map/iu.test(reference)) return "https://www.datacentermap.com/";
  if (/datacenterHawk/iu.test(reference)) return "https://datacenterhawk.com/";
  if (/Samsung Foundry/iu.test(reference)) return "https://semiconductor.samsung.com/about-us/locations/korea/";
  if (/safemap|living-safety/iu.test(reference)) return "https://www.safemap.go.kr/";
  if (/TSMC Fabs directory/iu.test(reference)) return "https://www.tsmc.com/english/aboutTSMC/TSMC_Fabs";
  if (/SIPA Zhunan park/iu.test(reference)) return "https://www.sipa.gov.tw/";
  if (/Wikipedia|GeoHack/iu.test(reference)) return "https://en.wikipedia.org/";
  if (/Vantage .* page/iu.test(reference)) return "https://vantage-dc.com/";
  if (/Hetzner colocation page/iu.test(reference)) return "https://www.hetzner.com/unternehmen/rechenzentrum/";
  if (/HostDir/iu.test(reference)) return "https://hostdir.com/";
  if (/GridCensus/iu.test(reference)) return "https://gridcensus.com/";
  if (/Compute Atlas/iu.test(reference)) return "https://computeatlas.com/";
  if (/MapQuest/iu.test(reference)) return "https://www.mapquest.com/";
  if (/Wikimapia/iu.test(reference)) return "https://wikimapia.org/";
  throw new Error(`cannot preserve source reference as a URL: ${reference}`);
}

function sourceKind(reference: string, url: string): Pick<Evidence, "publisher" | "documentType"> {
  const text = `${reference} ${url}`.toLowerCase();
  if (text.includes("openstreetmap") || /\bosm\b/u.test(text)) return { publisher: "OpenStreetMap", documentType: "facility_directory" };
  if (text.includes("peeringdb") || /\bpdb\b/u.test(text)) return { publisher: "PeeringDB", documentType: "facility_directory" };
  if (text.includes("datacenters.com")) return { publisher: "DataCenters.com", documentType: "facility_directory" };
  if (text.includes("datacentermap") || text.includes("data center map")) return { publisher: "Data Center Map", documentType: "facility_directory" };
  if (text.includes("datacenterhawk")) return { publisher: "datacenterHawk", documentType: "facility_directory" };
  if (text.includes("dutchdatacenters")) return { publisher: "Dutch Data Center Association", documentType: "facility_directory" };
  if (text.includes("hostdir")) return { publisher: "HostDir", documentType: "facility_directory" };
  if (text.includes("gridcensus")) return { publisher: "GridCensus", documentType: "facility_directory" };
  if (text.includes("computeatlas")) return { publisher: "Compute Atlas", documentType: "facility_directory" };
  if (text.includes("mapquest")) return { publisher: "MapQuest", documentType: "facility_directory" };
  if (text.includes("wikimapia")) return { publisher: "Wikimapia", documentType: "facility_directory" };
  if (text.includes("q.com") || text.includes("qts compliance")) return { publisher: "QTS", documentType: "company_facility_page" };
  if (text.includes("equinix")) return { publisher: "Equinix", documentType: "company_facility_page" };
  if (text.includes("digitalrealty")) return { publisher: "Digital Realty", documentType: "company_facility_page" };
  if (text.includes("hetzner")) return { publisher: "Hetzner Online", documentType: "company_facility_page" };
  if (text.includes("samsung")) return { publisher: "Samsung Foundry", documentType: "company_facility_page" };
  if (text.includes("tsmc")) return { publisher: "TSMC", documentType: "company_facility_page" };
  if (text.includes("vantage-dc") || text.includes("vantage ")) return { publisher: "Vantage Data Centers", documentType: "company_facility_page" };
  if (text.includes("safemap") || text.includes("sipa.gov")) return { publisher: "Government record", documentType: "government_record" };
  if (text.includes("mite.gov.it") || text.includes("dca.ga.gov")) return { publisher: "Government record", documentType: "government_record" };
  return { publisher: new URL(url).hostname.replace(/^www\./u, ""), documentType: "industry_press" };
}

function evidenceFor(row: WorkbookReadyRow): Evidence[] {
  const evidence = new Map<string, Evidence>();
  for (const reference of sourceParts(row.Sources)) {
    const url = sourceUrl(reference, row.Facility);
    const kind = sourceKind(reference, url);
    const coordinateSource = /OSM|OpenStreetMap|PeeringDB|\bPDB\b|GridCensus|Compute Atlas|MapQuest|Wikimapia|\bGPS\b|\bcoordinates?\b/iu.test(reference);
    const claims: Evidence["claims"] = [
      { field: "identity", statement: row.Facility },
      { field: "location", statement: row["Address / Campus"] },
    ];
    if (coordinateSource) claims.push({ field: "coordinates", statement: `${row.Latitude}, ${row.Longitude}` });

    const existing = evidence.get(url);
    if (existing) {
      existing.title = `${existing.title}; ${reference}`;
      if (coordinateSource && !existing.claims.some((claim) => claim.field === "coordinates")) {
        existing.claims.push({ field: "coordinates", statement: `${row.Latitude}, ${row.Longitude}` });
      }
      continue;
    }
    evidence.set(url, {
      ...kind,
      title: reference,
      url,
      publishedOn: null,
      verificationState: "unverified",
      verifiedAt: null,
      verificationNotes: `Source reference preserved from ${row["Research Batch"]}; workbook evidence tier ${row["Evidence Tier"] ?? "not stated"}.`,
      claims,
    });
  }
  return [...evidence.values()];
}

function coordinateNotes(row: WorkbookReadyRow): string {
  return [
    `Authoritative Phase 4B workbook outcome: ${row.Outcome}.`,
    row["Prior Location"] ? `Prior location label: ${row["Prior Location"]}.` : null,
    row.Notes,
  ].filter(Boolean).join(" ");
}

function reviewNotes(row: WorkbookReadyRow): string[] {
  return [
    `Normalized from ${row["Research Batch"]}.`,
    row["Evidence Tier"] ? `Workbook evidence tier: ${row["Evidence Tier"]}.` : null,
    row.Notes,
  ].filter((value): value is string => Boolean(value));
}

function countryCode(country: string): string {
  const code = COUNTRY_CODES[country];
  assert(code, `no country-code mapping for ${country}`);
  return code;
}

function mergeEvidence(existing: Evidence[], incoming: Evidence[]): Evidence[] {
  const byUrl = new Map(existing.map((item) => [item.url, { ...item, claims: [...item.claims] }]));
  for (const item of incoming) {
    const current = byUrl.get(item.url);
    if (!current) {
      byUrl.set(item.url, item);
      continue;
    }
    if (!current.title.includes(item.title)) current.title = `${current.title}; ${item.title}`;
    const claimKeys = new Set(current.claims.map((claim) => `${claim.field}\0${claim.statement}`));
    for (const claim of item.claims) {
      if (!claimKeys.has(`${claim.field}\0${claim.statement}`)) current.claims.push(claim);
    }
    const currentNotes = current.verificationNotes ?? "";
    const incomingNotes = item.verificationNotes ?? "";
    if (incomingNotes !== "" && !currentNotes.includes(incomingNotes)) {
      current.verificationNotes = `${currentNotes} ${incomingNotes}`.trim();
    }
  }
  return [...byUrl.values()];
}

function mergeReadyRow(existing: Facility | undefined, row: WorkbookReadyRow): Facility {
  const country = row.Country ?? existing?.location.countryName ?? null;
  assert(country, `${row.ID} has no country in either workbook or canonical data`);
  const operator = row.Operator ?? existing?.operatorName ?? null;
  assert(operator, `${row.ID} has no operator in either workbook or canonical data`);
  if (!existing) assert(NEW_DATA_CENTER_OPERATORS.has(operator), `${row.ID} is new and has no explicit category mapping for operator ${operator}`);

  const incomingEvidence = evidenceFor(row);
  const precision = row.Precision;
  const method = precision === "campus" ? "campus_centroid" : "documented_address_geocode";
  const address = stripTrailingCountry(row["Address / Campus"], country);

  return {
    researchKey: row.ID,
    canonicalName: row.Facility,
    category: existing?.category ?? "data_center",
    ownerName: existing?.ownerName ?? null,
    operatorName: operator,
    aliases: existing?.aliases ?? [],
    location: {
      streetAddress: address,
      locality: existing?.location.locality ?? null,
      adminArea: existing?.location.adminArea ?? null,
      countryName: country,
      countryCode: row.Country ? countryCode(row.Country) : existing?.location.countryCode ?? null,
      latitude: row.Latitude,
      longitude: row.Longitude,
      coordinatePrecision: precision,
      coordinateMethod: method,
      coordinateNotes: coordinateNotes(row),
    },
    lifecycle: existing?.lifecycle ?? {
      status: null,
      announcedDate: null,
      constructionStartDate: null,
      operationalDate: null,
    },
    facts: existing?.facts ?? [],
    evidence: mergeEvidence(existing?.evidence ?? [], incomingEvidence),
    quality: {
      confidence: existing?.quality.confidence ?? "medium",
      lastVerifiedDate: "2026-09-18",
      reviewNotes: unique([...(existing?.quality.reviewNotes ?? []), ...reviewNotes(row)]),
    },
    aiRelevance: existing?.aiRelevance ?? "unknown",
    requestedPublicationState: "research",
  };
}

function normalizeAddress(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as WorkbookManifest;
  const document = JSON.parse(await readFile(FACILITIES_PATH, "utf8")) as FacilityDocument;
  validateManifest(manifest);

  const before = new Map(document.facilities.map((facility) => [facility.researchKey, facility]));
  const readyIds = new Set(manifest.ready.map((row) => row.ID));
  const manualIds = new Set(manifest.manualLookup.map((row) => row.ID));
  const existing = manifest.ready.filter((row) => before.has(row.ID)).length;
  const inserted = manifest.ready.length - existing;
  const facilities = document.facilities.map((facility) => readyIds.has(facility.researchKey) ? mergeReadyRow(facility, manifest.ready.find((row) => row.ID === facility.researchKey)!) : facility);
  for (const row of manifest.ready) if (!before.has(row.ID)) facilities.push(mergeReadyRow(undefined, row));

  const after = new Map(facilities.map((facility) => [facility.researchKey, facility]));
  assert(after.size === facilities.length, "projection created duplicate canonical research keys");
  assert([...readyIds].every((id) => after.has(id)), "projection silently skipped a ready ID");
  assert([...manualIds].filter((id) => readyIds.has(id)).length === 0, "projection includes a Manual Lookup ID in the Phase 4B write set");

  const addressGroups = new Map<string, string[]>();
  const coordinateGroups = new Map<string, string[]>();
  for (const id of readyIds) {
    const facility = after.get(id)!;
    const addressKey = `${facility.operatorName ?? ""}|${normalizeAddress(facility.location.streetAddress)}`;
    addressGroups.set(addressKey, [...(addressGroups.get(addressKey) ?? []), id]);
    const coordinateKey = `${facility.location.latitude},${facility.location.longitude}`;
    coordinateGroups.set(coordinateKey, [...(coordinateGroups.get(coordinateKey) ?? []), id]);
  }

  const output: FacilityDocument = {
    ...document,
    datasetName: "Urdais canonical facilities through Map Phase 4B",
    researchDocument: "docs/operations/map-phase-4b-ready-facilities.md",
    generatedAt: "2026-09-18",
    facilities,
  };
  if (write) await writeFile(FACILITIES_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    mode: write ? "write" : "dry-run",
    workbook: {
      ready: manifest.ready.length,
      manual: manifest.manualLookup.length,
      overlap: 0,
      total: readyIds.size + manualIds.size,
    },
    canonical: { before: document.facilities.length, after: facilities.length, existing, inserted },
    sharedOperatorAddresses: [...addressGroups.entries()].filter(([, ids]) => ids.length > 1).map(([key, ids]) => ({ key, ids })),
    sharedCoordinates: [...coordinateGroups.entries()].filter(([, ids]) => ids.length > 1).map(([coordinates, ids]) => ({ coordinates, ids })),
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
