/**
 * The constant-30-day variance, interpolated in variance space.
 *
 *   σ²_i,30 = { T_1 σ²_1 [(N_2 − N30) / (N_2 − N_1)] + T_2 σ²_2 [(N30 − N_1) / (N_2 − N_1)] } × N365 / N30
 *
 * **Variance, never volatility.** Interpolating the two quoted volatilities directly gives a
 * number close enough to look right and wrong enough to never reproduce, and the methodology
 * forbids it in as many words: "quoted implied-volatility percentages are never interpolated".
 * The square root is applied once, afterwards, to the interpolated variance — and then once more
 * per constituent at aggregation, which is a different square root in a different place and is
 * the subject of `aggregate.ts`.
 *
 * Because selection guarantees `N_1 ≤ N30 < N_2`, both bracket weights lie in `[0, 1]` and the
 * result is genuinely an interpolation. The guard below re-checks that rather than assuming it:
 * the same expression outside the bracket is an extrapolation wearing the interpolation's
 * formula, and it would produce a number with no visible sign of being one.
 */

import { N30, N365 } from "@/lib/uavi/parameters";

export type InterpolationInput = {
  nearVariance: number;
  nextVariance: number;
  nearMinutes: number;
  nextMinutes: number;
};

export type InterpolationResult =
  | { ok: true; variance30: number; sigma30: number; nearWeight: number; nextWeight: number }
  | { ok: false; reason: "invalid_variance" };

export function interpolate30Day(input: InterpolationInput): InterpolationResult {
  const { nearVariance, nextVariance, nearMinutes, nextMinutes } = input;

  for (const value of [nearVariance, nextVariance, nearMinutes, nextMinutes]) {
    if (!Number.isFinite(value)) return { ok: false, reason: "invalid_variance" };
  }
  if (nearVariance < 0 || nextVariance < 0) return { ok: false, reason: "invalid_variance" };
  if (nearMinutes <= 0 || nextMinutes <= 0) return { ok: false, reason: "invalid_variance" };
  // Equal minute counts make the denominator zero. Two strips cannot share an expiration instant
  // and still be two terms, so this is a data fault rather than a degenerate but valid case.
  if (nextMinutes === nearMinutes) return { ok: false, reason: "invalid_variance" };
  // The bracket. Outside it the weights leave [0, 1] and this stops being an interpolation.
  if (!(nearMinutes <= N30 && nextMinutes > N30)) return { ok: false, reason: "invalid_variance" };

  const span = nextMinutes - nearMinutes;
  const nearWeight = (nextMinutes - N30) / span;
  const nextWeight = (N30 - nearMinutes) / span;

  const t1 = nearMinutes / N365;
  const t2 = nextMinutes / N365;
  const variance30 = (t1 * nearVariance * nearWeight + t2 * nextVariance * nextWeight) * (N365 / N30);

  if (!Number.isFinite(variance30) || variance30 < 0) return { ok: false, reason: "invalid_variance" };
  const sigma30 = Math.sqrt(variance30);
  if (!Number.isFinite(sigma30)) return { ok: false, reason: "invalid_variance" };

  return { ok: true, variance30, sigma30, nearWeight, nextWeight };
}
