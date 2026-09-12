import type { UrdaisMapPoint } from "@/types/map";

/**
 * TEMPORARY DEMO DATA for verifying the map's point rendering. These are
 * not Urdais facilities, markets, or measurements: the coordinates are
 * neutral geographic anchors (well-known city locations on several
 * continents) chosen only so that dots are obviously visible at world and
 * regional zoom, and the mapped/unmapped split (four of each) exists only
 * to exercise both colours. The operator and location on the mapped points
 * are placeholder text for the profile popup, not descriptions of anything
 * that exists. Delete this list when the backend supplies real points.
 */
export const DEMO_MAP_POINTS: readonly UrdaisMapPoint[] = [
  { id: "demo-1", name: "Demo Point 1", longitude: -84.388, latitude: 33.749, mappingStatus: "mapped", operator: "Demo Operator", location: "Atlanta, Georgia, USA" },
  { id: "demo-2", name: "Demo Point 2", longitude: -122.419, latitude: 37.775, mappingStatus: "unmapped" },
  { id: "demo-3", name: "Demo Point 3", longitude: -0.128, latitude: 51.507, mappingStatus: "mapped", operator: "Demo Operator", location: "London, United Kingdom" },
  { id: "demo-4", name: "Demo Point 4", longitude: 8.682, latitude: 50.111, mappingStatus: "unmapped" },
  { id: "demo-5", name: "Demo Point 5", longitude: 103.82, latitude: 1.352, mappingStatus: "mapped", operator: "Demo Operator", location: "Singapore" },
  { id: "demo-6", name: "Demo Point 6", longitude: 139.692, latitude: 35.69, mappingStatus: "unmapped" },
  { id: "demo-7", name: "Demo Point 7", longitude: 151.209, latitude: -33.868, mappingStatus: "mapped", location: "Sydney, Australia" },
  { id: "demo-8", name: "Demo Point 8", longitude: -46.633, latitude: -23.55, mappingStatus: "unmapped" },
];

/**
 * The seam between the map and its data. The map only ever calls this; a
 * later phase swaps the demo list for backend-supplied points without
 * touching the map lifecycle.
 */
export function getMapPoints(): readonly UrdaisMapPoint[] {
  return DEMO_MAP_POINTS;
}
