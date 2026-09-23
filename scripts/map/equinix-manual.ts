/**
 * Materialize, geocode, QA and optionally project the frozen Equinix
 * manual-verification tranche.
 *
 *   npm run map:equinix                 # cache-only QA, no canonical write
 *   npm run map:equinix -- --fetch      # bounded Nominatim requests + QA
 *   npm run map:equinix -- --apply      # project only safe results
 *
 * Production persistence remains the existing `npm run map:import` workflow.
 * This script never writes to a database.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseFacilityImportDocument, type ContractFacility } from "@/lib/facilities/contract";
import {
  enrichEquinixResult,
  materializeEquinixQueue,
  normalizedAddress,
  projectEquinixFacilities,
  resolveByNamedIdentity,
  validateEquinixTranche,
  type EquinixGeocodeResult,
  type EquinixQueueItem,
} from "@/lib/facilities/equinix-tranche";
import { demoteSharedBuildingPrecision } from "@/lib/map/precision/demoteSharedBuildingPrecision";
import { assessGeocode, cacheKey, type GeocodeCacheEntry, type GeocodeQueueItem, type GeocodeResult, type NominatimResult } from "./geocoding";

const ROOT = process.cwd();
const PATHS = {
  source: "data/map/equinix-manual-tranche.v1.json",
  cache: "data/map/geocoding/equinix-cache.v1.json",
  results: "data/map/geocoding/equinix-results.v1.json",
  qa: "data/map/geocoding/equinix-qa.v1.json",
  report: "docs/operations/map-equinix-manual-tranche.md",
  dataset: "data/map/facilities.v1.json",
} as const;

const GENERATED_AT = "2026-09-22";

type RequestCache = {
  cacheVersion: "urdais.map.equinix-geocode-cache/1";
  requests: Record<string, GeocodeCacheEntry>;
};

const readJson = (path: string): unknown => JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
const readOptional = <T>(path: string, fallback: T): T => {
  try { return readJson(path) as T; } catch { return fallback; }
};
const writeJson = (path: string, value: unknown): void => writeFileSync(resolve(ROOT, path), `${JSON.stringify(value, null, 2)}\n`, "utf8");
const sleep = (milliseconds: number) => new Promise((done) => setTimeout(done, milliseconds));

function asQueueItem(item: EquinixQueueItem, query: string): GeocodeQueueItem {
  return {
    researchKey: item.researchKey,
    canonicalName: `Equinix ${item.facilityCode}`,
    category: "data_center",
    documentedLocation: item.address,
    locality: item.locality,
    // Region names are localized by the provider (Hesse/Hessen, Nuevo
    // León/Nuevo Leon). Country and locality stay strict; region is reported
    // rather than compared as an English string.
    adminArea: null,
    countryName: item.countryName,
    countryCode: item.countryCode,
    coordinatePrecision: "building",
    query,
    sources: [{ label: `Equinix ${item.market}`, url: item.sourceUrl }],
    queueSources: ["manual_verification"],
    existingFacility: false,
    operatorName: "Equinix",
    lifecycleStatus: null,
    aiRelevance: "unknown",
  };
}

async function request(query: string, countryCode: string): Promise<NominatimResult[]> {
  const params = new URLSearchParams({ q: query, countrycodes: countryCode.toLowerCase(), format: "jsonv2", addressdetails: "1", limit: "5" });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "UrdaisMapGeocoder/1.0 (+https://github.com/BrycesonJones/urdais)", Accept: "application/json" },
    });
    if (response.ok) return await response.json() as NominatimResult[];
    if (response.status !== 429 && response.status < 500) throw new Error(`Nominatim HTTP ${response.status}`);
    if (attempt < 2) await sleep(2 ** attempt * 1_100);
  }
  throw new Error("Nominatim failed after three bounded attempts");
}

function missing(item: EquinixQueueItem): GeocodeResult {
  return {
    researchKey: item.researchKey,
    provider: "nominatim",
    query: item.query,
    originalLocation: item.address,
    originalSources: [{ label: `Equinix ${item.market}`, url: item.sourceUrl }],
    returnedFormattedAddress: null,
    latitude: null,
    longitude: null,
    providerCategory: null,
    providerType: null,
    providerImportance: null,
    outcome: "geocode_no_match",
    outcomeReason: "No cached provider response; run with --fetch.",
    coordinatePrecision: "building",
    geocodedAt: new Date(0).toISOString(),
    rawResult: null,
  };
}

function assess(item: EquinixQueueItem, query: string, cache: RequestCache): GeocodeResult | null {
  const entry = cache.requests[cacheKey(query, item.countryCode)];
  return entry ? assessGeocode(asQueueItem(item, query), entry) : null;
}

function chooseResult(item: EquinixQueueItem, cache: RequestCache): EquinixGeocodeResult {
  const attempts = [item.query, item.fallbackQuery, item.streetFallbackQuery]
    .filter((value, index, all): value is string => value !== null && all.indexOf(value) === index)
    .map((query) => ({ query, result: assess(item, query, cache) }))
    .filter((attempt): attempt is { query: string; result: GeocodeResult } => attempt.result !== null);
  const selected = attempts.find((attempt) => attempt.result.outcome === "geocoded_ready")
    ?? attempts.find((attempt) => attempt.result.latitude !== null && attempt.result.longitude !== null)
    ?? attempts[0];
  return resolveByNamedIdentity(enrichEquinixResult(item, selected?.result ?? missing(item), selected?.query ?? null));
}

function coordinateKey(result: EquinixGeocodeResult): string | null {
  return result.latitude === null || result.longitude === null ? null : `${result.latitude.toFixed(7)},${result.longitude.toFixed(7)}`;
}

function groupBy<T>(values: readonly T[], key: (value: T) => string | null): Array<{ key: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const group = key(value);
    if (group !== null) groups.set(group, [...(groups.get(group) ?? []), value]);
  }
  return [...groups.entries()].filter(([, items]) => items.length > 1).map(([group, items]) => ({ key: group, items }));
}

/** The address with its interior detail removed — what two co-located halls share. */
function streetBasis(address: string): string {
  return normalizedAddress(address.split(",", 1)[0] ?? "");
}

