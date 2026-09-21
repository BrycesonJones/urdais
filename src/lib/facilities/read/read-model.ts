/**
 * The public facility read model: what leaves the database for the map.
 *
 * It is a narrow projection on purpose. The database holds the reviewer's
 * working state — unresolved questions, confidence grades, records with no
 * position, records awaiting a decision — and none of that is here. What is
 * here is a placed public facility — verified or explicitly labelled research —
 * and the documents behind it.
 *
 * The validator below runs on the way out, on every response. Its job is the
 * class of mistake that renders perfectly: a dot with no source, a city
 * centroid presented as a site, a power station on the map with nothing tying
 * it to compute. Each of those is already refused by a constraint or a trigger
 * at write time; the check repeats here because a read path that acquired a bug
 * would otherwise publish the result of it silently.
 */

import {
  FACILITY_VERIFICATION_HORIZON_DAYS,
  MAP_ELIGIBLE_PRECISIONS,
  isFacilityCategory,
  type CoordinatePrecision,
  type FacilityCategory,
  type FacilityLifecycleStatus,
} from "@/lib/facilities/domain";

/** A cited document, as the public sees it: who published it, what it is, where it is. */
export type PublicFacilitySource = {
  publisher: string;
  title: string;
  url: string;
};

export type PublicFacility = {
  /** The research key, which is also the stable public identity of the dot. */
  id: string;
  name: string;
  category: FacilityCategory;
  latitude: number;
  longitude: number;
  /** Never "city": a city centroid is a location, not a position. */
  coordinatePrecision: Exclude<CoordinatePrecision, "city">;
  /** One line, assembled from the parts the source published. Null where none were. */
  address: string | null;
  ownerName: string | null;
  operatorName: string | null;
  lifecycleStatus: FacilityLifecycleStatus | null;
  /** Public-facing review level, derived from the internal publication state. */
  verificationStatus: "verified" | "research";
  lastVerifiedDate: string;
  sources: readonly PublicFacilitySource[];
};

export type FacilityCoverage = {
  /** Verified or research records that are candidates for the public map. */
  published: number;
  /** Of those, the ones this response carries after the staleness filter. */
  served: number;
  byCategory: Record<FacilityCategory, number>;
  countries: number;
};

/** Why the map has nothing to draw. Null whenever facilities are served. */
export type FacilityUnavailableReason =
  /** The deployment has no database configured. */
  | "not_configured"
  /** The database is reachable and holds no map-safe, current public facility. */
  | "no_public_facilities"
  /** The database could not be read. An outage, not an empty world. */
  | "read_failed";

export type FacilityMapReadModel = {
  dataset: "urdais-map-facilities";
  /** The staleness horizon this response applied, in days. */
  verificationHorizonDays: number;
  facilities: readonly PublicFacility[];
  coverage: FacilityCoverage;
  unavailableReason: FacilityUnavailableReason | null;
};

export function emptyFacilityCoverage(): FacilityCoverage {
  return {
    published: 0,
    served: 0,
    byCategory: { data_center: 0, gpu_compute_cluster: 0, semiconductor_fab: 0, power_infrastructure: 0 },
    countries: 0,
  };
}

export function emptyFacilityReadModel(reason: FacilityUnavailableReason): FacilityMapReadModel {
  return {
    dataset: "urdais-map-facilities",
    verificationHorizonDays: FACILITY_VERIFICATION_HORIZON_DAYS,
    facilities: [],
    coverage: emptyFacilityCoverage(),
    unavailableReason: reason,
  };
}

/**
 * Comparable form of an address component: lower case, unaccented, punctuation
 * dropped, whitespace collapsed, split into words.
 *
 * Accents and punctuation are removed because the same place is written both
 * ways by different sources — a facility page says "Colon" where the locality
 * field says "Colón", and "Qro." is "Qro". Comparing on words rather than on
 * raw substrings is what keeps "PA" from matching the "Pa" inside "Paul".
 */
function addressWords(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word !== "");
}

