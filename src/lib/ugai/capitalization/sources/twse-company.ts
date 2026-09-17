/**
 * TWSE company data: issued shares, and the ex-rights notice table.
 *
 * Two things worth noting about the share count. It is 已發行普通股數, the issued common share
 * count, which is `issued` and not `outstanding` — Taiwan publishes the former and the difference
 * is treasury stock, so the type is recorded as what the source actually said. And the same
 * payload carries 實收資本額 (paid-in capital) and 普通股每股面額 (par value per share), whose
 * quotient must equal the share count; a parse that disagrees with the issuer's own arithmetic is
 * rejected rather than trusted, which catches a misread column for free.
 */

import { rocDateToIso } from "@/lib/ugai/prices/roc-date";
import {
  CapitalizationContractError,
  assertShareCountLiteral,
  type ParsedCorporateAction,
  type ParsedShareCount,
} from "@/lib/ugai/capitalization/types";

export const TWSE_COMPANY_SLUG = "tw-twse-openapi-company" as const;
export const TWSE_ACTIONS_SLUG = "tw-twse-openapi-corporate-actions" as const;
export const TWSE_COMPANY_ENDPOINT = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L" as const;
export const TWSE_ACTIONS_ENDPOINT = "https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL" as const;

const SHARES_FIELD = "已發行普通股數或TDR原股發行股數";
const CAPITAL_FIELD = "實收資本額";
const PAR_FIELD = "普通股每股面額";
const CODE_FIELD = "公司代號";
const DATE_FIELD = "出表日期";

/** Pull the numeric par value out of TWSE's prose field, e.g. "新台幣  10.0000元". */
export function parseParValue(raw: string): number {
  const match = /([\d,]+\.?\d*)/.exec(raw.replace(/,/g, ""));
  if (!match) throw new CapitalizationContractError(`cannot read a par value from '${raw}'`);
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new CapitalizationContractError(`par value '${raw}' is not positive and finite`);
  }
  return value;
}

/**
 * Parse the issued common share count for one listed code.
 *
 * Returns null when the code is absent from the payload, which is the ordinary case: the endpoint
 * publishes every listed company and the UGAI master holds a handful.
 */
export function parseIssuedShares(payload: unknown, localCode: string): ParsedShareCount | null {
  if (!Array.isArray(payload)) throw new CapitalizationContractError("TWSE company payload is not an array");
  const row = (payload as Record<string, unknown>[]).find((r) => String(r[CODE_FIELD] ?? "").trim() === localCode);
  if (!row) return null;

  const sharesRaw = String(row[SHARES_FIELD] ?? "").replace(/,/g, "").trim();
  if (sharesRaw === "") {
    throw new CapitalizationContractError(`TWSE ${localCode} publishes no issued share count`);
  }
  const shareCount = assertShareCountLiteral(sharesRaw, `TWSE ${localCode}`);

  // The issuer's own arithmetic, used as a check rather than as a source. Paid-in capital divided
  // by par value equals the issued share count, and a mismatch means a column was misread.
  const capitalRaw = String(row[CAPITAL_FIELD] ?? "").replace(/,/g, "").trim();
  const parRaw = String(row[PAR_FIELD] ?? "").trim();
  if (capitalRaw !== "" && parRaw !== "") {
    const implied = Number(capitalRaw) / parParseSafe(parRaw);
    const stated = Number(shareCount);
    // A one-share tolerance, because par values are published to four decimal places and the
    // division is not always exact. Anything wider would stop the check catching a misread column.
    if (Math.abs(implied - stated) > 1) {
      throw new CapitalizationContractError(
        `TWSE ${localCode}: issued shares ${stated} disagrees with paid-in capital ${capitalRaw} over par ${parRaw} (implies ${implied})`,
      );
    }
  }

  const reportDate = rocDateToIso(String(row[DATE_FIELD] ?? ""));
  return {
    // 已發行 is "issued", not "outstanding". Taiwan publishes the former and the difference is
    // treasury stock, so the distinction is preserved rather than relabelled.
    shareCountType: "issued",
    shareCount,
    countUnit: "shares",
    effectiveDate: reportDate,
    asReportedDate: reportDate,
    sourceConcept: SHARES_FIELD,
    sourcePayload: row,
  };
}

function parParseSafe(raw: string): number {
  return parseParValue(raw);
}

/**
 * Parse the ex-rights and ex-dividend notice table.
 *
 * One source row can describe more than one action — a company can go ex-dividend and ex-rights on
 * the same date — so this returns a list per row rather than picking one. Ratios are kept as a
 * numerator and denominator pair; TWSE publishes a stock-dividend ratio per thousand shares, and
 * flattening it to a decimal would lose the issuer's own terms.
 */
export function parseExRightsNotices(payload: unknown, localCode: string): ParsedCorporateAction[] {
  if (!Array.isArray(payload)) throw new CapitalizationContractError("TWSE notice payload is not an array");
  const actions: ParsedCorporateAction[] = [];

  for (const raw of payload as Record<string, unknown>[]) {
    if (String(raw.Code ?? "").trim() !== localCode) continue;
    const exDate = rocDateToIso(String(raw.Date ?? ""));
    const cash = String(raw.CashDividend ?? "").trim();
    const stockRatio = String(raw.StockDividendRatio ?? "").trim();
    const subscriptionRatio = String(raw.SubscriptionRatio ?? "").trim();

    if (cash !== "" && Number(cash) > 0) {
      actions.push({
        actionType: "cash_dividend",
        exDate,
        cashAmount: cash,
        cashCurrency: "TWD",
        ratioNumerator: null,
        ratioDenominator: null,
        terms: { per_share_amount: cash, currency: "TWD", exdividend_marker: String(raw.Exdividend ?? "") },
        sourcePayload: raw,
      });
    }
    if (stockRatio !== "" && Number(stockRatio) > 0) {
      actions.push({
        actionType: "stock_dividend",
        exDate,
        cashAmount: null,
        cashCurrency: null,
        // Published per thousand shares. Kept as the pair the venue stated.
        ratioNumerator: stockRatio,
        ratioDenominator: "1000",
        terms: { stock_dividend_shares_per_thousand: stockRatio },
        sourcePayload: raw,
      });
    }
    if (subscriptionRatio !== "" && Number(subscriptionRatio) > 0) {
      actions.push({
        actionType: "rights_issue",
        exDate,
        cashAmount: null,
        cashCurrency: null,
        ratioNumerator: subscriptionRatio,
        ratioDenominator: "1000",
        terms: {
          subscription_shares_per_thousand: subscriptionRatio,
          subscription_price_per_share: String(raw.SubscriptionPricePerShare ?? "") || null,
        },
        sourcePayload: raw,
      });
    }
  }
  return actions;
}
