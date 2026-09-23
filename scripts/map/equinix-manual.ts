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
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseFacilityImportDocument, type ContractFacility } from "@/lib/facilities/contract";
import {
  campusKey,
  candidatesAgree,
  classifyReviewIssue,
  enrichEquinixResult,
  materializeEquinixQueue,
  geocodeCountryCode,
  stripInterior,
  normalizedAddress,
  projectEquinixFacilities,
  precisionForTier,
  resolveByNamedIdentity,
  type EquinixResolutionTier,
  type EquinixReviewRecord,
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
  resultsV2: "data/map/geocoding/equinix-results.v2.json",
  qa: "data/map/geocoding/equinix-qa.v1.json",
  review: "data/map/geocoding/equinix-review-required.v1.json",
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

/**
 * The digest the frozen artifact is identified by: keys sorted, no whitespace,
 * so a reformat of the file does not read as a change to its content.
 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

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
  const entry = cache.requests[cacheKey(query, geocodeCountryCode(item.countryCode))];
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

/**
 * The resolution ladder, walked once per facility the assessor would not place.
 *
 * Each rung answers a narrower question than the one above it, and the rung
 * reached becomes the precision. Nothing here invents a coordinate: every rung
 * takes a point the provider actually returned, and a facility that reaches the
 * bottom without one stays unresolved.
 *
 *   street  - the candidates the assessor could not choose between all sit
 *             within a block of each other, so the address is established even
 *             though the building is not. Also where a neighbour match lands:
 *             the coordinate is right for the address and wrong for the hall.
 *   campus  - a named estate, park or zone in the address geocoded, so the site
 *             is established and the address within it is not.
 *   city    - only the town resolved. Stored, and deliberately not drawn.
 */
function resolveByLadder(item: EquinixQueueItem, result: EquinixGeocodeResult, cache: RequestCache): { result: EquinixGeocodeResult; tier: EquinixResolutionTier } {
  if (result.outcome === "geocoded_ready" && result.precisionClass !== "lower_precision") {
    return { result, tier: result.coordinatePrecision === "building" ? "provider_building" : "street" };
  }

  const candidatesFor = (query: string | null) => {
    if (!query) return [];
    const entry = cache.requests[cacheKey(query, geocodeCountryCode(item.countryCode))];
    return (entry?.results ?? [])
      .map((candidate) => ({ lat: Number(candidate.lat), lon: Number(candidate.lon), raw: candidate }))
      .filter((candidate) => Number.isFinite(candidate.lat) && Number.isFinite(candidate.lon));
  };

  const take = (
    tier: EquinixResolutionTier,
    candidate: { lat: number; lon: number; raw: NominatimResult },
    query: string,
    why: string,
  ): { result: EquinixGeocodeResult; tier: EquinixResolutionTier } => {
    const { coordinatePrecision } = precisionForTier(tier);
    return {
      tier,
      result: {
        ...result,
        latitude: candidate.lat,
        longitude: candidate.lon,
        returnedFormattedAddress: candidate.raw.display_name ?? result.returnedFormattedAddress,
        providerType: candidate.raw.addresstype ?? candidate.raw.type ?? result.providerType,
        selectedQuery: query,
        outcome: "geocoded_ready",
        coordinatePrecision,
        precisionClass: tier === "provider_building" ? "exact_or_rooftop" : "interpolated_or_street",
        outcomeReason: why,
      },
    };
  };

  // Rung 1 - the street. Every candidate the assessor could not rank, from the
  // address-level queries, describing one place.
  for (const query of [item.query, item.fallbackQuery, item.streetFallbackQuery]) {
    const candidates = candidatesFor(query);
    if (candidates.length === 0) continue;
    if (!candidatesAgree(candidates.map((candidate) => ({ lat: candidate.lat, lon: candidate.lon })))) continue;
    const spread = candidates.length > 1 ? " the candidates returned all describe one place within a block" : " a single candidate was returned";
    return take("street", candidates[0]!, query!,
      `Resolved to street precision:${spread}, so the published address is established while the building within it is not.`);
  }

  // Rung 2 - a named estate, park or zone.
  const campus = candidatesFor(item.campusQuery);
  if (campus.length > 0 && candidatesAgree(campus.map((candidate) => ({ lat: candidate.lat, lon: candidate.lon })), 1_500)) {
    return take("campus", campus[0]!, item.campusQuery!,
      `Resolved to campus precision from the named site in the address (${item.campusQuery}); the site is established and the building within it is not.`);
  }

  // Rung 3 - the town. A location, never a position, and not drawn on the map.
  const city = candidatesFor(item.cityQuery);
  if (city.length > 0) {
    return take("city", city[0]!, item.cityQuery!,
      `Resolved to city precision only (${item.cityQuery}); no street, estate or building could be established, so this record is stored and is not placed on the map.`);
  }

  return { result, tier: "unresolved" };
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

/**
 * The address with its interior detail removed — what two co-located halls
 * share. The interior is not always last: "Unit B, 200 Bourke Road" leads with
 * it, so comparing first components alone would call that a different street
 * from "200 Bourke Road".
 */
function streetBasis(address: string): string {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  // A component that is *entirely* interior ("Unit B") strips to nothing; the
  // street is the first one that survives stripping unchanged.
  const street = parts.find((part) => stripInterior(part) === part && part !== "") ?? parts[0] ?? "";
  return normalizedAddress(street);
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
    // Sharing is inherent to the campus and city rungs: a campus centroid is
    // one point for the whole site, and a city centroid is one point for every
    // facility in the town. Neither claims a building, so neither is suspicious.
    const inherentlyShared = group.items.every((result) => result.coordinatePrecision === "campus" || result.coordinatePrecision === "city");
    return {
      coordinates: group.key,
      researchKeys: group.items.map((item) => item.researchKey),
      // A shared point is expected when the facilities share a street address
      // and none of them claims to have located a building on it, or when the
      // rung they were resolved at shares a point by construction.
      expectedSharedAddress: (streetBases.size === 1 && !claimsBuilding) || inherentlyShared,
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
    // Stored, and not drawn: facility_is_map_eligible admits the three above only.
    city: accepted.filter((result) => result.coordinatePrecision === "city").length,
  };
  const mapEligible = precision.building + precision.street + precision.campus;
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
    mapEligible,
    notMapEligibleCityPrecision: accepted.filter((result) => result.coordinatePrecision === "city").length,
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

/**
 * The unresolved facilities, written out as work a person can actually do.
 *
 * Every candidate the provider returned for every query tried is listed, with
 * the coordinate and why it was not taken — because the reviewer's question is
 * "is one of these right?", and answering it from a bare rejection count is
 * impossible. The `decision` field is null on every record: this file poses the
 * questions and nothing here answers them.
 */
function reviewFile(
  queue: EquinixQueueItem[],
  results: EquinixGeocodeResult[],
  cache: RequestCache,
  sourceArtifactDigest: string,
): { tranche: string; status: string; generatedAt: string; sourceArtifactDigest: string; counts: Record<string, number>; records: EquinixReviewRecord[] } {
  const byKey = new Map(queue.map((item) => [item.researchKey, item]));
  const held = results.filter((result) => !(result.outcome === "geocoded_ready" && result.precisionClass !== "lower_precision"));

  const campuses = new Map<string, string[]>();
  for (const item of queue) {
    const key = campusKey(item.address, item.countryCode);
    campuses.set(key, [...(campuses.get(key) ?? []), item.researchKey]);
  }

  const records: EquinixReviewRecord[] = held.map((result) => {
    const item = byKey.get(result.researchKey)!;
    const cohort = (campuses.get(campusKey(item.address, item.countryCode)) ?? []).filter((key) => key !== result.researchKey);
    const { issueType, issueSummary } = classifyReviewIssue(result, cohort.length > 0);
    const queries = [item.query, item.fallbackQuery, item.streetFallbackQuery]
      .filter((value, index, all): value is string => value !== null && all.indexOf(value) === index);

    const candidates = queries.flatMap((query) => {
      const entry = cache.requests[cacheKey(query, geocodeCountryCode(item.countryCode))];
      return (entry?.results ?? []).map((candidate) => ({
        lat: Number(candidate.lat),
        lng: Number(candidate.lon),
        source: `Nominatim: ${query}`,
        providerType: candidate.addresstype ?? candidate.type ?? null,
        returnedAddress: candidate.display_name ?? null,
        reasonRejected: issueType === "neighbor_facility_match"
          ? issueSummary
          : queries.length > 1 && entry?.results?.length !== 1
            ? "One of several similarly ranked candidates; the provider could not be preferred over the others."
            : "Did not satisfy the locality or country check for this facility.",
      }));
    });

    return {
      researchKey: result.researchKey,
      facilityCode: item.facilityCode,
      parentLocationId: item.parentLocationId,
      address: item.address,
      locality: item.locality,
      adminArea: item.adminArea,
      countryName: item.countryName,
      countryCode: item.countryCode,
      sourceUrl: item.sourceUrl,
      issueType,
      issueSummary,
      queriesAttempted: queries,
      sharesCampusWith: cohort.sort(),
      candidateCoordinates: candidates,
      decision: null,
    };
  });

  records.sort((a, b) => a.researchKey.localeCompare(b.researchKey));
  const counts: Record<string, number> = { total: records.length };
  for (const record of records) counts[record.issueType] = (counts[record.issueType] ?? 0) + 1;
  return {
    tranche: "equinix-manual-tranche.v1",
    status: "review_required",
    generatedAt: GENERATED_AT,
    sourceArtifactDigest,
    counts,
    records,
  };
}

async function main(): Promise<void> {
  const fetchEnabled = process.argv.includes("--fetch");
  const applyEnabled = process.argv.includes("--apply");
  const reviewEnabled = process.argv.includes("--review");
  const resolveEnabled = process.argv.includes("--resolve");

  const { tranche, issues } = validateEquinixTranche(readJson(PATHS.source));
  if (issues.length > 0) throw new Error(`frozen artifact failed validation: ${JSON.stringify(issues, null, 2)}`);
  const queue = materializeEquinixQueue(tranche);
  const cache = readOptional<RequestCache>(PATHS.cache, { cacheVersion: "urdais.map.equinix-geocode-cache/1", requests: {} });
  mkdirSync(resolve(ROOT, "data/map/geocoding"), { recursive: true });
  mkdirSync(resolve(ROOT, "docs/operations"), { recursive: true });

  let lastRequestAt = 0;
  if (fetchEnabled) {
    for (const [index, item] of queue.entries()) {
      for (const query of [item.query, item.fallbackQuery, item.streetFallbackQuery, item.campusQuery, item.cityQuery].filter((value, queryIndex, all): value is string => value !== null && all.indexOf(value) === queryIndex)) {
        const key = cacheKey(query, geocodeCountryCode(item.countryCode));
        if (cache.requests[key]) continue;
        const wait = Math.max(0, 1_100 - (Date.now() - lastRequestAt));
        if (wait > 0) await sleep(wait);
        const raw = await request(query, geocodeCountryCode(item.countryCode));
        lastRequestAt = Date.now();
        cache.requests[key] = { provider: "nominatim", query, countryCode: geocodeCountryCode(item.countryCode), fetchedAt: new Date().toISOString(), results: raw };
        writeJson(PATHS.cache, cache);
        const queryKind = query === item.query ? "full"
          : query === item.fallbackQuery ? "interior-stripped"
          : query === item.streetFallbackQuery ? "street"
          : query === item.campusQuery ? "campus" : "city";
        console.error(`[${index + 1}/${queue.length}] ${item.researchKey}: ${raw.length} candidate(s) for ${queryKind} query`);
        const current = assess(item, query, cache);
        if (current?.outcome === "geocoded_ready") break;
      }
    }
  }

  // A point shared by two facilities locates the address they share, not either
  // building. The rule is the shared one, applied to every tranche identically.
  const chosen = queue.map((item) => chooseResult(item, cache));
  const tiers = new Map<string, EquinixResolutionTier>();
  const laddered = resolveEnabled
    ? chosen.map((result) => {
        const item = queue.find((candidate) => candidate.researchKey === result.researchKey)!;
        const resolved = resolveByLadder(item, result, cache);
        tiers.set(result.researchKey, resolved.tier);
        return resolved.result;
      })
    : chosen;
  const demotion = demoteSharedBuildingPrecision(laddered);
  const results = demotion.results;
  const qa = qaReport(queue, results, demotion.groups);
  // The v1 artifact is the automated-only pass and is frozen at its digest.
  // The resolution ladder writes v2 so the two stages stay separately auditable.
  if (resolveEnabled) {
    writeJson(PATHS.resultsV2, {
      resultVersion: "urdais.map.equinix-geocode-results/2",
      generatedAt: GENERATED_AT,
      provider: "Nominatim",
      basis: "Automated pass (v1) plus the resolution ladder: street, campus, city.",
      resolutionTiers: Object.fromEntries([...tiers.entries()].sort()),
      results,
    });
  } else {
    writeJson(PATHS.results, { resultVersion: "urdais.map.equinix-geocode-results/1", generatedAt: GENERATED_AT, provider: "Nominatim", results });
  }
  writeJson(PATHS.qa, { qaVersion: "urdais.map.equinix-geocode-qa/1", ...qa, sharedPointPrecisionDemotions: demotion.demoted });

  let reviewCounts: Record<string, number> | null = null;
  if (reviewEnabled) {
    const sourceArtifactDigest = createHash("sha256")
      .update(canonicalJson(readJson(PATHS.source)))
      .digest("hex");
    const review = reviewFile(queue, results, cache, sourceArtifactDigest);
    reviewCounts = review.counts;
    writeJson(PATHS.review, review);
  }

  let projectedDigest: string | null = null;
  let canonicalBefore: number | null = null;
  let canonicalAfter: number | null = null;
  let projection: { inserted: number; updated: number; unchangedOutsideTranche: number; excluded: number } = { inserted: 0, updated: 0, unchangedOutsideTranche: 0, excluded: 0 };
  if (applyEnabled) {
    if (qa.hardErrors.length > 0) throw new Error(`QA has ${qa.hardErrors.length} hard error(s); canonical projection refused`);
    if (qa.suspiciousDuplicateCoordinateGroups.length > 0) throw new Error(`QA has ${qa.suspiciousDuplicateCoordinateGroups.length} unexplained duplicate-coordinate group(s); canonical projection refused`);
    const rawDataset = readJson(PATHS.dataset) as Record<string, unknown> & { facilities: ContractFacility[] };
    const parsed = parseFacilityImportDocument(rawDataset);
    if (!parsed.document) throw new Error(`canonical dataset is invalid: ${JSON.stringify(parsed.issues)}`);
    canonicalBefore = parsed.document.facilities.length;
    const applied = projectEquinixFacilities(rawDataset.facilities, queue, results);
    projection = { inserted: applied.inserted, updated: applied.updated, unchangedOutsideTranche: applied.unchangedOutsideTranche, excluded: applied.excluded };
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
    review: reviewCounts,
    resolution: resolveEnabled ? Object.fromEntries(Object.entries([...tiers.values()].reduce<Record<string, number>>((acc, tier) => ({ ...acc, [tier]: (acc[tier] ?? 0) + 1 }), {}))) : null,
    cachedRequests: Object.keys(cache.requests).length,
  }, null, 2));
}

void main();
