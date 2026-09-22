/**
 * M1-M5 under methodology 1.0.0.
 *
 * Each calculator is a pure function of an analytical universe, so a fixture in a test and a
 * production snapshot travel the same path. No calculator reads the database, and none of them
 * decides anything the methodology has not already decided: the classification rules live in
 * `methodology.ts`, the grouping in `universe.ts`, and what remains here is arithmetic.
 */

import { createHash } from "node:crypto";

import {
  KV_CLASS_MINIMUM_COMPLETIONS, METHODOLOGY_VERSION, SLIP_MINIMUM_PROJECTS, classifyWorksCharacter,
} from "@/lib/grid-buildout/analytics/methodology";
import type {
  AnalyticalProject, AnalyticalUniverse, GridBuildoutAnalytics, M1, M2, M3, M4, M5, WorksCharacter,
} from "@/lib/grid-buildout/analytics/types";
import { assertOutputContract } from "@/lib/grid-buildout/analytics/validate";

const WORKS_CHARACTERS: WorksCharacter[] = [
  "new", "rebuilt_or_reconductored", "both", "none_reported_zero", "unknown_unclassified",
];

const M1_CAVEAT =
  "ERCOT's Completed sheet is a rolling window rather than a cumulative census, so early periods "
  + "are not comparable with later ones until forward snapshots accumulate.";

const M5_ON_HOLD_NOTE =
  "CAISO's Project Status is uncontrolled free text, with several spellings of on-hold. "
  + "Methodology 1.0.0 does not treat them as one state, so no on-hold count is published.";

/** Projects the publisher's own list says are in service, whatever an optional status column says. */
function inService(projects: readonly AnalyticalProject[]): AnalyticalProject[] {
  return projects.filter((project) => project.primary.lifecycle === "in_service");
}

/** M1. A count of completions per calendar year of the actual in-service date. */
export function calculateM1(universe: AnalyticalUniverse): M1 {
  const completed = inService(universe.projects);
  const dated = completed.filter((project) => project.primary.actualInService !== null);
  const sentinel = completed.filter(
    (project) => project.primary.actualInService === null && project.primary.actualInServiceSentinel);

  const periods = new Map<number, number>();
  for (const project of dated) {
    const year = Number(project.primary.actualInService!.slice(0, 4));
    periods.set(year, (periods.get(year) ?? 0) + 1);
  }

  return {
    metric: "m1_projects_entering_service",
    market: "ercot",
    unit: "projects",
    periods: [...periods].map(([period, count]) => ({ period, count })).sort((a, b) => a.period - b.period),
    total: dated.length,
    excludedSentinelDate: sentinel.length,
    caveat: M1_CAVEAT,
  };
}

/** M2. A point-in-time stock of the three active lifecycle classes, plus what could not be classed. */
export function calculateM2(universe: AnalyticalUniverse): M2 {
  const wanted = ["under_construction", "planned", "proposed", "unknown"] as const;
  const counts = new Map<string, number>(wanted.map((item) => [item, 0]));
  for (const project of universe.projects) {
    const state = project.primary.lifecycle;
    if (counts.has(state)) counts.set(state, counts.get(state)! + 1);
  }
  const byLifecycle = [...counts].map(([lifecycle, count]) => ({ lifecycle, count }));
  return {
    metric: "m2_active_backlog",
    market: "ercot",
    unit: "projects",
    asOf: universe.observedAt,
    byLifecycle,
    total: byLifecycle.reduce((total, item) => total + item.count, 0),
  };
}

/**
 * M3. A decomposition of M1's dated population, as counts, along kV and works character.
 *
 * Works character comes from `classifyWorksCharacter`, which reads whether each mileage column was
 * reported before it compares anything to zero. A kV class below the floor is suppressed; the
 * unclassified works bucket never is, because it is a disclosure rather than a statistic.
 */
export function calculateM3(universe: AnalyticalUniverse): M3 {
  const population = inService(universe.projects)
    .filter((project) => project.primary.actualInService !== null);

  const kvCounts = new Map<number, number>();
  for (const project of population) {
    const kv = project.primary.serviceLevelKv;
    if (kv === null) continue;
    kvCounts.set(kv, (kvCounts.get(kv) ?? 0) + 1);
  }
  const kept: { kv: number; count: number }[] = [];
  let suppressedKvClasses = 0;
  let suppressedKvProjects = 0;
  for (const [kv, count] of [...kvCounts].sort((a, b) => a[0] - b[0])) {
    if (count < KV_CLASS_MINIMUM_COMPLETIONS) {
      suppressedKvClasses += 1;
      suppressedKvProjects += count;
    } else {
      kept.push({ kv, count });
    }
  }

  const characters = new Map<WorksCharacter, number>(WORKS_CHARACTERS.map((item) => [item, 0]));
  for (const project of population) {
    const character = classifyWorksCharacter(project.primary.newMiles, project.primary.rebuiltMiles);
    characters.set(character, characters.get(character)! + 1);
  }

  return {
    metric: "m3_completions_decomposition",
    market: "ercot",
    unit: "projects",
    population: population.length,
    byServiceLevelKv: kept,
    suppressedKvClasses,
    suppressedKvProjects,
    byWorksCharacter: [...characters].map(([character, count]) => ({
      character,
      count,
      // A zero population would otherwise divide by zero; the share is defined as 0, not NaN.
      share: population.length === 0 ? 0 : count / population.length,
    })),
  };
}

/** Linear-interpolated quantile over a sorted sample. */
export function quantile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) throw new Error("quantile of an empty sample");
  if (sorted.length === 1) return sorted[0]!;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

