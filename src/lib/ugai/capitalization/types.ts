/**
 * Canonical shapes for UGAI capitalization inputs.
 *
 * The distinctions here are the point. "Shares" is not one number: an EPS denominator is a
 * weighted average over a period, authorized shares are a ceiling nobody has issued, issued
 * includes treasury and outstanding does not. A parser that returns `shares: number` has already
 * thrown away the only thing that made the number usable, so `ShareCountType` is required
 * everywhere and has no default.
 *
 * `FloatDetermination` has the same shape for the same reason, inverted: the factor is optional
 * and the state is not. There is no constructor, code path or default in this module that
 * produces a factor of 1 from missing evidence.
 */

export type ShareCountType =
  | "issued"
  | "outstanding"
  | "treasury"
  | "authorized"
  | "diluted_weighted_average"
  | "privately_placed"
  | "preferred";

/** Concepts that are never a point-in-time capitalization count, whatever they are labelled. */
export const NON_CAPITALIZATION_CONCEPTS: readonly string[] = [
  "WeightedAverageNumberOfSharesOutstandingBasic",
  "WeightedAverageNumberOfDilutedSharesOutstanding",
  "WeightedAverageNumberOfSharesOutstandingDiluted",
  "CommonStockSharesAuthorized",
];

export type ParsedShareCount = {
  shareCountType: ShareCountType;
  /** Decimal string. The column is numeric and nothing here does arithmetic on it. */
  shareCount: string;
  countUnit: "shares";
  /** The date the count was true of. */
  effectiveDate: string;
  /** When the source said so. Never conflated with the above. */
  asReportedDate: string | null;
  sourceConcept: string;
  sourcePayload: unknown;
};

export type FloatState =
  | "established"
  | "unknown"
  | "unavailable"
  | "under_review"
  | "not_applicable";

/**
 * A float determination.
 *
 * `factor` is present only when `state` is "established". Every other state carries no number,
 * which is what keeps an unknown float from becoming a full float.
 */
export type FloatDetermination = {
  state: FloatState;
  factor: string | null;
  determinationMethod:
    | "published_by_venue"
    | "published_by_regulator"
    | "issuer_disclosure"
    | "derived_from_holdings"
    | null;
  basis: string;
  methodologyReference: string | null;
};

export type ParsedCorporateAction = {
  actionType:
    | "cash_dividend"
    | "special_dividend"
    | "stock_dividend"
    | "rights_issue"
    | "stock_split"
    | "reverse_split";
  exDate: string;
  cashAmount: string | null;
  cashCurrency: string | null;
  ratioNumerator: string | null;
  ratioDenominator: string | null;
  terms: Record<string, unknown>;
  sourcePayload: unknown;
};

export class CapitalizationContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapitalizationContractError";
  }
}

/** A share count that is not a positive finite integer-like decimal is not a share count. */
export function assertShareCountLiteral(raw: string, context: string): string {
  const value = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new CapitalizationContractError(`${context}: '${raw}' is not a share-count literal`);
  }
  if (Number(value) <= 0) {
    throw new CapitalizationContractError(`${context}: share count '${raw}' is not greater than zero`);
  }
  return value;
}

/**
 * A float factor literal, if one is ever established from a source.
 *
 * Rejects anything outside [0, 1] and anything non-finite. Note there is deliberately no
 * `factorOrDefault` helper: the absence of such a function is load-bearing.
 */
export function assertFloatFactorLiteral(raw: string, context: string): string {
  const value = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new CapitalizationContractError(`${context}: '${raw}' is not a float-factor literal`);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    throw new CapitalizationContractError(`${context}: float factor '${raw}' is outside [0, 1]`);
  }
  return value;
}

/** Identity of a capitalization fact: what it describes, never when it was collected. */
export function capitalizationIdempotencyKey(
  sourceSlug: string,
  subject: string,
  concept: string,
  effectiveDate: string,
  purpose: "research" | "production",
): string {
  return `${sourceSlug}:${subject}:${concept}:${effectiveDate}:${purpose}`;
}
