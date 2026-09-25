/**
 * Whether a calculated day may be released, and if not, exactly which condition refused it.
 *
 * Two intents, because they are two different questions and collapsing them would lose the one
 * that matters. `internal_release` asks whether the data is sound enough to become a stored,
 * auditable observation; `public_release` asks that *and* whether Urdais may show it. PJM, MISO
 * and SPP answer yes to the first and no to the second, permanently until a permission exists, and
 * a validator that returned a single boolean could not express that.
 *
 * Every refusal is a named reason code rather than `false`. A day held back for a missing hour and
 * a day held back because a source's terms forbid publication are not the same operational event,
 * and the run ledger has to be able to tell an operator which happened.
 *
 * Completeness is exact. There is no threshold below 100%, and no partial-day path: a 23-hour
 * spring day is complete at 23 hours and a 23-hour day in June is a hole. That single rule is what
 * keeps a UEPI level from quietly meaning "most of a day" (§G.2).
 */

import { calculateDailyValue, orderHours, type DailyCalculation } from "@/lib/uepi/calculate";
import { decimalToNumber } from "@/lib/uepi/decimal";
import { PLAUSIBILITY_GUARD_USD_PER_MWH } from "@/lib/uepi/methodology";
import {
  dstEvidenceSufficient, expectedIntervalStarts, type OperatingDayWindow,
} from "@/lib/uepi/operating-day";
import { mayPublishUepiValue, type UepiPublicationDecision, type UepiPublicationSubject } from "@/lib/uepi/rights";
import type { NormalizedHourlyPrice, QualityCheckResult, UepiBenchmark } from "@/lib/uepi/types";

export const RELEASE_BLOCK_REASONS = [
  /** Fewer -- or more -- hours than the market's own operating day contains. */
  "incomplete_intervals",
  /** Two accepted hours claim the same UTC instant. A DST pair is two instants, not this. */
  "duplicate_interval",
  /** An hour is misaligned, outside the day, or not an hour long. */
  "invalid_interval",
  /** An hour does not carry the construct, derivation or series the benchmark defines. */
  "missing_provenance",
  /** An hour is marked suspect, including by the plausibility guard. */
  "suspect_observation",
  /** A cross-check the specification requires disagreed beyond its tolerance. */
  "quality_check_failed",
  /** A 23- or 25-hour day for a market whose transition behaviour has never been observed. */
  "unverified_dst_transition",
  /** The operating day has not begun in the market's own timezone: UEPI never forward-dates. */
  "operating_day_not_started",
  /** The registry does not hold this specification version as approved. */
  "specification_not_approved",
  /** No adapter may emit for this series yet. */
  "series_not_built",
  /** Sound internally, and the terms do not permit display. */
  "rights_blocked",
  /** The mean itself could not be computed. */
  "calculation_failed",
] as const;

export type ReleaseBlockReason = (typeof RELEASE_BLOCK_REASONS)[number];

export type ReleaseIntent = "internal_release" | "public_release";

export type ReleaseDecision =
  | {
      readonly released: true;
      readonly intent: ReleaseIntent;
      readonly calculation: DailyCalculation;
      readonly checks: readonly QualityCheckResult[];
      readonly publication: UepiPublicationDecision | null;
    }
  | {
      readonly released: false;
      readonly intent: ReleaseIntent;
      readonly reason: ReleaseBlockReason;
      readonly detail: string;
      readonly checks: readonly QualityCheckResult[];
      readonly publication: UepiPublicationDecision | null;
    };

/** A cross-check the specification requires for a market, measured by the adapter layer. */
export type CrossCheck = {
  readonly check: string;
  /** The largest absolute disagreement observed across the day, in $/MWh. */
  readonly maxAbsoluteSpread: number;
  /** The tolerance the specification sets for this market's check. */
  readonly tolerance: number;
  readonly detail: string;
};

export type ReleaseInput = {
  readonly benchmark: UepiBenchmark;
  readonly window: OperatingDayWindow;
  readonly hours: readonly NormalizedHourlyPrice[];
  /** Uniformity and component-identity checks the adapter measured. Empty is not an assertion. */
  readonly crossChecks?: readonly CrossCheck[];
  /** Whether the registry said this specification version is approved. Read by the caller. */
  readonly specificationApproved: boolean;
  /** Now, as an instant. The operating day must have begun in the market's own zone. */
  readonly now: Date;
  readonly intent: ReleaseIntent;
  /** Required for `public_release`; the rights determination in force for the display purpose. */
  readonly publicationSubject?: Omit<UepiPublicationSubject, "benchmark">;
};

function check(name: string, passed: boolean, measured: number | null, detail: string): QualityCheckResult {
  return { check: name, passed, measured, detail };
}

/**
 * Evaluate one operating day.
 *
 * Order matters: conditions that make the other checks meaningless come first, so a day with no
 * hours reports that rather than a cascade of downstream complaints.
 */
