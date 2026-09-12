import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

/**
 * Urdais overrides for OpenFreeMap's Positron style, applied through
 * MapLibre's `transformStyle` hook before the style is used, so the basemap
 * is fetched from OpenFreeMap as-is and only these named layers change.
 *
 * Why: the OpenMapTiles tiles already carry the cities we want at regional
 * zooms (rank-5 cities from zoom 5, rank-6 cities and towns from zoom 6),
 * but Positron draws them too large and anchors every label below its dot,
 * so neighbours such as Austin / San Antonio or Chihuahua / Delicias collide
 * and MapLibre culls one of them. State labels are placed after cities and
 * lose the same collisions, which is why "TEXAS" vanishes at the zoom where
 * the cities around it appear. The overrides keep Positron's hierarchy and
 * palette, make city and town text a little smaller, and let labels choose
 * an anchor around their point so more of the tile's places survive
 * placement. Nothing here is geography-specific and no label is hard-coded.
 */

/** Layout patches by Positron layer id. Unknown ids are ignored so a style update cannot break the map. */
const LAYOUT_OVERRIDES: Record<string, Record<string, unknown>> = {
  label_city: {
    "text-size": ["interpolate", ["exponential", 1.2], ["zoom"], 4, 10.5, 7, 12, 11, 16],
    "text-variable-anchor": ["bottom", "top", "right", "left"],
    "text-radial-offset": 0.35,
    "text-justify": "auto",
  },
  label_city_capital: {
    "text-size": ["interpolate", ["exponential", 1.2], ["zoom"], 4, 11.5, 7, 13, 11, 17],
    "text-variable-anchor": ["bottom", "top", "right", "left"],
    "text-radial-offset": 0.4,
    "text-justify": "auto",
  },
  label_town: {
    "text-size": ["interpolate", ["exponential", 1.2], ["zoom"], 7, 10.5, 11, 13],
    "text-variable-anchor": ["bottom", "top", "right", "left"],
    "text-radial-offset": 0.3,
    "text-justify": "auto",
  },
  label_state: {
    // States have no dot, so the label may slide off its centroid rather than be dropped.
    "text-variable-anchor": ["center", "top", "bottom", "left", "right"],
    "text-radial-offset": 1.2,
    "text-justify": "auto",
  },
};

/** Positron sets a fixed text-anchor and offset that a variable anchor supersedes; drop them where we set one. */
const REMOVED_LAYOUT_KEYS = ["text-anchor", "text-offset"] as const;

export function applyBasemapOverrides(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer): LayerSpecification => {
      const patch = LAYOUT_OVERRIDES[layer.id];
      if (!patch || layer.type !== "symbol") return layer;
      const layout: Record<string, unknown> = { ...layer.layout };
      if ("text-variable-anchor" in patch) for (const key of REMOVED_LAYOUT_KEYS) delete layout[key];
      return { ...layer, layout: { ...layout, ...patch } } as LayerSpecification;
    }),
  };
}
