/**
 * Warms the MapLibre renderer chunk on navigation intent so `/map` feels
 * instant, without loading it for every homepage visitor. The route's own
 * code is prefetched by Next's `Link`; this only pulls the (large) renderer,
 * which `UrdaisMap` imports lazily. The map itself is never initialised
 * here, and no tiles are requested until the map page mounts.
 */
let warmed = false;

export function prefetchMapRenderer(): void {
  if (warmed || typeof window === "undefined") return;
  warmed = true;
  void import("maplibre-gl").catch(() => {
    // A failed warm-up is harmless: the map page retries its own import.
    warmed = false;
  });
}
