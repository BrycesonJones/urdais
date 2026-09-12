import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";

import { POINT_COLOR_EXPRESSION, filterPointCollection } from "@/components/map/map-point-style";
import type { MapVisibilityState } from "@/components/map/map-point-style";
import type { MapPointCollection } from "@/lib/map-geojson";

/** The one GeoJSON source every Urdais point lives in; visibility changes call `setData` on it. */
export const POINTS_SOURCE_ID = "urdais-points";
/** The one circle layer that draws individual (unclustered) points. */
export const POINTS_LAYER_ID = "urdais-points-circle";
/** The one circle layer that draws clusters. */
export const CLUSTERS_LAYER_ID = "urdais-point-clusters";
/** The one symbol layer that draws each cluster's point count. */
export const CLUSTER_COUNT_LAYER_ID = "urdais-point-cluster-count";

/**
 * Native MapLibre clustering on the source. Points within 48 screen pixels
 * of each other merge, which keeps distinct metro areas apart at country
 * zoom while still collapsing dense campuses; past zoom 12 nothing clusters
 * so every point is individually clickable at city scale.
 */
export const CLUSTER_RADIUS = 48;
export const CLUSTER_MAX_ZOOM = 12;

/** A feature is a cluster when supercluster has given it a `point_count`. */
export const IS_CLUSTER: FilterSpecification = ["has", "point_count"];
export const IS_NOT_CLUSTER: FilterSpecification = ["!", ["has", "point_count"]];

/**
 * Cluster circle radius in px by point count, stepped so three sizes are
 * enough to read at a glance: under 10 points small, 10 to 49 medium, 50 and
 * more large. Thresholds are deliberately coarse; real data can retune them.
 */
export const CLUSTER_RADIUS_EXPRESSION: ExpressionSpecification = ["step", ["get", "point_count"], 14, 10, 18, 50, 24];

/** Clusters are neutral (white with a dark ring) because a cluster may mix categories; category colour stays on the dots. */
export const CLUSTER_FILL_COLOR = "#ffffff";
export const CLUSTER_STROKE_COLOR = "#374151";
export const CLUSTER_TEXT_COLOR = "#111827";

/**
 * Adds the Urdais point source and its three layers to a map whose style has
 * loaded. Idempotent: anything that already exists is not added again, so
 * repeated lifecycle events cannot duplicate them.
 *
 * Render order, all beneath the basemap's first symbol layer so land,
 * water, roads, and boundaries sit below and city labels keep priority:
 * cluster circles, then cluster counts, then individual points. Counts are
 * above their circles; individual dots are above clusters so an unclustered
 * point at a cluster's edge is never hidden. The source is given the
 * collection for the initial visibility; later changes go through
 * applyPointVisibility.
 */
export function addPointLayer(map: MapLibreMap, collection: MapPointCollection, visibility?: MapVisibilityState): void {
  if (!map.getSource(POINTS_SOURCE_ID)) {
    map.addSource(POINTS_SOURCE_ID, {
      type: "geojson",
      data: visibility ? filterPointCollection(collection, visibility) : collection,
      cluster: true,
      clusterRadius: CLUSTER_RADIUS,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
    });
  }
  const firstLabelLayer = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;

  if (!map.getLayer(CLUSTERS_LAYER_ID)) {
    map.addLayer(
      {
        id: CLUSTERS_LAYER_ID,
        type: "circle",
        source: POINTS_SOURCE_ID,
        filter: IS_CLUSTER,
        paint: {
          "circle-radius": CLUSTER_RADIUS_EXPRESSION,
          "circle-color": CLUSTER_FILL_COLOR,
          "circle-opacity": 0.95,
          "circle-stroke-color": CLUSTER_STROKE_COLOR,
          "circle-stroke-width": 1.5,
        },
      },
      firstLabelLayer,
    );
  }
  if (!map.getLayer(CLUSTER_COUNT_LAYER_ID)) {
    map.addLayer(
      {
        id: CLUSTER_COUNT_LAYER_ID,
        type: "symbol",
        source: POINTS_SOURCE_ID,
        filter: IS_CLUSTER,
        layout: {
          // supercluster abbreviates from 1,000 upward ("1.2k"); below that both are the same.
          "text-field": ["coalesce", ["get", "point_count_abbreviated"], ["to-string", ["get", "point_count"]]],
          "text-font": ["Noto Sans Bold"],
          "text-size": 11,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": CLUSTER_TEXT_COLOR },
      },
      firstLabelLayer,
    );
  }
  if (!map.getLayer(POINTS_LAYER_ID)) {
    map.addLayer(
      {
        id: POINTS_LAYER_ID,
        type: "circle",
        source: POINTS_SOURCE_ID,
        filter: IS_NOT_CLUSTER,
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
}

/**
 * Applies the legend's visibility state by replacing the source's data with
 * the visible subset of the canonical collection. Clustering happens inside
 * the source before any layer filter runs, so a layer filter alone would
 * leave hidden points inside cluster counts; feeding the source only the
 * visible points is the one way counts stay honest. Nothing else changes:
 * the map, the source, the layers, and the viewport all stay as they are,
 * no data is fetched, and the canonical collection is kept by the caller.
 * A no-op until the source exists.
 */
export function applyPointVisibility(map: MapLibreMap, collection: MapPointCollection, visibility: MapVisibilityState): void {
  const source = map.getSource(POINTS_SOURCE_ID) as GeoJSONSource | undefined;
  if (!source) return;
  source.setData(filterPointCollection(collection, visibility));
}
