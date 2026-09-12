/**
 * Whether Urdais has placed a point at a verified location. Kept as an
 * explicit union rather than a boolean so later states (partial, unknown,
 * verified) can join without changing every consumer. Only these two exist
 * for now.
 */
export type MapPointStatus = "mapped" | "unmapped";

/**
 * Top-level infrastructure category of a point. Deliberately coarse:
 * a data-centre facility, a GPU / AI compute cluster or concentrated compute
 * capacity, important electrical infrastructure (substations, transformers,
 * and the like), or a semiconductor fabrication / foundry / advanced
 * manufacturing facility. Finer detail (GPU generation, transformer class,
 * process node) belongs to subtypes that do not exist yet.
 */
export type MapPointCategory = "data_center" | "compute_cluster" | "power_infrastructure" | "semiconductor_fab";

/**
 * A point Urdais can place on the map. Deliberately minimal: identity,
 * position, a human-readable name, and its mapping status are all the map
 * needs to render and colour a dot. Category, provider, capacity, and
 * provenance arrive with the data phases that need them.
 */
export type UrdaisMapPoint = {
  /** Stable, unique across the whole point set; becomes the GeoJSON feature id. */
  id: string;
  /** Degrees, −180 to 180. */
  longitude: number;
  /** Degrees, −90 to 90. */
  latitude: number;
  name: string;
  mappingStatus: MapPointStatus;
  /** Required for mapped points, which are coloured by it; optional for unmapped points. */
  category?: MapPointCategory;
  /** Shown on the profile popup when present, e.g. "Atlanta, Georgia, USA". */
  location?: string;
  /** Shown on the profile popup when present. */
  operator?: string;
};
