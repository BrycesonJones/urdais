/**
 * Domain and output validation for Grid Buildout analytics.
 *
 * Two gates, in two directions.
 *
 * Domain validation runs before any arithmetic and refuses inputs that are impossible rather than
 * merely absent. Absence is ordinary here and is handled by the methodology; a negative mileage or
 * a year 3000 date is not absence, it is a defect, and coercing it into a valid analytical value
 * would publish a number nobody can account for.
 *
 * Output validation runs before anything can be published and fails closed. A metric that cannot
 * satisfy its contract produces no figure at all, rather than a figure the contract would have
 * rejected.
 */

import {
  EARLIEST_PLAUSIBLE_YEAR, LATEST_PLAUSIBLE_YEAR, METHODOLOGY_VERSION, SLIP_MINIMUM_PROJECTS,
  type AnalyticalMarket,
} from "@/lib/grid-buildout/analytics/methodology";
import type {
  AnalyticalUniverse, CanonicalOccurrence, GridBuildoutAnalytics,
} from "@/lib/grid-buildout/analytics/types";

export class BuildoutDomainError extends Error {
  constructor(detail: string) {
    super(`grid buildout domain violation: ${detail}`);
    this.name = "BuildoutDomainError";
  }
}

export class BuildoutOutputError extends Error {
  constructor(detail: string) {
    super(`grid buildout output contract failed: ${detail}`);
    this.name = "BuildoutOutputError";
  }
}

function plausibleDate(value: string | null, field: string, where: string): void {
  if (value === null) return;
  const year = Number(value.slice(0, 4));
  if (!Number.isInteger(year) || year < EARLIEST_PLAUSIBLE_YEAR || year > LATEST_PLAUSIBLE_YEAR) {
    throw new BuildoutDomainError(`${where}: ${field} is ${value}, outside `
      + `${EARLIEST_PLAUSIBLE_YEAR}-${LATEST_PLAUSIBLE_YEAR}`);
  }
}

/** One canonical occurrence, checked before it may contribute to anything. */
export function assertOccurrenceDomain(
  occurrence: CanonicalOccurrence,
  market: AnalyticalMarket,
): void {
  const where = `${market} ${occurrence.nativeId}#${occurrence.occurrence}`;

  if (occurrence.nativeId.trim() === "") {
    throw new BuildoutDomainError(`${where}: empty native identifier; provenance would be unusable`);
  }
  if (occurrence.rawRecordId.trim() === "" || occurrence.projectId.trim() === "") {
    throw new BuildoutDomainError(`${where}: missing lineage identifier`);
  }
  if (!Number.isInteger(occurrence.occurrence) || occurrence.occurrence < 1) {
    throw new BuildoutDomainError(`${where}: occurrence ${occurrence.occurrence} is not a positive integer`);
  }

  for (const [field, quantity] of [["newMiles", occurrence.newMiles], ["rebuiltMiles", occurrence.rebuiltMiles]] as const) {
    if (quantity.value !== null && !Number.isFinite(quantity.value)) {
      throw new BuildoutDomainError(`${where}: ${field} is not finite`);
    }
    if (quantity.value !== null && quantity.value < 0) {
      throw new BuildoutDomainError(`${where}: ${field} is ${quantity.value}; mileage cannot be negative`);
    }
    // The contradiction the canonical schema also forbids, re-checked because analytics must not
    // rely on an upstream constraint it cannot see.
    if (!quantity.isReported && quantity.value !== null) {
      throw new BuildoutDomainError(`${where}: ${field} is unreported yet carries ${quantity.value}`);
    }
  }

  if (occurrence.serviceLevelKv !== null
      && (!Number.isFinite(occurrence.serviceLevelKv) || occurrence.serviceLevelKv <= 0)) {
    throw new BuildoutDomainError(`${where}: service level ${occurrence.serviceLevelKv} kV is not positive`);
  }

  plausibleDate(occurrence.actualInService, "actual in-service", where);
  plausibleDate(occurrence.targetAtApproval, "target at approval", where);
  plausibleDate(occurrence.targetCurrent, "current target", where);

  // A sentinel means the date is unknown. Holding both is contradictory.
  if (occurrence.actualInServiceSentinel && occurrence.actualInService !== null) {
    throw new BuildoutDomainError(`${where}: carries both a sentinel and a usable actual in-service date`);
  }
}

