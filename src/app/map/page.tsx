import type { Metadata } from "next";

import { TrackProductView } from "@/components/analytics/track-product-view";
import { SiteHeader } from "@/components/layout/site-header";
import { MapWorkspace } from "@/components/map/map-workspace";
import { filterMapPoints } from "@/lib/access/map-access";
import { resolveMapAccess } from "@/lib/access/server";
import { facilityMapPoints } from "@/lib/facilities/read/projection";
import { facilityMapSurface } from "@/lib/facilities/read/surface";

export const metadata: Metadata = {
  title: "Map",
  description: "An interactive world map of the Information Age's physical footprint.",
};

/**
 * The public facility set is live database state. Without this declaration
 * Next prerenders the page at build time, where no production database is
 * configured, and serves that empty snapshot forever. See
 * docs/operations/production-environments.md.
 */
export const dynamic = "force-dynamic";

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
 * strip there. The workspace owns the legend's visibility state; both the
 * legend and the map are React-owned and the legend is independent of the
 * MapLibre lifecycle.
 */
export default async function MapRoute() {
  // The map stays public: the route is never refused, only narrowed. Premium
  // points are dropped before they cross the Server/Client boundary, so an
  // unentitled reader's RSC payload contains no premium coordinate at all --
  // filtering in the browser would ship them and merely not draw them.
  const [model, access] = await Promise.all([facilityMapSurface(), resolveMapAccess()]);
  const points = filterMapPoints(facilityMapPoints(model), access);

  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader />
      <TrackProductView productId="map" />
      <main className="relative min-h-80 w-full flex-1">
        {/* `lockedCategories` is names only, so the legend can advertise what is
            withheld. No withheld point travels with it. */}
        <MapWorkspace
          points={points}
          lockedCategories={access.lockedCategories}
          {...(access.reason ? { lockedReason: access.reason } : {})}
        />
      </main>
    </div>
  );
}
