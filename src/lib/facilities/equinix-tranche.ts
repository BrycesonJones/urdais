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
  campusQuery: string | null;
  cityQuery: string | null;
};

export type EquinixGeocodeResult = Omit<GeocodeResult, "provider" | "coordinatePrecision"> & {
  provider: "nominatim" | "precision_recovery" | "manual_review";
  /**
   * Widened past the geocoder's own union to include `city`. A city centroid is
   * a location and not a position, so it is stored and is not map-eligible —
   * reference.facility_is_map_eligible admits building, campus and street only.
   */
  coordinatePrecision: "building" | "campus" | "street" | "city";
  parentLocationId: string;
  facilityCode: string;
  market: string;
  countryName: string;
  countryCode: string;
  sourceUrl: string;
  selectedQuery: string | null;
  fallbackUsed: boolean;
  precisionClass: "exact_or_rooftop" | "interpolated_or_street" | "lower_precision" | "unresolved";
  /** Coordinate-specific evidence added after the original Nominatim pass. */
  coordinateEvidenceUrls?: readonly string[];
  /** Sources inspected during recovery, including sources rejected as conflicting. */
  researchEvidenceUrls?: readonly string[];
  evidenceTier?: string;
  recoveryConfidence?: "high" | "medium" | "low";
  recoveryDisposition?: "upgrade" | "retain_city" | "needs_human_review";
  reviewedAt?: string;
  reviewer?: string;
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

/**
 * A named estate, park or zone inside an address. These geocode far better
 * than the street line does in places where OpenStreetMap has the estate
 * mapped but not the house number: "Citywest Business Campus",
 * "Manchester Science Park", "Parque Industrial Nexxus Aeropuerto",
 * "International Media Production Zone", "Masdar City".
 */
const CAMPUS_WORDS =
  /\b(?:business (?:park|campus)|science park|technology park|tecnologico|tecnológico|industrial (?:park|estate)|corporate park|free trade zone|production zone|parque (?:industrial|tecnologico|tecnológico)|polígono|organize sanayi|osb|impz|masdar city|innovation|campus|park|estate|zone)\b/iu;

export function campusNameQuery(item: EquinixSourceFacility & { countryName: string }): string | null {
  const parts = item.address.split(",").map((part) => part.trim()).filter(Boolean);
  const named = parts.find((part) => CAMPUS_WORDS.test(part) && !/^\d/u.test(part));
  if (!named) return null;
  const cleaned = named.replace(INTERIOR, "").replace(/\s*\(.*?\)\s*/gu, " ").trim();
  if (cleaned === "") return null;
  const town = item.locality ?? cityFromAddress(item.address);
  return [cleaned, town, item.countryName].filter(Boolean).join(", ");
}

/**
 * The town an address is in, read off the component before the country.
 * Postcodes are attached to the town in most of the world, so they are stripped
 * rather than searched for.
 */
export function cityFromAddress(address: string): string | null {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  // Walk back from the country, because the component before it is often only
  // a state and a postcode ("VIC 3207", "NSW 2020") and the town is the one
  // before that. A component that is nothing but codes is skipped, not used.
  for (let index = parts.length - 2; index >= 1; index -= 1) {
    const town = (parts[index] ?? "")
      .replace(/\b[A-Z]{1,3}[-\s]?\d{3,6}(?:-\d{3,4})?\b/gu, "")
      .replace(/\b\d{3,6}(?:-\d{3,4})?\b/gu, "")
      .replace(/\b[A-Z]{1,2}\d{1,2}[A-Z]?\s+\d[A-Z]{2}\b/gu, "")
      .replace(/\s{2,}/gu, " ")
      .replace(/^[\s,.-]+|[\s,.-]+$/gu, "")
      .trim();
    // A bare state, province or territory code is a region, not a town —
    // "VIC", "NSW", and Hong Kong's "N.T." for the New Territories.
    if (town === "" || /^[A-Z]{1,3}$/u.test(town.replace(/[.\s]/gu, ""))) continue;
    if (STREET_WORDS.test(town)) continue;
    return town;
  }
  return null;
}

/** The last resort: the town itself, which is a location and never a position. */
export function cityQuery(item: EquinixSourceFacility & { countryName: string }): string | null {
  const town = item.locality ?? cityFromAddress(item.address);
  return town ? `${town}, ${item.countryName}` : null;
}

/** An address component with its interior detail removed. Empty when the component was nothing but interior. */
export function stripInterior(component: string): string {
  return component.replace(INTERIOR, "").replace(/\s{2,}/gu, " ").trim();
}

/**
 * The country code to filter the *geocoder* by, which is not always the
 * facility's country code.
 *
 * OpenStreetMap files Hong Kong under China, so countrycodes=hk matches
 * nothing and every Hong Kong query comes back empty. The stored countryCode
 * stays HK, which is correct ISO 3166-1 and what the map serves; only the
 * provider filter changes.
 */
const GEOCODE_COUNTRY_OVERRIDES: Record<string, string> = { HK: "cn", MO: "cn" };

export function geocodeCountryCode(countryCode: string): string {
  return (GEOCODE_COUNTRY_OVERRIDES[countryCode.toUpperCase()] ?? countryCode).toLowerCase();
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
      campusQuery: campusNameQuery({ ...facility, countryName: market.countryName }),
      // The operator's own market name is the last fallback: an address like
      // "6/F, 1 Wang Wo Tsai Street, Hong Kong" carries no town component.
      cityQuery: cityQuery({ ...facility, countryName: market.countryName }) ?? `${market.market}, ${market.countryName}`,
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

export type EquinixResolutionTier = "provider_building" | "street" | "campus" | "city" | "unresolved";

/**
 * How far apart two coordinates are, in metres. Equirectangular is ample at the
 * scale this is used for — deciding whether a handful of candidates describe
 * one place or several.
 */
export function metresBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const x = toRad(bLon - aLon) * Math.cos(toRad((aLat + bLat) / 2));
  const y = toRad(bLat - aLat);
  return Math.sqrt(x * x + y * y) * R;
}

/**
 * Whether a set of candidates describes one place. Used to rescue a result the
 * assessor called ambiguous: if every candidate it could not choose between
 * sits within a block of the others, the street is established even though the
 * building is not, and `street` is the honest precision for that.
 */
export function candidatesAgree(candidates: readonly { lat: number; lon: number }[], toleranceMetres = 150): boolean {
  if (candidates.length < 2) return candidates.length === 1;
  const [first, ...rest] = candidates;
  return rest.every((candidate) => metresBetween(first!.lat, first!.lon, candidate.lat, candidate.lon) <= toleranceMetres);
}

/**
 * The precision a provider feature type can carry when it is being used as a
 * campus or city answer rather than as a building one.
 *
 * A city centroid is stored as `city` and is deliberately not map-eligible:
 * reference.facility_is_map_eligible admits building, campus and street only.
 * So a facility resolved this way is a complete, honest canonical record that
 * the map does not draw — which is the intended behaviour, not a failure. The
 * alternative is drawing a dot in the middle of a town and calling it a data
 * centre.
 */
export function precisionForTier(tier: EquinixResolutionTier): { coordinatePrecision: "building" | "campus" | "street" | "city"; coordinateMethod: "documented_address_geocode" | "campus_centroid" | "city_centroid" } {
  switch (tier) {
    case "provider_building":
      return { coordinatePrecision: "building", coordinateMethod: "documented_address_geocode" };
    case "street":
      return { coordinatePrecision: "street", coordinateMethod: "documented_address_geocode" };
    case "campus":
      return { coordinatePrecision: "campus", coordinateMethod: "campus_centroid" };
    case "city":
      return { coordinatePrecision: "city", coordinateMethod: "city_centroid" };
    default:
      return { coordinatePrecision: "street", coordinateMethod: "documented_address_geocode" };
  }
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

export type EquinixReviewDecision = {
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

export type EquinixReviewDecisions = {
  decisionVersion: "urdais.map.equinix-review-decisions/1";
  reviewedAt: string;
  reviewer: string;
  decisions: EquinixReviewDecision[];
};

/**
 * Folds a reviewer's decisions into the automated results.
 *
 * The rules that make this safe to run against production:
 *
 * A decision may only *lower* what the evidence claims, never raise it on the
 * strength of having been looked at by a person. Finding a coordinate by hand
 * establishes where the address is; it does not establish which hall inside the
 * building is this facility. So `building` is accepted only where the decision
 * says the facility itself was identified, and the shared-point rule still runs
 * afterwards and still wins.
 *
 * A decision for a research key that is not in the tranche is an error rather
 * than a no-op: it means the reviewer worked from a different list, and
 * silently ignoring it would hide that.
 */
export function applyEquinixReviewDecisions(
  results: readonly EquinixGeocodeResult[],
  decisions: EquinixReviewDecisions,
): { results: EquinixGeocodeResult[]; applied: string[]; issues: string[] } {
  const byKey = new Map(results.map((result) => [result.researchKey, result]));
  const issues: string[] = [];
  const applied: string[] = [];

  for (const decision of decisions.decisions) {
    if (!byKey.has(decision.researchKey)) issues.push(`decision for ${decision.researchKey}, which is not in this tranche`);
    if (decision.action === "use_reviewed_coordinate" && (decision.latitude === undefined || decision.longitude === undefined)) {
      issues.push(`${decision.researchKey} asks to use a reviewed coordinate but supplies none`);
    }
    if (!decision.reason?.trim()) issues.push(`${decision.researchKey} has no reason recorded`);
  }

  const next = results.map((result) => {
    const decision = decisions.decisions.find((candidate) => candidate.researchKey === result.researchKey);
    if (!decision) return result;

    const latitude = decision.action === "use_reviewed_coordinate" ? decision.latitude ?? null : result.latitude;
    const longitude = decision.action === "use_reviewed_coordinate" ? decision.longitude ?? null : result.longitude;
    if (latitude === null || longitude === null) {
      issues.push(`${decision.researchKey} resolves to no coordinate after its decision`);
      return result;
    }
    applied.push(decision.researchKey);
    return {
      ...result,
      provider: "manual_review" as const,
      latitude,
      longitude,
      returnedFormattedAddress: decision.returnedFormattedAddress ?? result.returnedFormattedAddress,
      sourceUrl: decision.evidenceUrl ?? result.sourceUrl,
      coordinatePrecision: decision.coordinatePrecision,
      precisionClass: decision.precisionClass,
      outcome: "geocoded_ready" as const,
      outcomeReason: decision.reason,
      coordinateEvidenceUrls: decision.evidenceUrl
        ? [...new Set([...(result.coordinateEvidenceUrls ?? []), decision.evidenceUrl])]
        : result.coordinateEvidenceUrls,
      recoveryDisposition: "needs_human_review" as const,
      reviewedAt: decisions.reviewedAt,
      reviewer: decisions.reviewer,
    };
  });

  return { results: next, applied: applied.sort(), issues };
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
      // The method has to match the rung the coordinate came from, or the
      // record claims a precision its provenance does not support.
      coordinateMethod:
        result.coordinatePrecision === "city" ? "city_centroid"
        : result.coordinatePrecision === "campus" ? "campus_centroid"
        : "documented_address_geocode",
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
      reviewNotes: result.coordinatePrecision === "city"
        ? [`Geocoder precision classification: ${result.precisionClass}.`, "City precision: stored as a canonical record and deliberately not map-eligible."]
        : [`Geocoder precision classification: ${result.precisionClass}.`],
    },
    requestedPublicationState: "research",
  };
}

/**
 * Adds this tranche to the canonical dataset without ever overwriting a record
 * already in it.
 *
 * The first version of this replaced a colliding record wholesale, and doing so
 * was actively destructive. equinix-ny4 already existed at street precision
 * with a per-facility coordinate and its own evidence page; this tranche
 * resolved it only to a Secaucus city centroid, so the overwrite downgraded a
 * facility the map was drawing into one it would refuse to draw, and replaced
 * its evidence with a metro-level page. equinix-ny2 likewise lost a specific
 * equinix.com/ny2 citation and an OpenStreetMap corroboration.
 *
 * A tranche exists to add what the dataset is missing. Where the dataset
 * already knows a facility, what it knows came from a source that looked at
 * that facility rather than at its metro, and this tranche has nothing better
 * to offer it. So an existing key is preserved untouched and reported, not
 * merged and not overwritten.
 */
export function projectEquinixFacilities(
  existing: readonly ContractFacility[],
  queue: readonly EquinixQueueItem[],
  results: readonly EquinixGeocodeResult[],
): { facilities: ContractFacility[]; inserted: number; preserved: string[]; unchangedOutsideTranche: number; excluded: number } {
  const byKey = new Map(existing.map((facility) => [facility.researchKey, facility]));
  const queueByKey = new Map(queue.map((item) => [item.researchKey, item]));
  let inserted = 0;
  let excluded = 0;
  const preserved: string[] = [];

  for (const result of results) {
    if (result.outcome !== "geocoded_ready" || result.latitude === null || result.longitude === null) {
      excluded += 1;
      continue;
    }
    if (byKey.has(result.researchKey)) {
      preserved.push(result.researchKey);
      continue;
    }
    const item = queueByKey.get(result.researchKey);
    if (!item) throw new Error(`geocode result is absent from the tranche queue: ${result.researchKey}`);
    inserted += 1;
    byKey.set(result.researchKey, canonicalEquinixFacility(item, result));
  }

  const trancheKeys = new Set(queue.map((item) => item.researchKey));
  const unchangedOutsideTranche = existing.filter((facility) => !trancheKeys.has(facility.researchKey)).length;
  const facilities = [...byKey.values()].sort((a, b) => a.researchKey.localeCompare(b.researchKey));
  return { facilities, inserted, preserved: preserved.sort(), unchangedOutsideTranche, excluded };
}