function qaReport(queue: EquinixQueueItem[], results: EquinixGeocodeResult[], demotedGroups: ReturnType<typeof demoteSharedBuildingPrecision>["groups"]) {
  const byKey = new Map(queue.map((item) => [item.researchKey, item]));
  const accepted = results.filter((result) => result.outcome === "geocoded_ready" && result.precisionClass !== "lower_precision");
  const unresolved = results.filter((result) => !accepted.includes(result));
  const sharedAddresses = groupBy(queue, (item) => normalizedAddress(item.address));
  const coordinateGroups = groupBy(accepted, coordinateKey);

  const duplicateCoordinates = coordinateGroups.map((group) => {
    const streetBases = new Set(group.items.map((result) => streetBasis(byKey.get(result.researchKey)!.address)));
    // The shared-point rule has already run, so no facility on a shared point
    // should still be claiming a building. `campus` is fine and is not raised
    // to street: it never claimed a building in the first place.
    const claimsBuilding = group.items.some((result) => result.coordinatePrecision === "building");
    return {
      coordinates: group.key,
      researchKeys: group.items.map((item) => item.researchKey),
      // A shared point is expected when the facilities share a street address
      // and none of them claims to have located a building on it.
      expectedSharedAddress: streetBases.size === 1 && !claimsBuilding,
      addresses: group.items.map((result) => byKey.get(result.researchKey)!.address),
    };
  });

  const hardErrors = accepted.flatMap((result) => {
    const reasons: string[] = [];
    if (result.latitude === null || result.longitude === null) reasons.push("accepted result has null coordinates");
    if (result.latitude === 0 && result.longitude === 0) reasons.push("accepted result is (0,0)");
    if (result.latitude !== null && !Number.isFinite(result.latitude)) reasons.push("latitude is not finite");
    if (result.longitude !== null && !Number.isFinite(result.longitude)) reasons.push("longitude is not finite");
    if (result.latitude !== null && (result.latitude < -90 || result.latitude > 90)) reasons.push("latitude outside valid range");
    if (result.longitude !== null && (result.longitude < -180 || result.longitude > 180)) reasons.push("longitude outside valid range");
    if (result.precisionClass === "lower_precision") reasons.push("accepted result is lower precision");
    if (!result.sourceUrl) reasons.push("accepted result carries no coordinate evidence");
    return reasons.map((reason) => ({ researchKey: result.researchKey, reason }));
  });

  const precision = {
    building: accepted.filter((result) => result.coordinatePrecision === "building").length,
    street: accepted.filter((result) => result.coordinatePrecision === "street").length,
    campus: accepted.filter((result) => result.coordinatePrecision === "campus").length,
  };
  const precisionClass = {
    exactOrRooftop: accepted.filter((result) => result.precisionClass === "exact_or_rooftop").length,
    interpolatedOrStreet: accepted.filter((result) => result.precisionClass === "interpolated_or_street").length,
    lowerPrecision: results.filter((result) => result.precisionClass === "lower_precision").length,
    unresolved: unresolved.filter((result) => result.latitude === null || result.longitude === null).length,
  };

  return {
    generatedAt: GENERATED_AT,
    markets: new Set(queue.map((item) => item.parentLocationId)).size,
    physicalFacilities: queue.length,
    successfullyGeolocated: accepted.length,
    unresolved: unresolved.length,
    excludedFromCanonicalWrite: unresolved.length,
    coordinateCoverage: `${accepted.length}/${queue.length}`,
    sourceCoverage: `${accepted.filter((result) => Boolean(result.sourceUrl)).length}/${accepted.length}`,
    precision,
    precisionClass,
    sharedAddressGroups: sharedAddresses.map((group) => ({
      normalizedAddress: group.key,
      researchKeys: group.items.map((item) => item.researchKey),
    })),
    duplicateCoordinateGroups: duplicateCoordinates,
    suspiciousDuplicateCoordinateGroups: duplicateCoordinates.filter((group) => !group.expectedSharedAddress),
    sharedPointGroups: demotedGroups,
    unresolvedFacilities: unresolved.map((result) => ({
      researchKey: result.researchKey,
      outcome: result.outcome,
      reason: result.outcomeReason,
    })),
    hardErrors,
  };
}

