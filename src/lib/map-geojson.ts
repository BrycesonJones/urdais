import type { Feature, FeatureCollection, Point } from "geojson";

import { isMapPointCategory, isMapPointStatus } from "@/components/map/map-point-style";
import type { MapPointCategory, MapPointStatus, UrdaisMapPoint } from "@/types/map";

/**
 * Properties carried on each rendered point feature. `mappingStatus` and
 * `category` drive the circle colour (category is always present on mapped
 * features); `location` and `operator` feed the profile popup and are
 * present only when the point has them.
 */
export type MapPointProperties = { name: string; mappingStatus: MapPointStatus; category?: MapPointCategory; location?: string; operator?: string };

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
 * `mappingStatus` in properties, plus `location` and `operator` when the
 * point carries them (never as empty or undefined keys).
 *
 * Invalid input is rejected, not coerced: a point with a longitude outside
 * −180…180, a latitude outside −90…90, a non-finite coordinate, an empty
 * id, an id already used, a mapping status outside the known set, a
 * mapped point without a category, or a category outside the known set
 * throws with the offending point named. These are runtime checks on
 * purpose: points will eventually arrive from outside the type system, and
 * a dot must never carry a status or category the map cannot colour. The
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
    if (point.category !== undefined && !isMapPointCategory(point.category)) throw new Error(`Map point "${point.id}" has an unknown category: ${String(point.category)}`);
    if (point.mappingStatus === "mapped" && point.category === undefined) throw new Error(`Map point "${point.id}" is mapped but has no category`);
    const properties: MapPointProperties = { name: point.name, mappingStatus: point.mappingStatus };
    if (point.category !== undefined) properties.category = point.category;
    for (const key of ["location", "operator"] as const) {
      const value = point[key];
      if (value === undefined) continue;
      if (typeof value !== "string" || value.trim() === "") throw new Error(`Map point "${point.id}" has an invalid ${key}: ${String(value)}`);
      properties[key] = value;
    }
    return {
      type: "Feature",
      id: point.id,
      geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
      properties,
    };
  });
  return { type: "FeatureCollection", features };
}
