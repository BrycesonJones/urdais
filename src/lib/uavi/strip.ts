/**
 * One expiration's VIX-style term variance, from quotes alone.
 *
 *   σ²_j = (2 / T_j) × Σ_k [ (ΔK_k / K_k²) × e^(r_j T_j) × Q(K_k) ] − (1 / T_j) × (F_j / K0_j − 1)²
 *
 * Pure, synchronous, and deterministic: the same normalized quotes and the same rate produce the
 * same number, every time, with no clock read and no I/O anywhere in the file. That is what makes
 * the whole calculator testable without a data agreement, which matters because Urdais has none.
 *
 * **On arithmetic.** UGAI carries its level in exact-ratio integer arithmetic at a fixed scale,
 * because a price index compounds daily for years and accumulated double error becomes
 * unattributable. UAVI deliberately does not, and the reason is not convenience: the estimator
 * contains `exp` and `sqrt`, which have no exact rational representation, so exact arithmetic is
 * unavailable no matter how the rest is carried. Mixing an exact sum with an inexact square root
 * would buy nothing and hide where the inexactness lives. IEEE doubles are used throughout, no
 * value is rounded before publication, and the reproducibility claim rests on recording every
 * input — the strike set, each ΔK, each mid, the forward, K0, the rate and the minute count —
 * rather than on the arithmetic being exact. Every stage instead guards finiteness explicitly,
 * because the real risk here is not drift but a NaN reaching a published number.
 *
 * **On failure.** A strip either produces a variance or names the reason it did not, and there is
 * no third outcome. In particular there is no at-the-money fallback: where the strip fails, the
 * constituent is uncovered and its parent weight is published as uncovered weight. Substituting a
 * single option's implied volatility for a failed strip would produce a plausible number from an
 * entirely different estimator, which is the failure mode this module is shaped to prevent.
 */

import {
  MIN_OTM_CONTRACTS_PER_SIDE,
  N365,
  ZERO_BID_RUN_LENGTH,
} from "@/lib/uavi/parameters";
import { hasZeroBid, isValidQuote, quoteMid } from "@/lib/uavi/quotes";
import type { NormalizedOptionQuote, ResolvedRate } from "@/lib/uavi/types";

/** Why a strip produced no variance. Matches the database's own closed list. */
export type StripFailureReason =
  | "option_data_missing"
  | "invalid_forward"
  | "invalid_k0"
  | "insufficient_puts"
  | "insufficient_calls"
  | "invalid_atm_quotes"
  | "invalid_variance"
  | "adjusted_contract_only"
  | "rate_missing"
  | "reference_data_conflict";

/** One surviving strike's contribution to the sum. */
export type StripComponent = {
  strike: number;
  /** `put` below K0, `call` above it, `atm_average` at K0 where Q is the average of both mids. */
  leg: "put" | "call" | "atm_average";
  bid: number | null;
  ask: number | null;
  quoteMid: number;
  deltaK: number;
  /** `(ΔK / K²) × e^(rT) × Q(K)`, this strike's term of the sum. */
  contribution: number;
  contractSymbol: string | null;
  quoteTimestamp: string | null;
};

/** Everything a reviewer needs to reproduce a strip, whether or not it produced a variance. */
export type StripResult = {
  valid: boolean;
  failureReason: StripFailureReason | null;
  expirationDate: string;
  expirationTimestamp: string;
  minutesToExpiration: number;
  timeToExpiration: number;
  forward: number | null;
  k0: number | null;
  parityStrike: number | null;
  parityCallMid: number | null;
  parityPutMid: number | null;
  continuousRate: number | null;
  otmPutCount: number;
  otmCallCount: number;
  includedStrikeCount: number;
  termVariance: number | null;
  components: readonly StripComponent[];
};

export type StripInput = {
  expirationDate: string;
  expirationTimestamp: string;
  /** The official snapshot instant, already resolved through the named zone. */
  snapshotTimestamp: string;
  /** Quotes for this one expiration on one underlying. */
  quotes: readonly NormalizedOptionQuote[];
  /** Resolved and supplied. This module never obtains a rate of its own. */
  rate: ResolvedRate | null;
};

function fail(
  base: Omit<StripResult, "valid" | "failureReason">,
  reason: StripFailureReason,
): StripResult {
  return { ...base, valid: false, failureReason: reason };
}

