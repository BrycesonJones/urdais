/**
 * Whether each UEPI series is still advancing.
 *
 * The question is deliberately narrow and deliberately hard to fake: **is the operating day a
 * reader sees the one the market should have released by now?** Not "did the cron run", not "did
 * the source answer 200", not "was a row touched recently". Those are all compatible with a
 * series that has been frozen for a week:
 *
 *     cron executes -> ERCOT has published nothing new -> no write -> run succeeds
 *
 * That is a healthy scheduler and an ageing product, and a monitor that reports the scheduler's
 * verdict would call it green every morning while the front page went stale. So freshness is
 * computed from the **released operating date** and nothing else. It never reads `updated_at`,
 * `created_at`, or any run record: a job touching a row must not be able to make a stale market
 * look fresh.
 *
 * It is evaluated per market, because the markets are independent. NYISO posting late says
 * nothing about CAISO, and one global UEPI timestamp would let a frozen series hide behind a
 * healthy one -- so the model can represent SPP as FAIL while the other five are CURRENT.
 *
 * The clock is always injected. Nothing here calls `Date.now()`, because a state machine whose
 * transitions depend on an ambient clock can only be tested by waiting for real days to pass.
 */

import { UEPI_BENCHMARKS } from "@/lib/uepi/benchmarks";
import { localDateOf } from "@/lib/uepi/operating-day";
import { IMPLEMENTED_SERIES_IDS } from "@/lib/uepi/source/registry";
import { UEPI_SERIES_IDS, type UepiSeriesId } from "@/lib/uepi/types";

/**
 * `current`       the head is within the tolerated lag; the series is advancing.
 * `warn`          one scheduled run's worth of advance is missing. Often a late source.
 * `fail`          the head has not moved for longer than any known source behaviour explains.
 * `never_released` the series is ingestible and has released nothing at all.
 * `not_ingested`  Urdais does not ingest this market, so it cannot go stale. PJM.
 */
export type UepiFreshnessStatus = "current" | "warn" | "fail" | "never_released" | "not_ingested";

/** A market is operationally healthy while its head is advancing, or not ingested at all. */
export const HEALTHY_UEPI_FRESHNESS: readonly UepiFreshnessStatus[] = ["current", "not_ingested"];

export function isHealthyUepiFreshness(status: UepiFreshnessStatus): boolean {
  return HEALTHY_UEPI_FRESHNESS.includes(status);
}

/**
 * How far behind its expected operating day a market may fall before this is a fault.
 *
 * **These are conservative defaults, not measurements, and the reason is recorded rather than
 * hidden.** Specification 1.0.0 §B.2 lists the publication lag for five of the six ingestible
 * markets as UNRESOLVED; only NYISO is verified, and what was verified there is that the next
 * operating day's file was already on the index the prior day. Copying another product's
 * thresholds would dress that gap up as precision it does not have.
 *
 * So the thresholds are derived from the *cadence* instead, which is known exactly because Urdais
 * chose it. With one scheduled run per day:
 *
 *   0-1 days behind   normal. The run for today may not have happened yet, and a market may
 *                     publish its day a few hours after the run.
 *   2 days behind     one scheduled run produced no advance. Worth a look, not yet a fault:
 *                     a single late publication or one failed run looks exactly like this.
 *   3+ days behind    two consecutive runs produced no advance. No documented behaviour of any
 *                     of these six markets explains that, so it is treated as a fault.
 *
 * When a market's real publication behaviour is measured, these should be replaced per market
 * with that evidence -- that is a change to this constant, not to the methodology.
 */
export const UEPI_FRESHNESS_THRESHOLDS = {
  /** Lag at or below this is `current`. */
  currentWithinDays: 1,
  /** Lag at or below this, and above `currentWithinDays`, is `warn`. Above it is `fail`. */
  warnWithinDays: 2,
} as const;

export type UepiSeriesFreshness = {
  seriesId: UepiSeriesId;
  market: string;
  status: UepiFreshnessStatus;
  /** The newest operating day this series has released, or null where it has released none. */
  latestOperatingDate: string | null;
  /**
   * The operating day this market should have released by now: its own current local calendar
   * date. A day-ahead auction for day `d` clears during day `d-1`, so the file for `d` exists
   * before `d` begins locally.
   */
  expectedOperatingDate: string;
  /** Whole days between the expected head and the actual one. Null when nothing is released. */
  lagDays: number | null;
  /** Whether this market is publicly served. Freshness is tracked either way. */
  publiclyServed: boolean;
  /** One line a person can act on. */
  reason: string;
  evaluatedAt: string;
};

export type UepiFreshnessReport = {
  evaluatedAt: string;
  thresholds: typeof UEPI_FRESHNESS_THRESHOLDS;
  series: readonly UepiSeriesFreshness[];
  /**
   * The worst status across the ingestible markets.
   *
   * An aggregate is offered because an operator wants one line, and it is deliberately the worst
   * rather than an average: a summary that reported five healthy markets and hid the sixth would
   * be the thing this module exists to prevent. It never replaces the per-market list.
   */
  worstStatus: UepiFreshnessStatus;
};

