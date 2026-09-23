import { demoteSharedBuildingPrecision } from "@/lib/map/precision/demoteSharedBuildingPrecision";
import type { ContractFacility } from "@/lib/facilities/contract";
import type { GeocodeOutcome, GeocodeResult, NominatimResult } from "../../../scripts/map/geocoding";

export const DIGITAL_REALTY_TRANCHE_VERSION = "urdais.map.digital-realty-manual-tranche/1" as const;
export const DIGITAL_REALTY_EXPECTED_MARKETS = 29;
export const DIGITAL_REALTY_EXPECTED_FACILITIES = 166;
export const DIGITAL_REALTY_VERIFIED_DATE = "2026-09-21";
export const DIGITAL_REALTY_VERIFIED_AT = "2026-09-21T00:00:00.000Z";

export type DigitalRealtySourceFacility = {
  facilityCode: string;
  researchKey: string;
  address: string;
  locality: string;
  adminArea: string;
};

export type DigitalRealtyMarket = {
  parentLocationId: string;
  market: string;
  countryName: string;
  countryCode: string;
  sourceUrl: string;
  facilities: DigitalRealtySourceFacility[];
};

export type DigitalRealtyTranche = {
  trancheVersion: string;
  datasetName: string;
  generatedAt: string;
  operator: string;
  sourceWorkbook: string;
  provenance: string;
  markets: DigitalRealtyMarket[];
};

export type DigitalRealtyQueueItem = DigitalRealtySourceFacility & {
  parentLocationId: string;
  market: string;
  countryName: string;
  countryCode: string;
  sourceUrl: string;
  query: string;
  fallbackQuery: string | null;
  streetFallbackQuery: string | null;
};

export type DigitalRealtyGeocodeResult = Omit<GeocodeResult, "provider"> & {
  provider: "nominatim" | "manual_review";
  parentLocationId: string;
  facilityCode: string;
  market: string;
  countryName: string;
  countryCode: string;
  sourceUrl: string;
  selectedQuery: string | null;
  fallbackUsed: boolean;
  precisionClass: "exact_or_rooftop" | "interpolated_or_street" | "lower_precision" | "unresolved";
};

export type DigitalRealtyReviewDecision = {
  researchKey: string;
  action: "accept_provider_result" | "use_reviewed_coordinate";
  coordinatePrecision: "building" | "campus" | "street";
  precisionClass: "exact_or_rooftop" | "interpolated_or_street";
  reason: string;
  latitude?: number;
  longitude?: number;
  returnedFormattedAddress?: string;
  evidenceUrl?: string;
};

export type DigitalRealtyReviewDecisions = {
  decisionVersion: "urdais.map.digital-realty-review-decisions/1";
  reviewedAt: string;
  decisions: DigitalRealtyReviewDecision[];
};

