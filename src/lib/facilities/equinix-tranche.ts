/**
 * The Equinix manual-verification tranche: 48 metros, 187 facilities.
 *
 * The shape mirrors the Digital Realty tranche, because the problem is the
 * same one: an operator publishes a facility code and a postal address, and the
 * map needs a defensible coordinate for each. What differs is how Equinix
 * writes an address. Its estate is overwhelmingly *inside* other buildings —
 * "350 E Cermak Rd, 5th Floor", "1950 North Stemmons Freeway, Suite 1034",
 * "2960 Corvin Drive, Pod D", "639 Gardeners Road, Unit B" — so a single street
 * address routinely carries three, four, eight separately coded facilities.
 *
 * That makes two rules load-bearing here in a way they were not for Digital
 * Realty:
 *
 *   1. The floor, suite, pod and unit are stripped from the *geocoder query*
 *      and kept in the *stored address*. A geocoder cannot resolve "Suite 1034"
 *      and returns worse answers when asked to; the suite is still what
 *      distinguishes DA1 from DA2 and belongs in what the map shows.
 *   2. Whatever comes back is then subject to the shared-point rule, which is
 *      not this module's business — it lives in @/lib/map/precision and is
 *      applied to every tranche identically.
 *
 * Nothing here invents a position. A facility whose address the provider cannot
 * resolve is reported unresolved and held out of the canonical projection.
 */

import type { ContractFacility } from "@/lib/facilities/contract";

/** The day the addresses in the frozen artifact were manually verified. */
export const EQUINIX_VERIFIED_DATE = "2026-09-22";
export const EQUINIX_VERIFIED_AT = `${EQUINIX_VERIFIED_DATE}T00:00:00.000Z`;
import type { GeocodeOutcome, GeocodeResult, NominatimResult } from "../../../scripts/map/geocoding";

export type EquinixSourceFacility = {
  facilityCode: string;
  researchKey: string;
  address: string;
  locality: string | null;
  adminArea: string | null;
};

export type EquinixMarket = {
  parentLocationId: string;
  market: string;
  countryName: string;
  countryCode: string;
  sourceUrl: string;
  facilities: EquinixSourceFacility[];
};

export type EquinixTranche = {
  trancheVersion: "urdais.map.equinix-manual-tranche/1";
  datasetName: string;
  generatedAt: string;
  operator: "Equinix";
  status: string;
  coordinateStatus: string;
  source: string;
  provenance: string;
  markets: EquinixMarket[];
};

export type EquinixQueueItem = EquinixSourceFacility & {
  parentLocationId: string;
  market: string;
  countryName: string;
  countryCode: string;
  sourceUrl: string;
  query: string;
  fallbackQuery: string | null;
  streetFallbackQuery: string | null;
};

