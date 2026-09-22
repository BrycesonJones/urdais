/**
 * Reference-month arithmetic.
 *
 * A UMPI observation is identified by the month it describes, never by the date it was
 * retrieved. Months are `YYYY-MM` strings so that a value's identity survives a timezone and
 * cannot be shifted by one by a `Date` constructor.
 */

import type { ReferenceMonth } from "./types";

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isReferenceMonth(value: string): value is ReferenceMonth {
  return MONTH_PATTERN.test(value);
}

/** Throws rather than coercing: a malformed month is a rejected row, not a guess. */
export function parseReferenceMonth(value: string): { year: number; month: number } {
  const match = MONTH_PATTERN.exec(value);
  if (!match) throw new Error(`not a reference month: ${JSON.stringify(value)}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

/** The month before `value`. Pure string arithmetic; no Date, no timezone. */
export function previousMonth(value: ReferenceMonth): ReferenceMonth {
  const { year, month } = parseReferenceMonth(value);
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, "0")}`;
}

/** Whether `later` is exactly one month after `earlier`. Used to refuse a change across a gap. */
export function isConsecutive(earlier: ReferenceMonth, later: ReferenceMonth): boolean {
  return previousMonth(later) === earlier;
}

/** The twelve months of a calendar year, in order. The Series B base window. */
export function calendarYearMonths(year: number): ReferenceMonth[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

/** Sort key for months. Lexicographic order on `YYYY-MM` is chronological, which is the point. */
export function compareMonths(a: ReferenceMonth, b: ReferenceMonth): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
