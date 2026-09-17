/**
 * SEC XBRL: shares outstanding, and the cases where it refuses to answer.
 *
 * The concept this reads is `dei:EntityCommonStockSharesOutstanding` — the cover-page count,
 * which is a point-in-time capitalization figure with its own effective date (`end`) and its own
 * publication date (`filed`). That pair is what makes a historical calculation possible.
 *
 * The interesting behaviour is the refusal. A multi-class issuer does not report that concept as
 * a scalar: Palantir's `dei` facts contain only `EntityPublicFloat`, and the `us-gaap`
 * share concepts the flat API does serve have had their share-class dimension stripped, so
 * whether a figure is one class or every class summed is not established. Falling back to those
 * would attach an all-class number to a single listed class — a wrong number that looks right.
 * So this parser has no fallback, and says why.
 */

import {
  CapitalizationContractError,
  NON_CAPITALIZATION_CONCEPTS,
  assertShareCountLiteral,
  type ParsedShareCount,
} from "@/lib/ugai/capitalization/types";

export const SEC_XBRL_SLUG = "sec-xbrl-company-concepts" as const;
export const SHARES_OUTSTANDING_CONCEPT = "dei:EntityCommonStockSharesOutstanding" as const;
export const PUBLIC_FLOAT_CONCEPT = "dei:EntityPublicFloat" as const;

export function companyConceptUrl(cik: string, taxonomy: string, tag: string): string {
  return `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/${taxonomy}/${tag}.json`;
}

type ConceptUnitValue = {
  val?: unknown;
  end?: unknown;
  filed?: unknown;
  form?: unknown;
};

type ConceptResponse = {
  taxonomy?: unknown;
  tag?: unknown;
  units?: Record<string, ConceptUnitValue[]>;
};

/**
 * Parse a companyconcept response into share counts.
 *
 * Every reported period is returned rather than only the newest, because point-in-time
 * reconstruction needs the historical series and a later filing restating an earlier period is a
 * supersession the store has to be able to see.
 */
export function parseSharesOutstanding(payload: unknown): ParsedShareCount[] {
  const response = payload as ConceptResponse;
  const tag = typeof response?.tag === "string" ? response.tag : "";
  const taxonomy = typeof response?.taxonomy === "string" ? response.taxonomy : "";

  if (NON_CAPITALIZATION_CONCEPTS.includes(tag)) {
    throw new CapitalizationContractError(
      `${tag} is not a point-in-time capitalization count and cannot establish shares outstanding`,
    );
  }
  if (tag !== "EntityCommonStockSharesOutstanding") {
    throw new CapitalizationContractError(
      `expected EntityCommonStockSharesOutstanding, got '${taxonomy}:${tag}'. There is deliberately no fallback to a us-gaap share concept: the flat API strips the share-class dimension, so a multi-class issuer's figure cannot be attached to one listed class.`,
    );
  }

  const units = response.units ?? {};
  const shareUnits = units["shares"];
  if (!Array.isArray(shareUnits) || shareUnits.length === 0) {
    throw new CapitalizationContractError("the concept reports no values in 'shares'");
  }

  const parsed: ParsedShareCount[] = [];
  for (const value of shareUnits) {
    const end = typeof value.end === "string" ? value.end : null;
    if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
    if (value.val === null || value.val === undefined) continue;
    parsed.push({
      shareCountType: "outstanding",
      shareCount: assertShareCountLiteral(String(value.val), `SEC ${end}`),
      countUnit: "shares",
      effectiveDate: end,
      asReportedDate: typeof value.filed === "string" ? value.filed : null,
      sourceConcept: SHARES_OUTSTANDING_CONCEPT,
      sourcePayload: value,
    });
  }
  if (parsed.length === 0) {
    throw new CapitalizationContractError("no reported period in the concept yielded a usable count");
  }
  return parsed;
}

/**
 * Parse `dei:EntityPublicFloat` into float *evidence*.
 *
 * Deliberately not a factor and deliberately not convertible into one here. The SEC concept is
 * the aggregate market value of common equity held by non-affiliates, in currency, at one fiscal
 * date. Turning it into a factor needs a market capitalization at that same date, and
 * "non-affiliate" is not the same population as "free float" — it excludes officers, directors
 * and ten-percent holders while including strategic corporate holders an index would remove.
 * Both of those are methodology decisions, so this returns the amount and nothing else.
 */
export function parsePublicFloatEvidence(
  payload: unknown,
): { amount: string; currency: string; effectiveDate: string; asReportedDate: string | null }[] {
  const response = payload as ConceptResponse;
  if (response?.tag !== "EntityPublicFloat") {
    throw new CapitalizationContractError(`expected EntityPublicFloat, got '${String(response?.tag)}'`);
  }
  const out: { amount: string; currency: string; effectiveDate: string; asReportedDate: string | null }[] = [];
  for (const [unit, values] of Object.entries(response.units ?? {})) {
    if (!/^[A-Z]{3}$/.test(unit)) continue;
    for (const value of values) {
      const end = typeof value.end === "string" ? value.end : null;
      if (!end || value.val === null || value.val === undefined) continue;
      out.push({
        amount: String(value.val),
        currency: unit,
        effectiveDate: end,
        asReportedDate: typeof value.filed === "string" ? value.filed : null,
      });
    }
  }
  if (out.length === 0) throw new CapitalizationContractError("EntityPublicFloat reports no currency values");
  return out;
}
