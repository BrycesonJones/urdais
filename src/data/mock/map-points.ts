import type { UrdaisMapPoint } from "@/types/map";

/**
 * TEMPORARY DEMO DATA for verifying the map's point rendering. These are
 * not Urdais facilities, markets, or measurements: the coordinates are
 * neutral geographic anchors (well-known city locations on several
 * continents) chosen only so that dots are obviously visible at world and
 * regional zoom, and the mapped/unmapped split (six and four) exists only
 * to exercise the colours: the six mapped points cover the four
 * categories (two data centres, two compute clusters, one power
 * infrastructure point, one semiconductor fab) so every colour is on the
 * map. The address and contact email on the mapped points are placeholder
 * text for the profile popup (example.com addresses, not real contacts),
 * and some mapped points carry only one of them so optional rows are
 * exercised. The demo-11 to demo-24 points sit in three deliberately dense
 * pockets (Northern Virginia, Dallas–Fort Worth, Frankfurt) purely so that
 * clustering is visible at country and world zoom; they are not facilities.
 * Delete this list when the backend supplies real points.
 */
export const DEMO_MAP_POINTS: readonly UrdaisMapPoint[] = [
  { id: "demo-1", name: "Demo Point 1", longitude: -84.388, latitude: 33.749, mappingStatus: "mapped", category: "compute_cluster", address: "Atlanta, Georgia, USA", contactEmail: "demo@example.com" },
  { id: "demo-2", name: "Demo Point 2", longitude: -122.419, latitude: 37.775, mappingStatus: "unmapped" },
  { id: "demo-3", name: "Demo Point 3", longitude: -0.128, latitude: 51.507, mappingStatus: "mapped", category: "data_center", address: "London, United Kingdom", contactEmail: "demo@example.com" },
  { id: "demo-4", name: "Demo Point 4", longitude: 8.682, latitude: 50.111, mappingStatus: "unmapped" },
  { id: "demo-5", name: "Demo Point 5", longitude: 103.82, latitude: 1.352, mappingStatus: "mapped", category: "data_center", address: "Singapore" },
  { id: "demo-6", name: "Demo Point 6", longitude: 139.692, latitude: 35.69, mappingStatus: "unmapped" },
  { id: "demo-7", name: "Demo Point 7", longitude: 151.209, latitude: -33.868, mappingStatus: "mapped", category: "power_infrastructure", contactEmail: "demo@example.com" },
  { id: "demo-8", name: "Demo Point 8", longitude: -46.633, latitude: -23.55, mappingStatus: "unmapped" },
  { id: "demo-9", name: "Demo Point 9", longitude: 121.0, latitude: 24.8, mappingStatus: "mapped", category: "semiconductor_fab", address: "Hsinchu, Taiwan", contactEmail: "demo@example.com" },
  { id: "demo-10", name: "Demo Point 10", longitude: -97.743, latitude: 30.267, mappingStatus: "mapped", category: "compute_cluster", address: "1 Demo Street, Austin, Texas, USA" },
  // Dense pocket: Northern Virginia.
  { id: "demo-11", name: "Demo Point 11", longitude: -77.487, latitude: 39.044, mappingStatus: "mapped", category: "data_center", address: "Ashburn, Virginia, USA", contactEmail: "demo@example.com" },
  { id: "demo-12", name: "Demo Point 12", longitude: -77.52, latitude: 39.03, mappingStatus: "mapped", category: "data_center", address: "Ashburn, Virginia, USA" },
  { id: "demo-13", name: "Demo Point 13", longitude: -77.45, latitude: 39.06, mappingStatus: "mapped", category: "power_infrastructure", address: "Loudoun County, Virginia, USA" },
  { id: "demo-14", name: "Demo Point 14", longitude: -77.41, latitude: 38.95, mappingStatus: "mapped", category: "compute_cluster", address: "Sterling, Virginia, USA" },
  { id: "demo-15", name: "Demo Point 15", longitude: -77.55, latitude: 39.08, mappingStatus: "unmapped" },
  { id: "demo-16", name: "Demo Point 16", longitude: -77.36, latitude: 38.92, mappingStatus: "mapped", category: "data_center", address: "Manassas, Virginia, USA" },
  // Dense pocket: Dallas–Fort Worth.
  { id: "demo-17", name: "Demo Point 17", longitude: -96.797, latitude: 32.777, mappingStatus: "mapped", category: "data_center", address: "Dallas, Texas, USA", contactEmail: "demo@example.com" },
  { id: "demo-18", name: "Demo Point 18", longitude: -96.87, latitude: 32.81, mappingStatus: "mapped", category: "compute_cluster", address: "Dallas, Texas, USA" },
  { id: "demo-19", name: "Demo Point 19", longitude: -97.04, latitude: 32.9, mappingStatus: "mapped", category: "power_infrastructure", address: "Irving, Texas, USA" },
  { id: "demo-20", name: "Demo Point 20", longitude: -97.33, latitude: 32.75, mappingStatus: "mapped", category: "data_center", address: "Fort Worth, Texas, USA" },
  { id: "demo-21", name: "Demo Point 21", longitude: -96.7, latitude: 33.0, mappingStatus: "unmapped" },
  // Dense pocket: Frankfurt.
  { id: "demo-22", name: "Demo Point 22", longitude: 8.65, latitude: 50.12, mappingStatus: "mapped", category: "data_center", address: "Frankfurt, Germany", contactEmail: "demo@example.com" },
  { id: "demo-23", name: "Demo Point 23", longitude: 8.72, latitude: 50.09, mappingStatus: "mapped", category: "compute_cluster", address: "Frankfurt, Germany" },
  { id: "demo-24", name: "Demo Point 24", longitude: 8.6, latitude: 50.15, mappingStatus: "mapped", category: "power_infrastructure", address: "Frankfurt, Germany" },
];

/**
 * The seam between the map and its data. The map only ever calls this; a
 * later phase swaps the demo list for backend-supplied points without
 * touching the map lifecycle.
 */
export function getMapPoints(): readonly UrdaisMapPoint[] {
  return DEMO_MAP_POINTS;
}
