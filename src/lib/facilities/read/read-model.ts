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

/** Assembles the one-line address from whichever parts a source published. */
export function composeAddress(parts: {
  streetAddress: string | null;
  locality: string | null;
  adminArea: string | null;
  countryName: string | null;
}): string | null {
  const line = [parts.streetAddress, parts.locality, parts.adminArea, parts.countryName]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "")
    .join(", ");
  return line === "" ? null : line;
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
