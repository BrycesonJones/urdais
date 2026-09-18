/**
 * Builds and, only with --fetch, executes the bounded Phase 4A address queue.
 *
 *   npm run map:geocode                 # cache-only deterministic projection
 *   npm run map:geocode -- --fetch      # serialized Nominatim requests, then projection
 *
 * The public Nominatim service permits small one-time jobs only when they are
 * single-threaded, cached and rate limited. This command waits at least 1.1s
 * between requests, identifies Urdais, caches every response and retries only
 * 429/5xx failures (three attempts). It is deliberately not a reusable server.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { parseFacilityImportDocument, type ContractFacility } from "@/lib/facilities/contract";
import { isAiRelevance, isLifecycleStatus } from "@/lib/facilities/domain";
import { applyReadyGeocodes, assessGeocode, buildGeocodingQueue, cacheKey, GEOCODE_OUTCOMES, type GeocodeCacheEntry, type GeocodeOutcome, type GeocodeQueueItem, type GeocodeResult, type NominatimResult } from "./geocoding";
import { parseResearchPackage } from "./research-parser";

const root = process.cwd();
const paths = {
  classB: "docs/operations/map-class-b-42-location-remediation.md",
  phase1: "URDAIS_MAP_RESEARCH_PHASE_1.md",
  global: "URDAIS_GLOBAL_DATA_CENTER_EXPANSION.md",
  dataset: "data/map/facilities.v1.json",
  queue: "data/map/geocoding/address-queue.v1.json",
  cache: "data/map/geocoding/nominatim-cache.v1.json",
  results: "data/map/geocoding/results.v1.json",
  decisions: "data/map/geocoding/review-decisions.v1.json",
};
const fetchEnabled = process.argv.includes("--fetch");
const applyEnabled = process.argv.includes("--apply");

const readJson = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const readOptional = <T>(path: string, fallback: T): T => {
  try { return readJson(path) as T; } catch { return fallback; }
};
const writeJson = (path: string, value: unknown) => writeFileSync(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`);
const sleep = (milliseconds: number) => new Promise((done) => setTimeout(done, milliseconds));

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

function canonicalGlobalFacility(item: GeocodeQueueItem, result: GeocodeResult): ContractFacility {
  const ready = result.outcome === "geocoded_ready" && result.latitude !== null && result.longitude !== null;
  return {
    researchKey: item.researchKey,
    canonicalName: item.canonicalName,
    category: "data_center",
    ownerName: null,
    operatorName: item.operatorName,
    aliases: [],
    location: {
      streetAddress: item.documentedLocation,
      locality: item.locality,
      adminArea: item.adminArea,
      countryName: item.countryName,
      countryCode: item.countryCode,
      latitude: ready ? result.latitude : null,
      longitude: ready ? result.longitude : null,
      coordinatePrecision: item.coordinatePrecision,
      coordinateMethod: ready ? "documented_address_geocode" : null,
      coordinateNotes: ready
        ? `Nominatim geocode of the documented location; query: ${result.query}; returned: ${result.returnedFormattedAddress}; reviewed ${result.geocodedAt.slice(0, 10)}. Original research evidence remains authoritative.`
        : `Phase 4A geocoding outcome: ${result.outcome}. ${result.outcomeReason}`,
    },
    lifecycle: { status: isLifecycleStatus(item.lifecycleStatus) ? item.lifecycleStatus : null },
    facts: [],
    evidence: item.sources.map((source) => ({
      publisher: item.operatorName ?? source.label,
      title: source.label,
      url: source.url,
      documentType: "company_facility_page" as const,
      publishedOn: null,
      verificationState: "unverified" as const,
      verifiedAt: null,
      verificationNotes: "Cited by the approved global data-center expansion artifact; primary-page contents require a later evidence-verification pass.",
      claims: [
        { field: "identity" as const, statement: `${item.canonicalName} is listed in the approved global data-center expansion research.` },
        { field: "location" as const, statement: item.documentedLocation },
      ],
    })),
    quality: {
      confidence: "medium",
      lastVerifiedDate: "2026-09-18",
      reviewNotes: [
        `Canonicalized from URDAIS_GLOBAL_DATA_CENTER_EXPANSION.md; geocoding classification: ${result.outcome}.`,
        result.outcomeReason,
      ],
    },
    aiRelevance: isAiRelevance(item.aiRelevance) ? item.aiRelevance : "unknown",
    requestedPublicationState: ready ? "research" : "review_required",
  };
}

async function main(): Promise<void> {
  const rawDataset = readJson(paths.dataset);
  const parsed = parseFacilityImportDocument(rawDataset);
  if (!parsed.document) throw new Error(`Facility dataset is invalid: ${JSON.stringify(parsed.issues)}`);
  const existing = new Map(parsed.document.facilities.map((facility) => [facility.researchKey, { category: facility.category }]));
  const baselineResearchKeys = new Set(parseResearchPackage(readFileSync(resolve(root, paths.phase1), "utf8")).facilities.map((facility) => facility.researchKey));
  const queue = buildGeocodingQueue({
    classBMarkdown: readFileSync(resolve(root, paths.classB), "utf8"),
    globalMarkdown: readFileSync(resolve(root, paths.global), "utf8"),
    existingFacilities: existing,
    baselineResearchKeys,
  });
  const classB = queue.filter((item) => item.queueSources.includes("class_b_28")).length;
  const global = queue.filter((item) => item.queueSources.includes("global_expansion")).length;
  if (classB !== 28 || global !== 47 || queue.length !== 60) throw new Error(`Queue invariant failed: classB=${classB}, global=${global}, unique=${queue.length}`);

  mkdirSync(resolve(root, "data/map/geocoding"), { recursive: true });
  const cacheDocument = readOptional<{ cacheVersion: string; entries: Record<string, GeocodeCacheEntry> }>(paths.cache, { cacheVersion: "urdais.map.geocode-cache/1", entries: {} });
  let lastRequestAt = 0;
  for (const [index, item] of queue.entries()) {
    const key = cacheKey(item.query, item.countryCode);
    if (cacheDocument.entries[key] || !fetchEnabled) continue;
    const wait = Math.max(0, 1_100 - (Date.now() - lastRequestAt));
    if (wait > 0) await sleep(wait);
    const results = await request(item.query, item.countryCode);
    lastRequestAt = Date.now();
    cacheDocument.entries[key] = { provider: "nominatim", query: item.query, countryCode: item.countryCode, fetchedAt: new Date().toISOString(), results };
    writeJson(paths.cache, cacheDocument);
    console.error(`[${index + 1}/${queue.length}] ${item.researchKey}: ${results.length} candidate(s)`);
  }

  let results: GeocodeResult[] = queue.map((item) => {
    const entry = cacheDocument.entries[cacheKey(item.query, item.countryCode)];
    return entry ? assessGeocode(item, entry) : {
      researchKey: item.researchKey, provider: "nominatim", query: item.query, originalLocation: item.documentedLocation,
      originalSources: item.sources, returnedFormattedAddress: null, latitude: null, longitude: null,
      providerCategory: null, providerType: null, providerImportance: null, outcome: "geocode_no_match",
      outcomeReason: "No cached provider response; run with --fetch.", coordinatePrecision: item.coordinatePrecision,
      geocodedAt: new Date(0).toISOString(), rawResult: null,
    } satisfies GeocodeResult;
  });
  const decisionDocument = readOptional<{ decisions: Record<string, { outcome: GeocodeOutcome; reason: string }> }>(paths.decisions, { decisions: {} });
  results = results.map((result) => {
    const decision = decisionDocument.decisions[result.researchKey];
    if (!decision) return result;
    if (!GEOCODE_OUTCOMES.includes(decision.outcome)) throw new Error(`Invalid reviewed outcome for ${result.researchKey}: ${decision.outcome}`);
    if (decision.outcome === "geocoded_ready" && (result.latitude === null || result.longitude === null)) {
      throw new Error(`Reviewed ready result has no coordinates: ${result.researchKey}`);
    }
    return { ...result, outcome: decision.outcome, outcomeReason: decision.reason };
  });
  const counts = results.reduce<Record<string, number>>((all, result) => ({ ...all, [result.outcome]: (all[result.outcome] ?? 0) + 1 }), {});
  writeJson(paths.queue, { queueVersion: "urdais.map.geocode-queue/1", generatedAt: "2026-09-18", counts: { unique: queue.length, classB, global, globalIncremental: queue.length - classB }, items: queue });
  writeJson(paths.results, { resultVersion: "urdais.map.geocode-results/1", generatedAt: "2026-09-18", provider: "Nominatim", counts, results });

  if (applyEnabled) {
    const updated = applyReadyGeocodes(
      rawDataset.facilities.filter((facility: { researchKey: string }) => baselineResearchKeys.has(facility.researchKey)),
      results,
      queue,
    );
    const byResult = new Map(results.map((result) => [result.researchKey, result]));
    const additions = queue
      .filter((item) => !item.existingFacility)
      .map((item) => canonicalGlobalFacility(item, byResult.get(item.researchKey)!));
    const facilities = [...updated, ...additions];
    writeJson(paths.dataset, {
      ...rawDataset,
      contractVersion: "urdais.map.facility-import/2",
      datasetName: "Urdais canonical facilities through Map Phase 4A",
      researchDocument: "docs/operations/map-phase-4a-geocoding.md",
      generatedAt: "2026-09-18",
      facilities,
    });
  }
  console.log(JSON.stringify({ mode: fetchEnabled ? "fetch" : "cache-only", applied: applyEnabled, queue: { unique: queue.length, classB, global, globalIncremental: queue.length - classB }, results: counts, cached: Object.keys(cacheDocument.entries).length }, null, 2));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; });
