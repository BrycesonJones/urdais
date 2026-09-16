/**
 * When a date has stopped moving, and why that is a measurement rather than a convention.
 *
 * Phase 1A read one completed day three times and watched it accrue: +5 then +53 parts per
 * billion, monotone, rank order unchanged. It then read a five-day window twice, 6.2 minutes
 * apart, and found the day that had just closed still accruing while the two days before it
 * moved by exactly zero.
 *
 * So settlement is a function of a date's age, and the lag this module encodes is one
 * calculation day: the just-closed day is provisional, and a day closed longer than that is
 * final. That is a parameter of methodology version 0.1.1-draft and is stated there.
 *
 * What this module deliberately does not do is treat `final` as permanent. The evidence for
 * older days being frozen spans six minutes, which shows they are not *actively* accruing
 * and says nothing about a batch correction a week later. So a final snapshot remains
 * supersedable, and the database enforces that rather than trusting this code.
 */

import { UtviContractError } from "@/lib/utvi/types";

/**
 * Days after a date closes before its value is treated as final.
 *
 * A date `D` closes at `D+1 00:00Z`. With a lag of 1, `D` is provisional while it is the
 * most recently closed date and final once another date has closed after it.
 */
export const SETTLEMENT_LAG_DAYS = 1 as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function utcMidnight(date: string): number {
  if (!ISO_DATE.test(date)) throw new UtviContractError(`'${date}' is not a YYYY-MM-DD date`);
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) throw new UtviContractError(`'${date}' is not a parseable date`);
  return parsed;
}

/** The UTC calendar date of an instant. */
export function utcDateOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The most recent completed UTC day at `now`.
 *
 * This is also the newest date the source will serve: it clamps `end_date` down to exactly
 * this day, and rejects a request for the current day outright.
 */
export function lastCompletedUtcDate(now: Date): string {
  return new Date(utcMidnight(utcDateOf(now)) - 86_400_000).toISOString().slice(0, 10);
}

/** Whole UTC days between two dates. Negative when `later` precedes `earlier`. */
export function daysBetween(earlier: string, later: string): number {
  return Math.round((utcMidnight(later) - utcMidnight(earlier)) / 86_400_000);
}

/**
 * Whether a date is settled at `now`.
 *
 * True once at least `SETTLEMENT_LAG_DAYS` further days have closed after it.
 */
export function isSettled(observationDate: string, now: Date): boolean {
  const newestClosed = lastCompletedUtcDate(now);
  return daysBetween(observationDate, newestClosed) >= SETTLEMENT_LAG_DAYS;
}

/** The settlement state a date should carry at `now`. */
export function settlementStateFor(observationDate: string, now: Date): "provisional" | "final" {
  return isSettled(observationDate, now) ? "final" : "provisional";
}

/**
 * The date a daily run should re-read to settle.
 *
 * The run reads `D−1` for its new value and re-reads this date to confirm it has stopped
 * moving before calling it final. Re-reading rather than assuming is the point: the cost is
 * one request and it is the only thing that would catch a late revision.
 */
export function settlementTargetDate(now: Date): string {
  const newestClosed = lastCompletedUtcDate(now);
  return new Date(utcMidnight(newestClosed) - SETTLEMENT_LAG_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
