/**
 * How a change between two observations is expressed, for series whose values may be zero or
 * negative.
 *
 * Every Urdais series until now has been strictly positive -- a price per GPU-hour, a token count,
 * a share of global wealth -- and for those, a percentage is the whole story. Wholesale power is
 * not like that. On 12 April 2026 the SPP North Hub day-ahead daily mean was -$0.11/MWh and the
 * South Hub's was -$8.63/MWh. Once a value can sit at or below zero, ordinary percentage return
 * breaks in four distinct ways, and three of them are worse than an error because they still print
 * a plausible number:
 *
 *   a zero denominator is undefined;
 *   a negative denominator inverts the sign, so -$10 -> -$5 reports "-50%" while the price rose;
 *   a zero crossing produces a figure describing no rate of return anyone can act on;
 *   and all three render in the same red-or-green chip as a real move.
 *
 * So the rule, from UEPI specification 1.0.0 §D, which is a product rule and not a UI convention:
 *
 *   the absolute change is always computed and always shown;
 *   a percentage is computed only when BOTH endpoints are strictly positive;
 *   direction always comes from the sign of the absolute change, never from the percentage;
 *   and a suppressed percentage carries the reason it was suppressed, so a surface can explain
 *   itself rather than merely omitting a number.
 *
 * This module is deliberately product-agnostic: it is the shared defect fix, not a UEPI annexe.
 * `market-ranges.ts` is its caller for period returns.
 */

export type ChangeDirection = "up" | "down" | "flat";

/** Why a percentage was not computed although both observations exist (§D.4). */
export type PercentageSuppressionReason =
  /** The base is exactly zero: the denominator is undefined. */
  | "base_zero"
  /** The base is negative: an ordinary percentage would invert direction. */
  | "base_negative"
  /** The base is positive and the newer value is zero or negative: the move crosses into or sits at non-positive territory. */
  | "new_not_positive";

/** Why no change could be expressed at all. Distinct from a suppressed percentage. */
export type ChangeUnavailableReason =
  /** No observation sits at or before the window's start, within reach of it. */
  | "no_base_observation"
  /** The series does not hold two comparable observations for this horizon. */
  | "insufficient_history"
  /** A methodology or specification break falls between the endpoints. */
  | "methodology_version_break"
  /** An endpoint is absent or not a finite number. */
  | "missing_value";

type ChangeEndpoints = {
  readonly baseValue: number;
  readonly latestValue: number;
  /** Unix seconds of the endpoints, where the caller knows them. Surfaces show the base date. */
  readonly baseTime: number | null;
  readonly latestTime: number | null;
};

export type MarketChange =
  | ({
      readonly kind: "percentage";
      readonly percentage: number;
      readonly absoluteChange: number;
      readonly direction: ChangeDirection;
    } & ChangeEndpoints)
  | ({
      readonly kind: "absolute";
      readonly absoluteChange: number;
      readonly direction: ChangeDirection;
      readonly reason: PercentageSuppressionReason;
    } & ChangeEndpoints)
  | {
      readonly kind: "unavailable";
      readonly reason: ChangeUnavailableReason;
    };

export function directionOf(absoluteChange: number): ChangeDirection {
  if (absoluteChange > 0) return "up";
  if (absoluteChange < 0) return "down";
  return "flat";
}

/**
 * Whether an ordinary percentage change is economically meaningful between these two values.
 *
 * Strictly positive on both sides, and nothing else. The looser rule -- "defined whenever the base
 * is non-zero" -- is exactly the one that produces mathematically valid, economically deceptive
 * percentages, which is the failure this exists to prevent.
 */
export function isPercentagePublishable(baseValue: number, latestValue: number): boolean {
  return Number.isFinite(baseValue) && Number.isFinite(latestValue) && baseValue > 0 && latestValue > 0;
}

/** Which endpoint disqualified the percentage. The base is examined first: a bad base makes the
 * newer value's sign irrelevant, and it is the case that would otherwise invert direction. */
function suppressionReason(baseValue: number): PercentageSuppressionReason {
  if (baseValue === 0) return "base_zero";
  if (baseValue < 0) return "base_negative";
  return "new_not_positive";
}

export function changeUnavailable(reason: ChangeUnavailableReason): MarketChange {
  return { kind: "unavailable", reason };
}

/**
 * The change between two observations, under the §D rule.
 *
 * Endpoint times are optional because the rule itself does not need them; surfaces do, so that a
 * range label like "1 month" can be accompanied by the date the comparison actually measured from
 * (§E.3).
 */
export function changeBetween(
  baseValue: number,
  latestValue: number,
  times: { baseTime?: number | null; latestTime?: number | null } = {},
): MarketChange {
  if (!Number.isFinite(baseValue) || !Number.isFinite(latestValue)) {
    return changeUnavailable("missing_value");
  }
  const endpoints: ChangeEndpoints = {
    baseValue,
    latestValue,
    baseTime: times.baseTime ?? null,
    latestTime: times.latestTime ?? null,
  };
  const absoluteChange = latestValue - baseValue;
  const direction = directionOf(absoluteChange);

  if (isPercentagePublishable(baseValue, latestValue)) {
    return {
      kind: "percentage",
      percentage: (absoluteChange / baseValue) * 100,
      absoluteChange,
      direction,
      ...endpoints,
    };
  }
  return {
    kind: "absolute",
    absoluteChange,
    direction,
    reason: suppressionReason(baseValue),
    ...endpoints,
  };
}

/** The percentage where one is publishable, and null otherwise. For callers that only take a number. */
export function percentageOf(change: MarketChange): number | null {
  return change.kind === "percentage" ? change.percentage : null;
}

/** The absolute change where the endpoints exist, and null where no change could be expressed. */
export function absoluteChangeOf(change: MarketChange): number | null {
  return change.kind === "unavailable" ? null : change.absoluteChange;
}