function markdownReport(qa: ReturnType<typeof qaReport>, digest: string | null): string {
  const lines = [
    "# Equinix manual-verification tranche",
    "",
    "<!-- not registered in the docs catalog -->",
    "",
    `Generated ${qa.generatedAt} from the frozen manual artifact. ${qa.markets} markets, ${qa.physicalFacilities} facilities.`,
    "",
    "## Geolocation",
    "",
    `- Accepted: ${qa.successfullyGeolocated}`,
    `- Unresolved and held back: ${qa.unresolved}`,
    `- Precision: building ${qa.precision.building}, street ${qa.precision.street}, campus ${qa.precision.campus}`,
    "",
    "## Shared points",
    "",
    `- Co-located coordinate groups: ${qa.duplicateCoordinateGroups.length}`,
    `- Unexplained: ${qa.suspiciousDuplicateCoordinateGroups.length}`,
    "",
    digest ? `Canonical dataset digest: \`${digest}\`` : "Canonical projection not applied in this run.",
    "",
  ];
  return lines.join("\n");
}

async function main(): Promise<void> {
  const fetchEnabled = process.argv.includes("--fetch");
  const applyEnabled = process.argv.includes("--apply");

  const { tranche, issues } = validateEquinixTranche(readJson(PATHS.source));
  if (issues.length > 0) throw new Error(`frozen artifact failed validation: ${JSON.stringify(issues, null, 2)}`);
  const queue = materializeEquinixQueue(tranche);
  const cache = readOptional<RequestCache>(PATHS.cache, { cacheVersion: "urdais.map.equinix-geocode-cache/1", requests: {} });
  mkdirSync(resolve(ROOT, "data/map/geocoding"), { recursive: true });
  mkdirSync(resolve(ROOT, "docs/operations"), { recursive: true });

  let lastRequestAt = 0;
  if (fetchEnabled) {
    for (const [index, item] of queue.entries()) {
      for (const query of [item.query, item.fallbackQuery, item.streetFallbackQuery].filter((value, queryIndex, all): value is string => value !== null && all.indexOf(value) === queryIndex)) {
        const key = cacheKey(query, item.countryCode);
        if (cache.requests[key]) continue;
        const wait = Math.max(0, 1_100 - (Date.now() - lastRequestAt));
        if (wait > 0) await sleep(wait);
        const raw = await request(query, item.countryCode);
        lastRequestAt = Date.now();
        cache.requests[key] = { provider: "nominatim", query, countryCode: item.countryCode, fetchedAt: new Date().toISOString(), results: raw };
        writeJson(PATHS.cache, cache);
        const queryKind = query === item.query ? "full" : query === item.fallbackQuery ? "interior-stripped fallback" : "street fallback";
        console.error(`[${index + 1}/${queue.length}] ${item.researchKey}: ${raw.length} candidate(s) for ${queryKind} query`);
        const current = assess(item, query, cache);
        if (current?.outcome === "geocoded_ready") break;
      }
    }
  }

  // A point shared by two facilities locates the address they share, not either
  // building. The rule is the shared one, applied to every tranche identically.
  const demotion = demoteSharedBuildingPrecision(queue.map((item) => chooseResult(item, cache)));
  const results = demotion.results;
  const qa = qaReport(queue, results, demotion.groups);
  writeJson(PATHS.results, { resultVersion: "urdais.map.equinix-geocode-results/1", generatedAt: GENERATED_AT, provider: "Nominatim", results });
  writeJson(PATHS.qa, { qaVersion: "urdais.map.equinix-geocode-qa/1", ...qa, sharedPointPrecisionDemotions: demotion.demoted });

  let projectedDigest: string | null = null;
  let canonicalBefore: number | null = null;
  let canonicalAfter: number | null = null;
  let projection: { inserted: number; updated: number; excluded: number } = { inserted: 0, updated: 0, excluded: 0 };
  if (applyEnabled) {
    if (qa.hardErrors.length > 0) throw new Error(`QA has ${qa.hardErrors.length} hard error(s); canonical projection refused`);
    if (qa.suspiciousDuplicateCoordinateGroups.length > 0) throw new Error(`QA has ${qa.suspiciousDuplicateCoordinateGroups.length} unexplained duplicate-coordinate group(s); canonical projection refused`);
    const rawDataset = readJson(PATHS.dataset) as Record<string, unknown> & { facilities: ContractFacility[] };
    const parsed = parseFacilityImportDocument(rawDataset);
    if (!parsed.document) throw new Error(`canonical dataset is invalid: ${JSON.stringify(parsed.issues)}`);
    canonicalBefore = parsed.document.facilities.length;
    const applied = projectEquinixFacilities(rawDataset.facilities, queue, results);
    projection = applied;
    canonicalAfter = applied.facilities.length;
    const output = { ...rawDataset, contractVersion: "urdais.map.facility-import/2", generatedAt: GENERATED_AT, facilities: applied.facilities };
    writeJson(PATHS.dataset, output);
    const reparsed = parseFacilityImportDocument(output);
    if (!reparsed.document) throw new Error(`projected dataset is invalid: ${JSON.stringify(reparsed.issues)}`);
    const { buildImportPlan } = await import("@/lib/facilities/import/plan");
    const plan = buildImportPlan(reparsed.document);
    if (plan.errors.length > 0) throw new Error(`projected dataset has ${plan.errors.length} import error(s): ${JSON.stringify(plan.errors)}`);
    projectedDigest = plan.digest;
  }

  writeFileSync(resolve(ROOT, PATHS.report), markdownReport(qa, projectedDigest), "utf8");
  console.log(JSON.stringify({
    mode: fetchEnabled ? "fetch" : "cache-only",
    applied: applyEnabled,
    source: { markets: tranche.markets.length, facilities: queue.length },
    geocoding: { accepted: qa.successfullyGeolocated, unresolved: qa.unresolved, precision: qa.precision, precisionClass: qa.precisionClass },
    qa: {
      sharedAddressGroups: qa.sharedAddressGroups.length,
      duplicateCoordinateGroups: qa.duplicateCoordinateGroups.length,
      suspiciousDuplicateCoordinateGroups: qa.suspiciousDuplicateCoordinateGroups.length,
      sharedPointPrecisionDemotions: demotion.demoted.length,
      hardErrors: qa.hardErrors.length,
    },
    canonical: { before: canonicalBefore, after: canonicalAfter, ...projection, digest: projectedDigest },
    cachedRequests: Object.keys(cache.requests).length,
  }, null, 2));
}

void main();
