/**
 * Planning currentness: whether Urdais is serving the latest official vintage it knows about.
 *
 * This is deliberately not the freshness model PD-2 uses for operational power. An EIA-930 hour
 * that is two days old is stale because the grid has since run for two more days. A planning
 * forecast has no equivalent property: ERCOT's April 2025 Adjusted LTLF was the current official
 * forecast throughout 2026, and an age threshold would have called it stale every day it fired
 * while ERCOT had published nothing to replace it.
 *
 * So currentness compares rather than counts. Two questions, both answerable from evidence:
 * what is the latest vintage the publisher has released as of the last time Urdais successfully
 * looked, and is that the vintage Urdais is serving?
 */

import type { QualityStatus } from "@/lib/power-delivery/planning/types";

export const PLANNING_CURRENTNESS_STATUSES = [
  /** Serving the latest released vintage, validated, checked recently enough to say so. */
  "current",
  /** The publisher has released something newer and Urdais has not ingested it. */
  "new_vintage_available",
  /** The newer vintage is ingested but has not passed validation yet. */
  "ingestion_pending",
  /** The newer vintage is ingested and failed validation. */
  "validation_failed",
  /** No successful check inside the monitor's interval: Urdais does not know what the source has done since. */
  "source_check_overdue",
  /** The most recent check could not reach or read the source. */
  "source_check_failed",
  /** The source is not watchable: rights, format, or methodology. */
  "blocked",
  /** No monitor, or no check has ever run. */
  "unknown",
] as const;
export type PlanningCurrentness = (typeof PLANNING_CURRENTNESS_STATUSES)[number];

/** Only one of these states permits calling a served vintage the current official forecast. */
export function isCurrent(status: PlanningCurrentness): boolean {
  return status === "current";
}

export type PlanningSourceMonitor = {
  sourceInterfaceSlug: string;
  marketSlug: string;
  discoveryUrl: string;
  discoveryMethod: "html_listing" | "asset_probe" | "manual";
  expectedCadence: "annual" | "semiannual" | "biennial" | "irregular" | "unknown";
  /** Milliseconds a successful check stays authoritative for. */
  checkIntervalMs: number;
  monitoringState: "active" | "blocked";
  blockedKind: "rights" | "format" | "methodology" | null;
  blockedReason: string | null;
};

/** What one look at a source found. */
export type PlanningSourceCheck = {
  id: string;
  sourceInterfaceSlug: string;
  checkedAt: string;
  outcome: "succeeded" | "failed";
  checkerVersion: string;
  checkedUrl: string;
  responseStatus: number | null;
  discoveredVintageKey: string | null;
  discoveredPublishedAt: string | null;
  discoveredArtifactUrl: string | null;
  discoveredArtifactHash: string | null;
  error: string | null;
};

/** The vintage a public read would serve, and the state of the one the source is offering. */
export type PlanningCurrentnessInput = {
  monitor: PlanningSourceMonitor | null;
  /** Most recent check of any outcome. */
  latestCheck: PlanningSourceCheck | null;
  /** Most recent check that succeeded, which is the only one that can establish what exists. */
  latestSuccessfulCheck: PlanningSourceCheck | null;
  /** The live vintage a public read would return, if any. */
  servedVintage: { nativeVintageKey: string; publishedAt: string; qualityStatus: QualityStatus } | null;
  /**
   * The vintage matching the discovered key, if Urdais holds one at all. Distinct from the
   * served vintage: a newer release may be ingested and awaiting validation while an older one
   * is still what a read returns.
   */
  discoveredVintage: { nativeVintageKey: string; qualityStatus: QualityStatus } | null;
  now: Date;
};

export type PlanningCurrentnessResult = {
  status: PlanningCurrentness;
  /** True only for `current`. Kept explicit so a caller cannot forget which statuses qualify. */
  isCurrent: boolean;
  servedVintageKey: string | null;
  latestKnownVintageKey: string | null;
  lastCheckedAt: string | null;
  lastSuccessfulCheckAt: string | null;
  /** When a successful check stops being authoritative. Null when there is nothing to expire. */
  checkExpiresAt: string | null;
  detail: string;
};

export type PlanningFreshness = PlanningCurrentnessResult & {
  marketSlug: string;
  sourceInterfaceSlug: string;
  expectedCadence: PlanningSourceMonitor["expectedCadence"] | null;
  monitoringState: PlanningSourceMonitor["monitoringState"] | null;
  blockedKind: PlanningSourceMonitor["blockedKind"];
  blockedReason: string | null;
};
