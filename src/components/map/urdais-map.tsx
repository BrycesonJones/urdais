"use client";

import { useEffect, useRef } from "react";

import "maplibre-gl/dist/maplibre-gl.css";

import { applyBasemapOverrides } from "@/components/map/basemap-style";
import { DEFAULT_MAP_VISIBILITY } from "@/components/map/map-point-style";
import type { MapVisibilityState } from "@/components/map/map-point-style";
import { addPointLayer, applyPointVisibility } from "@/components/map/point-layer";
import { attachPointInteractions } from "@/components/map/point-popup";
import type { PointInteractions } from "@/components/map/point-popup";
import { loadMapRenderer } from "@/components/map/prefetch-map";
import { getMapPoints } from "@/data/mock/map-points";
import { buildMapFeatureCollection } from "@/lib/map-geojson";
import type { StyleSpecification } from "maplibre-gl";

/**
 * OpenFreeMap's Positron style: a subdued, low-noise basemap served from
 * OpenMapTiles vector tiles with OpenStreetMap data. It needs no API key.
 * The style's tile source declares the required OpenFreeMap, OpenMapTiles,
 * and OpenStreetMap attribution, which MapLibre's attribution control shows.
 * Its place-label layers are adjusted by basemap-style.ts for city-level
 * context; everything else is used as published.
 */
const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/**
 * MapLibre parses tiles in a web worker that it locates relative to its own
 * module URL. Under Next's bundling that URL is a chunk with no sibling
 * worker file, so the worker is served from our origin instead: the
 * sync-maplibre-worker script copies it (and the shared module it imports)
 * out of the installed package before every dev and build.
 */
const WORKER_URL = "/vendor/maplibre-gl/maplibre-gl-worker.mjs";

/** World-scale opening view: the whole map at a glance, centred on the Atlantic. */
const INITIAL_CENTER: [number, number] = [10, 20];
const INITIAL_ZOOM = 1.4;
const MIN_ZOOM = 1;

/**
 * The Urdais map workspace: one MapLibre GL JS instance filling its
 * container. It renders the basemap plus one GeoJSON point source and one
 * circle layer (see point-layer.ts), fed through the getMapPoints seam,
 * which currently returns static demo points, and the mapped-point profile
 * popup (point-popup.ts). The `visibility` prop, owned by the workspace
 * that renders the legend, is applied as a layer filter whenever it
 * changes: the map, source, data, and viewport are untouched, only the
 * filter expression moves. Clustering is added later on the same
 * instance, so this component owns the map lifecycle and nothing else.
 *
 * MapLibre touches `window` on import, so the renderer is loaded inside
 * the effect (through the shared loader in prefetch-map.ts): the page
 * renders on the server without it, the library ships in its own chunk
 * that only `/map` (or an intentional prefetch) loads, and the map is
 * created once per mount and removed on unmount. A cancelled flag covers
 * the mount → unmount → mount sequence React runs in development so no
 * orphan instance survives.
 */
type UrdaisMapProps = {
  /** Which point groups to show; defaults to everything. */
  visibility?: MapVisibilityState;
};

export function UrdaisMap({ visibility = DEFAULT_MAP_VISIBILITY }: UrdaisMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const interactionsRef = useRef<PointInteractions | null>(null);
  // The latest visibility, readable from the one-time load handler without
  // re-running the map effect (which would recreate the map).
  const visibilityRef = useRef(visibility);
  visibilityRef.current = visibility;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let map: import("maplibre-gl").Map | null = null;

    // The style is fetched here rather than by MapLibre so the label
    // overrides can be applied before the first render; it is one request
    // either way. If the fetch fails MapLibre is handed the URL and reports
    // the error itself.
    const loadStyle = (): Promise<StyleSpecification | string> =>
      fetch(BASEMAP_STYLE_URL)
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
        .then((style: StyleSpecification) => applyBasemapOverrides(style))
        .catch(() => BASEMAP_STYLE_URL);

    void Promise.all([loadMapRenderer(), loadStyle()]).then(([{ Map, NavigationControl, Popup, ScaleControl, setWorkerUrl }, style]) => {
      if (cancelled) return;
      setWorkerUrl(WORKER_URL);
      map = new Map({
        container,
        style,
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        minZoom: MIN_ZOOM,
      });
      // Attribution is required by the data licences. MapLibre keeps it
      // expanded on wide maps and collapses it to its info button on narrow
      // ones, so it stays reachable without covering the map.
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");
      // Metric distance scale. Controls added to a bottom corner stack above
      // the ones already there, so bottom-right puts the scale directly
      // above the attribution rather than beside it, and the two never
      // overlap even when the compact attribution opens on narrow maps. It
      // re-measures on every zoom and switches between metres and
      // kilometres itself.
      map.addControl(new ScaleControl({ unit: "metric", maxWidth: 120 }), "bottom-right");
      // Data layers wait for the style so they can be slotted beneath its
      // labels. `load` fires once per map; the guard covers an unmount that
      // races it, and addPointLayer itself never adds twice.
      const points = buildMapFeatureCollection(getMapPoints());
      mapRef.current = map;
      map.on("load", () => {
        if (cancelled || !map) return;
        addPointLayer(map, points);
        applyPointVisibility(map, visibilityRef.current);
        interactionsRef.current = attachPointInteractions(map, Popup);
      });
    });

    return () => {
      cancelled = true;
      interactionsRef.current?.dispose();
      interactionsRef.current = null;
      mapRef.current = null;
      map?.remove();
      map = null;
    };
  }, []);

  // Filter changes never touch the map instance: just the layer filter, and
  // the popup if its point was hidden. Before the layer exists this is a
  // no-op and the load handler applies the latest state instead.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyPointVisibility(map, visibility);
    interactionsRef.current?.applyVisibility(visibility);
  }, [visibility]);

  return <div ref={containerRef} role="region" aria-label="World map" className="h-full w-full bg-[#f2f3f0]" />;
}
