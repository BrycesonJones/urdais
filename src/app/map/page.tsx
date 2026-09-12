import type { Metadata } from "next";

import { SiteHeader } from "@/components/layout/site-header";
import { MapLegend } from "@/components/map/map-legend";
import { UrdaisMap } from "@/components/map/urdais-map";

export const metadata: Metadata = {
  title: "Map",
  description: "An interactive world map of the Information Age's physical footprint.",
};

/**
 * The map workspace. The map is the page: a viewport-tall column holds the
 * header and the map, and the map takes whatever the header leaves, so there
 * is no footer, no page chrome, no hard-coded header height, and no body
 * scroll. `dvh` keeps the height correct as mobile browser chrome shows and
 * hides; the minimum keeps the map usable on very short viewports. The
 * legend is application UI floated over the map's bottom-left corner: zoom
 * controls are top-right and the scale and attribution are bottom-right,
 * so nothing competes with it. On phones MapLibre opens the compact
 * attribution across the full width on load, so the legend sits above that
 * strip there. It is React-owned and independent of the MapLibre lifecycle.
 */
export default function MapRoute() {
  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader />
      <main className="relative min-h-80 w-full flex-1">
        <UrdaisMap />
        <MapLegend className="absolute bottom-16 left-3 sm:bottom-3" />
      </main>
    </div>
  );
}
