/**
 * Whether Urdais has placed a point at a verified location. Kept as an
 * explicit union rather than a boolean so later states (partial, unknown,
 * verified) can join without changing every consumer. Only these two exist
 * for now.
 */
export type MapPointStatus = "mapped" | "unmapped";

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
  /** Shown on the profile popup when present, e.g. "Atlanta, Georgia, USA". */
  location?: string;
  /** Shown on the profile popup when present. */
  operator?: string;
};
