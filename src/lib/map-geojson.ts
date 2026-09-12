import type { Feature, FeatureCollection, Point } from "geojson";

import { isMapPointCategory, isMapPointStatus } from "@/components/map/map-point-style";
import type { MapPointCategory, MapPointStatus, UrdaisMapPoint } from "@/types/map";

/**
 * Properties carried on each rendered point feature. `mappingStatus` and
 * `category` drive the circle colour (category is always present on mapped
 * features); `address` and `contactEmail` feed the profile popup and are
 * present only when the point has them.
 */
export type MapPointProperties = { name: string; mappingStatus: MapPointStatus; category?: MapPointCategory; address?: string; contactEmail?: string };

/**
 * A practical email-shape check, not RFC validation: exactly one "@", a
 * non-empty local part, a domain with at least one dot, and no whitespace.
 */
export function isPlausibleEmail(value: string): boolean {
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;
  const domain = value.slice(at + 1);
  return !/\s/.test(value) && domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

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
 * `mappingStatus` in properties, plus `address` and `contactEmail` when
 * the point carries them (never as empty or undefined keys). Both are
 * trimmed; a blank or non-string value, or an email that fails the
 * plausibility check, is rejected with the point named.
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
    if (point.address !== undefined) {
      const address = typeof point.address === "string" ? point.address.trim() : "";
      if (address === "") throw new Error(`Map point "${point.id}" has an invalid address: ${String(point.address)}`);
      properties.address = address;
    }
    if (point.contactEmail !== undefined) {
      const email = typeof point.contactEmail === "string" ? point.contactEmail.trim() : "";
      if (email === "" || !isPlausibleEmail(email)) throw new Error(`Map point "${point.id}" has an invalid contactEmail: ${String(point.contactEmail)}`);
      properties.contactEmail = email;
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
