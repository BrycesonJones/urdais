import type { DataDrivenPropertyValueSpecification } from "maplibre-gl";

import type { MapPointCategory, MapPointStatus } from "@/types/map";

/**
 * The one source of truth for how a point looks and is named. The MapLibre
 * circle layer, the React legend, and the profile popup all read these
 * tables, so a colour or label can never disagree between them.
 */

/** Every status the map understands. Also the runtime allow-list for incoming data. */
export const MAP_POINT_STATUSES: readonly MapPointStatus[] = ["mapped", "unmapped"];

/** Every category the map understands, in legend order. Also the runtime allow-list for incoming data. */
export const MAP_POINT_CATEGORIES: readonly MapPointCategory[] = ["data_center", "compute_cluster", "power_infrastructure", "semiconductor_fab"];

/** Unmapped points are black whatever their category. */
export const UNMAPPED_POINT_COLOR = "#000000";

/**
 * Category colours for mapped points: four hues chosen to stay distinct for
 * protan, deutan, and tritan vision and to read at a 4px dot on Positron's
 * pale land. Data Center keeps the Urdais cobalt from the charts; the other
 * three derive from the Okabe-Ito palette. Validated with the dataviz
 * palette checker (all pairs, light surface).
 */
export const MAP_POINT_CATEGORY_COLORS: Record<MapPointCategory, string> = {
  data_center: "#526fe0",
  compute_cluster: "#a04ea0",
  power_infrastructure: "#d55e00",
  semiconductor_fab: "#0f8f6a",
};

export const MAP_POINT_CATEGORY_LABELS: Record<MapPointCategory, string> = {
  data_center: "Data Center",
  compute_cluster: "Compute Cluster",
  power_infrastructure: "Power Infrastructure",
  semiconductor_fab: "Semiconductor Fab",
};

/** The legend row for points that are not mapped. */
export const UNMAPPED_POINT_LABEL = "Unmapped";

/**
 * Colour a mapped point would take if its category were somehow missing.
 * Runtime validation makes this unreachable for data that came through the
 * converter; it exists so the expression is total.
 */
export const FALLBACK_POINT_COLOR = "#6b7280";

export function isMapPointStatus(value: unknown): value is MapPointStatus {
  return typeof value === "string" && (MAP_POINT_STATUSES as readonly string[]).includes(value);
}

export function isMapPointCategory(value: unknown): value is MapPointCategory {
  return typeof value === "string" && (MAP_POINT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Data-driven circle colour: mapping status is checked first so an unmapped
 * point is black regardless of category; a mapped point then takes its
 * category colour, with the fallback closing the expression.
 */
export const POINT_COLOR_EXPRESSION: DataDrivenPropertyValueSpecification<string> = [
  "case",
  ["==", ["get", "mappingStatus"], "unmapped"],
  UNMAPPED_POINT_COLOR,
  [
    "match",
    ["get", "category"],
    "data_center",
    MAP_POINT_CATEGORY_COLORS.data_center,
    "compute_cluster",
    MAP_POINT_CATEGORY_COLORS.compute_cluster,
    "power_infrastructure",
    MAP_POINT_CATEGORY_COLORS.power_infrastructure,
    "semiconductor_fab",
    MAP_POINT_CATEGORY_COLORS.semiconductor_fab,
    FALLBACK_POINT_COLOR,
  ],
];

/** Rows the legend shows, in order: every category, then unmapped. */
export const MAP_LEGEND_ROWS: ReadonlyArray<{ id: string; label: string; color: string }> = [
  ...MAP_POINT_CATEGORIES.map((category) => ({ id: category, label: MAP_POINT_CATEGORY_LABELS[category], color: MAP_POINT_CATEGORY_COLORS[category] })),
  { id: "unmapped", label: UNMAPPED_POINT_LABEL, color: UNMAPPED_POINT_COLOR },
];
