import { createHash } from "node:crypto";

import type { CoordinatePrecision } from "@/lib/facilities/domain";

export const GEOCODE_OUTCOMES = [
  "geocoded_ready",
  "geocoded_review",
  "geocode_no_match",
  "geocode_conflict",
  "skipped_identity_hold",
] as const;
export type GeocodeOutcome = (typeof GEOCODE_OUTCOMES)[number];

export type GeocodeQueueItem = {
  researchKey: string;
  canonicalName: string;
  category: "data_center" | "gpu_compute_cluster" | "semiconductor_fab" | "power_infrastructure";
  documentedLocation: string;
  locality: string | null;
  adminArea: string | null;
  countryName: string;
  countryCode: string;
  coordinatePrecision: Extract<CoordinatePrecision, "building" | "campus" | "street">;
  query: string;
  sources: readonly { label: string; url: string }[];
  queueSources: readonly ("class_b_28" | "global_expansion")[];
  existingFacility: boolean;
  operatorName: string | null;
  lifecycleStatus: string | null;
  aiRelevance: string | null;
};

export type NominatimResult = {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  category?: string;
  type?: string;
  addresstype?: string;
  importance?: number;
  address?: Record<string, string>;
  boundingbox?: string[];
};

export type GeocodeCacheEntry = {
  provider: "nominatim";
  query: string;
  countryCode: string;
  fetchedAt: string;
  results: NominatimResult[];
};

export type GeocodeResult = {
  researchKey: string;
  provider: "nominatim";
  query: string;
  originalLocation: string;
  originalSources: GeocodeQueueItem["sources"];
  returnedFormattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  providerCategory: string | null;
  providerType: string | null;
  providerImportance: number | null;
  outcome: GeocodeOutcome;
  outcomeReason: string;
  coordinatePrecision: GeocodeQueueItem["coordinatePrecision"];
  geocodedAt: string;
  rawResult: NominatimResult | null;
};

const COUNTRY_CODES: Record<string, string> = {
  "United States": "US", "South Korea": "KR", Singapore: "SG", Sweden: "SE", Taiwan: "TW",
  Germany: "DE", Italy: "IT", Poland: "PL", Switzerland: "CH", "United Kingdom": "GB",
  Uruguay: "UY", "South Africa": "ZA",
};

const QUERY_OVERRIDES: Record<string, string> = {
  "fermi-project-matador-campus": "US Highway 60 and FM 2373, Carson County, Texas, United States",
  "fermi-matador-gas-generation": "US Highway 60 and FM 2373, Carson County, Texas, United States",
  "naver-gak-sejong": "824 Haengbok-daero, Sejong 30138, South Korea",
  "microsoft-sweden-staffanstorp": "Västanvägen 86, 245 42 Staffanstorp, Sweden",
  "coreweave-lancaster-pa": "216 Greenfield Road, Lancaster, Pennsylvania, United States",
  "cyrusone-dfw10-bosque": "557 County Road 3610, Whitney, Texas 76692, United States",
  "dataone-vineland": "Lincoln Avenue and Sheridan Avenue, Vineland, New Jersey, United States",
  "google-cedar-rapids": "Edgewood Road SW and 76th Avenue SW, Cedar Rapids, Iowa 52404, United States",
  "google-pryor-mayes-county": "4581 Webb Street, Pryor, Oklahoma 74361, United States",
  "google-stillwater": "1500 East Richmond Road, Stillwater, Oklahoma, United States",
  "meta-eagle-mountain": "1275 North Community Circle, Eagle Mountain, Utah 84005, United States",
  "meta-richland-parish": "Louisiana Highway 183 and Jaggers Lane, Holly Ridge, Louisiana, United States",
  "project-jupiter-dona-ana": "New Mexico Highway 136 and New Mexico Highway 9, Santa Teresa, New Mexico, United States",
  "switch-citadel-tahoe-reno": "1 Superloop Circle, McCarran, Nevada 89434, United States",
  "related-the-barn-saline": "11600 West Michigan Avenue, Saline, Michigan 48176, United States",
  "vantage-lighthouse-port-washington": "531 East Lake Drive, Port Washington, Wisconsin, United States",
  "nscc-aspire-2a": "3 Research Link, Singapore 117602",
  "meta-hyperion": "Louisiana Highway 183 and Jaggers Lane, Holly Ridge, Louisiana, United States",
  "nebius-vineland-cluster": "Lincoln Avenue and Sheridan Avenue, Vineland, New Jersey, United States",
  "micron-singapore-hbm-packaging": "1 Woodlands Industrial Park D Street 1, Singapore 738799",
  "sk-hynix-cheongju": "215 Daesin-ro, Cheongju, South Korea",
  "sk-hynix-yongin": "Yongin Semiconductor Cluster, Wonsam-myeon, Yongin, South Korea",
  "samsung-hwaseong": "1 Samsungjeonja-ro, Hwaseong-si, Gyeonggi-do 18448, South Korea",
  "samsung-pyeongtaek": "114 Samsung-ro, Godeok-myeon, Pyeongtaek-si, Gyeonggi-do 17786, South Korea",
  "tsmc-ap6-zhunan": "1 Kezhuan 1st Road, Zhunan Township, Miaoli, Taiwan",
  "intel-ohio-one": "11511 Green Chapel Road NW, New Albany, Ohio 43031, United States",
  "micron-boise": "8000 South Federal Way, Boise, Idaho 83716, United States",
  "samsung-taylor-tx": "1530 FM 973, Taylor, Texas 76574, United States",
};