/** A strike's two legs, as far as the chain supplies them. */
type StrikeRow = {
  strike: number;
  call: NormalizedOptionQuote | null;
  put: NormalizedOptionQuote | null;
};

/**
 * Index the chain by strike.
 *
 * A duplicated (strike, right) is a reference-data conflict and not something to resolve by
 * preferring one row: a duplicated strike would contribute its term twice and inflate the
 * variance by an amount nothing about the result would look wrong. The caller is told, and the
 * strip fails.
 */
function indexByStrike(quotes: readonly NormalizedOptionQuote[]): Map<number, StrikeRow> | null {
  const rows = new Map<number, StrikeRow>();
  for (const quote of quotes) {
    if (!Number.isFinite(quote.strike) || quote.strike <= 0) return null;
    const existing = rows.get(quote.strike) ?? { strike: quote.strike, call: null, put: null };
    if (quote.right === "call") {
      if (existing.call !== null) return null;
      existing.call = quote;
    } else {
      if (existing.put !== null) return null;
      existing.put = quote;
    }
    rows.set(quote.strike, existing);
  }
  return rows;
}

/**
 * Walk one wing outward from K0, applying the zero-bid truncation, and return what survives.
 *
 * The rule, in the order the methodology states it:
 *
 *   1. Moving outward, once two consecutive out-of-the-money contracts have zero bids, that
 *      contract and every contract further from K0 in that direction is excluded, including any
 *      with a non-zero bid.
 *   2. Any remaining contract without a valid quote is excluded.
 *   3. Any remaining contract with a zero bid is excluded.
 *
 * **An invalid quote interrupts the run rather than continuing it**, and that follows from the
 * text rather than from a preference. Step 1 operates on the full out-of-the-money sequence,
 * before step 2 has removed anything, and it counts contracts that "have zero bids". A contract
 * with a missing or crossed quote does not have a zero bid — it has no usable bid at all — so it
 * is not one of the two, and the run restarts after it. Reading it the other way would terminate
 * a wing on weaker evidence than the rule asks for, and would make the surviving set depend on
 * how a vendor happened to represent an absent side.
 *
 * Once a wing terminates nothing beyond it is reconsidered, which is the clause that makes the
 * rule a frontier rather than a filter: a live quote further out is deliberately discarded.
 */
function walkWing(
  rows: readonly StrikeRow[],
  right: "call" | "put",
): { surviving: { row: StrikeRow; quote: NormalizedOptionQuote; mid: number }[] } {
  const surviving: { row: StrikeRow; quote: NormalizedOptionQuote; mid: number }[] = [];
  let consecutiveZeroBids = 0;

  for (const row of rows) {
    const quote = right === "call" ? row.call : row.put;
    if (quote === null || !isValidQuote(quote)) {
      // Not a zero bid: no usable bid at all. The run restarts, and step 2 drops this contract.
      consecutiveZeroBids = 0;
      continue;
    }
    if (hasZeroBid(quote)) {
      consecutiveZeroBids += 1;
      if (consecutiveZeroBids >= ZERO_BID_RUN_LENGTH) break; // wing terminated; nothing beyond
      continue; // step 3 drops this one anyway
    }
    consecutiveZeroBids = 0;
    const mid = quoteMid(quote);
    if (mid === null || mid <= 0) continue;
    surviving.push({ row, quote, mid });
  }
  return { surviving };
}

/**
 * ΔK for an ordered strike set.
 *
 * Interior: half the distance between the neighbours on either side. At either end of the
 * *surviving* range: the simple difference to the single neighbour. Computed over the survivors
 * and not over the listed chain, because the methodology defines it that way and because a ΔK
 * measured across a truncated-away strike would weight a surviving strike by an interval no
 * surviving contract covers.
 *
 * A single-strike set has no neighbour and therefore no interval; it returns an empty result
 * rather than a fabricated width. In practice the 3-per-side minimum makes that unreachable, and
 * it is handled anyway because "unreachable" is a property of today's rules.
 */