export type EquinixGeocodeResult = Omit<GeocodeResult, "provider"> & {
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

export function normalizedAddress(value: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/** Every check the frozen artifact must pass before a single request is made. */
export function validateEquinixTranche(raw: unknown): { tranche: EquinixTranche; issues: string[] } {
  const issues: string[] = [];
  const doc = raw as EquinixTranche;
  if (doc?.trancheVersion !== "urdais.map.equinix-manual-tranche/1") issues.push(`unexpected trancheVersion ${String(doc?.trancheVersion)}`);
  if (doc?.operator !== "Equinix") issues.push(`unexpected operator ${String(doc?.operator)}`);
  if (!Array.isArray(doc?.markets)) {
    issues.push("markets is not an array");
    return { tranche: doc, issues };
  }

  const keys = new Set<string>();
  const codes = new Set<string>();
  for (const market of doc.markets) {
    if (!market.sourceUrl) issues.push(`${market.parentLocationId} has no sourceUrl; a facility with no evidence cannot reach the map`);
    if (!market.countryName || !market.countryCode) issues.push(`${market.parentLocationId} is missing a country`);
    for (const facility of market.facilities) {
      if (keys.has(facility.researchKey)) issues.push(`${facility.researchKey} appears more than once`);
      keys.add(facility.researchKey);
      if (codes.has(facility.facilityCode)) issues.push(`facility code ${facility.facilityCode} appears more than once`);
      codes.add(facility.facilityCode);
      if (facility.researchKey !== `equinix-${facility.facilityCode.toLowerCase()}`) {
        issues.push(`${facility.researchKey} does not derive from facility code ${facility.facilityCode}`);
      }
      if (!facility.address?.trim()) issues.push(`${facility.researchKey} has no address`);
      // The artifact is the manual layer. A coordinate in it means something
      // upstream already geocoded, and this stage would be running twice.
      if ("latitude" in facility || "longitude" in facility) issues.push(`${facility.researchKey} already carries a coordinate`);
    }
  }
  return { tranche: doc, issues };
}

/**
 * Interior detail a geocoder cannot resolve. Kept out of the query and left
 * untouched in the stored address, which is what tells DA1 from DA2.
 */
const INTERIOR = new RegExp(
  String.raw`,?\s*(?:` +
    String.raw`(?:Suite|Ste\.?|Unit|Pod|Floor|Fl\.?|Lot|Block|Bldg|Building|Room|Level|Nave|Conjunto|Manzana|Area|of\.?)\s*#?[A-Za-z0-9][A-Za-z0-9./&-]*` +
    String.raw`|\d{1,3}(?:st|nd|rd|th)\s+Floor` +
    String.raw`|\d{1,3}(?:st|nd|rd|th),\s*\d{1,3}(?:st|nd|rd|th)\s+and\s+\d{1,3}(?:st|nd|rd|th)\s+Floors` +
    String.raw`|#\d+[A-Za-z]?(?:-\d+)?` +
    String.raw`|\d{1,2}/F` +
    String.raw`)(?=,|$)`,
  "giu",
);

/** Placeholder text a source used to mean "nothing here". Never a real component. */
const PLACEHOLDER_COMPONENT = /^(?:n\/a|na|none|null|unknown|tbd|-{1,2})$/iu;

/**
 * The query Nominatim is actually asked. Interior detail removed, placeholder
 * components dropped, punctuation tidied. Null when nothing changed, so the
 * caller knows there is no second query worth making.
 */
export function simplifiedEquinixQuery(address: string): string | null {
  const simplified = address
    .replace(INTERIOR, "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "" && !PLACEHOLDER_COMPONENT.test(part))
    .join(", ")
    .replace(/\s{2,}/gu, " ")
    .trim();
  return simplified === address || simplified === "" ? null : simplified;
}

const STREET_WORDS =
  /\b(?:alameda|aleje|avenida|avenue|ave\.?|av\.?|boulevard|blvd\.?|calle|camino|carrera|carretera|cadde|circle|close|court|crescent|drive|dr\.?|estrada|freeway|gasse|gata|gatan|katu|kuja|lane|parkway|place|plaza|rd\.?|road|rua|rue|ruta|str\.?|strasse|straße|street|st\.?|tie|via|v\.?|walk|way|weg)\b/iu;

/**
 * Last resort: the street and its town. Used only when the full and simplified
 * queries both fail, and only when it says something the address did not.
 */
export function streetLevelFallbackQuery(item: EquinixSourceFacility & { countryName: string }): string | null {
  const parts = item.address.split(",").map((part) => part.trim()).filter(Boolean);
  const streetPart = parts.find((part) => STREET_WORDS.test(part));
  if (!streetPart) return null;
  const street = streetPart.replace(INTERIOR, "").trim();
  if (street === "") return null;
  const town = item.locality ?? parts.find((part) => /^[A-Za-zÀ-ÿ' -]{3,}$/u.test(part) && !STREET_WORDS.test(part)) ?? null;
  const query = [street, town, item.countryName].filter(Boolean).join(", ");
  return normalizedAddress(query) === normalizedAddress(item.address) ? null : query;
}

export function materializeEquinixQueue(tranche: EquinixTranche): EquinixQueueItem[] {
  return tranche.markets.flatMap((market) =>
    market.facilities.map((facility) => ({
      ...facility,
      parentLocationId: market.parentLocationId,
      market: market.market,
      countryName: market.countryName,
      countryCode: market.countryCode,
      sourceUrl: market.sourceUrl,
      query: facility.address,
      fallbackQuery: simplifiedEquinixQuery(facility.address),
      streetFallbackQuery: streetLevelFallbackQuery({ ...facility, countryName: market.countryName }),
    })),
  );
}

const BUILDING_TYPES = new Set(["house", "building", "commercial", "industrial", "office", "warehouse", "data_centre", "datacenter", "retail"]);
const STREET_TYPES = new Set(["road", "residential", "tertiary", "secondary", "primary", "trunk", "motorway", "service", "unclassified", "living_street", "pedestrian"]);
const LOWER_TYPES = new Set(["city", "town", "village", "suburb", "neighbourhood", "quarter", "state", "province", "county", "region", "municipality", "administrative", "postcode", "hamlet", "borough", "city_district", "district"]);

/**
 * What the provider's own feature type establishes. A city centroid is not a
 * position, so it is never dressed up as one: it downgrades the outcome to
 * review rather than producing a pin.
 */
export function classifyEquinixPrecision(result: NominatimResult | null): Pick<EquinixGeocodeResult, "coordinatePrecision" | "precisionClass"> {
  if (!result) return { coordinatePrecision: "street", precisionClass: "unresolved" };
  const type = (result.addresstype ?? result.type ?? "").toLowerCase();
  if (BUILDING_TYPES.has(type)) return { coordinatePrecision: "building", precisionClass: "exact_or_rooftop" };
  if (STREET_TYPES.has(type)) return { coordinatePrecision: "street", precisionClass: "interpolated_or_street" };
  if (LOWER_TYPES.has(type)) return { coordinatePrecision: "street", precisionClass: "lower_precision" };
  return { coordinatePrecision: "campus", precisionClass: "exact_or_rooftop" };
}

export function enrichEquinixResult(item: EquinixQueueItem, result: GeocodeResult, selectedQuery: string | null): EquinixGeocodeResult {
  const precision = classifyEquinixPrecision(result.rawResult);
  const outcome: GeocodeOutcome =
    precision.precisionClass === "lower_precision" && result.outcome === "geocoded_ready" ? "geocoded_review" : result.outcome;
  return {
    ...result,
    outcome,
    outcomeReason:
      outcome !== result.outcome
        ? `Provider returned lower-precision ${result.providerType ?? "feature"}; a facility pin requires building, campus, or street precision.`
        : result.outcomeReason,
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

/**
 * Equinix facility codes as OpenStreetMap writes them in a feature name:
 * "Equinix ME1", "Equinix SV5", "Equinix MU4 Rechenzentrum".
 */
const NAMED_CODE = /\bEquinix\s+([A-Z]{2}\d{1,2}x?)\b/giu;

export function namedFacilityCodes(text: string | null): Set<string> {
  const found = new Set<string>();
  for (const match of (text ?? "").matchAll(NAMED_CODE)) found.add(match[1]!.toUpperCase());
  return found;
}

/**
 * Rescues a result the generic assessor called ambiguous, when the provider's
 * own feature name settles the identity.
 *
 * The assessor refuses a response with several similarly ranked candidates,
 * which is right in general and wrong here in one specific case: OpenStreetMap
 * frequently names the data centre itself, so a query for ME1 comes back as a
 * building literally named "Equinix ME1". That is not an ambiguous match; it is
 * the strongest match available, and discarding it would hold back a facility
 * the provider identified by name.
 *
 * The discrimination is what makes this safe, and it is not hypothetical: the
 * same query pattern returns "Equinix ME1" for ME2, "Equinix SY5" for SY4,
 * "Equinix PA3" for PA2, PA9x and PA10, and "Equinix SV17" for SV14 — halls at
 * one address, where the provider located a neighbour rather than the facility
 * asked for. So a result is rescued only when the name carries this facility's
 * code and no other. A name that mentions a different code stays refused.
 */
export function resolveByNamedIdentity(result: EquinixGeocodeResult): EquinixGeocodeResult {
  if (result.outcome !== "geocoded_review" || result.latitude === null || result.longitude === null) return result;
  const codes = namedFacilityCodes(result.returnedFormattedAddress);
  const code = result.facilityCode.toUpperCase();
  if (codes.size !== 1 || !codes.has(code)) return result;
  return {
    ...result,
    outcome: "geocoded_ready",
    outcomeReason:
      `${result.outcomeReason} Resolved: the provider returned a feature named for this facility (${result.returnedFormattedAddress}), ` +
      `which identifies it rather than a neighbour at the same address.`,
  };
}

export type EquinixReviewIssue = "no_candidate" | "ambiguous_shared_location" | "neighbor_facility_match";

export type EquinixReviewCandidate = {
  lat: number;
  lng: number;
  source: string;
  providerType: string | null;
  returnedAddress: string | null;
  reasonRejected: string;
};

export type EquinixReviewRecord = {
  researchKey: string;
  facilityCode: string;
  parentLocationId: string;
  address: string;
  locality: string | null;
  adminArea: string | null;
  countryName: string;
  countryCode: string;
  sourceUrl: string;
  issueType: EquinixReviewIssue;
  issueSummary: string;
  queriesAttempted: string[];
  sharesCampusWith: string[];
  candidateCoordinates: EquinixReviewCandidate[];
  decision: null;
};

/**
 * The address with its interior detail and postcode removed — what two halls
 * in one building genuinely share. "350 E Cermak Rd, 5th Floor" and
 * "350 E Cermak Rd, 6th Floor" share a campus; the full strings do not match.
 */
export function campusKey(address: string, countryCode: string): string {
  const first = address.split(",", 1)[0] ?? "";
  return `${normalizedAddress(first.replace(INTERIOR, ""))}|${countryCode}`;
}

/**
 * Why a facility could not be placed, in the terms a reviewer needs.
 *
 * The three categories are not cosmetic: they call for different work.
 * `no_candidate` needs a source Nominatim does not have. `neighbor_facility_match`
 * has a coordinate that is real but belongs to a different hall, so the reviewer
 * is choosing between "close enough at street precision" and finding the
 * specific building. `ambiguous_shared_location` has candidates the provider
 * could not rank, usually because several facilities occupy one address.
 */
export function classifyReviewIssue(
  result: EquinixGeocodeResult,
  sharesCampus: boolean,
): { issueType: EquinixReviewIssue; issueSummary: string } {
  if (result.latitude === null || result.longitude === null) {
    return {
      issueType: "no_candidate",
      issueSummary: "No acceptable coordinate source returned a result for any query tried.",
    };
  }
  const codes = namedFacilityCodes(result.returnedFormattedAddress);
  const code = result.facilityCode.toUpperCase();
  if (codes.size > 0 && !codes.has(code)) {
    return {
      issueType: "neighbor_facility_match",
      issueSummary: `The returned coordinate belongs to another Equinix facility (${[...codes].sort().join(", ")}), not ${code}.`,
    };
  }
  return {
    issueType: "ambiguous_shared_location",
    issueSummary: sharesCampus
      ? "Evidence exists, but several facilities share this address or campus and the source cannot distinguish them."
      : "The provider returned multiple similarly ranked candidates and none could be preferred on the evidence.",
  };
}

export function canonicalEquinixFacility(item: EquinixQueueItem, result: EquinixGeocodeResult): ContractFacility {
  if (result.outcome !== "geocoded_ready" || result.latitude === null || result.longitude === null) {
    throw new Error(`${item.researchKey} is not ready for canonical projection`);
  }
  return {
    researchKey: item.researchKey,
    canonicalName: `Equinix ${item.facilityCode}`,
    category: "data_center",
    ownerName: "Equinix",
    operatorName: "Equinix",
    aliases: [
      { alias: item.facilityCode, kind: "source_identifier", authority: "Equinix" },
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
      coordinateNotes: result.outcomeReason,
    },
    lifecycle: { status: "operational" },
    evidence: [
      {
        publisher: "Equinix",
        title: `Equinix ${item.market} data centers`,
        url: item.sourceUrl,
        documentType: "company_facility_page",
        publishedOn: null,
        verificationState: "human_verified",
        verifiedAt: EQUINIX_VERIFIED_AT,
        verificationNotes: `Bryceson manually verified ${item.facilityCode} and its address during the ${EQUINIX_VERIFIED_DATE} tranche review.`,
        claims: [
          { field: "identity", statement: `Equinix facility code ${item.facilityCode} belongs to the ${item.market} market listing.` },
          { field: "location", statement: item.address },
        ],
      },
    ],
    quality: {
      confidence: "medium",
      lastVerifiedDate: EQUINIX_VERIFIED_DATE,
      reviewNotes: [`Geocoder precision classification: ${result.precisionClass}.`],
    },
    requestedPublicationState: "research",
  };
}

export function projectEquinixFacilities(
  existing: readonly ContractFacility[],
  queue: readonly EquinixQueueItem[],
  results: readonly EquinixGeocodeResult[],
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
    if (byKey.has(result.researchKey)) updated += 1;
    else inserted += 1;
    byKey.set(result.researchKey, canonicalEquinixFacility(item, result));
  }

  const trancheKeys = new Set(queue.map((item) => item.researchKey));
  const unchangedOutsideTranche = existing.filter((facility) => !trancheKeys.has(facility.researchKey)).length;
  const facilities = [...byKey.values()].sort((a, b) => a.researchKey.localeCompare(b.researchKey));
  return { facilities, inserted, updated, unchangedOutsideTranche, excluded };
}
