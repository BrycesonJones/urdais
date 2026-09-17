/**
 * The UGAI level, its divisor, and the continuity rule that holds them together.
 *
 *   MV_t   = Σ_i q_i,t × P_i,t × X_i,t
 *   UGAI_t = MV_t / D_t
 *
 * One sentence governs everything here: the index must change because constituent market values
 * changed, not because bookkeeping altered shares, listings or capital structure. The divisor is
 * how that is enforced, and it has exactly one rule —
 *
 *   D_after = D_before × MV_after / MV_before
 *
 * — which every maintenance event reduces to. There are no per-event formulas in this module,
 * only per-event decisions about what MV_after is, which is the distinction that keeps the
 * arithmetic auditable.
 *
 * Arithmetic is exact-ratio integer arithmetic at a fixed scale. A price index compounds daily
 * for years; a level carried in doubles accumulates error that nobody can attribute afterwards,
 * and the methodology requires that a rounded value never become an input to a subsequent
 * calculation. The cheapest way to guarantee that is to never round at all before publication.
 */

export class CalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalculationError";
  }
}

/** Working scale: 1 unit = 1e-24. Wide enough for index shares times prices in USD. */
const SCALE = 24n;
const ONE = 10n ** SCALE;

/** The base level the methodology fixes: 1,000.00 on the base date. */
export const UGAI_BASE_LEVEL = "1000" as const;

export function parseDecimal(literal: string, context: string): bigint {
  const value = literal.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new CalculationError(`${context}: '${literal}' is not a decimal literal`);
  }
  const [whole = "0", fraction = ""] = value.split(".");
  if (fraction.length > Number(SCALE)) {
    throw new CalculationError(`${context}: '${literal}' exceeds the calculation scale`);
  }
  return BigInt(whole + fraction.padEnd(Number(SCALE), "0"));
}

export function render(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const whole = abs / ONE;
  const fraction = (abs % ONE).toString().padStart(Number(SCALE), "0").replace(/0+$/, "");
  const body = fraction === "" ? whole.toString() : `${whole}.${fraction}`;
  return negative ? `-${body}` : body;
}

function mul(a: bigint, b: bigint): bigint {
  return (a * b) / ONE;
}
function div(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new CalculationError("division by zero in the index arithmetic");
  return (a * ONE) / b;
}

/** One constituent's inputs for a calculation day. */
export type ConstituentInput = {
  securityId: string;
  /** q_i — index shares, constant between resets. Zero is legitimate for a departing line. */
  indexShares: string;
  /** P_i — the raw official close, or the carried value the missing-data rule permits. */
  localPrice: string | null;
  /** X_i — USD per one unit of the price currency. */
  fxRate: string | null;
  /**
   * The methodology's input condition. `missing` and `reference_data_conflict` are the two that
   * may not be imputed; the carried states are explicitly permitted and flagged.
   */
  priceInputState:
    | "observed"
    | "valid_prior_close"
    | "stale"
    | "suspended"
    | "missing"
    | "reference_data_conflict";
};

export type ConstituentContribution = {
  securityId: string;
  contributionUsd: string;
  asOfWeight: string;
};

export type MarketValueOutcome =
  | { computable: true; marketValueUsd: string; contributions: ConstituentContribution[] }
  | { computable: false; reason: string; blockingSecurities: string[] };

/**
 * Compute MV_t.
 *
 * Refuses rather than renormalising when a constituent cannot be valued. The methodology's
 * missing-data rule permits carrying a close for a holiday, a stale session or a suspension — and
 * for a genuinely missing observation says "do not impute; the observation is unavailable until
 * resolved". Dropping the name and rescaling the rest would be an imputation of exactly the kind
 * it forbids, and it would silently change every other constituent's weight.
 */
