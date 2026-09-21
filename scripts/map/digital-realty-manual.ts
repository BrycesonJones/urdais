/**
 * Materialize, geocode, QA, and optionally project the frozen Digital Realty
 * manual-verification tranche into the canonical facility document.
 *
 *   npm run map:digital-realty                 # cache-only QA, no canonical write
 *   npm run map:digital-realty -- --fetch      # bounded Nominatim requests + QA
 *   npm run map:digital-realty -- --apply      # project only safe results
 *
 * Production persistence remains the existing `npm run map:import` workflow.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseFacilityImportDocument, type ContractFacility } from "@/lib/facilities/contract";
import {
  DIGITAL_REALTY_EXPECTED_FACILITIES,
  DIGITAL_REALTY_EXPECTED_MARKETS,
  applyDigitalRealtyReviewDecisions,
  demoteSharedBuildingPrecision,
  enrichDigitalRealtyResult,
  materializeDigitalRealtyQueue,
  normalizedAddress,
  projectDigitalRealtyFacilities,
  validateDigitalRealtyTranche,
  type DigitalRealtyGeocodeResult,
  type DigitalRealtyQueueItem,
  type DigitalRealtyReviewDecisions,
} from "@/lib/facilities/digital-realty-tranche";
import { assessGeocode, cacheKey, type GeocodeCacheEntry, type GeocodeQueueItem, type GeocodeResult, type NominatimResult } from "./geocoding";

const ROOT = process.cwd();
const PATHS = {
  source: "data/map/digital-realty-manual-tranche.v1.json",
  decisions: "data/map/geocoding/digital-realty-review-decisions.v1.json",
  cache: "data/map/geocoding/digital-realty-cache.v1.json",
  results: "data/map/geocoding/digital-realty-results.v1.json",
  qa: "data/map/geocoding/digital-realty-qa.v1.json",
  report: "docs/operations/map-digital-realty-manual-tranche.md",
  dataset: "data/map/facilities.v1.json",
} as const;

type RequestCache = {
  cacheVersion: "urdais.map.digital-realty-geocode-cache/1";
  requests: Record<string, GeocodeCacheEntry>;
};

const readJson = (path: string): unknown => JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
const readOptional = <T>(path: string, fallback: T): T => {
  try { return readJson(path) as T; } catch { return fallback; }
};
const writeJson = (path: string, value: unknown): void => writeFileSync(resolve(ROOT, path), `${JSON.stringify(value, null, 2)}\n`, "utf8");
const sleep = (milliseconds: number) => new Promise((done) => setTimeout(done, milliseconds));

function asQueueItem(item: DigitalRealtyQueueItem, query: string): GeocodeQueueItem {
  return {
    researchKey: item.researchKey,
    canonicalName: `Digital Realty ${item.facilityCode}`,
    category: "data_center",
    documentedLocation: item.address,
    locality: item.locality,
    // Nominatim localizes first-order region names (Hesse/Hessen,
    // North Holland/Noord-Holland, etc.). Country and supplied-locality checks
    // remain strict; region is retained for QA/reporting rather than compared
    // as an English string inside the generic Phase 4A assessor.
    adminArea: null,
    countryName: item.countryName,
    countryCode: item.countryCode,
    coordinatePrecision: "building",
    query,
    sources: [{ label: `Digital Realty ${item.market}`, url: item.sourceUrl }],
    queueSources: ["manual_verification"],
    existingFacility: false,
    operatorName: "Digital Realty",
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

function missing(item: DigitalRealtyQueueItem): GeocodeResult {
  return {
    researchKey: item.researchKey,
    provider: "nominatim",
    query: item.query,
    originalLocation: item.address,
    originalSources: [{ label: `Digital Realty ${item.market}`, url: item.sourceUrl }],
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

function assess(item: DigitalRealtyQueueItem, query: string, cache: RequestCache): GeocodeResult | null {
  const entry = cache.requests[cacheKey(query, item.countryCode)];
  return entry ? assessGeocode(asQueueItem(item, query), entry) : null;
}

function chooseResult(item: DigitalRealtyQueueItem, cache: RequestCache): DigitalRealtyGeocodeResult {
  const attempts = [item.query, item.fallbackQuery, item.streetFallbackQuery]
    .filter((value, index, all): value is string => value !== null && all.indexOf(value) === index)
    .map((query) => ({ query, result: assess(item, query, cache) }))
    .filter((attempt): attempt is { query: string; result: GeocodeResult } => attempt.result !== null);
  const selected = attempts.find((attempt) => attempt.result.outcome === "geocoded_ready")
    ?? attempts.find((attempt) => attempt.result.latitude !== null && attempt.result.longitude !== null)
    ?? attempts[0];
  return enrichDigitalRealtyResult(item, selected?.result ?? missing(item), selected?.query ?? null);
}

function coordinateKey(result: DigitalRealtyGeocodeResult): string | null {
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

function streetBasis(address: string): string {
  return normalizedAddress(address.split(",", 1)[0]!
    .replace(/^\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?\s+/u, "")
    .replace(/\s+\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?$/u, ""))
    .replace(/^(?:avenida|avenue|av|calle|carrera|road|rodovia|rue|rua|street)\s+/u, "");
}

function qaReport(queue: DigitalRealtyQueueItem[], results: DigitalRealtyGeocodeResult[]) {
  const byKey = new Map(queue.map((item) => [item.researchKey, item]));
  const accepted = results.filter((result) => result.outcome === "geocoded_ready" && result.precisionClass !== "lower_precision");
  const unresolved = results.filter((result) => !accepted.includes(result));
  const sharedAddresses = groupBy(queue, (item) => normalizedAddress(item.address));
  const coordinateGroups = groupBy(accepted, coordinateKey);
  const duplicateCoordinates = coordinateGroups.map((group) => {
    const baseQueries = new Set(group.items.map((result) => normalizedAddress(byKey.get(result.researchKey)!.streetFallbackQuery ?? byKey.get(result.researchKey)!.fallbackQuery ?? byKey.get(result.researchKey)!.query)));
    const streetBases = new Set(group.items.map((result) => streetBasis(byKey.get(result.researchKey)!.address)));
    const everyCoordinateIsStreetLevel = group.items.every((result) => result.coordinatePrecision === "street");
    return {
      coordinates: group.key,
      researchKeys: group.items.map((item) => item.researchKey),
      expectedSharedAddress: baseQueries.size === 1 || (everyCoordinateIsStreetLevel && streetBases.size === 1),
      addresses: group.items.map((result) => byKey.get(result.researchKey)!.address),
    };
  });
  const hardErrors = accepted.flatMap((result) => {
    const reasons: string[] = [];
    if (result.latitude === null || result.longitude === null) reasons.push("accepted result has null coordinates");
    if (result.latitude === 0 && result.longitude === 0) reasons.push("accepted result is (0,0)");
    if (result.latitude !== null && (result.latitude < -90 || result.latitude > 90)) reasons.push("latitude outside valid range");
    if (result.longitude !== null && (result.longitude < -180 || result.longitude > 180)) reasons.push("longitude outside valid range");
    if (result.precisionClass === "lower_precision") reasons.push("accepted result is lower precision");
    return reasons.map((reason) => ({ researchKey: result.researchKey, reason }));
  });
  const precision = {
    exactOrRooftop: accepted.filter((result) => result.precisionClass === "exact_or_rooftop").length,
    interpolatedOrStreet: accepted.filter((result) => result.precisionClass === "interpolated_or_street").length,
    lowerPrecision: results.filter((result) => result.precisionClass === "lower_precision").length,
    unresolved: unresolved.filter((result) => result.latitude === null || result.longitude === null).length,
  };
  return {
    generatedAt: "2026-09-21",
    markets: DIGITAL_REALTY_EXPECTED_MARKETS,
    physicalFacilities: DIGITAL_REALTY_EXPECTED_FACILITIES,
    successfullyGeolocated: accepted.length,
    unresolved: unresolved.length,
    excludedFromCanonicalWrite: unresolved.length,
    precision,
    sharedAddressGroups: sharedAddresses.map((group) => ({ normalizedAddress: group.key, researchKeys: group.items.map((item) => item.researchKey), addresses: group.items.map((item) => item.address) })),
    duplicateCoordinateGroups: duplicateCoordinates,
    suspiciousDuplicateCoordinateGroups: duplicateCoordinates.filter((group) => !group.expectedSharedAddress),
    hardErrors,
    unresolvedRecords: unresolved.map((result) => ({
      parentLocationId: result.parentLocationId,
      facilityCode: result.facilityCode,
      researchKey: result.researchKey,
      address: byKey.get(result.researchKey)!.address,
      returnedCoordinates: result.latitude === null || result.longitude === null ? null : [result.latitude, result.longitude],
      precision: result.precisionClass,
      outcome: result.outcome,
      reason: result.outcomeReason,
    })),
  };
}

function markdownReport(qa: ReturnType<typeof qaReport>, digest: string | null): string {
  const unresolved = qa.unresolvedRecords.length === 0
    ? "None."
    : qa.unresolvedRecords.map((item) => `| ${item.parentLocationId} | ${item.facilityCode} | ${item.address.replaceAll("|", "\\|")} | ${item.returnedCoordinates?.join(", ") ?? "null"} | ${item.precision} | ${item.reason.replaceAll("|", "\\|")} |`).join("\n");
  return `# Digital Realty manual-verification tranche\n\nGenerated 21 September 2026 from the frozen manual-verification input. The source artifact is \`data/map/digital-realty-manual-tranche.v1.json\`. Digital Realty's market pages are the cited primary evidence; the manually verified facility code and address remain authoritative, while Nominatim supplies only the coordinate transformation.\n\n## Outcome\n\n| Measure | Count |\n| --- | ---: |\n| Parent market IDs | ${qa.markets} |\n| Physical facilities | ${qa.physicalFacilities} |\n| Successfully geolocated and canonical-write eligible | ${qa.successfullyGeolocated} |\n| Unresolved / excluded | ${qa.unresolved} |\n| Exact-address / rooftop or named-feature results | ${qa.precision.exactOrRooftop} |\n| Interpolated / street-level results | ${qa.precision.interpolatedOrStreet} |\n| Lower-precision results | ${qa.precision.lowerPrecision} |\n| Shared-address groups | ${qa.sharedAddressGroups.length} |\n| Duplicate-coordinate groups | ${qa.duplicateCoordinateGroups.length} |\n| Suspicious duplicate-coordinate groups | ${qa.suspiciousDuplicateCoordinateGroups.length} |\n| Hard errors | ${qa.hardErrors.length} |\n\nCanonical dataset digest after projection: ${digest ?? "not projected"}.\n\nMEX01 is included as \`digital-realty-mex01\` with the superseding verified address \`Camino a Nativitas 800, Colon, Querétaro, Mexico\`.\n\n## Records requiring review\n\n${qa.unresolvedRecords.length === 0 ? unresolved : `| Parent ID | Code | Supplied address | Returned coordinates | Precision | Reason |\n| --- | --- | --- | --- | --- | --- |\n${unresolved}`}\n\n## Duplicate-coordinate review\n\nExact coordinate equality never merges records. ${qa.suspiciousDuplicateCoordinateGroups.length === 0 ? "Every duplicate-coordinate group is explained by a shared normalized address." : `${qa.suspiciousDuplicateCoordinateGroups.length} group(s) use different supplied street strings and require review in the JSON QA artifact before production.`}\n`;
}

async function main(): Promise<void> {
  const fetchEnabled = process.argv.includes("--fetch");
  const applyEnabled = process.argv.includes("--apply");
  const tranche = validateDigitalRealtyTranche(readJson(PATHS.source));
  const queue = materializeDigitalRealtyQueue(tranche);
  const cache = readOptional<RequestCache>(PATHS.cache, { cacheVersion: "urdais.map.digital-realty-geocode-cache/1", requests: {} });
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
        const queryKind = query === item.query ? "full" : query === item.fallbackQuery ? "building-stripped fallback" : "street fallback";
        console.error(`[${index + 1}/${queue.length}] ${item.researchKey}: ${raw.length} candidate(s) for ${queryKind} query`);
        const current = assess(item, query, cache);
        if (current?.outcome === "geocoded_ready") break;
      }
    }
  }

  const decisions = readOptional<DigitalRealtyReviewDecisions>(PATHS.decisions, {
    decisionVersion: "urdais.map.digital-realty-review-decisions/1",
    reviewedAt: "2026-09-21T00:00:00.000Z",
    decisions: [],
  });
  const reviewed = applyDigitalRealtyReviewDecisions(queue.map((item) => chooseResult(item, cache)), decisions);
  // A point shared by two facilities locates the address they share, not either
  // building. Applied after the review decisions so a reviewer's explicit
  // precision is still subject to what the coordinate can actually support.
  const demotion = demoteSharedBuildingPrecision(reviewed);
  const results = demotion.results;
  const qa = qaReport(queue, results);
  writeJson(PATHS.results, { resultVersion: "urdais.map.digital-realty-geocode-results/1", generatedAt: "2026-09-21", provider: "Nominatim", results });
  writeJson(PATHS.qa, { qaVersion: "urdais.map.digital-realty-geocode-qa/1", ...qa, sharedPointPrecisionDemotions: demotion.demoted });

  let projectedDigest: string | null = null;
  let canonicalBefore: number | null = null;
  let canonicalAfter: number | null = null;
  let inserted = 0;
  if (applyEnabled) {
    if (qa.hardErrors.length > 0) throw new Error(`QA has ${qa.hardErrors.length} hard error(s); canonical projection refused`);
    if (qa.suspiciousDuplicateCoordinateGroups.length > 0) throw new Error(`QA has ${qa.suspiciousDuplicateCoordinateGroups.length} unexplained duplicate-coordinate group(s); canonical projection refused`);
    const rawDataset = readJson(PATHS.dataset) as Record<string, unknown> & { facilities: ContractFacility[] };
    const parsed = parseFacilityImportDocument(rawDataset);
    if (!parsed.document) throw new Error(`canonical dataset is invalid: ${JSON.stringify(parsed.issues)}`);
    canonicalBefore = parsed.document.facilities.length;
    // Validate through the parser, but project onto the raw records so optional
    // fields omitted by prior batches are not mechanically rewritten as null.
    const projection = projectDigitalRealtyFacilities(rawDataset.facilities, queue, results);
    inserted = projection.inserted;
    const facilities = projection.facilities;
    canonicalAfter = facilities.length;
    const output = {
      ...rawDataset,
      contractVersion: "urdais.map.facility-import/2",
      generatedAt: "2026-09-21",
      facilities,
    };
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
    geocoding: { accepted: qa.successfullyGeolocated, unresolved: qa.unresolved, precision: qa.precision },
    qa: { sharedAddressGroups: qa.sharedAddressGroups.length, duplicateCoordinateGroups: qa.duplicateCoordinateGroups.length, suspiciousDuplicateCoordinateGroups: qa.suspiciousDuplicateCoordinateGroups.length, hardErrors: qa.hardErrors.length },
    canonical: { before: canonicalBefore, after: canonicalAfter, inserted, digest: projectedDigest },
    cachedRequests: Object.keys(cache.requests).length,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
