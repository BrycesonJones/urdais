import type { Feature, FeatureCollection, Point } from "geojson";

import type { UrdaisMapPoint } from "@/types/map";

/** Properties carried on each rendered point feature. */
export type MapPointProperties = { name: string };

export type MapPointFeature = Feature<Point, MapPointProperties>;
export type MapPointCollection = FeatureCollection<Point, MapPointProperties>;

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

/**
 * Converts Urdais map points into the GeoJSON FeatureCollection MapLibre's
 * source consumes. Pure and deterministic: features keep the input order,
 * carry the point id as the feature id (so later `setData` updates and
 * feature-state changes address the same dot), and keep `name` in
 * properties.
 *
 * Invalid input is rejected, not coerced: a point with a longitude outside
 * −180…180, a latitude outside −90…90, a non-finite coordinate, an empty
 * id, or an id already used throws with the offending point named. The
 * seam that supplies points is responsible for handing over clean data;
 * malformed GeoJSON never reaches the map.
 */
export function buildMapFeatureCollection(points: readonly UrdaisMapPoint[]): MapPointCollection {
  const seen = new Set<string>();
  const features = points.map((point): MapPointFeature => {
    if (!point.id) throw new Error(`Map point "${point.name}" has no id`);
    if (seen.has(point.id)) throw new Error(`Map point id "${point.id}" is used more than once`);
    seen.add(point.id);
    if (!isValidLongitude(point.longitude)) throw new Error(`Map point "${point.id}" has an invalid longitude: ${point.longitude}`);
    if (!isValidLatitude(point.latitude)) throw new Error(`Map point "${point.id}" has an invalid latitude: ${point.latitude}`);
    return {
      type: "Feature",
      id: point.id,
      geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
      properties: { name: point.name },
    };
  });
  return { type: "FeatureCollection", features };
}