export function deltaKs(strikes: readonly number[]): number[] {
  if (strikes.length < 2) return [];
  return strikes.map((strike, i) => {
    if (i === 0) return strikes[1]! - strike;
    if (i === strikes.length - 1) return strike - strikes[i - 1]!;
    return (strikes[i + 1]! - strikes[i - 1]!) / 2;
  });
}

/** Compute one expiration's term variance, or say why it could not be computed. */
export function computeStrip(input: StripInput): StripResult {
  const expiration = Date.parse(input.expirationTimestamp);
  const snapshot = Date.parse(input.snapshotTimestamp);
  const minutesToExpiration =
    Number.isFinite(expiration) && Number.isFinite(snapshot)
      ? (expiration - snapshot) / 60_000
      : Number.NaN;
  const timeToExpiration = minutesToExpiration / N365;

  const base: Omit<StripResult, "valid" | "failureReason"> = {
    expirationDate: input.expirationDate,
    expirationTimestamp: input.expirationTimestamp,
    minutesToExpiration,
    timeToExpiration,
    forward: null,
    k0: null,
    parityStrike: null,
    parityCallMid: null,
    parityPutMid: null,
    continuousRate: input.rate?.continuousRate ?? null,
    otmPutCount: 0,
    otmCallCount: 0,
    includedStrikeCount: 0,
    termVariance: null,
    components: [],
  };

  // A non-positive or non-finite time to expiration divides the whole formula. An already-expired
  // contract would give a negative T and a variance with the wrong sign, which is why this is
  // refused here rather than caught by the non-negativity check at the end.
  if (!Number.isFinite(minutesToExpiration) || minutesToExpiration <= 0) {
    return fail(base, "option_data_missing");
  }
  if (input.rate === null || !Number.isFinite(input.rate.continuousRate)) {
    return fail(base, "rate_missing");
  }
  const rate = input.rate.continuousRate;
  const discount = Math.exp(rate * timeToExpiration);
  if (!Number.isFinite(discount) || discount <= 0) return fail(base, "rate_missing");

  // Adjusted series are excluded outright. If nothing standard remains for this expiration the
  // strip cannot be built from unadjusted contracts, and the methodology prefers the temporary
  // coverage loss to a variance computed from a non-standard deliverable.
  const standard = input.quotes.filter((q) => q.seriesState === "standard");
  if (standard.length === 0) {
    return fail(base, input.quotes.length === 0 ? "option_data_missing" : "adjusted_contract_only");
  }

  // Look-ahead within the session. A quote current after the official instant did not exist at
  // the instant UAVI claims to measure, and the methodology refuses a strip depending on one
  // rather than tolerating it. Enforced here as well as by the database trigger, because the
  // calculator is the component that runs against fixtures and against a future vendor adapter,
  // and a guard that only exists at persistence is a guard the mathematics can be used without.
  if (standard.some((q) => Date.parse(q.quoteTimestamp) > snapshot)) {
    return fail(base, "reference_data_conflict");
  }

  const rows = indexByStrike(standard);
  if (rows === null) return fail(base, "reference_data_conflict");
  const ascending = [...rows.values()].sort((a, b) => a.strike - b.strike);
  if (ascending.length === 0) return fail(base, "option_data_missing");

  // ---- the implied forward, by put-call parity at the strike of minimum |C − P|.
  //
  // Never a spot price. The methodology requires the option-implied forward, and substituting
  // spot would move K0, change which contracts count as out of the money, and shift the
  // correction term — three errors that partly offset and never cancel.
  let parity: { strike: number; call: number; put: number } | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const row of ascending) {
    if (row.call === null || row.put === null) continue;
    const call = quoteMid(row.call);
    const put = quoteMid(row.put);
    if (call === null || put === null) continue;
    const gap = Math.abs(call - put);
    // Strictly less: ties resolve to the lowest strike, and `ascending` visits them in order.
    if (gap < bestGap) {
      bestGap = gap;
      parity = { strike: row.strike, call, put };
    }
  }
  if (parity === null) return fail(base, "invalid_forward");

  const forward = parity.strike + discount * (parity.call - parity.put);
  const withForward = {
    ...base,
    forward,
    parityStrike: parity.strike,
    parityCallMid: parity.call,
    parityPutMid: parity.put,
  };
  if (!Number.isFinite(forward) || forward <= 0) return fail(withForward, "invalid_forward");

  // ---- K0: the greatest listed strike at or below the forward.
  const atOrBelow = ascending.filter((row) => row.strike <= forward);
  const k0Row = atOrBelow[atOrBelow.length - 1];
  if (k0Row === undefined) return fail(withForward, "invalid_k0");
  const k0 = k0Row.strike;
  const withK0 = { ...withForward, k0 };

  // ---- the at-the-money term. Both legs must be valid: Q(K0) is their average, and an average
  // of one number is not what the formula says.
  const atmCall = k0Row.call === null ? null : quoteMid(k0Row.call);
  const atmPut = k0Row.put === null ? null : quoteMid(k0Row.put);
  if (atmCall === null || atmPut === null) return fail(withK0, "invalid_atm_quotes");
  const atmMid = (atmCall + atmPut) / 2;
  if (!Number.isFinite(atmMid) || atmMid <= 0) return fail(withK0, "invalid_atm_quotes");

  // ---- the two wings, traversed outward from K0 and truncated independently. Exhausting one
  // wing does not terminate the other.
  const putRows = ascending.filter((row) => row.strike < k0).reverse(); // outward: descending
  const callRows = ascending.filter((row) => row.strike > k0); // outward: ascending
  const puts = walkWing(putRows, "put").surviving;
  const calls = walkWing(callRows, "call").surviving;

  const withCounts = { ...withK0, otmPutCount: puts.length, otmCallCount: calls.length };
  if (puts.length < MIN_OTM_CONTRACTS_PER_SIDE) return fail(withCounts, "insufficient_puts");
  if (calls.length < MIN_OTM_CONTRACTS_PER_SIDE) return fail(withCounts, "insufficient_calls");

  // ---- the surviving strike set, ascending, with K0 between the wings.
  const legs: { strike: number; leg: StripComponent["leg"]; mid: number; quote: NormalizedOptionQuote | null }[] = [
    ...puts.map((p) => ({ strike: p.row.strike, leg: "put" as const, mid: p.mid, quote: p.quote })),
    { strike: k0, leg: "atm_average" as const, mid: atmMid, quote: null },
    ...calls.map((c) => ({ strike: c.row.strike, leg: "call" as const, mid: c.mid, quote: c.quote })),
  ].sort((a, b) => a.strike - b.strike);

  const strikes = legs.map((l) => l.strike);
  const widths = deltaKs(strikes);
  if (widths.length !== legs.length) return fail(withCounts, "invalid_variance");

  const components: StripComponent[] = [];
  let sum = 0;
  for (let i = 0; i < legs.length; i += 1) {
    const leg = legs[i]!;
    const deltaK = widths[i]!;
    // A non-positive ΔK means two strikes collided or arrived unsorted; either way the term is
    // meaningless and the whole strip is refused rather than the strike being skipped.
    if (!Number.isFinite(deltaK) || deltaK <= 0) return fail(withCounts, "invalid_variance");
    const contribution = (deltaK / (leg.strike * leg.strike)) * discount * leg.mid;
    if (!Number.isFinite(contribution)) return fail(withCounts, "invalid_variance");
    sum += contribution;
    components.push({
      strike: leg.strike,
      leg: leg.leg,
      bid: leg.quote?.bid ?? null,
      ask: leg.quote?.ask ?? null,
      quoteMid: leg.mid,
      deltaK,
      contribution,
      contractSymbol: leg.quote?.contractSymbol ?? null,
      quoteTimestamp: leg.quote?.quoteTimestamp ?? null,
    });
  }

  // ---- σ²_j = (2/T) Σ − (1/T)(F/K0 − 1)²
  const correction = forward / k0 - 1;
  const termVariance = (2 / timeToExpiration) * sum - (1 / timeToExpiration) * correction * correction;

  const withVariance = {
    ...withCounts,
    includedStrikeCount: components.length,
    components,
    termVariance,
  };

  // A negative variance is a data or calculation fault. It is never floored at zero: flooring
  // would turn a fault into a plausible reading of "no volatility", and the square root taken
  // later would otherwise return a non-real result.
  if (!Number.isFinite(termVariance) || termVariance < 0) {
    return fail({ ...withVariance, termVariance: null }, "invalid_variance");
  }

  return { ...withVariance, valid: true, failureReason: null };
}
