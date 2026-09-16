/**
 * Splitting a historical range into requests the source will actually serve.
 *
 * Three measured limits shape this, none of them documented by the source:
 *
 *   the dataset begins 2025-01-01, and an `end_date` before it is rejected outright while a
 *   `start_date` before it is silently clamped forward;
 *
 *   a request may not span more than 366 days, which is why a backfill from the floor to
 *   today is two requests rather than one;
 *
 *   the current UTC day cannot be served at all, and asking for it produces an error about
 *   date ordering because `end_date` is clamped first and then compared with `start_date`.
 *
 * Splitting locally rather than discovering these at runtime means a backfill fails on a
 * date arithmetic bug in a test rather than on the twelfth request of a live run.
 */

import { datesInWindow } from "@/lib/utvi/normalize";
import { lastCompletedUtcDate } from "@/lib/utvi/settlement";
import { SOURCE_HISTORY_FLOOR, SOURCE_MAX_WINDOW_DAYS, UtviContractError } from "@/lib/utvi/types";

export type SourceWindow = { startDate: string; endDate: string; dayCount: number };

function utcMidnight(date: string): number {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) throw new UtviContractError(`'${date}' is not a parseable date`);
  return parsed;
}

const toDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * Clamp a requested range to what the source can serve at `now`.
 *
 * Returns null when nothing is left to ask for, which is the honest answer on the day a
 * backfill has already reached the newest completed date.
 */
export function clampToServableRange(
  requestedStart: string,
  requestedEnd: string,
  now: Date,
): { startDate: string; endDate: string } | null {
  const floor = utcMidnight(SOURCE_HISTORY_FLOOR);
  const ceiling = utcMidnight(lastCompletedUtcDate(now));
  const start = Math.max(utcMidnight(requestedStart), floor);
  const end = Math.min(utcMidnight(requestedEnd), ceiling);
  if (end < start) return null;
  if (end < floor) return null;
  return { startDate: toDate(start), endDate: toDate(end) };
}

/**
 * Split a servable range into windows of at most `SOURCE_MAX_WINDOW_DAYS` days.
 *
 * Windows are contiguous and non-overlapping by construction: each begins the day after the
 * previous one ended. The backfill verifies that property against the dates actually
 * returned rather than trusting it, but building it in means the verification is checking
 * the source rather than this arithmetic.
 */
export function splitIntoWindows(startDate: string, endDate: string): SourceWindow[] {
  const first = utcMidnight(startDate);
  const last = utcMidnight(endDate);
  if (last < first) throw new UtviContractError(`window ${startDate}..${endDate} ends before it starts`);

  const windows: SourceWindow[] = [];
  let cursor = first;
  while (cursor <= last) {
    const windowEnd = Math.min(cursor + (SOURCE_MAX_WINDOW_DAYS - 1) * 86_400_000, last);
    windows.push({
      startDate: toDate(cursor),
      endDate: toDate(windowEnd),
      dayCount: Math.round((windowEnd - cursor) / 86_400_000) + 1,
    });
    cursor = windowEnd + 86_400_000;
  }
  return windows;
}

/**
 * Plan a backfill: clamp, then split.
 *
 * `null` means the request asks for nothing the source will serve — before the floor, or
 * entirely in the future — and that is reported rather than turned into an empty run that
 * looks like a success.
 */
export function planBackfill(
  requestedStart: string,
  requestedEnd: string,
  now: Date,
): { windows: SourceWindow[]; startDate: string; endDate: string; expectedDates: string[] } | null {
  const clamped = clampToServableRange(requestedStart, requestedEnd, now);
  if (clamped === null) return null;
  return {
    ...clamped,
    windows: splitIntoWindows(clamped.startDate, clamped.endDate),
    expectedDates: datesInWindow(clamped.startDate, clamped.endDate),
  };
}

export type CoverageVerification = {
  /** True when every expected date is either observed or a known source gap, with no duplicates. */
  complete: boolean;
  /** Expected, not observed, and not explained. A retrieval failure or a bug. */
  missing: string[];
  /**
   * Expected, and the source served the date while returning no rows for it.
   *
   * Not a gap in Urdais's coverage and not a failure: the source's own dataset has holes.
   * Measured on 2025-06-15 and 2025-07-15, both of which return zero rows while their
   * neighbours return the usual fifty-one. These dates have no UTVI point, which is the only
   * honest outcome — a zero would claim the platform processed nothing that day.
   */
  sourceReturnedNoRows: string[];
  /** Two live snapshots for one date. The database's unique index should make this impossible. */
  duplicated: string[];
  /** A date outside the plan. A contract surprise. */
  unexpected: string[];
};

/**
 * Check a set of covered dates against a plan.
 *
 * Four categories rather than two, because "we have no value for this date" has more than one
 * cause and only some of them are problems. A date the source served empty is accounted for;
 * a date nothing is known about is missing and wants a retry.
 */
export function verifyCoverage(
  expectedDates: readonly string[],
  coveredDates: readonly string[],
  sourceEmptyDates: readonly string[] = [],
): CoverageVerification {
  const expected = new Set(expectedDates);
  const empty = new Set(sourceEmptyDates);
  const counts = new Map<string, number>();
  for (const date of coveredDates) counts.set(date, (counts.get(date) ?? 0) + 1);

  const missing = expectedDates.filter((date) => !counts.has(date) && !empty.has(date));
  const sourceReturnedNoRows = expectedDates.filter((date) => !counts.has(date) && empty.has(date));
  const duplicated = [...counts.entries()].filter(([, n]) => n > 1).map(([date]) => date).sort();
  const unexpected = [...counts.keys()].filter((date) => !expected.has(date)).sort();
  return {
    complete: missing.length === 0 && duplicated.length === 0 && unexpected.length === 0,
    missing,
    sourceReturnedNoRows,
    duplicated,
    unexpected,
  };
}