/** The assembled universe, checked before metrics read it. */
export function assertUniverseDomain(universe: AnalyticalUniverse): void {
  const keys = new Set<string>();
  for (const project of universe.projects) {
    if (keys.has(project.key)) {
      throw new BuildoutDomainError(`analytical identity collision on ${project.key}`);
    }
    keys.add(project.key);

    if (project.occurrences.length === 0) {
      throw new BuildoutDomainError(`analytical project ${project.key} has no contributing occurrence`);
    }
    // A resolution group must share the identifier it was grouped by, or the rule did something
    // other than exact equality.
    for (const occurrence of project.occurrences) {
      if (occurrence.nativeId !== project.nativeId) {
        throw new BuildoutDomainError(
          `analytical project ${project.key} groups native id ${occurrence.nativeId}; `
          + "resolution is exact-identifier only");
      }
      if (occurrence.snapshotId !== universe.snapshotId) {
        throw new BuildoutDomainError(
          `analytical project ${project.key} mixes snapshots; a metric never spans vintages`);
      }
    }
    if (!project.occurrences.includes(project.primary)) {
      throw new BuildoutDomainError(`analytical project ${project.key} has a primary outside its members`);
    }
  }

  const grouped = universe.projects.reduce((total, project) => total + project.occurrences.length, 0);
  const excludedTotal = universe.excluded.reduce((total, item) => total + item.count, 0);
  if (grouped + excludedTotal !== universe.occurrencesRead) {
    throw new BuildoutDomainError(
      `${universe.market}: ${grouped} grouped + ${excludedTotal} excluded <> ${universe.occurrencesRead} read`);
  }
}

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new BuildoutOutputError(`${label} is ${String(value)}`);
}

function count(value: number, label: string): void {
  finite(value, label);
  if (!Number.isInteger(value) || value < 0) {
    throw new BuildoutOutputError(`${label} is ${value}; counts are non-negative integers`);
  }
}

