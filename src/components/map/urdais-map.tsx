"use client";

import { useEffect, useRef } from "react";

import "maplibre-gl/dist/maplibre-gl.css";

/**
 * OpenFreeMap's Positron style: a subdued, low-noise basemap served from
 * OpenMapTiles vector tiles with OpenStreetMap data. It needs no API key.
 * The style's tile source declares the required OpenFreeMap, OpenMapTiles,
 * and OpenStreetMap attribution, which MapLibre's attribution control shows.
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
 * container. This phase renders the basemap only. Data layers (mapped and
 * unmapped points, category colours, clustering, popups, filtering) are
 * added later as MapLibre sources and layers on the same instance, so this
 * component owns the map lifecycle and nothing else.
 *
 * MapLibre touches `window` on import, so the renderer is imported inside
 * the effect: the page renders on the server without it, the library ships
 * in its own chunk that only `/map` (or an intentional prefetch) loads, and
 * the map is created once per mount and removed on unmount. A cancelled
 * flag covers the mount → unmount → mount sequence React runs in
 * development so no orphan instance survives.
 */
export function UrdaisMap() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let map: import("maplibre-gl").Map | null = null;

    void import("maplibre-gl").then(({ Map, NavigationControl, setWorkerUrl }) => {
      if (cancelled) return;
      setWorkerUrl(WORKER_URL);
      map = new Map({
        container,
        style: BASEMAP_STYLE_URL,
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        minZoom: MIN_ZOOM,
      });
      // Attribution is required by the data licences. MapLibre keeps it
      // expanded on wide maps and collapses it to its info button on narrow
      // ones, so it stays reachable without covering the map.
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    });

    return () => {
      cancelled = true;
      map?.remove();
      map = null;
    };
  }, []);

  return <div ref={containerRef} role="region" aria-label="World map" className="h-full w-full bg-[#f2f3f0]" />;
}
