import type { Feature, FeatureCollection, Point } from "geojson";

import { isMapPointCategory } from "@/components/map/map-point-style";
import { isLifecycleStatus } from "@/lib/facilities/domain";
import type { MapPointCategory, UrdaisMapPoint } from "@/types/map";

/**
 * Properties carried on each rendered point feature. `category` drives the
 * circle colour; the rest feed the profile popup and are present only when the
 * point has them.
 *
 * `sourcesJson` is the one encoded field. Feature properties survive
 * clustering, style updates and `queryRenderedFeatures` reliably as scalars and
 * less reliably as nested structures, so the citation list crosses as a JSON
 * string and the popup parses it defensively. A dot whose sources could not be
 * carried would be a dot with no provenance, which is the thing this dataset
 * exists not to produce.
 */
export type MapPointProperties = {
  name: string;
  category: MapPointCategory;
  address?: string;
  ownerName?: string;
  operatorName?: string;
  lifecycleStatus?: string;
  lastVerifiedDate?: string;
  sourcesJson?: string;
};

export type MapPointFeature = Feature<Point, MapPointProperties>;
export type MapPointCollection = FeatureCollection<Point, MapPointProperties>;

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Converts Urdais map points into the GeoJSON FeatureCollection MapLibre's
 * source consumes. Pure and deterministic: features keep the input order and
 * carry the point id as the feature id (so later `setData` updates and
 * feature-state changes address the same dot).
 *
 * Invalid input is rejected, not coerced: a point with a longitude outside
 * −180…180, a latitude outside −90…90, a non-finite coordinate, an empty
 * id, an id already used, a missing or unknown category, or a malformed
 * verification date throws with the offending point named. These are runtime
 * checks on purpose: points arrive from the database through an HTTP response,
 * outside the type system, and a dot must never carry a category the map
 * cannot colour. Malformed GeoJSON never reaches the map.
 */
export function buildMapFeatureCollection(points: readonly UrdaisMapPoint[]): MapPointCollection {
  const seen = new Set<string>();
  const features = points.map((point): MapPointFeature => {
    if (!point.id) throw new Error(`Map point "${point.name}" has no id`);
    if (seen.has(point.id)) throw new Error(`Map point id "${point.id}" is used more than once`);
    seen.add(point.id);
    if (!isValidLongitude(point.longitude)) throw new Error(`Map point "${point.id}" has an invalid longitude: ${point.longitude}`);
    if (!isValidLatitude(point.latitude)) throw new Error(`Map point "${point.id}" has an invalid latitude: ${point.latitude}`);
    if (!isMapPointCategory(point.category)) throw new Error(`Map point "${point.id}" has an unknown category: ${String(point.category)}`);

    const properties: MapPointProperties = { name: point.name, category: point.category };

    const carry = (key: "address" | "ownerName" | "operatorName", value: unknown) => {
      if (value === undefined) return;
      const text = typeof value === "string" ? value.trim() : "";
      if (text === "") throw new Error(`Map point "${point.id}" has an invalid ${key}: ${String(value)}`);
      properties[key] = text;
    };
    carry("address", point.address);
    carry("ownerName", point.ownerName);
    carry("operatorName", point.operatorName);

    if (point.lifecycleStatus !== undefined) {
      if (!isLifecycleStatus(point.lifecycleStatus)) {
        throw new Error(`Map point "${point.id}" has an unknown lifecycle status: ${String(point.lifecycleStatus)}`);
      }
      properties.lifecycleStatus = point.lifecycleStatus;
    }
    if (point.lastVerifiedDate !== undefined) {
      if (typeof point.lastVerifiedDate !== "string" || !ISO_DATE.test(point.lastVerifiedDate)) {
        throw new Error(`Map point "${point.id}" has an invalid lastVerifiedDate: ${String(point.lastVerifiedDate)}`);
      }
      properties.lastVerifiedDate = point.lastVerifiedDate;
    }
    if (point.sources !== undefined && point.sources.length > 0) {
      const sources = point.sources.map((source) => {
        const publisher = typeof source?.publisher === "string" ? source.publisher.trim() : "";
        const url = typeof source?.url === "string" ? source.url.trim() : "";
        if (publisher === "" || !/^https?:\/\//.test(url)) {
          throw new Error(`Map point "${point.id}" has an invalid source: ${JSON.stringify(source)}`);
        }
        return { publisher, url };
      });
      properties.sourcesJson = JSON.stringify(sources);
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
