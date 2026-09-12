/**
 * A point Urdais can place on the map. Deliberately minimal: identity,
 * position, and a human-readable name are all the map needs to render a
 * dot. Category, status, provider, capacity, and provenance arrive with
 * the data phases that need them.
 */
export type UrdaisMapPoint = {
  /** Stable, unique across the whole point set; becomes the GeoJSON feature id. */
  id: string;
  /** Degrees, −180 to 180. */
  longitude: number;
  /** Degrees, −90 to 90. */
  latitude: number;
  name: string;
};
