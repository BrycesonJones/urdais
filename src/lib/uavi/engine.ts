/**
 * One UAVI session, end to end, as a pure function.
 *
 * Takes a parent weight vector, the volatility-instrument mappings, normalized option chains and
 * a rate resolver; returns a constituent result for every parent member and a headline or the
 * structured reason there is none. No clock is read, no network is touched, and nothing is
 * persisted: the same inputs produce the same output, which is the whole of the idempotency
 * requirement expressed as a property of the function rather than as a convention around it.
 *
 * The order is the methodology's own and the sequence matters. Membership and weights come first
 * and are validated before anything is computed from them; only then is each member assessed
 * against option data; only then is coverage measured; only then are the gates applied. Assessing
 * option data first would invite the natural shortcut of measuring coverage over the members that
 * happened to have data, which is a different denominator and a flattering one.
 *
 * What this function never does: fill a missing constituent volatility from the previous session,
 * fall back to an at-the-money implied volatility when a strip fails, substitute a related
 * security for an instrument that has no options, or return a headline from a residual set. Each
 * of those produces a plausible number, and a plausible number is worse than no number because
 * nobody downstream checks it.
 */

import {
  aggregate,
  type AggregationConstituent,
  type AggregationResult,
} from "@/lib/uavi/aggregate";
import { selectExpirations, type ExpirationCandidate } from "@/lib/uavi/expiration";
import {
  selectVolatilityInstrument,
  type VolatilityInstrumentMapping,
} from "@/lib/uavi/instrument";
import { interpolate30Day } from "@/lib/uavi/interpolate";
import type { UncoveredReason } from "@/lib/uavi/parameters";
import { computeStrip, type StripResult } from "@/lib/uavi/strip";
import type { OptionChainSnapshot, RateResolver } from "@/lib/uavi/types";

/** One parent member, with the weight the parent snapshot gave it. */
export type ParentConstituent = {
  issuerId: string;
  parentWeight: number;
};

export type ConstituentOutcome = {
  issuerId: string;
  parentWeight: number;
  covered: boolean;
  uncoveredReason: UncoveredReason | null;
  volatilityInstrumentId: string | null;
  volatilitySecurityId: string | null;
  mappingType: "representative" | "adr" | null;
  sigma30: number | null;
  variance30: number | null;
  nearStrip: StripResult | null;
  nextStrip: StripResult | null;
};

export type SessionInput = {
  sessionDate: string;
  /** The official instant, resolved through the named zone for this session date. */
  snapshotTimestamp: string;
  /** The canonical parent base weights. Inherited, never recomputed. */
  parentConstituents: readonly ParentConstituent[];
  /** Every candidate mapping, for every issuer. Ranked selection happens here. */
  mappings: readonly VolatilityInstrumentMapping[];
  /** Normalized chains, keyed by the underlying security they are written on. */
  chains: ReadonlyMap<string, OptionChainSnapshot>;
  rates: RateResolver;
};

export type SessionResult = {
  sessionDate: string;
  snapshotTimestamp: string;
  constituents: readonly ConstituentOutcome[];
  aggregation: AggregationResult;
};

function uncovered(
  member: ParentConstituent,
  reason: UncoveredReason,
  partial: Partial<ConstituentOutcome> = {},
): ConstituentOutcome {
  return {
    issuerId: member.issuerId,
    parentWeight: member.parentWeight,
    covered: false,
    uncoveredReason: reason,
    volatilityInstrumentId: null,
    volatilitySecurityId: null,
    mappingType: null,
    sigma30: null,
    variance30: null,
    nearStrip: null,
    nextStrip: null,
    ...partial,
  };
}

/** Distinct expirations present in a chain, with the series flag the venue gave them. */
function expirationCandidates(chain: OptionChainSnapshot): ExpirationCandidate[] {
  const seen = new Map<string, ExpirationCandidate>();
  for (const quote of chain.quotes) {
    if (quote.seriesState !== "standard") continue;
    if (seen.has(quote.expirationTimestamp)) continue;
    seen.set(quote.expirationTimestamp, {
      expirationDate: quote.expirationDate,
      expirationTimestamp: quote.expirationTimestamp,
      isStandardExpiration: quote.isStandardExpiration,
    });
  }
  return [...seen.values()];
}