export function evaluateRelease(input: ReleaseInput): ReleaseDecision {
  const { benchmark, window, intent } = input;
  const checks: QualityCheckResult[] = [];
  const publication = intent === "public_release" && input.publicationSubject !== undefined
    ? mayPublishUepiValue({ benchmark, ...input.publicationSubject })
    : null;

  const refuse = (reason: ReleaseBlockReason, detail: string): ReleaseDecision =>
    ({ released: false, intent, reason, detail, checks, publication });

  if (benchmark.publicationPosture === "not_built") {
    return refuse("series_not_built",
      `${benchmark.seriesId} has no verified source payload; no adapter may emit for it yet`);
  }

  if (!input.specificationApproved) {
    return refuse("specification_not_approved",
      "the registry does not hold this specification version as approved");
  }

  const dayStarted = input.now.getTime() >= Date.parse(window.startUtc);
  checks.push(check("operating_day_started", dayStarted, null,
    `operating day begins ${window.startUtc}`));
  if (!dayStarted) {
    return refuse("operating_day_not_started",
      `${window.operatingDate} has not begun in ${window.timezone}; UEPI never publishes a forward-dated value`);
  }

  const dstOk = dstEvidenceSufficient(benchmark, window);
  checks.push(check("dst_evidence", dstOk, window.expectedIntervalCount,
    `${window.dstTransition} day, evidence ${benchmark.dstEvidence}`));
  if (!dstOk) {
    return refuse("unverified_dst_transition",
      `${window.operatingDate} is a ${window.dstTransition} day and ${benchmark.seriesId}'s transition `
      + "behaviour has never been observed; an operator must confirm the hour set");
  }

  const ordered = orderHours(input.hours);

  for (const hour of ordered) {
    if (hour.seriesId !== benchmark.seriesId
      || hour.construct !== benchmark.construct
      || hour.derivation !== benchmark.derivation
      || hour.derivationExpression !== benchmark.derivationExpression) {
      checks.push(check("provenance_matches_benchmark", false, null,
        `${hour.intervalStartUtc} does not carry ${benchmark.seriesId}'s construct and derivation`));
      return refuse("missing_provenance",
        `an hour at ${hour.intervalStartUtc} does not carry the benchmark's own construct and derivation`);
    }
  }
  checks.push(check("provenance_matches_benchmark", true, ordered.length, "every hour carries the benchmark's construct and derivation"));

  const expected = expectedIntervalStarts(window);
  const seen = new Set<string>();
  for (const hour of ordered) {
    const startMs = Date.parse(hour.intervalStartUtc);
    const endMs = Date.parse(hour.intervalEndUtc);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      checks.push(check("interval_alignment", false, null, `${hour.intervalStartUtc} is not an instant`));
      return refuse("invalid_interval", `'${hour.intervalStartUtc}' is not an instant`);
    }
    if (endMs - startMs !== 3_600_000) {
      checks.push(check("interval_alignment", false, null, `${hour.intervalStartUtc} is not one hour long`));
      return refuse("invalid_interval", `the interval at ${hour.intervalStartUtc} is not one hour long`);
    }
    if (!expected.includes(hour.intervalStartUtc)) {
      checks.push(check("interval_alignment", false, null,
        `${hour.intervalStartUtc} is not an hour of ${window.operatingDate}`));
      return refuse("invalid_interval",
        `${hour.intervalStartUtc} is not an hour of operating day ${window.operatingDate}`);
    }
    if (seen.has(hour.intervalStartUtc)) {
      checks.push(check("no_duplicate_interval", false, null, `${hour.intervalStartUtc} appears twice`));
      return refuse("duplicate_interval",
        `${hour.intervalStartUtc} appears twice; a repeated local hour is two instants, not one`);
    }
    seen.add(hour.intervalStartUtc);
  }
  checks.push(check("interval_alignment", true, ordered.length, "every hour is an exact hour of the operating day"));
  checks.push(check("no_duplicate_interval", true, seen.size, "no two hours share a UTC instant"));

  const complete = seen.size === window.expectedIntervalCount;
  checks.push(check("hour_completeness", complete, seen.size,
    `${seen.size} of ${window.expectedIntervalCount} hours`));
  if (!complete) {
    return refuse("incomplete_intervals",
      `${seen.size} of ${window.expectedIntervalCount} hours are present; UEPI does not publish a partial day `
      + "and does not interpolate a wholesale price");
  }

  const suspect = ordered.find((hour) => hour.qualityStatus !== "accepted");
  checks.push(check("all_hours_accepted", suspect === undefined, ordered.length,
    suspect === undefined ? "no hour is suspect" : `${suspect.intervalStartUtc} is suspect`));
  if (suspect !== undefined) {
    return refuse("suspect_observation",
      `the hour at ${suspect.intervalStartUtc} is suspect: ${suspect.qualityNotes.join("; ") || "no note recorded"}`);
  }

  const implausible = ordered.find(
    (hour) => Math.abs(decimalToNumber(hour.priceUsdPerMwh)) > PLAUSIBILITY_GUARD_USD_PER_MWH);
  checks.push(check("plausibility_guard", implausible === undefined, PLAUSIBILITY_GUARD_USD_PER_MWH,
    "an operational guard against a parse error, not a claim about offer caps"));
  if (implausible !== undefined) {
    return refuse("suspect_observation",
      `${implausible.intervalStartUtc} reads ${implausible.priceUsdPerMwh} $/MWh, beyond the plausibility guard`);
  }

  for (const crossCheck of input.crossChecks ?? []) {
    const passed = crossCheck.maxAbsoluteSpread <= crossCheck.tolerance;
    checks.push(check(crossCheck.check, passed, crossCheck.maxAbsoluteSpread, crossCheck.detail));
    if (!passed) {
      return refuse("quality_check_failed",
        `${crossCheck.check} measured ${crossCheck.maxAbsoluteSpread} against a tolerance of ${crossCheck.tolerance}`);
    }
  }

  let calculation: DailyCalculation;
  try {
    calculation = calculateDailyValue(benchmark, window, ordered);
  } catch (error) {
    return refuse("calculation_failed", error instanceof Error ? error.message : String(error));
  }

  if (intent === "public_release") {
    if (publication === null) {
      return refuse("rights_blocked",
        "a public release needs a rights determination and none was supplied");
    }
    if (!publication.allowed) {
      return refuse("rights_blocked",
        `${benchmark.seriesId} may not be displayed: ${publication.reasonCode}`);
    }
  }

  return { released: true, intent, calculation, checks, publication };
}