function cells(line: string): string[] {
  return line.split("|").slice(1, -1).map((cell) => cell.trim().replace(/^`|`$/g, ""));
}

function links(markdown: string): { label: string; url: string }[] {
  return [...markdown.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)].map((match) => ({ label: match[1]!, url: match[2]! }));
}

function plain(value: string): string | null {
  const normalized = value.replace(/`/g, "").trim();
  return normalized === "" || normalized === "null" ? null : normalized;
}

function globalTables(markdown: string): string[][] {
  const start = markdown.indexOf("## 3. Global Data Center Dataset");
  const end = markdown.indexOf("## 4. Existing Urdais Record Remediation");
  return markdown.slice(start, end).split("\n").filter((line) => line.startsWith("| `")).map(cells);
}

function sourceRegister(markdown: string): Map<string, { label: string; url: string }> {
  const register = new Map<string, { label: string; url: string }>();
  const start = markdown.indexOf("## 8. Source Register");
  const end = markdown.indexOf("## 9. Duplicate / Entity-Resolution Review");
  for (const row of markdown.slice(start, end).split("\n").filter((line) => line.startsWith("| `")).map(cells)) {
    const match = /^([^`\s]+)`?\s+(.+)$/.exec(row[0]!.replace(/^`/, ""));
    const url = plain(row[1]!);
    if (match && url?.startsWith("http")) register.set(match[1]!, { label: match[2]!, url });
  }
  return register;
}

function humanReviewKeys(markdown: string): Set<string> {
  const start = markdown.indexOf("## 10. Human Review Queue");
  const end = markdown.indexOf("## 11. Rejected Candidates");
  return new Set(markdown.slice(start, end).split("\n").filter((line) => line.startsWith("| `")).map((line) => cells(line)[0]!));
}

function countryCode(country: string): string {
  const code = COUNTRY_CODES[country];
  if (!code) throw new Error(`No ISO country code configured for geocoding queue country: ${country}`);
  return code;
}

export function buildGeocodingQueue(args: {
  classBMarkdown: string;
  globalMarkdown: string;
  existingFacilities: ReadonlyMap<string, { category: GeocodeQueueItem["category"] }>;
  baselineResearchKeys?: ReadonlySet<string>;
}): GeocodeQueueItem[] {
  const queue = new Map<string, GeocodeQueueItem>();
  for (const row of args.classBMarkdown.split("\n").filter((line) => line.startsWith("| `")).map(cells)) {
    if (row[9] !== "resolved_address_only") continue;
    const key = row[0]!;
    const existing = args.existingFacilities.get(key);
    if (!existing) throw new Error(`Class B queue key is absent from facility dataset: ${key}`);
    const location = row[5]!;
    const precision = row[7] as GeocodeQueueItem["coordinatePrecision"];
    queue.set(key, {
      researchKey: key, canonicalName: row[1]!, category: existing.category, documentedLocation: location,
      locality: null, adminArea: null, countryName: row[2]!, countryCode: countryCode(row[2]!),
      coordinatePrecision: precision, query: QUERY_OVERRIDES[key] ?? `${location}, ${row[2]}`,
      sources: links(row[8]!), queueSources: ["class_b_28"], existingFacility: true,
      operatorName: null, lifecycleStatus: null, aiRelevance: null,
    });
  }

  const register = sourceRegister(args.globalMarkdown);
  const holds = humanReviewKeys(args.globalMarkdown);
  for (const row of globalTables(args.globalMarkdown)) {
    const [key, name, operator, city, region, country, status, address, coordinates, precision, ai, , sourceKeys, review] = row;
    if (!key || !name || !country || plain(address!) === null || plain(coordinates!) !== null) continue;
    if (!["building", "campus", "street"].includes(precision!) || holds.has(key) || /HUMAN REVIEW/i.test(review ?? "")) continue;
    const refs = (sourceKeys ?? "").split(",").map((source) => source.trim()).flatMap((source) => {
      const found = register.get(source);
      return found ? [found] : [];
    });
    const prior = queue.get(key);
    if (prior) {
      queue.set(key, { ...prior, sources: [...prior.sources, ...refs.filter((ref) => !prior.sources.some((source) => source.url === ref.url))], queueSources: ["class_b_28", "global_expansion"] });
      continue;
    }
    const location = plain(address!)!;
    const locality = plain(city!);
    const adminArea = plain(region!);
    queue.set(key, {
      researchKey: key, canonicalName: name, category: "data_center", documentedLocation: location,
      locality, adminArea, countryName: country, countryCode: countryCode(country),
      coordinatePrecision: precision as GeocodeQueueItem["coordinatePrecision"],
      query: QUERY_OVERRIDES[key] ?? [location, locality, adminArea, country].filter(Boolean).join(", "),
      sources: refs, queueSources: ["global_expansion"], existingFacility: (args.baselineResearchKeys ?? args.existingFacilities).has(key),
      operatorName: plain(operator!), lifecycleStatus: plain(status!), aiRelevance: plain(ai!),
    });
  }
  return [...queue.values()];
}

export function cacheKey(query: string, countryCode: string): string {
  return createHash("sha256").update(`${countryCode.toUpperCase()}\0${query.trim()}`).digest("hex");
}

const CENTROID_TYPES = new Set(["city", "town", "village", "municipality", "administrative", "postcode", "county", "state"]);
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function regionMatches(expected: string | null, result: NominatimResult): boolean {
  if (!expected) return true;
  const address = result.address ?? {};
  const candidates = [address.state, address.region, address.county, address["ISO3166-2-lvl4"], address["ISO3166-2-lvl6"]].filter(Boolean) as string[];
  const wanted = normalize(expected);
  return candidates.some((candidate) => {
    const got = normalize(candidate);
    return got === wanted || got.endsWith(` ${wanted}`) || candidate.toUpperCase().endsWith(`-${expected.toUpperCase()}`);
  });
}

function localityMatches(expected: string | null, result: NominatimResult): boolean {
  if (!expected) return true;
  const address = result.address ?? {};
  const candidates = [address.city, address.town, address.village, address.municipality, address.hamlet, address.county, result.display_name].filter(Boolean) as string[];
  const wanted = normalize(expected);
  return candidates.some((candidate) => normalize(candidate).includes(wanted));
}

export function assessGeocode(item: GeocodeQueueItem, entry: GeocodeCacheEntry): GeocodeResult {
  const geocodedAt = entry.fetchedAt;
  const base = {
    researchKey: item.researchKey, provider: "nominatim" as const, query: item.query,
    originalLocation: item.documentedLocation, originalSources: item.sources,
    coordinatePrecision: item.coordinatePrecision, geocodedAt,
  };
  if (entry.results.length === 0) return { ...base, returnedFormattedAddress: null, latitude: null, longitude: null, providerCategory: null, providerType: null, providerImportance: null, outcome: "geocode_no_match", outcomeReason: "Provider returned no result.", rawResult: null };
  const result = entry.results[0]!;
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  const type = result.addresstype ?? result.type ?? "";
  const detail = { returnedFormattedAddress: result.display_name, latitude, longitude, providerCategory: result.category ?? null, providerType: type || null, providerImportance: result.importance ?? null, rawResult: result };
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { ...base, ...detail, outcome: "geocode_conflict", outcomeReason: "Provider returned invalid coordinates." };
  }
  if ((result.address?.country_code ?? "").toUpperCase() !== item.countryCode) {
    return { ...base, ...detail, outcome: "geocode_conflict", outcomeReason: `Returned country does not match ${item.countryCode}.` };
  }
  if (!regionMatches(item.adminArea, result)) return { ...base, ...detail, outcome: "geocode_conflict", outcomeReason: `Returned region does not match ${item.adminArea}.` };
  if (CENTROID_TYPES.has(type)) return { ...base, ...detail, outcome: "geocoded_review", outcomeReason: `Provider resolved a ${type}, not a physical address/campus feature.` };
  if (!localityMatches(item.locality, result)) return { ...base, ...detail, outcome: "geocoded_review", outcomeReason: `Returned locality does not clearly match ${item.locality}.` };
  if (entry.results.length > 1) {
    const second = entry.results[1]!;
    const gap = (result.importance ?? 0) - (second.importance ?? 0);
    if (gap < 0.02 && (second.address?.country_code ?? "").toUpperCase() === item.countryCode) {
      return { ...base, ...detail, outcome: "geocoded_review", outcomeReason: "Provider returned multiple similarly ranked candidates." };
    }
  }
  return { ...base, ...detail, outcome: "geocoded_ready", outcomeReason: "Top result is a valid non-centroid match in the expected country, region, and locality." };
}

function geocodeSourceDocumentType(url: string): "government_record" | "company_facility_page" | "facility_directory" | "industry_press" {
  const host = new URL(url).hostname.toLowerCase();
  if (host.endsWith(".gov") || host.includes("go.kr") || host.includes("gov.sg") || host.includes("gov.tw")) return "government_record";
  if (["datacenters.com", "baxtel.com", "datacentermap.com", "mapquest.com"].some((domain) => host.endsWith(domain))) return "facility_directory";
  if (["navercorp.com", "micron.com", "skhynix.com", "samsung.com", "tsmc.com", "equinix.com", "vantage-dc.com", "digitalrealty.com", "microsoft.com", "google.com"].some((domain) => host.endsWith(domain))) return "company_facility_page";
  return "industry_press";
}

export function applyReadyGeocodes<T extends {
  researchKey: string;
  location: Record<string, unknown>;
  requestedPublicationState: string;
  evidence?: ReadonlyArray<Record<string, unknown>>;
  quality?: Record<string, unknown>;
}>(
  facilities: readonly T[], results: readonly GeocodeResult[], queue: readonly GeocodeQueueItem[] = [],
): T[] {
  const ready = new Map(results.filter((result) => result.outcome === "geocoded_ready").map((result) => [result.researchKey, result]));
  const queued = new Map(queue.map((item) => [item.researchKey, item]));
  return facilities.map((facility) => {
    const result = ready.get(facility.researchKey);
    const item = queued.get(facility.researchKey);
    if (!item && (!result || result.latitude === null || result.longitude === null)) return facility;
    const existingEvidence = facility.evidence ?? [];
    const evidence = existingEvidence.map((entry) => {
      const source = item?.sources.find((candidate) => candidate.url === entry.url);
      if (!source) return entry;
      const claims = Array.isArray(entry.claims) ? entry.claims as Array<Record<string, unknown>> : [];
      if (claims.some((claim) => claim.field === "location" && claim.statement === item!.documentedLocation)) return entry;
      return { ...entry, claims: [...claims, { field: "location", statement: item!.documentedLocation }] };
    });
    for (const source of item?.sources ?? []) {
      if (evidence.some((entry) => entry.url === source.url)) continue;
      evidence.push({
        publisher: source.label,
        title: source.label,
        url: source.url,
        documentType: geocodeSourceDocumentType(source.url),
        publishedOn: null,
        verificationState: "unverified",
        verifiedAt: null,
        verificationNotes: "Location source cited by the Phase 4A remediation artifact.",
        claims: [{ field: "location", statement: item!.documentedLocation }],
      });
    }
    return {
      ...facility,
      ...(item ? { evidence } : {}),
      location: {
        ...facility.location,
        streetAddress: item?.documentedLocation ?? facility.location.streetAddress,
        coordinatePrecision: item?.coordinatePrecision ?? result?.coordinatePrecision,
        ...(result && result.latitude !== null && result.longitude !== null ? {
          latitude: result.latitude,
          longitude: result.longitude,
          coordinateMethod: "documented_address_geocode",
          coordinateNotes: `Nominatim geocode of the documented location; query: ${result.query}; returned: ${result.returnedFormattedAddress}; reviewed ${result.geocodedAt.slice(0, 10)}. Original research evidence remains authoritative.`,
        } : {}),
      },
    };
  });
}
