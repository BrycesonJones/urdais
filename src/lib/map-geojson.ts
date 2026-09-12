import type { Feature, FeatureCollection, Point } from "geojson";

import { isMapPointStatus } from "@/components/map/map-point-style";
import type { MapPointStatus, UrdaisMapPoint } from "@/types/map";

/** Properties carried on each rendered point feature; `mappingStatus` drives the circle colour. */
export type MapPointProperties = { name: string; mappingStatus: MapPointStatus };

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
 * feature-state changes address the same dot), and keep `name` and
 * `mappingStatus` in properties.
 *
 * Invalid input is rejected, not coerced: a point with a longitude outside
 * −180…180, a latitude outside −90…90, a non-finite coordinate, an empty
 * id, an id already used, or a mapping status outside the known set
 * throws with the offending point named. The status check is a runtime
 * check on purpose: points will eventually arrive from outside the type
 * system, and a dot must never carry a status the map cannot colour. The
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
    if (!isMapPointStatus(point.mappingStatus)) throw new Error(`Map point "${point.id}" has an unknown mapping status: ${String(point.mappingStatus)}`);
    return {
      type: "Feature",
      id: point.id,
      geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
      properties: { name: point.name, mappingStatus: point.mappingStatus },
    };
  });
  return { type: "FeatureCollection", features };
}
