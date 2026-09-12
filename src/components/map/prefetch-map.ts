/**
 * Single entry point for loading the MapLibre renderer. The library touches
 * `window` on import and is large, so it is never imported statically: the
 * map component loads it when it mounts, and the header warms it on
 * navigation intent so `/map` feels instant without pulling it for every
 * homepage visitor. One memoised promise serves both, so the chunk is
 * requested once per page no matter how many callers ask (React's
 * development double mount included). No map is created and no tile is
 * requested here.
 */
type MapLibre = typeof import("maplibre-gl");

let renderer: Promise<MapLibre> | null = null;

export function loadMapRenderer(): Promise<MapLibre> {
  renderer ??= import("maplibre-gl").catch((error: unknown) => {
    // Let the next caller retry rather than caching a failed load.
    renderer = null;
    throw error;
  });
  return renderer;
}

/** Warm the renderer chunk ahead of a click. A failed warm-up is harmless: the map page retries. */
export function prefetchMapRenderer(): void {
  if (typeof window === "undefined") return;
  void loadMapRenderer().catch(() => undefined);
}
