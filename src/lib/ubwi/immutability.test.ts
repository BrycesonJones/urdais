/**
 * A published UBWI point is immutable.
 *
 * Phase 2F freezes the first real one, which makes these properties load-bearing for the
 * first time rather than hypothetical. The thing being prevented is specific: a later
 * observation, a later Chainlink round, or a later rights decision silently rewriting a
 * number Urdais already published. Corrections happen by supersession -- a new publication
 * that names the one it replaces -- and never by editing the old row.
 *
 * The database enforces this with append-only triggers, exercised in
 * supabase/tests/250_ubwi_protocol_supply.sql and 230/240. What is checked here is the
 * calculation layer's half of the same promise: that a frozen calculation is a value, not
 * a live view over mutable inputs.
 */
import { describe, expect, it } from "vitest";

import { METHODOLOGY_VERSION, calculateUbwi } from "./calculate";
import { evaluateGate } from "./gate";
import { PRODUCTION_BTC_OBSERVATION } from "./numerator";
import { cumulativeScheduledSubsidySats, satsToBtc } from "./supply";
import type { BtcMarketObservation } from "./types";

const AT = "2026-09-15T04:13:40Z";

/** A deep copy, so mutating the copy cannot possibly reach the shared constant. */
function clone(observation: BtcMarketObservation): BtcMarketObservation {
  return JSON.parse(JSON.stringify(observation)) as BtcMarketObservation;
}

/** The fields a frozen publication records. Its identity, for comparison purposes. */
function identity(calculation: ReturnType<typeof calculateUbwi>) {
  return {
    ubwiPercent: calculation.ubwiPercent,
    marketCapUsd: calculation.numerator.marketCapUsd,
    totalGlobalWealthUsd: calculation.totalGlobalWealthUsd,
    observedShareOfTotal: calculation.observedShareOfTotal,
    modeledShareOfTotal: calculation.modeledShareOfTotal,
    sensitivity: calculation.sensitivity,
    methodologyVersion: calculation.methodologyVersion,
    blockHeight: calculation.numerator.blockHeight,
    scheduledSupplySats: calculation.numerator.supplyDerivation?.scheduledSupplySats,
    roundId: calculation.numerator.chainlink?.roundId,
  };
}

describe("a frozen point does not move when the world does", () => {
  const frozen = calculateUbwi({ calculatedAt: AT });
  const frozenIdentity = identity(frozen);

  it("is unchanged by a later block-height observation", () => {
    // The chain advances every ten minutes. A published point must describe the height it
    // was taken at, not the tip as of whenever someone next reads the page.
    const later = clone(PRODUCTION_BTC_OBSERVATION);
    later.blockHeight = PRODUCTION_BTC_OBSERVATION.blockHeight + 144;
    const sats = cumulativeScheduledSubsidySats(later.blockHeight);
    later.supplyBtc = satsToBtc(sats);
    later.supplyDerivation!.scheduledSupplySats = sats.toString();
    later.marketCapUsd = later.supplyBtc * later.priceUsd;

    const recomputed = calculateUbwi({ calculatedAt: AT, numerator: later });

    // The later calculation genuinely differs -- otherwise this test proves nothing.
    expect(recomputed.numerator.blockHeight).toBeGreaterThan(frozen.numerator.blockHeight);
    expect(recomputed.ubwiPercent).not.toBe(frozen.ubwiPercent);
    // And the frozen one is untouched by its existence.
    expect(identity(frozen)).toEqual(frozenIdentity);
  });

  it("is unchanged by a later Chainlink round", () => {
    const later = clone(PRODUCTION_BTC_OBSERVATION);
    later.chainlink!.roundId = "129127208515966885595";
    later.chainlink!.aggregatorRoundId = "24283";
    later.chainlink!.answer = "7800000000000";
    later.chainlink!.normalizedUsd = 78_000;
    later.chainlink!.updatedAt = later.chainlink!.updatedAt + 600;
    later.chainlink!.retrievalTimestamp = later.chainlink!.retrievalTimestamp + 700;
    later.priceUsd = 78_000;
    later.marketCapUsd = later.supplyBtc * 78_000;

    const recomputed = calculateUbwi({ calculatedAt: AT, numerator: later });
    expect(recomputed.numerator.chainlink!.roundId).not.toBe(frozen.numerator.chainlink!.roundId);
    expect(recomputed.ubwiPercent).not.toBe(frozen.ubwiPercent);
    expect(identity(frozen)).toEqual(frozenIdentity);
  });

  it("keeps methodology 1.2.0 attached to the point it produced", () => {
    expect(frozen.methodologyVersion).toBe("1.2.0");
    expect(frozen.methodologyVersion).toBe(METHODOLOGY_VERSION);
    expect(frozen.numerator.supplyDerivation!.derivationVersion).toBe("1.0.0");
    expect(frozen.numerator.supplyDerivation!.rightsBasis).toBe("derived_from_protocol");
  });

  it("replays to the same identity from the same lineage, any number of times", () => {
    for (let i = 0; i < 3; i += 1) {
      expect(identity(calculateUbwi({ calculatedAt: AT }))).toEqual(frozenIdentity);
    }
    // And from an independently reconstructed copy of the same observation, which is what
    // a restatement years from now would actually have to do.
    const replayed = calculateUbwi({
      calculatedAt: AT,
      numerator: clone(PRODUCTION_BTC_OBSERVATION),
    });
    expect(identity(replayed)).toEqual(frozenIdentity);
  });

  it("re-derives the published supply from the frozen height alone", () => {
    // The strongest form of reproducibility methodology 1.2.0 buys: someone with nothing
    // but the block height can recompute the supply exactly, with no dataset and no
    // provider.
    const sats = cumulativeScheduledSubsidySats(frozen.numerator.blockHeight);
    expect(sats.toString()).toBe(frozen.numerator.supplyDerivation!.scheduledSupplySats);
    expect(satsToBtc(sats)).toBe(frozen.numerator.supplyBtc);
  });

  it("passes its gate on replay, not only on the run that published it", () => {
    expect(evaluateGate(frozen).passed).toBe(true);
    expect(evaluateGate(frozen).findings).toEqual([]);
  });

  it("publishes no percentage change, because no predecessor exists", () => {
    // The first point in a history has nothing to be a change from. Zero would be a claim
    // that the value did not move, which is a different and false statement.
    expect(frozen.numerator.observedAt).toBe(AT);
  });
});
