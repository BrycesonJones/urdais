/**
 * Central Bank of the Republic of China (Taiwan), open dataset 7232.
 *
 * "The closing exchange rate of the New Taiwan Dollar against the US dollar in the interbank
 * market", identifier A59000000N-000045, served as JSON from the bank's open-data platform with
 * daily observations from 2 January 2008.
 *
 * The orientation is the thing to get right. CBC publishes **TWD per one USD** — 31.881, not
 * 0.031 — which is the inverse of what UGAI needs. This parser therefore returns the rate in the
 * orientation the source published it, labelled as such, and does not invert. Inversion is a
 * separate, recorded derivation with lineage back to this row, because an inversion applied twice
 * restores the original number and leaves nothing to notice.
 *
 * There is no HTML path here and there should never be one: the dataset is published as JSON and
 * scraping the presentation page would be collecting a rendering of the data rather than the data.
 */

import { FxContractError, type SourceRate } from "@/lib/ugai/fx/derive";

export const CBC_SLUG = "cbc-exchange-rates" as const;
export const CBC_ENDPOINT = "https://cpx.cbc.gov.tw/api/OpenData/FTDOpenData_Day" as const;
export const CBC_DATASET = "7232" as const;
export const CBC_DATASET_IDENTIFIER = "A59000000N-000045" as const;
export const CBC_SERIES_TITLE =
  "The closing exchange rate of the New Taiwan Dollar against the US dollar in the interbank market" as const;

/** The published row. Field names are the source's own, including the Chinese date key. */
export type CbcDailyRow = {
  日期?: unknown;
  NTD_USD?: unknown;
};

/** Convert the source's compact date to an ISO calendar date, rejecting anything impossible. */
export function parseCbcDate(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!/^\d{8}$/.test(value)) {
    throw new FxContractError(`CBC date '${String(raw)}' is not an eight-digit date`);
  }
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  if (month < 1 || month > 12) throw new FxContractError(`CBC date '${value}' has month ${month}`);
  if (day < 1 || day > 31) throw new FxContractError(`CBC date '${value}' has day ${day}`);
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.getUTCDate() !== day || parsed.getUTCMonth() + 1 !== month) {
    throw new FxContractError(`CBC date '${value}' is not a real calendar date`);
  }
  // Deliberately no weekday check. The series is a Taiwan business-day series and Taiwan runs
  // Saturday make-up workdays, which carry legitimate observations; a Monday-to-Friday filter
  // would silently discard them. What to do when a date has no fixing is a methodology question
  // that the unresolved fixing convention owns, not a parsing one.
  return iso;
}

/** Parse the published rate, in the orientation the source published it. */
export function parseCbcRate(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new FxContractError(`CBC rate '${String(raw)}' is not a decimal rate literal`);
  }
  if (Number(value) <= 0) {
    throw new FxContractError(`CBC rate '${value}' is not greater than zero`);
  }
  return value;
}

/**
 * Parse the daily series into source rates.
 *
 * Every returned rate is `TWD per USD` — base TWD, quote USD — which is what CBC publishes. A
 * malformed row is dropped with its reason rather than defaulted, and the caller is told how many
 * were dropped so a partially broken payload is visible instead of quietly shorter.
 */
export function parseCbcDaily(
  payload: unknown,
): { rates: SourceRate[]; rejected: { row: unknown; reason: string }[] } {
  if (!Array.isArray(payload)) {
    throw new FxContractError("the CBC daily payload is not an array");
  }
  const rates: SourceRate[] = [];
  const rejected: { row: unknown; reason: string }[] = [];

  for (const row of payload as CbcDailyRow[]) {
    try {
      rates.push({
        // As published. Relabelling this USD/TWD here would destroy the only evidence that an
        // inversion happens at all.
        baseCurrency: "TWD",
        quoteCurrency: "USD",
        rate: parseCbcRate(row.NTD_USD),
        fixingDate: parseCbcDate(row.日期),
      });
    } catch (error) {
      rejected.push({ row, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  if (rates.length === 0) {
    throw new FxContractError("no CBC row in the payload yielded a usable rate");
  }
  return { rates, rejected };
}

/** The single observation for one date, or null where the series has none. */
export function cbcRateFor(payload: unknown, isoDate: string): SourceRate | null {
  return parseCbcDaily(payload).rates.find((r) => r.fixingDate === isoDate) ?? null;
}
