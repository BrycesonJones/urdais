import type { DataDrivenPropertyValueSpecification } from "maplibre-gl";

import type { MapPointStatus } from "@/types/map";

/**
 * The one source of truth for how a point's mapping status looks. The
 * MapLibre circle layer and the React legend both read these, so the dot on
 * the map and the dot in the legend can never disagree.
 */

/** Every status the map understands, in legend order. Also the runtime allow-list for incoming data. */
export const MAP_POINT_STATUSES: readonly MapPointStatus[] = ["mapped", "unmapped"];

/** Mapped points use the Urdais cobalt from the charts; a temporary single colour until category colours arrive. */
export const MAPPED_POINT_COLOR = "#526fe0";
/** Unmapped points are black. */
export const UNMAPPED_POINT_COLOR = "#000000";

export const MAP_POINT_STATUS_COLOR: Record<MapPointStatus, string> = {
  mapped: MAPPED_POINT_COLOR,
  unmapped: UNMAPPED_POINT_COLOR,
};

export const MAP_POINT_STATUS_LABEL: Record<MapPointStatus, string> = {
  mapped: "Mapped",
  unmapped: "Unmapped",
};

export function isMapPointStatus(value: unknown): value is MapPointStatus {
  return typeof value === "string" && (MAP_POINT_STATUSES as readonly string[]).includes(value);
}

/**
 * Data-driven circle colour keyed on the feature's `mappingStatus`
 * property. Anything that is not "mapped" falls through to the unmapped
 * colour, so a feature can never render in an undefined colour.
 */
export const POINT_COLOR_EXPRESSION: DataDrivenPropertyValueSpecification<string> = [
  "match",
  ["get", "mappingStatus"],
  "mapped",
  MAPPED_POINT_COLOR,
  UNMAPPED_POINT_COLOR,
];
