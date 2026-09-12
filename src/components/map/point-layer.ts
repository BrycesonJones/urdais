import type { Map as MapLibreMap } from "maplibre-gl";

import { POINT_COLOR_EXPRESSION } from "@/components/map/map-point-style";
import type { MapPointCollection } from "@/lib/map-geojson";

/** The one GeoJSON source every Urdais point lives in; later phases call `setData` on it. */
export const POINTS_SOURCE_ID = "urdais-points";
/** The one circle layer that draws those points. */
export const POINTS_LAYER_ID = "urdais-points-circle";

/**
 * Adds the Urdais point source and circle layer to a map whose style has
 * loaded. Idempotent: if either already exists nothing is added again, so
 * repeated lifecycle events cannot duplicate them.
 *
 * Render order: the layer is inserted beneath the basemap's first symbol
 * layer. Everything below that point is land, water, roads, and boundaries,
 * which the dots must sit on top of; everything from it upward is labels,
 * which keep priority so a dot never hides a city name. Colour is
 * data-driven from each feature's `mappingStatus` (see map-point-style.ts);
 * category colours come with a later data phase.
 */
export function addPointLayer(map: MapLibreMap, collection: MapPointCollection): void {
  if (!map.getSource(POINTS_SOURCE_ID)) {
    map.addSource(POINTS_SOURCE_ID, { type: "geojson", data: collection });
  }
  if (map.getLayer(POINTS_LAYER_ID)) return;
  const firstLabelLayer = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
  map.addLayer(
    {
      id: POINTS_LAYER_ID,
      type: "circle",
      source: POINTS_SOURCE_ID,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 3, 6, 5, 12, 7],
        "circle-color": POINT_COLOR_EXPRESSION,
        "circle-opacity": 0.9,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1,
      },
    },
    firstLabelLayer,
  );
}