const text = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} must be nonblank text`);
  return value.trim();
};

export function validateDigitalRealtyTranche(raw: unknown): DigitalRealtyTranche {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Digital Realty tranche must be an object");
  const document = raw as DigitalRealtyTranche;
  if (document.trancheVersion !== DIGITAL_REALTY_TRANCHE_VERSION) throw new Error(`unsupported tranche version ${String(document.trancheVersion)}`);
  if (document.operator !== "Digital Realty") throw new Error("operator must be Digital Realty");
  if (!Array.isArray(document.markets) || document.markets.length !== DIGITAL_REALTY_EXPECTED_MARKETS) {
    throw new Error(`tranche must contain ${DIGITAL_REALTY_EXPECTED_MARKETS} markets`);
  }
  const parentIds = new Set<string>();
  const researchKeys = new Set<string>();
  const codes = new Set<string>();
  let facilities = 0;
  for (const [marketIndex, market] of document.markets.entries()) {
    const path = `markets[${marketIndex}]`;
    market.parentLocationId = text(market.parentLocationId, `${path}.parentLocationId`);
    market.market = text(market.market, `${path}.market`);
    market.countryName = text(market.countryName, `${path}.countryName`);
    market.countryCode = text(market.countryCode, `${path}.countryCode`).toUpperCase();
    market.sourceUrl = text(market.sourceUrl, `${path}.sourceUrl`);
    if (!/^https:\/\/www\.digitalrealty\.com\//u.test(market.sourceUrl)) throw new Error(`${path}.sourceUrl is not a Digital Realty HTTPS URL`);
    if (!/^[A-Z]{2}$/u.test(market.countryCode)) throw new Error(`${path}.countryCode is not ISO alpha-2`);
    if (parentIds.has(market.parentLocationId)) throw new Error(`duplicate parent market ID ${market.parentLocationId}`);
    parentIds.add(market.parentLocationId);
    if (!Array.isArray(market.facilities) || market.facilities.length === 0) throw new Error(`${path}.facilities is empty`);
    for (const [facilityIndex, facility] of market.facilities.entries()) {
      const facilityPath = `${path}.facilities[${facilityIndex}]`;
      facility.facilityCode = text(facility.facilityCode, `${facilityPath}.facilityCode`);
      facility.researchKey = text(facility.researchKey, `${facilityPath}.researchKey`);
      facility.address = text(facility.address, `${facilityPath}.address`);
      facility.locality = text(facility.locality, `${facilityPath}.locality`);
      facility.adminArea = text(facility.adminArea, `${facilityPath}.adminArea`);
      if (!/^digital-realty-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(facility.researchKey)) throw new Error(`${facilityPath}.researchKey is invalid`);
      if (researchKeys.has(facility.researchKey)) throw new Error(`duplicate research key ${facility.researchKey}`);
      const codeKey = `${market.parentLocationId}\0${facility.facilityCode.toUpperCase()}`;
      if (codes.has(codeKey)) throw new Error(`duplicate facility code ${facility.facilityCode} in ${market.parentLocationId}`);
      researchKeys.add(facility.researchKey);
      codes.add(codeKey);
      facilities += 1;
    }
  }
  if (facilities !== DIGITAL_REALTY_EXPECTED_FACILITIES) throw new Error(`tranche must contain ${DIGITAL_REALTY_EXPECTED_FACILITIES} facilities, received ${facilities}`);
  const mex01 = document.markets.flatMap((market) => market.facilities).find((facility) => facility.facilityCode === "MEX01");
  if (!mex01 || mex01.address !== "Camino a Nativitas 800, Colon, Querétaro, Mexico") throw new Error("MEX01 must be present with the superseding verified address");
  return document;
}

export function simplifiedAddressQuery(address: string): string | null {
  const simplified = address
    .replace(/\s*[—-]\s*Second Entrance\s*$/iu, "")
    .replace(/,?\s*(?:Building|Bldg|Bâtiment|Block)\s*#?[A-Z0-9-]+/giu, "")
    .replace(/^Crawley Unit\s+\d+,\s*/iu, "")
    .replace(/^Digital Loyang\s+\d+,\s*/iu, "")
    .replace(/\s+,/gu, ",")
    .replace(/,{2,}/gu, ",")
    .trim();
  return simplified === address ? null : simplified;
}

const STREET_WORDS = /\b(?:avenida|avenue|av\.?|calle|camino|carretera|carrera|gasse|landstrasse|landstraße|laan|road|rd\.?|rue|rua|street|st\.?|strasse|straße|weg|way|rodovia)\b/iu;
const STREET_QUERY_OVERRIDES: Record<string, string> = {
  "digital-realty-mex01": "Camino a Nativitas, Colón, Querétaro, Mexico",
  "digital-realty-mex02": "Carretera Estatal 100, Colón, Querétaro, Mexico",
  "digital-realty-mex03": "Ejido San Vicente, Colón, Querétaro, Mexico",
};

export function streetLevelFallbackQuery(item: DigitalRealtySourceFacility, market: DigitalRealtyMarket): string | null {
  const override = STREET_QUERY_OVERRIDES[item.researchKey];
  if (override) return override;
  const parts = item.address.split(",").map((part) => part.trim()).filter(Boolean);
  const streetPart = parts.find((part) => STREET_WORDS.test(part) && !/^off\b/iu.test(part))
    ?? parts.find((part) => !/^(?:unit|building|bldg|block|bâtiment|cep|ch-?\d|dk-?\d|\d{4,6})\b/iu.test(part));
  if (!streetPart) return null;
  const street = streetPart
    .replace(/^Unit\s+\d+\s+/iu, "")
    .replace(/\s+\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?\s*$/u, "")
    .trim();
  if (street === "" || normalizedAddress(street) === normalizedAddress(item.locality)) return null;
  const query = `${street}, ${item.locality}, ${market.countryName}`;
  return normalizedAddress(query) === normalizedAddress(item.address) ? null : query;
}

export function materializeDigitalRealtyQueue(document: DigitalRealtyTranche): DigitalRealtyQueueItem[] {
  return document.markets.flatMap((market) => market.facilities.map((facility) => ({
    ...facility,
    parentLocationId: market.parentLocationId,
    market: market.market,
    countryName: market.countryName,
    countryCode: market.countryCode,
    sourceUrl: market.sourceUrl,
    query: facility.address,
    fallbackQuery: simplifiedAddressQuery(facility.address),
    streetFallbackQuery: streetLevelFallbackQuery(facility, market),
  }))).sort((a, b) => a.researchKey.localeCompare(b.researchKey));
}

const BUILDING_TYPES = new Set(["house", "building", "commercial", "industrial", "office", "warehouse", "data_centre", "datacenter"]);
const STREET_TYPES = new Set(["road", "street", "route", "residential"]);
const LOWER_TYPES = new Set(["postcode", "city", "town", "village", "municipality", "administrative", "county", "state", "suburb", "neighbourhood"]);

export function classifyProviderPrecision(result: NominatimResult | null): Pick<DigitalRealtyGeocodeResult, "coordinatePrecision" | "precisionClass"> {
  if (!result) return { coordinatePrecision: "street", precisionClass: "unresolved" };
  const type = (result.addresstype ?? result.type ?? "").toLowerCase();
  if (BUILDING_TYPES.has(type)) return { coordinatePrecision: "building", precisionClass: "exact_or_rooftop" };
  if (STREET_TYPES.has(type)) return { coordinatePrecision: "street", precisionClass: "interpolated_or_street" };
  if (LOWER_TYPES.has(type)) return { coordinatePrecision: "street", precisionClass: "lower_precision" };
  return { coordinatePrecision: "campus", precisionClass: "exact_or_rooftop" };
}

export function enrichDigitalRealtyResult(
  item: DigitalRealtyQueueItem,
  result: GeocodeResult,
  selectedQuery: string | null,
): DigitalRealtyGeocodeResult {
  const precision = classifyProviderPrecision(result.rawResult);
  const outcome: GeocodeOutcome = precision.precisionClass === "lower_precision" && result.outcome === "geocoded_ready" ? "geocoded_review" : result.outcome;
  return {
    ...result,
    outcome,
    outcomeReason: outcome !== result.outcome ? `Provider returned lower-precision ${result.providerType ?? "feature"}; a facility pin requires building, campus, or street precision.` : result.outcomeReason,
    coordinatePrecision: precision.coordinatePrecision,
    precisionClass: result.latitude === null || result.longitude === null ? "unresolved" : precision.precisionClass,
    parentLocationId: item.parentLocationId,
    facilityCode: item.facilityCode,
    market: item.market,
    countryName: item.countryName,
    countryCode: item.countryCode,
    sourceUrl: item.sourceUrl,
    selectedQuery,
    fallbackUsed: selectedQuery !== null && selectedQuery !== item.query,
  };
}

export function applyDigitalRealtyReviewDecisions(
  results: readonly DigitalRealtyGeocodeResult[],
  decisionsDocument: DigitalRealtyReviewDecisions,
): DigitalRealtyGeocodeResult[] {
  if (decisionsDocument.decisionVersion !== "urdais.map.digital-realty-review-decisions/1") {
    throw new Error(`unsupported Digital Realty review decision version ${String(decisionsDocument.decisionVersion)}`);
  }
  const decisions = new Map<string, DigitalRealtyReviewDecision>();
  for (const decision of decisionsDocument.decisions) {
    if (decisions.has(decision.researchKey)) throw new Error(`duplicate review decision for ${decision.researchKey}`);
    decisions.set(decision.researchKey, decision);
  }
  const resultKeys = new Set(results.map((result) => result.researchKey));
  for (const key of decisions.keys()) if (!resultKeys.has(key)) throw new Error(`review decision has no tranche result: ${key}`);
  return results.map((result) => {
    const decision = decisions.get(result.researchKey);
    if (!decision) return result;
    if (decision.action === "accept_provider_result") {
      if (result.latitude === null || result.longitude === null || result.outcome !== "geocoded_review") {
        throw new Error(`${result.researchKey} does not have a reviewable provider coordinate`);
      }
      return {
        ...result,
        outcome: "geocoded_ready",
        outcomeReason: decision.reason,
        coordinatePrecision: decision.coordinatePrecision,
        precisionClass: decision.precisionClass,
      };
    }
    if (!Number.isFinite(decision.latitude) || !Number.isFinite(decision.longitude) || !decision.returnedFormattedAddress || !decision.evidenceUrl) {
      throw new Error(`${result.researchKey} reviewed coordinate decision is incomplete`);
    }
    return {
      ...result,
      provider: "manual_review",
      query: result.originalLocation,
      selectedQuery: result.originalLocation,
      returnedFormattedAddress: decision.returnedFormattedAddress,
      latitude: decision.latitude!,
      longitude: decision.longitude!,
      providerCategory: "facility_registry",
      providerType: "facility",
      providerImportance: null,
      rawResult: null,
      outcome: "geocoded_ready",
      outcomeReason: `${decision.reason} Coordinate evidence: ${decision.evidenceUrl}`,
      coordinatePrecision: decision.coordinatePrecision,
      precisionClass: decision.precisionClass,
      fallbackUsed: false,
      geocodedAt: decisionsDocument.reviewedAt,
    };
  });
}

export function canonicalDigitalRealtyFacility(item: DigitalRealtyQueueItem, result: DigitalRealtyGeocodeResult): ContractFacility {
  if (result.outcome !== "geocoded_ready" || result.latitude === null || result.longitude === null) throw new Error(`${item.researchKey} is not ready for canonical projection`);
  return {
    researchKey: item.researchKey,
    canonicalName: `Digital Realty ${item.facilityCode}`,
    category: "data_center",
    ownerName: "Digital Realty",
    operatorName: "Digital Realty",
    aliases: [
      { alias: item.facilityCode, kind: "source_identifier", authority: "Digital Realty" },
      { alias: item.parentLocationId, kind: "source_identifier", authority: "Urdais manual-verification parent market" },
    ],
    location: {
      streetAddress: item.address,
      locality: item.locality,
      adminArea: item.adminArea,
      countryName: item.countryName,
      countryCode: item.countryCode,
      latitude: result.latitude,
      longitude: result.longitude,
      coordinatePrecision: result.coordinatePrecision,
      coordinateMethod: "documented_address_geocode",
      coordinateNotes: `${result.provider === "nominatim" ? "Nominatim geocode" : "Manually reviewed facility-registry coordinate"} of the manually verified Digital Realty address; query: ${result.selectedQuery}; returned: ${result.returnedFormattedAddress}; reviewed ${DIGITAL_REALTY_VERIFIED_DATE}. ${result.fallbackUsed ? "A deterministic building/unit-stripped fallback query was used after the full address did not produce a safe result. " : ""}${result.outcomeReason} The supplied address remains authoritative.`,
    },
    lifecycle: { status: null, announcedDate: null, constructionStartDate: null, operationalDate: null },
    facts: [],
    evidence: [{
      publisher: "Digital Realty",
      title: `Digital Realty ${item.market} data centers`,
      url: item.sourceUrl,
      documentType: "company_facility_page",
      publishedOn: null,
      verificationState: "human_verified",
      verifiedAt: DIGITAL_REALTY_VERIFIED_AT,
      verificationNotes: `Bryceson manually verified ${item.facilityCode} and its address during the ${DIGITAL_REALTY_VERIFIED_DATE} tranche review.`,
      claims: [
        { field: "identity", statement: `Digital Realty facility code ${item.facilityCode} belongs to the ${item.market} market listing.` },
        { field: "location", statement: item.address },
      ],
    }],
    quality: {
      confidence: "medium",
      lastVerifiedDate: DIGITAL_REALTY_VERIFIED_DATE,
      reviewNotes: [
        `Materialized from parent market ${item.parentLocationId}; the parent is not itself a physical facility record.`,
        `Geocoder precision classification: ${result.precisionClass}.`,
      ],
    },
    aiRelevance: "unknown",
    requestedPublicationState: "research",
  };
}

export function projectDigitalRealtyFacilities(
  existing: readonly ContractFacility[],
  queue: readonly DigitalRealtyQueueItem[],
  results: readonly DigitalRealtyGeocodeResult[],
): { facilities: ContractFacility[]; inserted: number; updated: number; unchangedOutsideTranche: number; excluded: number } {
  const byKey = new Map(existing.map((facility) => [facility.researchKey, facility]));
  const queueByKey = new Map(queue.map((item) => [item.researchKey, item]));
  let inserted = 0;
  let updated = 0;
  let excluded = 0;
  for (const result of results) {
    if (result.outcome !== "geocoded_ready" || result.precisionClass === "lower_precision" || result.latitude === null || result.longitude === null) {
      excluded += 1;
      continue;
    }
    const item = queueByKey.get(result.researchKey);
    if (!item) throw new Error(`geocode result is absent from the tranche queue: ${result.researchKey}`);
    const facility = canonicalDigitalRealtyFacility(item, result);
    if (byKey.has(result.researchKey)) updated += 1;
    else inserted += 1;
    byKey.set(result.researchKey, facility);
  }
  const trancheKeys = new Set(queue.map((item) => item.researchKey));
  const unchangedOutsideTranche = existing.filter((facility) => !trancheKeys.has(facility.researchKey)).length;
  return { facilities: [...byKey.values()], inserted, updated, unchangedOutsideTranche, excluded };
}

export function normalizedAddress(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

/** Re-exported so the Digital Realty generator and its tests keep one import site. */
export { demoteSharedBuildingPrecision };
