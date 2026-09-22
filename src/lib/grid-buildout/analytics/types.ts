/** Typed shapes for the Grid Buildout analytical layer. */

import type { AnalyticalMarket } from "@/lib/grid-buildout/analytics/methodology";
import type { LifecycleState } from "@/lib/grid-buildout/types";

/** Methodology §5. `none_reported_zero` is an affirmative nil, not a gap. */
export type WorksCharacter =
  | "new" | "rebuilt_or_reconductored" | "both" | "none_reported_zero" | "unknown_unclassified";

/** One canonical occurrence, as the analytical layer sees it. Never mutated. */
export type CanonicalOccurrence = {
  projectId: string;
  snapshotId: string;
  rawRecordId: string;
  nativeId: string;
  nativeList: string;
  occurrence: number;
  sponsor: string | null;
  lifecycle: LifecycleState;
  lifecycleBasis: string;
  driverClass: string;
  serviceLevelKv: number | null;
  newMiles: { value: number | null; isReported: boolean };
  rebuiltMiles: { value: number | null; isReported: boolean };
  /** Usable dates only; a sentinel or unparseable value arrives as null with a flag. */
  actualInService: string | null;
  actualInServiceSentinel: boolean;
  targetAtApproval: string | null;
  /** Year precision means the publisher gave only a year; a slip may not be computed from it. */
  targetAtApprovalPrecision: string | null;
  targetCurrent: string | null;
  targetCurrentPrecision: string | null;
  cancellationReason: string | null;
};

/**
 * One analytical project. For ERCOT this is always one occurrence; for CAISO it may be several,
 * and every contributor is retained so a counted project traces back to the rows that made it.
 */
export type AnalyticalProject = {
  key: string;
  market: AnalyticalMarket;
  nativeId: string;
  occurrences: CanonicalOccurrence[];
  /** The occurrence whose values the project takes, per methodology §6 value selection. */
  primary: CanonicalOccurrence;
  /** Owners contributing to this project, in the publisher's own sheet order. */
  contributingOwners: string[];
  /** Fields on which contributors disagreed. Reported, never averaged. */
  disagreements: { field: string; values: string[] }[];
};

export type AnalyticalUniverse = {
  market: AnalyticalMarket;
  snapshotId: string;
  snapshotKey: string;
  observedAt: string;
  occurrencesRead: number;
  projects: AnalyticalProject[];
  excluded: { reason: string; count: number }[];
  /** Driver rows left `unknown` for want of publisher evidence. A coverage disclosure. */
  unknownDriverCount: number;
  duplicateResolutions: {
    nativeId: string;
    occurrences: number;
    owners: string[];
    projectIds: string[];
  }[];
};

export type PeriodCount = { period: number; count: number };

export type M1 = {
  metric: "m1_projects_entering_service";
  market: "ercot";
  unit: "projects";
  periods: PeriodCount[];
  total: number;
  excludedSentinelDate: number;
  caveat: string;
};

export type M2 = {
  metric: "m2_active_backlog";
  market: "ercot";
  unit: "projects";
  asOf: string;
  byLifecycle: { lifecycle: string; count: number }[];
  total: number;
};

export type M3 = {
  metric: "m3_completions_decomposition";
  market: "ercot";
  unit: "projects";
  population: number;
  byServiceLevelKv: { kv: number; count: number }[];
  suppressedKvClasses: number;
  suppressedKvProjects: number;
  byWorksCharacter: { character: WorksCharacter; count: number; share: number }[];
};

export type M4 = {
  metric: "m4_schedule_slip";
  market: "caiso";
  unit: "days";
  published: boolean;
  /** Null whenever `published` is false, so an unpublishable distribution cannot be read as zero. */
  distribution: {
    count: number; median: number; q1: number; q3: number; min: number; max: number;
  } | null;
  excludedMissingEndpoint: number;
  /** Endpoints the publisher gave only to the year. Excluded rather than given an invented day. */
  excludedYearPrecision: number;
  excludedCancelled: number;
  floor: number;
  withheldReason: string | null;
};

export type M5 = {
  metric: "m5_cancellations";
  market: "caiso";
  unit: "projects";
  cancelled: number;
  reasons: { nativeId: string; reason: string }[];
  unmappedStatusCount: number;
  onHoldReported: false;
  onHoldNote: string;
};

export type GridBuildoutAnalytics = {
  methodologyVersion: string;
  calculatedAt: string;
  inputDigest: string;
  markets: {
    ercot: { snapshotId: string; snapshotKey: string; observedAt: string; projects: number };
    caiso: { snapshotId: string; snapshotKey: string; observedAt: string; projects: number };
  };
  m1: M1;
  m2: M2;
  m3: M3;
  m4: M4;
  m5: M5;
  coverage: {
    ercotOccurrencesRead: number;
    caisoOccurrencesRead: number;
    ercotUnknownDriver: number;
    caisoUnknownDriver: number;
    caisoDuplicateGroups: number;
    caisoOccurrencesResolvedAway: number;
    excluded: { market: string; reason: string; count: number }[];
  };
};