/** Compute one issuer's 30-day volatility, or the reason it has none. */
function computeConstituent(
  member: ParentConstituent,
  input: SessionInput,
): ConstituentOutcome {
  // The waterfall. A candidate qualifies only if a chain exists for its security and that chain
  // yields a bracketing expiration pair; anything less and the next-ranked candidate is tried.
  const selection = selectVolatilityInstrument(member.issuerId, input.mappings, (mapping) => {
    const chain = input.chains.get(mapping.volatilitySecurityId);
    if (chain === undefined || chain.quotes.length === 0) return false;
    return selectExpirations(expirationCandidates(chain), input.snapshotTimestamp).selected;
  });
  if (!selection.selected) {
    // Distinguish "no mapping we could use at all" from "a mapping exists but has no data", since
    // the first is a reference-data gap and the second is a market or licensing gap.
    const anyMapping = input.mappings.some((m) => m.issuerId === member.issuerId);
    return uncovered(member, anyMapping ? "option_data_missing" : "no_volatility_instrument");
  }

  const mapping = selection.mapping;
  const identity = {
    volatilityInstrumentId: mapping.id,
    volatilitySecurityId: mapping.volatilitySecurityId,
    mappingType: mapping.mappingType,
  };
  const chain = input.chains.get(mapping.volatilitySecurityId);
  if (chain === undefined) return uncovered(member, "option_data_missing", identity);
  // Cross-session leakage. A chain carrying another session's date or another instant's snapshot
  // would produce an entirely plausible variance from the wrong day's market, and nothing
  // downstream would notice: the strip arithmetic does not know what day it is. Refused rather
  // than trusted, because the chains arrive from an adapter and a caller assembling them by
  // security id could reuse a cached one without meaning to.
  if (chain.sessionDate !== input.sessionDate) {
    return uncovered(member, "reference_data_conflict", identity);
  }
  if (chain.snapshotTimestamp !== input.snapshotTimestamp) {
    return uncovered(member, "reference_data_conflict", identity);
  }

  const expirations = selectExpirations(expirationCandidates(chain), input.snapshotTimestamp);
  if (!expirations.selected) return uncovered(member, expirations.reason, identity);

  const strips = ([expirations.near, expirations.next] as const).map((term) =>
    computeStrip({
      expirationDate: term.expirationDate,
      expirationTimestamp: term.expirationTimestamp,
      snapshotTimestamp: input.snapshotTimestamp,
      quotes: chain.quotes.filter((q) => q.expirationTimestamp === term.expirationTimestamp),
      rate: input.rates(term.expirationTimestamp),
    }),
  );
  const [nearStrip, nextStrip] = strips as [StripResult, StripResult];
  const withStrips = { ...identity, nearStrip, nextStrip };

  // Either strip failing makes the issuer uncovered. There is no fallback to the surviving strip:
  // one term's variance relabelled as a 30-day figure is a different estimator, and the term
  // structure the interpolation exists for is exactly what would be discarded.
  if (!nearStrip.valid) {
    return uncovered(member, nearStrip.failureReason ?? "invalid_variance", withStrips);
  }
  if (!nextStrip.valid) {
    return uncovered(member, nextStrip.failureReason ?? "invalid_variance", withStrips);
  }

  const interpolated = interpolate30Day({
    nearVariance: nearStrip.termVariance!,
    nextVariance: nextStrip.termVariance!,
    nearMinutes: nearStrip.minutesToExpiration,
    nextMinutes: nextStrip.minutesToExpiration,
  });
  if (!interpolated.ok) return uncovered(member, interpolated.reason, withStrips);

  return {
    issuerId: member.issuerId,
    parentWeight: member.parentWeight,
    covered: true,
    uncoveredReason: null,
    ...identity,
    sigma30: interpolated.sigma30,
    variance30: interpolated.variance30,
    nearStrip,
    nextStrip,
  };
}

/** Run one session. */
export function calculateSession(input: SessionInput): SessionResult {
  const constituents = input.parentConstituents.map((member) => computeConstituent(member, input));

  const forAggregation: AggregationConstituent[] = constituents.map((c) => ({
    issuerId: c.issuerId,
    parentWeight: c.parentWeight,
    sigma30: c.covered ? c.sigma30 : null,
  }));

  return {
    sessionDate: input.sessionDate,
    snapshotTimestamp: input.snapshotTimestamp,
    constituents,
    aggregation: aggregate(forAggregation),
  };
}
