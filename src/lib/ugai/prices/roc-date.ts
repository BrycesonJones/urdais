/**
 * Republic of China calendar conversion, for Taiwan's exchange data.
 *
 * TWSE publishes dates as民國 years: "1150916" is ROC year 115, month 09, day 16, and ROC year 1
 * is 1912, so the Gregorian year is 115 + 1911 = 2026. The string is seven characters for any
 * ROC year from 100 onward and six before that, which is the kind of detail that makes a
 * substring-based parse quietly wrong in 2010 and correct in 2026.
 *
 * This is parsed rather than sliced, and an out-of-range month or day is rejected rather than
 * normalised — a "date" of 1151332 is a sign the payload is not what it claims to be, and
 * rolling it forward to January 2027 would hide that.
 */

import { PriceContractError } from "@/lib/ugai/prices/types";

const ROC_EPOCH_OFFSET = 1911;

/** Convert a TWSE ROC date string to an ISO calendar date. */
export function rocDateToIso(roc: string): string {
  const raw = roc.trim();
  if (!/^\d{6,7}$/.test(raw)) {
    throw new PriceContractError(`ROC date '${roc}' is not six or seven digits`);
  }
  const day = Number(raw.slice(-2));
  const month = Number(raw.slice(-4, -2));
  const rocYear = Number(raw.slice(0, raw.length - 4));
  if (rocYear < 1) throw new PriceContractError(`ROC date '${roc}' has no year`);
  if (month < 1 || month > 12) throw new PriceContractError(`ROC date '${roc}' has month ${month}`);
  if (day < 1 || day > 31) throw new PriceContractError(`ROC date '${roc}' has day ${day}`);

  const year = rocYear + ROC_EPOCH_OFFSET;
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // Reject a day that does not exist in that month. Date.UTC would roll 2026-02-30 into March.
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.getUTCDate() !== day || parsed.getUTCMonth() + 1 !== month) {
    throw new PriceContractError(`ROC date '${roc}' is not a real calendar date`);
  }
  return iso;
}

/** Convert an ISO calendar date to the seven-digit ROC form TWSE publishes. */
export function isoDateToRoc(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) throw new PriceContractError(`'${iso}' is not an ISO calendar date`);
  const rocYear = Number(match[1]) - ROC_EPOCH_OFFSET;
  if (rocYear < 1) throw new PriceContractError(`'${iso}' precedes the ROC epoch`);
  return `${rocYear}${match[2]}${match[3]}`;
}
