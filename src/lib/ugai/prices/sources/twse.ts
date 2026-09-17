/**
 * Taiwan Stock Exchange OpenAPI: official daily closes, and the venue's own trading calendar.
 *
 * The adapter is built around the venue, not around any issuer. It fetches every listed line the
 * exchange published for a date and leaves selection to the caller, because the set of listings
 * Urdais cares about is a property of the universe and not of the source.
 *
 * Two things about this source shape the code.
 *
 * The endpoint serves the latest session only — there is no date parameter — so a request for an
 * older date cannot be satisfied and must fail rather than silently return today's prices under
 * yesterday's label. That is the single most dangerous thing this adapter could do, so the date
 * the payload reports is checked against the date that was asked for.
 *
 * Dates are ROC years. "1150916" is 2026-09-16, and the conversion lives in its own module with
 * its own tests because an off-by-1911 error produces a date that still parses.
 */

import { rocDateToIso } from "@/lib/ugai/prices/roc-date";
import {
  PriceContractError,
  assertPriceLiteral,
  type ParsedClose,
  type PriceSourceAdapter,
  type SessionStatus,
} from "@/lib/ugai/prices/types";

export const TWSE_VENUE_MIC = "XTAI" as const;
export const TWSE_DAILY_SLUG = "tw-twse-openapi-daily" as const;
export const TWSE_HOLIDAY_SLUG = "tw-twse-openapi-holidays" as const;
export const TWSE_DAILY_ENDPOINT =
  "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL" as const;
export const TWSE_HOLIDAY_ENDPOINT =
  "https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule" as const;

/** The daily record as TWSE publishes it. Every field is a string in the real payload. */
export type TwseDailyRecord = {
  Date?: unknown;
  Code?: unknown;
  Name?: unknown;
  ClosingPrice?: unknown;
  OpeningPrice?: unknown;
  HighestPrice?: unknown;
  LowestPrice?: unknown;
  TradeVolume?: unknown;
};

export type TwseHolidayRecord = {
  Date?: unknown;
  Name?: unknown;
  Description?: unknown;
};

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PriceContractError(`TWSE record field '${field}' is missing or not a string`);
  }
  return value.trim();
}

/**
 * Parse one daily payload into canonical closes for a stated trading date.
 *
 * A record whose close cannot be read is dropped rather than defaulted, and the reason is
 * returned alongside so the caller can see how much of the payload failed closed. A line that
 * did not trade appears in the payload with an empty or non-numeric close; that is a real
 * condition, not a malformed record, and it becomes `no_official_close` rather than a gap.
 */
export function parseTwseDaily(
  payload: unknown,
  expectedDate: string,
): { closes: ParsedClose[]; rejected: { code: string; reason: string }[] } {
  if (!Array.isArray(payload)) {
    throw new PriceContractError("TWSE daily payload is not an array");
  }
  if (payload.length === 0) {
    throw new PriceContractError("TWSE daily payload is empty");
  }

  const closes: ParsedClose[] = [];
  const rejected: { code: string; reason: string }[] = [];

  for (const raw of payload as TwseDailyRecord[]) {
    let code = "(unknown)";
    try {
      code = requireString(raw.Code, "Code");
      const recordDate = rocDateToIso(requireString(raw.Date, "Date"));

      // The endpoint serves only the most recent session. If the payload is for a different date
      // than the caller asked for, the request was not satisfied — and returning these rows
      // under the requested date would misdate every price in the set.
      if (recordDate !== expectedDate) {
        throw new PriceContractError(
          `TWSE published ${recordDate}, not the requested ${expectedDate}; this endpoint serves the latest session only`,
        );
      }

      const rawClose = typeof raw.ClosingPrice === "string" ? raw.ClosingPrice.trim() : "";
      if (rawClose === "" || rawClose === "--") {
        closes.push({
          listingRef: { venueMic: TWSE_VENUE_MIC, localCode: code },
          tradingDate: recordDate,
          sessionStatus: "no_official_close",
          closePrice: null,
          priceCurrency: null,
          priceUnit: null,
          sourceReportedAt: null,
          sourcePayload: raw,
        });
        continue;
      }

      closes.push({
        listingRef: { venueMic: TWSE_VENUE_MIC, localCode: code },
        tradingDate: recordDate,
        sessionStatus: "traded",
        // Raw and unadjusted, as published. TWSE quotes in whole New Taiwan dollars.
        closePrice: assertPriceLiteral(rawClose, `TWSE ${code}`),
        priceCurrency: "TWD",
        priceUnit: "major",
        sourceReportedAt: null,
        sourcePayload: raw,
      });
    } catch (error) {
      // A date mismatch invalidates the whole payload, not one record, so it is not swallowed.
      if (error instanceof PriceContractError && error.message.includes("serves the latest session only")) {
        throw error;
      }
      rejected.push({ code, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  if (closes.length === 0) {
    throw new PriceContractError("no TWSE record in the payload yielded a usable close");
  }
  return { closes, rejected };
}

/** Whether the venue's own calendar marks a date as a non-trading day. */
export function parseTwseHolidays(payload: unknown): Map<string, string> {
  if (!Array.isArray(payload)) {
    throw new PriceContractError("TWSE holiday payload is not an array");
  }
  const byDate = new Map<string, string>();
  for (const raw of payload as TwseHolidayRecord[]) {
    const date = typeof raw.Date === "string" ? raw.Date.trim() : "";
    if (date === "") continue;
    let iso: string;
    try {
      iso = rocDateToIso(date);
    } catch {
      continue;
    }
    const name = typeof raw.Name === "string" ? raw.Name.trim() : "";
    const description = typeof raw.Description === "string" ? raw.Description.trim() : "";
    // The calendar carries both closures and notable trading days ("the last trading day before
    // Lunar New Year"), so only entries that describe a closure are treated as holidays.
    if (/放假|休市/.test(`${name}${description}`)) byDate.set(iso, name || description);
  }
  return byDate;
}

export type Fetcher = (url: string) => Promise<unknown>;

/** The live adapter. `fetcher` is injected so tests never reach the network. */
export function createTwseAdapter(fetcher: Fetcher): PriceSourceAdapter {
  return {
    sourceSlug: TWSE_DAILY_SLUG,
    venueMic: TWSE_VENUE_MIC,

    async fetchCloses(tradingDate: string): Promise<ParsedClose[]> {
      const payload = await fetcher(TWSE_DAILY_ENDPOINT);
      return parseTwseDaily(payload, tradingDate).closes;
    },

    async sessionStatusFor(tradingDate: string): Promise<SessionStatus> {
      const holidays = parseTwseHolidays(await fetcher(TWSE_HOLIDAY_ENDPOINT));
      if (holidays.has(tradingDate)) return "exchange_holiday";
      const weekday = new Date(`${tradingDate}T00:00:00Z`).getUTCDay();
      if (weekday === 0 || weekday === 6) return "exchange_holiday";
      return "traded";
    },
  };
}
