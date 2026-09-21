/**
 * MISO's Local Resource Zones and seasons, shared by the two MISO adapters.
 *
 * Shared because both releases name the same ten zones and the same four seasons, and spell them
 * differently: the study writes `LRZ-1` and the limits deck writes `LRZ1`, with `LRZ 10` appearing
 * once. One key reconciles them, or each zone would enter the reference tables twice and split its
 * history down the middle — the same trap PJM set with `PS NORTH` and `PSNORTH`.
 *
 * The zones' membership of local balancing authorities is not written here. MISO publishes it in
 * the limits deck, and the adapter that reads that deck records it from the artifact rather than
 * from anything typed into this repository.
 */

import type { CapacitySeason } from "@/lib/power-delivery/capacity/types";

export type MisoSeason = {
  key: string;
  label: string;
  season: CapacitySeason;
};

/**
 * The four seasons of a MISO planning year, in the order the reports tabulate them.
 *
 * No start or end date: MISO's seasonal month ranges are defined in its tariff, not in either
 * artifact, and a period this pipeline did not read is a period it does not assert. The planning
 * year and the season name identify the period exactly.
 */
export const MISO_SEASONS: MisoSeason[] = [
  { key: "summer", label: "Summer", season: "summer" },
  { key: "fall", label: "Fall", season: "fall" },
  { key: "winter", label: "Winter", season: "winter" },
  { key: "spring", label: "Spring", season: "spring" },
];

export function misoSeason(label: string): MisoSeason | null {
  const wanted = label.trim().toLowerCase();
  return MISO_SEASONS.find((season) => season.key === wanted) ?? null;
}

export type MisoZone = { nativeKey: string; nativeLabel: string };

/** `LRZ-1` from `LRZ1`, `LRZ 1`, `LRZ-1` or a bare `1`. Null when the text names no zone. */
export function misoZoneKey(label: string): string | null {
  const matched = /(?:LRZ\s*[-–]?\s*)?(\d{1,2})\s*$/.exec(label.trim());
  if (matched === null) return null;
  const number = Number(matched[1]);
  if (!Number.isInteger(number) || number < 1 || number > 10) return null;
  return `LRZ-${number}`;
}

export const MISO_ZONES: MisoZone[] = Array.from({ length: 10 }, (_, index) => ({
  nativeKey: `LRZ-${index + 1}`,
  nativeLabel: `MISO Local Resource Zone ${index + 1}`,
}));

/** Shape the adapters read: the zones in table order, and the seasons in table order. */
export const MISO_LRZS = {
  zones: MISO_ZONES,
  seasons: MISO_SEASONS,
};