const DAY_MS = 86_400_000;

function wholeDaysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Worst-first, so `worstStatus` is a max over this order. */
const SEVERITY: Record<UepiFreshnessStatus, number> = {
  not_ingested: 0,
  current: 1,
  warn: 2,
  never_released: 3,
  fail: 4,
};

export type UepiFreshnessInput = {
  /** Injected, never ambient. */
  asOf: Date;
  /**
   * Newest released operating date per series, as `YYYY-MM-DD`. A series absent from the map, or
   * mapped to null, has released nothing.
   *
   * This must come from the released daily values themselves -- the head of the series -- and
   * never from a run record or a row timestamp.
   */
  latestOperatingDate: Readonly<Partial<Record<UepiSeriesId, string | null>>>;
  thresholds?: typeof UEPI_FRESHNESS_THRESHOLDS;
};

/**
 * One market's freshness.
 *
 * Historical gaps cannot make a market stale. ERCOT has no 2026-03-07 and MISO no 2026-05-19,
 * and neither is a statement about whether the series is advancing today -- this looks only at
 * the head. A market that publishes tomorrow's day on time is current however many holes lie
 * behind it, which is correct: those holes are documented exceptions, not an outage.
 *
 * The value is never consulted, only the date. A wholesale price can be negative -- SPP's North
 * Hub daily mean was -$0.11/MWh on 12 April 2026 -- and a released negative day advances the
 * series exactly as a positive one does. Tying freshness to a value, a sign, or the availability
 * of a percentage change would make a legitimate market condition look like an outage.
 */
export function evaluateSeriesFreshness(
  seriesId: UepiSeriesId,
  input: UepiFreshnessInput,
): UepiSeriesFreshness {
  const benchmark = UEPI_BENCHMARKS[seriesId];
  const thresholds = input.thresholds ?? UEPI_FRESHNESS_THRESHOLDS;
  const evaluatedAt = input.asOf.toISOString();
  // Each market's own local calendar date. Comparing every market against one UTC date would
  // report CAISO stale for the seven hours after UTC midnight during which it is still yesterday
  // in California.
  const expectedOperatingDate = localDateOf(input.asOf.toISOString(), benchmark.operatingTimezone);
  const publiclyServed = benchmark.publicationPosture === "publishable";
  const base = { seriesId, market: benchmark.market, expectedOperatingDate, publiclyServed, evaluatedAt };

  if (!IMPLEMENTED_SERIES_IDS.includes(seriesId)) {
    return {
      ...base,
      status: "not_ingested",
      latestOperatingDate: null,
      lagDays: null,
      reason: "Urdais does not ingest this market, so it has no head to advance.",
    };
  }

  const latestOperatingDate = input.latestOperatingDate[seriesId] ?? null;
  if (latestOperatingDate === null) {
    return {
      ...base,
      status: "never_released",
      latestOperatingDate: null,
      lagDays: null,
      reason: "the series is ingested and has released no operating day at all.",
    };
  }

  const lagDays = wholeDaysBetween(latestOperatingDate, expectedOperatingDate);
  // A head at or ahead of the expected day is current; negative lag is not a fault.
  if (lagDays <= thresholds.currentWithinDays) {
    return {
      ...base,
      status: "current",
      latestOperatingDate,
      lagDays,
      reason: `released through ${latestOperatingDate}, ${lagDays} day(s) behind the expected ${expectedOperatingDate}.`,
    };
  }
  if (lagDays <= thresholds.warnWithinDays) {
    return {
      ...base,
      status: "warn",
      latestOperatingDate,
      lagDays,
      reason:
        `released through ${latestOperatingDate}, ${lagDays} days behind the expected ` +
        `${expectedOperatingDate}: one scheduled run produced no advance.`,
    };
  }
  return {
    ...base,
    status: "fail",
    latestOperatingDate,
    lagDays,
    reason:
      `released through ${latestOperatingDate}, ${lagDays} days behind the expected ` +
      `${expectedOperatingDate}: the head has not moved for longer than any documented ` +
      `publication behaviour of this market explains.`,
  };
}

/** Every UEPI series' freshness, including the ones Urdais does not publish or does not ingest. */
export function evaluateUepiFreshness(input: UepiFreshnessInput): UepiFreshnessReport {
  const series = UEPI_SERIES_IDS.map((seriesId) => evaluateSeriesFreshness(seriesId, input));
  const worstStatus = series.reduce<UepiFreshnessStatus>(
    (worst, candidate) => (SEVERITY[candidate.status] > SEVERITY[worst] ? candidate.status : worst),
    "not_ingested",
  );
  return {
    evaluatedAt: input.asOf.toISOString(),
    thresholds: input.thresholds ?? UEPI_FRESHNESS_THRESHOLDS,
    series,
    worstStatus,
  };
}
