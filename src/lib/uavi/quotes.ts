/**
 * Quote validity and the midpoint.
 *
 * The predicate is small and the reasoning around it is not, so it is worth stating once:
 *
 *   `ask > 0` and `ask ≥ bid`
 *
 * **A locked market is valid. Only a crossed market is rejected.** A locked market is one where
 * `ask === bid`; it satisfies `ask ≥ bid` exactly. A crossed market is `ask < bid`, and fails.
 *
 * This is stated explicitly because the instruction "reject locked and crossed markets" is a
 * common one and contradicts the `ask ≥ bid` predicate given alongside it. The cited source
 * settles it: the constituent-volatility methodology UAVI adopts this from defines a valid quote
 * as "a two-sided quote whose ask is non-zero and at least the bid", and names crossed quotes as
 * invalid while saying nothing about locked ones. A locked market is an unusually *tight* quote
 * rather than a malformed one, and its midpoint equals both sides, making it the least ambiguous
 * mid in the strip. Discarding it would delete the best-priced contracts in the book.
 *
 * Zero bids are a separate matter and are handled in the strip, not here. A zero-bid quote is
 * *valid* — it is two-sided and uncrossed — and is excluded from the final strike set by the
 * wing-truncation rules. The two must not be collapsed: the truncation rule counts consecutive
 * zero-bid contracts, and it can only do that if a zero-bid contract is still a quote.
 */

import type { NormalizedOptionQuote } from "@/lib/uavi/types";

/** Whether a number is a usable price: present, finite, and not NaN. */
function isFinitePrice(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * The valid-quote predicate.
 *
 * Both sides present and finite, a strictly positive ask, and an ask at or above the bid. A
 * negative bid fails too: it is not a price, and admitting one would drag a midpoint below zero.
 */
export function isValidQuote(quote: Pick<NormalizedOptionQuote, "bid" | "ask">): boolean {
  if (!isFinitePrice(quote.bid) || !isFinitePrice(quote.ask)) return false;
  if (quote.bid < 0) return false;
  if (quote.ask <= 0) return false;
  return quote.ask >= quote.bid;
}

/** Whether a valid quote is locked: `ask === bid`. Valid, and named so a reader can check. */
export function isLockedQuote(quote: Pick<NormalizedOptionQuote, "bid" | "ask">): boolean {
  return isValidQuote(quote) && quote.ask === quote.bid;
}

/** Whether a quote is crossed: `ask < bid`. Always invalid. */
export function isCrossedQuote(quote: Pick<NormalizedOptionQuote, "bid" | "ask">): boolean {
  if (!isFinitePrice(quote.bid) || !isFinitePrice(quote.ask)) return false;
  return quote.ask < quote.bid;
}

/** Whether a valid quote carries a zero bid. Valid, and excluded from the final strike set. */
export function hasZeroBid(quote: Pick<NormalizedOptionQuote, "bid" | "ask">): boolean {
  return isValidQuote(quote) && quote.bid === 0;
}

/**
 * `Q(K) = (bid + ask) / 2`.
 *
 * Returns null for an invalid quote rather than throwing, because "this contract has no usable
 * mid" is an ordinary outcome that the strip handles, not an exceptional one.
 */
export function quoteMid(quote: Pick<NormalizedOptionQuote, "bid" | "ask">): number | null {
  if (!isValidQuote(quote)) return null;
  const mid = (quote.bid! + quote.ask!) / 2;
  return Number.isFinite(mid) ? mid : null;
}
