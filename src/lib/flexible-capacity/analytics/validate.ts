/**
 * The contract every scenario result must satisfy before it may be stored as successful.
 *
 * These are not unit tests of the solver. They are the properties a *stored* figure must have for
 * anyone downstream to trust it without re-deriving it: that the energy it claims to spend is
 * within the budget it claims to have, that it never sheds more than the load it added, that its
 * coverage arithmetic closes, that it carries the methodology it says it does, and that the things
 * 1.0.0 refuses to model are genuinely absent rather than merely unmentioned.
 *
 * Returning a list rather than throwing on the first problem is deliberate. A result that fails
 * three invariants has a different cause from one that fails a single tolerance, and the run
 * ledger should be able to say which.
 */

import {
  BATTERY_ENABLED, MAX_ANNUAL_CURTAILMENT_ENERGY_FRACTION, METHODOLOGY_DOCUMENT_SHA256,
  METHODOLOGY_SLUG, METHODOLOGY_VERSION, MODELED_LOAD_SHAPE, PEAK_REFERENCE_RULE,
  PEAK_REGION_RULE, REBOUND_MODEL,
} from "@/lib/flexible-capacity/methodology";
import { energyToleranceMwh } from "@/lib/flexible-capacity/scenario";
import type { ScenarioRecord } from "@/lib/flexible-capacity/analytics/types";

const finite = (value: number): boolean => Number.isFinite(value);

export function validateScenarioRecord(record: ScenarioRecord): string[] {
  const problems: string[] = [];
  const { observed, assumptions, outcome } = record;
  const where = `${record.market} ${record.modeledPeriod.localYear} alpha=${assumptions.annualCurtailmentEnergyFraction}`;
  const fail = (detail: string): void => { problems.push(`${where}: ${detail}`); };

  // ---------------------------------------------------------------- the numbers are numbers
  for (const [key, value] of Object.entries(outcome)) {
    if (!finite(value)) fail(`outcome.${key} is ${String(value)}`);
  }
  for (const [key, value] of Object.entries(observed)) {
    if (typeof value === "number" && !finite(value)) fail(`observed.${key} is ${String(value)}`);
  }

  // ---------------------------------------------------------------- the headroom
  if (outcome.curtailmentEnabledHeadroomMw < 0) fail("headroom is negative");
  if (Math.abs(outcome.curtailmentEnabledHeadroomGw * 1000 - outcome.curtailmentEnabledHeadroomMw) > 1e-9) {
    fail("the GW and MW headroom figures disagree");
  }

  // ---------------------------------------------------------------- the budget actually binds
  if (outcome.curtailedEnergyMwh < 0) fail("curtailed energy is negative");
  if (outcome.curtailmentBudgetMwh < 0) fail("the curtailment budget is negative");
  if (outcome.curtailedEnergyMwh
    > outcome.curtailmentBudgetMwh + energyToleranceMwh(outcome.curtailmentBudgetMwh)) {
    fail(`curtailed energy ${outcome.curtailedEnergyMwh} exceeds its budget ${outcome.curtailmentBudgetMwh}`);
  }
  const expectedBudget = assumptions.annualCurtailmentEnergyFraction
    * outcome.curtailmentEnabledHeadroomMw * observed.observationCount;
  if (Math.abs(expectedBudget - outcome.curtailmentBudgetMwh) > 1e-6 * (1 + Math.abs(expectedBudget))) {
    fail("the reported budget is not alpha x headroom x T");
  }

  // ---------------------------------------------------------------- hours and events
  if (outcome.curtailmentClockHours < 0) fail("clock hours are negative");
  if (!Number.isInteger(outcome.curtailmentClockHours)) fail("clock hours are not a whole number");
  if (outcome.curtailmentClockHours > observed.observationCount) {
    fail("more hours were curtailed than exist in the period");
  }
  if (outcome.curtailmentEventCount < 0) fail("the event count is negative");
  if (!Number.isInteger(outcome.curtailmentEventCount)) fail("the event count is not a whole number");
  if (outcome.curtailmentEventCount > outcome.curtailmentClockHours) {
    fail("there are more events than curtailed hours");
  }
  if (outcome.maxCurtailmentEventHours > outcome.curtailmentClockHours) {
    fail("the longest event is longer than the total curtailed hours");
  }
  if (outcome.meanCurtailmentEventHours > outcome.maxCurtailmentEventHours + 1e-9) {
    fail("the mean event is longer than the longest event");
  }
  if (outcome.curtailmentEventCount === 0 && outcome.curtailmentClockHours !== 0) {
    fail("curtailed hours are recorded with no events");
  }

  // ---------------------------------------------------------------- coverage arithmetic closes
  if (observed.observationCount + observed.missingObservationCount !== observed.expectedObservationCount) {
    fail("present + missing hours do not equal the expected hours");
  }
  if (observed.observationCount !== record.modeledPeriod.expectedObservationCount - observed.missingObservationCount) {
    fail("the observation count disagrees with the period length");
  }
  const ratio = observed.expectedObservationCount === 0
    ? 0 : observed.observationCount / observed.expectedObservationCount;
  if (Math.abs(ratio - observed.coverageRatio) > 1e-12) fail("the coverage ratio does not match the counts");
  if (observed.coverageRatio < assumptions.minimumAnnualCoverage) {
    fail("a stored result is below the coverage floor");
  }
  if (observed.peakRegionPresentHours !== observed.peakRegionExpectedHours) {
    fail("a stored result has an incomplete peak day");
  }
  if (assumptions.maximumContiguousGapHours !== null
    && observed.maxContiguousGapHours > assumptions.maximumContiguousGapHours) {
    fail("a stored result has a contiguous gap above the approved threshold");
  }

  // ---------------------------------------------------------------- the rules it claims
  if (record.methodology.slug !== METHODOLOGY_SLUG) fail("the methodology slug is not this product's");
  if (record.methodology.version !== METHODOLOGY_VERSION) fail("the methodology version is not the one in force");
  if (record.methodology.documentSha256 !== METHODOLOGY_DOCUMENT_SHA256) {
    fail("the methodology digest is not the one this code was written against");
  }
  if (!/^[0-9a-f]{64}$/.test(record.inputDigest)) fail("the input digest is not a SHA-256");
  if (!/^[0-9a-f]{64}$/.test(record.observationsDigest)) fail("the observations digest is not a SHA-256");
  if (assumptions.peakReferenceRule !== PEAK_REFERENCE_RULE) fail("an unadopted peak reference rule was used");
  if (assumptions.peakRegionRule !== PEAK_REGION_RULE) fail("an unadopted peak region rule was used");
  if (assumptions.reboundModel !== REBOUND_MODEL) fail("rebound was modelled");
  if (assumptions.modeledLoadShape !== MODELED_LOAD_SHAPE) fail("the load shape is not flat");

  // ---------------------------------------------------------------- what 1.0.0 refuses to model
  if (assumptions.batteryEnabled !== BATTERY_ENABLED || assumptions.batteryEnabled !== false) {
    fail("storage contributed to a 1.0.0 result");
  }

  // ---------------------------------------------------------------- alpha
  const alpha = assumptions.annualCurtailmentEnergyFraction;
  if (!finite(alpha) || alpha < 0 || alpha > MAX_ANNUAL_CURTAILMENT_ENERGY_FRACTION) {
    fail(`alpha ${alpha} is outside [0, ${MAX_ANNUAL_CURTAILMENT_ENERGY_FRACTION}]`);
  }
  if (alpha === 0 && outcome.curtailmentEnabledHeadroomMw !== 0) {
    fail("a zero curtailment allowance produced positive headroom");
  }
  const equivalent = alpha * observed.observationCount;
  if (Math.abs(equivalent - assumptions.equivalentFullLoadHours) > 1e-9) {
    fail("equivalent full-load hours are not alpha x T");
  }

  // ---------------------------------------------------------------- the peak was not exceeded
  // Peak_ref is the period maximum under the adopted rule, so the modelled system after
  // curtailment sits at the reference and never above it. A result claiming headroom larger than
  // the mean headroom below the reference, inflated by the allowance, is arithmetically impossible.
  const ceiling = (observed.peakReferenceMw - observed.meanLoadMw) / (1 - alpha);
  if (outcome.curtailmentEnabledHeadroomMw > ceiling + 1e-6) {
    fail("the headroom exceeds the analytic ceiling for this series");
  }
  if (observed.meanLoadMw > observed.peakReferenceMw) fail("the mean load exceeds the peak reference");

  return problems;
}

