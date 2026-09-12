"use client";

import { useState } from "react";

import { MapLegend } from "@/components/map/map-legend";
import { DEFAULT_MAP_VISIBILITY } from "@/components/map/map-point-style";
import type { MapVisibilityGroup, MapVisibilityState } from "@/components/map/map-point-style";
import { UrdaisMap } from "@/components/map/urdais-map";

/**
 * Owns the map page's application state: which point groups are visible.
 * The legend edits it and the map applies it, so the data flow is one
 * direction and neither knows about the other. State lives only for the
 * page's lifetime: a refresh restores every group to visible, by design,
 * until persistence is wanted.
 */
export function MapWorkspace() {
  const [visibility, setVisibility] = useState<MapVisibilityState>(DEFAULT_MAP_VISIBILITY);

  const toggle = (group: MapVisibilityGroup) => setVisibility((current) => ({ ...current, [group]: !current[group] }));

  return (
    <>
      <UrdaisMap visibility={visibility} />
      <MapLegend visibility={visibility} onToggle={toggle} className="absolute bottom-16 left-3 sm:bottom-3" />
    </>
  );
}
