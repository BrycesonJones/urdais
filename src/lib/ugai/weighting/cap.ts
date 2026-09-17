/**
 * Capped weights: `w_i = min(c, λ × M_i)` with `Σ w_i = 1`.
 *
 * The methodology states the allocation in closed form and then states the procedure that
 * reaches it: "cap overweight issuers and repeatedly redistribute excess in proportion to
 * uncapped capitalization until the constraints hold. The resulting weights are unique when
 * feasible, including the boundary where all issuers are capped."
 *
 * Repeatedly is the operative word. One pass is not enough, because redistributing the excess
 * from a capped issuer raises everyone else — and can push the next-largest above the cap in
 * turn. A single-pass implementation produces weights that satisfy nothing and look plausible.
 *
 * Arithmetic is exact-ratio integer arithmetic at a fixed scale, not floating point. Weights are
 * a shared denominator problem and IEEE-754 does not have one: accumulating thirty divisions in
 * doubles leaves a residual that someone is then tempted to dump on the largest constituent. The
 * methodology forbids display rounding from becoming the next calculation's input, and the
 * cheapest way to honour that is never to round at all until publication.
 */

export class WeightingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeightingError";
  }
}

/** Scale for stored weights and intermediate ratios: 1 unit = 1e-30. */
export const WEIGHT_SCALE = 30n;
const ONE = 10n ** WEIGHT_SCALE;

export type CapInput = {
  issuerId: string;
  /** Accessible free-float market capitalization in the base currency, as a decimal string. */
  marketCapUsd: string;
};

export type CapOutcome = {
  feasible: boolean;
  /** Present only when feasible. */
  weights: { issuerId: string; uncappedWeight: string; cappedWeight: string; capBound: boolean }[];
  /** How many redistribution passes were needed. Recorded because one is rarely enough. */
  iterations: number;
  reason: string | null;
};

function parseDecimal(literal: string, context: string): bigint {
  const value = literal.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new WeightingError(`${context}: '${literal}' is not a decimal literal`);
  }
  const [whole = "0", fraction = ""] = value.split(".");
  if (fraction.length > Number(WEIGHT_SCALE)) {
    throw new WeightingError(`${context}: '${literal}' exceeds the weighting scale`);
  }
  return BigInt(whole + fraction.padEnd(Number(WEIGHT_SCALE), "0"));
}

function render(scaled: bigint): string {
  const whole = scaled / ONE;
  const fraction = (scaled % ONE).toString().padStart(Number(WEIGHT_SCALE), "0").replace(/0+$/, "");
  return fraction === "" ? whole.toString() : `${whole}.${fraction}`;
}

/**
 * Apply the issuer cap.
 *
 * Returns infeasible rather than throwing for the two cases the methodology names, because both
 * are ordinary outcomes a snapshot has to record and publish a reason for: an empty or
 * non-positively-capitalized universe, and `n × c < 1`.
 */
