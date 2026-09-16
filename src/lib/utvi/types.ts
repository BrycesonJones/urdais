/**
 * UTVI domain types: the Observed Token Volume Index, from OpenRouter's
 * `rankings-daily` dataset.
 *
 * The shapes here follow the source's real contract rather than its
 * documentation. There is no input/output split anywhere because the source
 * returns one combined figure and no leg fields at all — a nullable leg would
 * be a claim that it might one day fill them.
 *
 * Token counts are carried as `bigint`. The source returns decimal strings
 * explicitly so that 64-bit values are not truncated, and although today's
 * volumes sit three orders of magnitude inside the IEEE-754 safe range, that is
 * a fact about 2026 and not a property of the contract.
 */

/** The source interface Urdais reads. One slug, one endpoint, no alternates. */
export const UTVI_SOURCE_SLUG = "openrouter-datasets-rankings-daily" as const;
export const UTVI_SOURCE_ENDPOINT = "https://openrouter.ai/api/v1/datasets/rankings-daily" as const;

/** The serving platform. Never a lab. */
export const UTVI_SERVING_PLATFORM_SLUG = "openrouter" as const;

/** The reserved permaslug for the aggregate tail row. */
export const RESIDUAL_PERMASLUG = "other" as const;

/**
 * The first date the source serves. Measured: an `end_date` before it is
 * rejected with a 400, and a `start_date` before it is silently clamped forward.
 */
export const SOURCE_HISTORY_FLOOR = "2025-01-01" as const;

/**
 * The maximum span of one request, measured. Undocumented by the source, which
 * is why it is pinned here with the error text that revealed it:
 * "Date range cannot exceed 366 days (requested 623)."
 */
export const SOURCE_MAX_WINDOW_DAYS = 366 as const;

/** The unit of the published value. Not money, and deliberately not a currency. */
export const UTVI_UNIT = "tokens/day" as const;

export const UTVI_SYMBOL = "UTVI" as const;
export const UTVI_DISPLAY_NAME = "Observed Token Volume Index" as const;

/**
 * The universe this version observes, in the exact words published with every value and
 * frozen onto each publication, so a later change of universe cannot rewrite what an old
 * point meant.
 *
 * It defers to the source rather than describing it. OpenRouter documents that the dataset
 * covers the top fifty public models per day, and documents nothing about bring-your-own-key
 * traffic or traffic from hidden applications; Urdais asked and has no answer. A plausible
 * guess would cost nothing to write and could not be corrected later without superseding
 * every point carrying it, so this sentence is a refusal to guess.
 *
 * Do not broaden this string. Widening it is a methodology change with an effective date, and
 * it requires OpenRouter to have documented the thing being claimed.
 */
export const UTVI_UNIVERSE_DESCRIPTOR =
  "Token volume exposed by OpenRouter's rankings-daily dataset for the traffic included by " +
  "that dataset. Urdais makes no claim about inclusion of BYOK or hidden/private application " +
  "traffic unless OpenRouter explicitly documents it.";

/** One row of the source response, exactly as returned. Three fields, no more. */
export type SourceRow = {
  date: string;
  model_permaslug: string;
  total_tokens: string;
};

/** The `meta` block. Its `end_date` is authoritative; the requested one is not. */
export type SourceMeta = {
  as_of: string;
  start_date: string;
  end_date: string;
  version: string;
};

export type SourceResponse = {
  data: SourceRow[];
  meta: SourceMeta;
};

/** A parsed permaslug. The namespace is a grouping key, never a lab identity. */
export type ParsedPermaslug = {
  /** The identifier exactly as the source returned it. Never rewritten. */
  permaslug: string;
  /** The segment before the first slash, or null when there is none. */
  namespace: string | null;
  /** The permaslug with any `:variant` suffix removed: the canonical model key. */
  baseSlug: string;
  /** The `:variant` suffix, where present. Only `free` has been observed. */
  variant: string | null;
  /** True for the reserved aggregate tail row. */
  isResidual: boolean;
};

/**
 * How confidently a row's lab is known.
 *
 * `undisclosed` and `unmapped` are different facts and must not be collapsed:
 * one is a permanent property of the model, the other is work Urdais has not
 * done. Both keep the volume and refuse the attribution.
 */
export type LabAttributionState = "evidenced" | "undisclosed" | "unmapped" | "not_applicable";

/** One normalized observation, ready to persist. */
export type ModelObservation = {
  permaslug: string;
  namespace: string | null;
  variant: string | null;
  baseSlug: string;
  tokens: bigint;
  isResidual: boolean;
  labSlug: string | null;
  labAttributionState: LabAttributionState;
  qualityFlags: string[];
};

/** Why a date has, or has not, a usable observation. */
export type CoverageState = "covered_observed" | "covered_no_rows" | "malformed";

/** Whether a date is still moving. Never `final` by assumption. */
export type SettlementState = "provisional" | "final";

/** One UTC date as one retrieval saw it. */
export type DailySnapshot = {
  observationDate: string;
  coverageState: CoverageState;
  /** The canonical daily total: every returned row for the date, residual included. */
  totalTokens: bigint | null;
  /** The total minus the residual: the denominator for any attributed breakdown. */
  attributedTokens: bigint | null;
  /** The aggregate tail: volume with no model and no lab. */
  residualTokens: bigint | null;
  namedRowCount: number;
  /** Measured: legitimately false when the tail is empty. Never an error. */
  residualRowPresent: boolean;
  /** SHA-256 over this date's rows alone. The revision detector. */
  dateContentHash: string | null;
  settlementState: SettlementState;
  observations: ModelObservation[];
};

/** The outcome of one read of the dataset. */
export type RetrievalOutcome = "succeeded" | "http_error" | "malformed" | "transport_error";

export type RetrievalResult = {
  outcome: RetrievalOutcome;
  outcomeDetail: string | null;
  httpStatus: number | null;
  /** SHA-256 of the raw response body. */
  responseHash: string | null;
  responseByteLength: number | null;
  requestedStartDate: string;
  requestedEndDate: string;
  /** From `meta`, and authoritative: the endpoint clamps the requested end date. */
  actualStartDate: string | null;
  actualEndDate: string | null;
  sourceAsOf: string | null;
  datasetVersion: string | null;
  rowCount: number | null;
  retrievedAt: string;
  requestUrl: string;
  requestParameters: Record<string, string>;
  response: SourceResponse | null;
};

/** One computed UTVI value. */
export type UtviCalculation = {
  calculationDate: string;
  totalObservedTokens: bigint;
  /** Volume with no model at all: the aggregate tail. */
  modelResidualTokens: bigint;
  /** Volume with a model whose lab is not evidenced. A subset of the attributed volume. */
  labResidualTokens: bigint;
  attributedTokens: bigint;
  eligibleRowCount: number;
  excludedRowCount: number;
  exclusions: { permaslug: string; reason: string }[];
  coverageState: CoverageState;
  settlementState: SettlementState;
  sourceContentHash: string;
};

export class UtviSourceError extends Error {
  readonly outcome: RetrievalOutcome;
  readonly httpStatus: number | null;
  constructor(outcome: RetrievalOutcome, detail: string, httpStatus: number | null = null) {
    super(`utvi source ${outcome}: ${detail}`);
    this.name = "UtviSourceError";
    this.outcome = outcome;
    this.httpStatus = httpStatus;
  }
}

export class UtviContractError extends Error {
  constructor(detail: string) {
    super(`utvi source contract violated: ${detail}`);
    this.name = "UtviContractError";
  }
}