/** Whether `words` contains `needle` as a contiguous run of whole words. */
function containsRun(words: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > words.length) return false;
  for (let start = 0; start + needle.length <= words.length; start += 1) {
    let hit = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (words[start + offset] !== needle[offset]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

/**
 * Whether a street address already states this component.
 *
 * Checked per comma-separated component rather than across the whole string, so
 * "London" is found inside "London E1 6QR" — the postcode is attached to the
 * city in British addresses — without a component boundary hiding it.
 */
export function streetAddressStates(streetAddress: string, component: string | null): boolean {
  const needle = addressWords(component ?? "");
  if (needle.length === 0) return false;
  return streetAddress.split(",").some((part) => containsRun(addressWords(part), needle));
}

/**
 * Whether a street address *ends* with this component — the test for whether it
 * is a complete postal address.
 *
 * Deliberately stricter than `streetAddressStates`, because a country name can
 * appear inside a proper noun partway through an address: "8, Beiyuan Rd. 2,
 * Southern Taiwan Science Park" mentions Taiwan without being addressed to
 * Taiwan, and treating it as complete would drop the country from the rendered
 * line. An administrative tail sits at the end or it is not a tail.
 */
function streetAddressEndsWith(streetAddress: string, component: string | null): boolean {
  const needle = addressWords(component ?? "");
  if (needle.length === 0) return false;
  const parts = streetAddress.split(",");
  const last = addressWords(parts[parts.length - 1] ?? "");
  if (last.length < needle.length) return false;
  return needle.every((word, index) => last[last.length - needle.length + index] === word);
}

/**
 * Assembles the one-line address from whichever parts a source published,
 * without saying the same thing twice.
 *
 * The duplication this exists to prevent was on 145 of 271 public facilities:
 * many sources publish `streetAddress` as a *complete* postal address, and
 * appending the locality, admin area and country to that produced
 * "Camino a Nativitas 800, Colon, Querétaro, Mexico, Colón, Querétaro, Mexico"
 * on the public map.
 *
 * The rule, in two parts:
 *
 *   1. A street address that already names the country — and the locality, or
 *      has no locality to name — is a complete address, and is returned as the
 *      source wrote it. Appending to it can only repeat it.
 *   2. Otherwise each remaining component is appended only if the street does
 *      not already state it, so a partial street still gains its city, state
 *      and country.
 *
 * Nothing is removed from what a source wrote: the street address is never
 * rewritten, only left un-suffixed. Canonical rows are untouched; this is a
 * presentation rule applied when the public read model is assembled.
 */
export function composeAddress(parts: {
  streetAddress: string | null;
  locality: string | null;
  adminArea: string | null;
  countryName: string | null;
}): string | null {
  const street = parts.streetAddress?.trim() ?? "";
  const tail = [parts.locality, parts.adminArea, parts.countryName].map((part) => part?.trim() ?? "");

  if (street === "") {
    const line = tail.filter((part) => part !== "").join(", ");
    return line === "" ? null : line;
  }

  const locality = tail[0] ?? "";
  const countryName = tail[2] ?? "";
  const statesCountry = countryName !== "" && streetAddressEndsWith(street, countryName);
  const statesLocality = locality === "" || streetAddressStates(street, locality);
  // A complete postal address. Returning it verbatim is both the correct
  // rendering and the one that cannot reorder what the source wrote.
  if (statesCountry && statesLocality) return street;

  // Appended in order, skipping anything the street already states and anything
  // an earlier addition already said: a city and its administrative division
  // frequently share a name (Tainan in Tainan, Bogotá in Bogotá), and printing
  // it twice is noise rather than information.
  const additions: string[] = [];
  tail.forEach((part, index) => {
    if (part === "") return;
    // The country is matched only at the tail, for the same reason rule 1 is:
    // "Southern Taiwan Science Park" names Taiwan without being addressed to it,
    // and treating that as stated would drop the country from the line.
    const isCountry = index === 2;
    const alreadyInStreet = isCountry ? streetAddressEndsWith(street, part) : streetAddressStates(street, part);
    if (alreadyInStreet) return;
    if (additions.some((added) => streetAddressStates(added, part) && streetAddressStates(part, added))) return;
    additions.push(part);
  });
  return [street, ...additions].join(", ");
}

/** Internal field names that must never appear on a public facility. */
const INTERNAL_FIELDS = ["reviewNotes", "review_notes", "confidence", "publicationState", "publication_state", "coordinateNotes"];

/**
 * Contract check on the way out. Returns the reasons a response must not be
 * served; an empty array is a clean response.
 */
export function validatePublicFacilities(model: unknown, now: Date = new Date()): readonly string[] {
  const reasons: string[] = [];
  if (typeof model !== "object" || model === null) return ["response is not an object"];
  const m = model as Partial<FacilityMapReadModel> & Record<string, unknown>;

  if (m.dataset !== "urdais-map-facilities") reasons.push("dataset identifier is wrong or missing");
  if (!Array.isArray(m.facilities)) return [...reasons, "facilities is not an array"];

  const seen = new Set<string>();
  for (const raw of m.facilities) {
    const facility = raw as Partial<PublicFacility> & Record<string, unknown>;
    const label = typeof facility.id === "string" && facility.id !== "" ? facility.id : "an unnamed facility";

    if (typeof facility.id !== "string" || facility.id === "") reasons.push("a facility was served with no id");
    else if (seen.has(facility.id)) reasons.push(`${facility.id} appears more than once`);
    else seen.add(facility.id);

    if (typeof facility.name !== "string" || facility.name.trim() === "") reasons.push(`${label} has no name`);
    if (!isFacilityCategory(facility.category)) reasons.push(`${label} has category ${String(facility.category)}, which is not public`);

    const { latitude, longitude } = facility;
    if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      reasons.push(`${label} has an unusable latitude`);
    }
    if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      reasons.push(`${label} has an unusable longitude`);
    }
    if (!(MAP_ELIGIBLE_PRECISIONS as readonly string[]).includes(String(facility.coordinatePrecision))) {
      reasons.push(`${label} is placed at ${String(facility.coordinatePrecision)} precision, which is not a position`);
    }
    if (facility.verificationStatus !== "verified" && facility.verificationStatus !== "research") {
      reasons.push(`${label} has no valid public verification status`);
    }

    if (!Array.isArray(facility.sources) || facility.sources.length === 0) {
      reasons.push(`${label} is on the map with no source cited`);
    }

    if (typeof facility.lastVerifiedDate !== "string" || facility.lastVerifiedDate === "") {
      reasons.push(`${label} does not say when it was last verified`);
    } else {
      const age = Math.floor((now.getTime() - new Date(`${facility.lastVerifiedDate}T00:00:00Z`).getTime()) / 86_400_000);
      if (Number.isNaN(age)) reasons.push(`${label} has an unreadable verification date`);
      else if (age > FACILITY_VERIFICATION_HORIZON_DAYS) {
        reasons.push(`${label} was last verified ${age} days ago, past the ${FACILITY_VERIFICATION_HORIZON_DAYS}-day horizon`);
      }
    }

    for (const field of INTERNAL_FIELDS) {
      if (field in facility) reasons.push(`${label} carries the internal field ${field}`);
    }
  }

  if (m.facilities.length === 0 && !m.unavailableReason) {
    reasons.push("no facilities and no reason given for their absence");
  }
  if (m.facilities.length > 0 && m.unavailableReason) {
    reasons.push("facilities were served alongside a reason they are unavailable");
  }

  return reasons;
}