export function applyIssuerCap(inputs: readonly CapInput[], capLiteral: string): CapOutcome {
  const cap = parseDecimal(capLiteral, "issuer cap");
  if (cap <= 0n || cap > ONE) {
    throw new WeightingError(`the issuer cap must satisfy 0 < c <= 1, got ${capLiteral}`);
  }

  const seen = new Set<string>();
  const caps = inputs.map((i) => {
    if (seen.has(i.issuerId)) {
      // One issuer, one membership, one weight. A duplicate here would mean a dual listing had
      // become two memberships upstream, and silently summing them would hide that.
      throw new WeightingError(`issuer ${i.issuerId} appears twice in one weighting`);
    }
    seen.add(i.issuerId);
    const m = parseDecimal(i.marketCapUsd, `market cap for ${i.issuerId}`);
    if (m <= 0n) throw new WeightingError(`issuer ${i.issuerId} has non-positive capitalization`);
    return { issuerId: i.issuerId, m };
  });

  if (caps.length === 0) {
    return { feasible: false, weights: [], iterations: 0, reason: "The universe is empty and has no valid weight vector." };
  }

  const n = BigInt(caps.length);
  // n × c >= 1 is necessary. Below it no capped allocation can sum to one, and the methodology is
  // explicit that the answer is to withhold the snapshot rather than relax the cap, add ineligible
  // companies, or fall back to equal weights.
  if (n * cap < ONE) {
    return {
      feasible: false,
      weights: [],
      iterations: 0,
      reason: `Cap infeasible: ${caps.length} issuers at a cap of ${capLiteral} can carry at most ${render(n * cap)} of the allocation. Withhold the snapshot; do not relax the cap.`,
    };
  }

  const total = caps.reduce((acc, c) => acc + c.m, 0n);
  const uncapped = new Map(caps.map((c) => [c.issuerId, (c.m * ONE) / total]));

  const bound = new Set<string>();
  let iterations = 0;
  for (;;) {
    iterations += 1;
    // Mass left for the uncapped, after the bound issuers take exactly c each.
    const remaining = ONE - BigInt(bound.size) * cap;
    const freeTotal = caps.filter((c) => !bound.has(c.issuerId)).reduce((acc, c) => acc + c.m, 0n);

    if (freeTotal === 0n) {
      // Everyone is capped. Feasible only at the exact boundary n × c = 1, which the methodology
      // names as a valid case.
      if (remaining !== 0n) {
        return {
          feasible: false,
          weights: [],
          iterations,
          reason: `Every issuer is at the cap and the allocation sums to ${render(BigInt(bound.size) * cap)} rather than 1.`,
        };
      }
      break;
    }

    const newlyBound = caps.filter(
      (c) => !bound.has(c.issuerId) && (remaining * c.m) / freeTotal > cap,
    );
    if (newlyBound.length === 0) break;
    for (const c of newlyBound) bound.add(c.issuerId);
    if (iterations > caps.length + 1) {
      throw new WeightingError("cap redistribution did not converge within n + 1 passes");
    }
  }

  const remaining = ONE - BigInt(bound.size) * cap;
  const freeTotal = caps.filter((c) => !bound.has(c.issuerId)).reduce((acc, c) => acc + c.m, 0n);

  const weights = caps.map((c) => ({
    issuerId: c.issuerId,
    m: c.m,
    capBound: bound.has(c.issuerId),
    w: bound.has(c.issuerId) ? cap : (remaining * c.m) / freeTotal,
  }));

  // Integer division truncates, so the parts can sum a few units of the last place below one.
  // The residual is distributed one unit at a time to the uncapped issuers with the largest
  // truncated remainders — the standard largest-remainder allocation. It is deterministic, it
  // cannot push anyone past the cap, and it is not "give the rounding error to the biggest
  // constituent", which the methodology does not define and which would be arbitrary.
  let residual = ONE - weights.reduce((acc, w) => acc + w.w, 0n);
  if (residual > 0n) {
    const candidates = weights
      .filter((w) => !w.capBound)
      .map((w) => ({ w, remainder: (remaining * w.m) % freeTotal }))
      .sort((a, b) => (b.remainder === a.remainder ? a.w.issuerId.localeCompare(b.w.issuerId) : b.remainder > a.remainder ? 1 : -1));
    for (let i = 0; residual > 0n && candidates.length > 0; i += 1) {
      const target = candidates[i % candidates.length]!;
      if (target.w.w + 1n <= cap) {
        target.w.w += 1n;
        residual -= 1n;
      } else if (candidates.every((c) => c.w.w + 1n > cap)) {
        break;
      }
    }
  }

  return {
    feasible: true,
    iterations,
    reason: null,
    weights: weights.map((w) => ({
      issuerId: w.issuerId,
      uncappedWeight: render(uncapped.get(w.issuerId)!),
      cappedWeight: render(w.w),
      capBound: w.capBound,
    })),
  };
}

/** Exact sum of a weight vector, for assertions. Returns a decimal string. */
export function sumWeights(weights: readonly { cappedWeight: string }[]): string {
  return render(weights.reduce((acc, w) => acc + parseDecimal(w.cappedWeight, "weight"), 0n));
}