/** Every published figure, checked before it can leave the calculator. */
export function assertOutputContract(analytics: GridBuildoutAnalytics): void {
  if (analytics.methodologyVersion !== METHODOLOGY_VERSION) {
    throw new BuildoutOutputError(
      `methodology version ${analytics.methodologyVersion} is not ${METHODOLOGY_VERSION}`);
  }
  if (Number.isNaN(Date.parse(analytics.calculatedAt))) {
    throw new BuildoutOutputError(`calculatedAt ${analytics.calculatedAt} is not a timestamp`);
  }
  if (!/^[0-9a-f]{64}$/.test(analytics.inputDigest)) {
    throw new BuildoutOutputError("input digest is not a sha-256");
  }

  // M1: periods are years, counts are counts, and the total is their sum.
  let m1Sum = 0;
  for (const period of analytics.m1.periods) {
    count(period.count, `m1 ${period.period}`);
    if (!Number.isInteger(period.period)
        || period.period < 1900 || period.period > 2200) {
      throw new BuildoutOutputError(`m1 period ${period.period} is not a plausible year`);
    }
    m1Sum += period.count;
  }
  count(analytics.m1.total, "m1 total");
  if (m1Sum !== analytics.m1.total) {
    throw new BuildoutOutputError(`m1 periods sum to ${m1Sum}, total says ${analytics.m1.total}`);
  }
  count(analytics.m1.excludedSentinelDate, "m1 sentinel exclusions");

  // M2: a stock, summing to its own total.
  let m2Sum = 0;
  for (const item of analytics.m2.byLifecycle) {
    count(item.count, `m2 ${item.lifecycle}`);
    m2Sum += item.count;
  }
  count(analytics.m2.total, "m2 total");
  if (m2Sum !== analytics.m2.total) {
    throw new BuildoutOutputError(`m2 classes sum to ${m2Sum}, total says ${analytics.m2.total}`);
  }

  // M3: a decomposition of M1's population. Works character must account for all of it.
  count(analytics.m3.population, "m3 population");
  if (analytics.m3.population !== analytics.m1.total) {
    throw new BuildoutOutputError(
      `m3 population ${analytics.m3.population} <> m1 total ${analytics.m1.total}`);
  }
  let characterSum = 0;
  for (const item of analytics.m3.byWorksCharacter) {
    count(item.count, `m3 ${item.character}`);
    finite(item.share, `m3 ${item.character} share`);
    if (item.share < 0 || item.share > 1) {
      throw new BuildoutOutputError(`m3 ${item.character} share ${item.share} is outside 0..1`);
    }
    characterSum += item.count;
  }
  if (characterSum !== analytics.m3.population) {
    throw new BuildoutOutputError(
      `m3 works character sums to ${characterSum}, population is ${analytics.m3.population}`);
  }
  let kvSum = 0;
  for (const item of analytics.m3.byServiceLevelKv) {
    count(item.count, `m3 kv ${item.kv}`);
    kvSum += item.count;
  }
  count(analytics.m3.suppressedKvProjects, "m3 suppressed kv projects");
  if (kvSum + analytics.m3.suppressedKvProjects > analytics.m3.population) {
    throw new BuildoutOutputError(
      `m3 kV classes plus suppressed exceed the population`);
  }

  // M4: either a complete distribution or none at all.
  count(analytics.m4.excludedMissingEndpoint, "m4 missing-endpoint exclusions");
  count(analytics.m4.excludedYearPrecision, "m4 year-precision exclusions");
  count(analytics.m4.excludedCancelled, "m4 cancelled exclusions");
  if (analytics.m4.published) {
    const d = analytics.m4.distribution;
    if (d === null) throw new BuildoutOutputError("m4 is published with no distribution");
    count(d.count, "m4 count");
    if (d.count < SLIP_MINIMUM_PROJECTS) {
      throw new BuildoutOutputError(`m4 published with ${d.count} projects, floor is ${SLIP_MINIMUM_PROJECTS}`);
    }
    for (const [label, value] of Object.entries(d)) finite(value, `m4 ${label}`);
    if (!(d.min <= d.q1 && d.q1 <= d.median && d.median <= d.q3 && d.q3 <= d.max)) {
      throw new BuildoutOutputError(
        `m4 quantiles are not ordered: min ${d.min} q1 ${d.q1} median ${d.median} q3 ${d.q3} max ${d.max}`);
    }
  } else {
    if (analytics.m4.distribution !== null) {
      throw new BuildoutOutputError("m4 is withheld yet carries a distribution");
    }
    if (analytics.m4.withheldReason === null) {
      throw new BuildoutOutputError("m4 is withheld with no stated reason");
    }
  }

  // M5: counts, and a reason list that cannot exceed them.
  count(analytics.m5.cancelled, "m5 cancelled");
  count(analytics.m5.unmappedStatusCount, "m5 unmapped statuses");
  if (analytics.m5.reasons.length > analytics.m5.cancelled) {
    throw new BuildoutOutputError(
      `m5 lists ${analytics.m5.reasons.length} reasons for ${analytics.m5.cancelled} cancellations`);
  }
  if (analytics.m5.onHoldReported !== false) {
    throw new BuildoutOutputError("m5 claims an on-hold figure, which 1.0.0 does not publish");
  }

  // Provenance must be sufficient to trace any figure back.
  for (const [market, info] of Object.entries(analytics.markets)) {
    if (info.snapshotId.trim() === "" || info.snapshotKey.trim() === "") {
      throw new BuildoutOutputError(`${market} provenance is missing its snapshot identity`);
    }
    count(info.projects, `${market} project count`);
  }
  count(analytics.coverage.caisoDuplicateGroups, "caiso duplicate groups");
  count(analytics.coverage.caisoOccurrencesResolvedAway, "caiso occurrences resolved away");
}
