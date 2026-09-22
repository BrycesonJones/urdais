/**
 * Spreadsheet date handling for Grid Buildout Velocity.
 *
 * The XLSX reader deliberately does not convert dates: a serial number that silently becomes a
 * date is how a 2026 value turns into 1970 without anyone noticing. So conversion happens here,
 * once, where the sentinel rule also lives.
 *
 * Every conversion returns a quality alongside the date, and the two are constrained against each
 * other: a date exists exactly when the quality is `reported`. That is what stops ERCOT's year
 * 9999 from ever being read as a date, and it is why a date defect can never reach the lifecycle.
 */

import type { DatePrecision, DateQuality } from "@/lib/grid-buildout/types";
import { SENTINEL_YEAR } from "@/lib/grid-buildout/types";

export type ParsedDate = {
  /** ISO `YYYY-MM-DD`, or null whenever the quality is anything but `reported`. */
  date: string | null;
  quality: DateQuality;
  precision: DatePrecision;
  /** Exactly what the cell held, retained so the publisher's own value survives. */
  native: string | null;
};

/**
 * Excel's day zero under the 1900 system, offset by the leap-year bug it preserves for
 * compatibility: serial 1 is 1900-01-01, and serial 60 is the day that never existed.
 */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

const NOT_REPORTED: ParsedDate = { date: null, quality: "not_reported", precision: "none", native: null };

function unparseable(native: string): ParsedDate {
  return { date: null, quality: "unparseable", precision: "none", native };
}

function sentinel(native: string): ParsedDate {
  return { date: null, quality: "sentinel_unknown", precision: "none", native };
}

/** Serial to UTC calendar parts. Fractional serials are truncated; no source here carries a time. */
export function serialToUtc(serial: number): { year: number; month: number; day: number } {
  const ms = EXCEL_EPOCH_UTC + Math.trunc(serial) * MS_PER_DAY;
  const at = new Date(ms);
  return { year: at.getUTCFullYear(), month: at.getUTCMonth() + 1, day: at.getUTCDate() };
}

function iso(year: number, month: number, day: number): string {
  const pad = (value: number, width: number) => String(value).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/**
 * Read a spreadsheet cell as a date.
 *
 * `precision` records what the publisher actually asserts rather than what the cell type implies.
 * ERCOT's field dictionary asks TSPs for Month/Yr even though the cells are typed as dates, so its
 * columns are read at month precision and the day component is not treated as meaningful.
 */
export function parseSpreadsheetDate(
  raw: string | null | undefined,
  options: { precision: Exclude<DatePrecision, "none">; sentinelYear?: number },
): ParsedDate {
  if (raw === null || raw === undefined || raw.trim() === "") return NOT_REPORTED;
  const native = raw.trim();

  const serial = Number(native);
  if (Number.isFinite(serial)) {
    // A serial at or below zero predates the epoch and is not a date any publisher here means.
    if (serial <= 0) return unparseable(native);
    const { year, month, day } = serialToUtc(serial);
    if (year === (options.sentinelYear ?? SENTINEL_YEAR)) return sentinel(native);
    if (year < 1900 || year > 2200) return unparseable(native);
    return { date: iso(year, month, day), quality: "reported", precision: options.precision, native };
  }

  // Some publishers write text into a date column. `TBD` is CAISO's, and it is not a date.
  const text = native.toUpperCase();
  if (text === "TBD" || text === "N/A" || text === "NA" || text === "-") return sentinel(native);

  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(native);
  if (ymd !== null) {
    const year = Number(ymd[1]);
    if (year === (options.sentinelYear ?? SENTINEL_YEAR)) return sentinel(native);
    if (year < 1900 || year > 2200) return unparseable(native);
    return { date: `${ymd[1]}-${ymd[2]}-${ymd[3]}`, quality: "reported", precision: options.precision, native };
  }

  return unparseable(native);
}

/** A quantity as published, keeping an empty cell distinct from a reported zero. */
export type ParsedQuantity = {
  value: number | null;
  /** False only when the publisher left the cell empty. An explicit zero is reported. */
  isReported: boolean;
  native: string | null;
};

/**
 * Read a spreadsheet cell as a quantity.
 *
 * The distinction this preserves is the one GBV-1 insisted on: an empty cell is not a zero. It
 * turns out to matter less for ERCOT mileage than expected — TSPs mostly write an explicit 0
 * rather than leaving the cell blank — but "mostly" is exactly why the pipeline must record which
 * it saw rather than assume.
 */
export function parseQuantity(raw: string | null | undefined): ParsedQuantity {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return { value: null, isReported: false, native: null };
  }
  const native = raw.trim();
  const value = Number(native.replace(/,/g, ""));
  if (!Number.isFinite(value)) return { value: null, isReported: false, native };
  return { value, isReported: true, native };
}