const MS_PER_DAY = 86_400_000;

/** M4. Current expected in-service minus the date recorded at approval, in days, as a distribution. */
export function calculateM4(universe: AnalyticalUniverse): M4 {
  const live = universe.projects.filter((project) => project.primary.lifecycle !== "cancelled");
  const cancelled = universe.projects.length - live.length;

  const slips: number[] = [];
  let missing = 0;
  let yearOnly = 0;
  for (const project of live) {
    const from = project.primary.targetAtApproval;
    const to = project.primary.targetCurrent;
    if (from === null || to === null) { missing += 1; continue; }
    // A year-precision endpoint would need a day this methodology refuses to invent: choosing one
    // fabricates up to 364 days of precision the publisher never gave. Excluded and counted.
    if (project.primary.targetAtApprovalPrecision === "year"
        || project.primary.targetCurrentPrecision === "year") { yearOnly += 1; continue; }
    const days = Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);
    if (!Number.isFinite(days)) { missing += 1; continue; }
    slips.push(days);
  }
  slips.sort((a, b) => a - b);

  if (slips.length < SLIP_MINIMUM_PROJECTS) {
    return {
      metric: "m4_schedule_slip", market: "caiso", unit: "days",
      published: false, distribution: null,
      excludedMissingEndpoint: missing, excludedYearPrecision: yearOnly, excludedCancelled: cancelled,
      floor: SLIP_MINIMUM_PROJECTS,
      withheldReason: `${slips.length} project(s) carry two day-precision endpoints; the floor is ${SLIP_MINIMUM_PROJECTS}`,
    };
  }

  return {
    metric: "m4_schedule_slip", market: "caiso", unit: "days",
    published: true,
    distribution: {
      count: slips.length,
      median: quantile(slips, 0.5),
      q1: quantile(slips, 0.25),
      q3: quantile(slips, 0.75),
      min: slips[0]!,
      max: slips[slips.length - 1]!,
    },
    excludedMissingEndpoint: missing, excludedYearPrecision: yearOnly, excludedCancelled: cancelled,
    floor: SLIP_MINIMUM_PROJECTS,
    withheldReason: null,
  };
}

/** M5. Cancellations with the publisher's own reason text. No taxonomy is invented. */
export function calculateM5(universe: AnalyticalUniverse): M5 {
  const cancelled = universe.projects.filter((project) => project.primary.lifecycle === "cancelled");
  const reasons = cancelled
    .filter((project) => (project.primary.cancellationReason ?? "").trim() !== "")
    .map((project) => ({ nativeId: project.nativeId, reason: project.primary.cancellationReason!.trim() }));
  const unmapped = universe.projects.filter((project) => project.primary.lifecycle === "unknown").length;

  return {
    metric: "m5_cancellations", market: "caiso", unit: "projects",
    cancelled: cancelled.length,
    reasons,
    unmappedStatusCount: unmapped,
    onHoldReported: false,
    onHoldNote: M5_ON_HOLD_NOTE,
  };
}

/**
 * The input digest: what the figures were computed from.
 *
 * Built from snapshot identity and the analytical population rather than from a timestamp, so the
 * same evidence produces the same digest on every run and an unchanged input is recognisable.
 */
export function inputDigest(ercot: AnalyticalUniverse, caiso: AnalyticalUniverse): string {
  const parts = [METHODOLOGY_VERSION];
  for (const universe of [ercot, caiso]) {
    parts.push(`${universe.market}|${universe.snapshotId}|${universe.snapshotKey}|${universe.occurrencesRead}`);
    for (const project of universe.projects) {
      parts.push(`${project.key}|${project.occurrences.map((item) => item.rawRecordId).sort().join(",")}`);
    }
  }
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

/** Assemble every metric and refuse to return anything that fails its output contract. */
export function calculateAnalytics(
  ercot: AnalyticalUniverse,
  caiso: AnalyticalUniverse,
  options: { calculatedAt?: string } = {},
): GridBuildoutAnalytics {
  const resolvedAway = caiso.duplicateResolutions
    .reduce((total, group) => total + group.occurrences - 1, 0);

  const analytics: GridBuildoutAnalytics = {
    methodologyVersion: METHODOLOGY_VERSION,
    calculatedAt: options.calculatedAt ?? new Date().toISOString(),
    inputDigest: inputDigest(ercot, caiso),
    markets: {
      ercot: {
        snapshotId: ercot.snapshotId, snapshotKey: ercot.snapshotKey,
        observedAt: ercot.observedAt, projects: ercot.projects.length,
      },
      caiso: {
        snapshotId: caiso.snapshotId, snapshotKey: caiso.snapshotKey,
        observedAt: caiso.observedAt, projects: caiso.projects.length,
      },
    },
    m1: calculateM1(ercot),
    m2: calculateM2(ercot),
    m3: calculateM3(ercot),
    m4: calculateM4(caiso),
    m5: calculateM5(caiso),
    coverage: {
      ercotOccurrencesRead: ercot.occurrencesRead,
      caisoOccurrencesRead: caiso.occurrencesRead,
      ercotUnknownDriver: ercot.unknownDriverCount,
      caisoUnknownDriver: caiso.unknownDriverCount,
      caisoDuplicateGroups: caiso.duplicateResolutions.length,
      caisoOccurrencesResolvedAway: resolvedAway,
      excluded: [
        ...ercot.excluded.map((item) => ({ market: "ercot", ...item })),
        ...caiso.excluded.map((item) => ({ market: "caiso", ...item })),
      ],
    },
  };

  assertOutputContract(analytics);
  return analytics;
}
