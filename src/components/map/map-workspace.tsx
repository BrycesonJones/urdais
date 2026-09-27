"use client";

import { useState } from "react";

import { MapLegend } from "@/components/map/map-legend";
import {
  DEFAULT_MAP_VISIBILITY,
  MAP_POINT_CATEGORY_LABELS,
} from "@/components/map/map-point-style";
import type {
  MapVisibilityGroup,
  MapVisibilityState,
} from "@/components/map/map-point-style";
import { UrdaisMap } from "@/components/map/urdais-map";
import { PremiumLayerDialog } from "@/components/premium/premium-layer-dialog";
import type { AccessDenialReason } from "@/lib/access/entitlement";
import { MAP_HREF } from "@/lib/routes";
import type { FacilityCategory } from "@/lib/facilities/domain";
import type { UrdaisMapPoint } from "@/types/map";

/**
 * Owns the map page's application state: which point groups are visible.
 * The legend edits it and the map applies it, so the data flow is one
 * direction and neither knows about the other. State lives only for the
 * page's lifetime: a refresh restores every group to visible, by design,
 * until persistence is wanted.
 *
 * The facilities themselves are not state. They are read on the server and
 * passed straight through, so this component has nothing to fetch and no
 * loading condition to render.
 *
 * ## Locked layers
 *
 * `lockedCategories` arrives already decided by the server, and carries names
 * only — the points for those categories were filtered out before this component
 * existed, so there is nothing here to leak and nothing to "unhide". Toggling
 * visibility on a locked group would do nothing but confuse; activating its legend
 * row opens the gate instead, over a map that keeps its position and zoom.
 */
export function MapWorkspace({
  points,
  lockedCategories = [],
  lockedReason = "authentication_required",
}: {
  points: readonly UrdaisMapPoint[];
  lockedCategories?: readonly FacilityCategory[];
  lockedReason?: Exclude<AccessDenialReason, "unknown_product">;
}) {
  const [visibility, setVisibility] = useState<MapVisibilityState>(
    DEFAULT_MAP_VISIBILITY,
  );
  const [gateLayer, setGateLayer] = useState<MapVisibilityGroup | null>(null);

  const toggle = (group: MapVisibilityGroup) =>
    setVisibility((current) => ({ ...current, [group]: !current[group] }));

  return (
    <>
      <UrdaisMap points={points} visibility={visibility} />
      <MapLegend
        visibility={visibility}
        onToggle={toggle}
        lockedCategories={lockedCategories}
        onLockedSelect={setGateLayer}
        className="absolute bottom-16 left-3 sm:bottom-3"
      />
      {/*
        Rendered only when something is actually locked. With enforcement off --
        the production default -- there is nothing to gate, so the public map ships
        none of the gate's markup or copy and is byte-identical to what it was
        before Phase 3.
      */}
      {lockedCategories.length > 0 ? (
        <PremiumLayerDialog
          open={gateLayer !== null}
          onClose={() => setGateLayer(null)}
          layerName={gateLayer ? MAP_POINT_CATEGORY_LABELS[gateLayer] : null}
          reason={lockedReason}
          // Back to the map, naming the layer they wanted so a later onboarding flow
          // can return them to it. Sanitised by `safeReturnTo` inside the links module.
          returnTo={
            gateLayer
              ? `${MAP_HREF}?layer=${encodeURIComponent(gateLayer)}`
              : MAP_HREF
          }
        />
      ) : null}
    </>
  );
}