export function marketValue(constituents: readonly ConstituentInput[]): MarketValueOutcome {
  if (constituents.length === 0) {
    return { computable: false, reason: "the basket is empty", blockingSecurities: [] };
  }

  const blocking = constituents.filter(
    (c) =>
      c.priceInputState === "missing" ||
      c.priceInputState === "reference_data_conflict" ||
      c.localPrice === null ||
      c.fxRate === null,
  );
  if (blocking.length > 0) {
    return {
      computable: false,
      reason:
        "a constituent has no usable price or exchange rate, and the methodology forbids imputing one. " +
        "Dropping it and renormalising would silently change every other constituent's weight, which is " +
        "the same imputation by another route.",
      blockingSecurities: blocking.map((c) => c.securityId),
    };
  }

  const terms = constituents.map((c) => {
    const q = parseDecimal(c.indexShares, `index shares for ${c.securityId}`);
    const p = parseDecimal(c.localPrice!, `price for ${c.securityId}`);
    const x = parseDecimal(c.fxRate!, `FX for ${c.securityId}`);
    if (p <= 0n) throw new CalculationError(`price for ${c.securityId} is not positive`);
    if (x <= 0n) throw new CalculationError(`FX for ${c.securityId} is not positive`);
    return { securityId: c.securityId, value: mul(mul(q, p), x) };
  });

  const total = terms.reduce((acc, t) => acc + t.value, 0n);
  if (total <= 0n) {
    return {
      computable: false,
      reason: "the basket has no positive market value",
      blockingSecurities: [],
    };
  }

  return {
    computable: true,
    marketValueUsd: render(total),
    contributions: terms.map((t) => ({
      securityId: t.securityId,
      contributionUsd: render(t.value),
      // Recorded, never fed back. Re-weighting to it between resets would embed a trading rule
      // the methodology explicitly rejects.
      asOfWeight: render(div(t.value, total)),
    })),
  };
}

/** UGAI_t = MV_t / D_t. */
export function indexLevel(marketValueUsd: string, divisor: string): string {
  const mv = parseDecimal(marketValueUsd, "market value");
  const d = parseDecimal(divisor, "divisor");
  if (d <= 0n) throw new CalculationError("the divisor is not positive");
  return render(div(mv, d));
}

/**
 * The base divisor: `D_base = MV_base / 1000`.
 *
 * Deliberately takes only a market value. There is no date parameter and no way to ask for a
 * different base level, because the methodology fixes both — the level at 1,000.00 and the date
 * at first live publication — and a function that accepted either would be an invitation.
 */
export function baseDivisor(marketValueUsd: string): string {
  const mv = parseDecimal(marketValueUsd, "base market value");
  if (mv <= 0n) throw new CalculationError("the base market value is not positive");
  return render(div(mv, parseDecimal(UGAI_BASE_LEVEL, "base level")));
}

/**
 * The continuity rule: `D_after = D_before × MV_after / MV_before`.
 *
 * Applies to every maintenance event without exception — additions, deletions, resets, rights
 * issues, special dividends, share consideration in a merger, index-share rounding. The caller
 * decides what MV_after is; this decides nothing else.
 */
export function adjustedDivisor(
  divisorBefore: string,
  marketValueBefore: string,
  marketValueAfter: string,
): string {
  const d = parseDecimal(divisorBefore, "prior divisor");
  const before = parseDecimal(marketValueBefore, "market value before");
  const after = parseDecimal(marketValueAfter, "market value after");
  if (d <= 0n) throw new CalculationError("the prior divisor is not positive");
  if (before <= 0n) throw new CalculationError("the pre-event market value is not positive");
  if (after <= 0n) throw new CalculationError("the post-event market value is not positive");
  return render(div(mul(d, after), before));
}

/**
 * Index shares at a reset: `q_i = w_i × MV_s / (P_i,s × X_i,s)`.
 *
 * The parent supplies base weights; this turns them into quantities at the implementation close,
 * after which they are held fixed and weights drift. A security entering starts from q = 0 and a
 * security leaving ends at q = 0 — both are computed here as any other, since a zero weight
 * yields zero shares without a special case.
 */
export function resetIndexShares(
  baseWeight: string,
  marketValueAtReset: string,
  localPrice: string,
  fxRate: string,
): string {
  const w = parseDecimal(baseWeight, "base weight");
  const mv = parseDecimal(marketValueAtReset, "market value at reset");
  const p = parseDecimal(localPrice, "price at reset");
  const x = parseDecimal(fxRate, "FX at reset");
  if (p <= 0n || x <= 0n) throw new CalculationError("a reset needs a positive price and rate");
  if (w < 0n) throw new CalculationError("a base weight cannot be negative");
  return render(div(mul(w, mv), mul(p, x)));
}