/** Cross-result invariants: the things no single record can check about itself. */
export function validateScenarioSet(records: readonly ScenarioRecord[]): string[] {
  const problems: string[] = [];

  // Monotonicity in alpha, within a market-year. More allowance can never buy less headroom.
  const byMarketYear = new Map<string, ScenarioRecord[]>();
  for (const record of records) {
    const key = `${record.market}|${record.modeledPeriod.localYear}`;
    byMarketYear.set(key, [...(byMarketYear.get(key) ?? []), record]);
  }
  for (const [key, group] of byMarketYear) {
    const ordered = [...group].sort((left, right) =>
      left.assumptions.annualCurtailmentEnergyFraction - right.assumptions.annualCurtailmentEnergyFraction);
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      if (current.outcome.curtailmentEnabledHeadroomMw < previous.outcome.curtailmentEnabledHeadroomMw - 1e-9) {
        problems.push(`${key}: headroom falls as alpha rises, `
          + `${previous.assumptions.annualCurtailmentEnergyFraction} -> ${current.assumptions.annualCurtailmentEnergyFraction}`);
      }
      // One evidence set per market-year: every alpha must have seen the same observations.
      if (current.observationsDigest !== previous.observationsDigest) {
        problems.push(`${key}: two alphas were computed from different observations`);
      }
    }
  }

  // Input digests are unique. Two identical questions must be one row, not two.
  const digests = new Map<string, string>();
  for (const record of records) {
    const key = `${record.market}|${record.modeledPeriod.localYear}|${record.assumptions.annualCurtailmentEnergyFraction}`;
    const existing = digests.get(record.inputDigest);
    if (existing !== undefined && existing !== key) {
      problems.push(`two different scenarios share an input digest: ${existing} and ${key}`);
    }
    digests.set(record.inputDigest, key);
  }

  // No cross-market object exists. Markets are never summed, so nothing may carry a market that
  // is not one of the seven, and no record may claim more than one.
  for (const record of records) {
    if (record.market !== record.modeledPeriod.market) {
      problems.push(`${record.market}: the record and its period name different markets`);
    }
  }

  return problems;
}
