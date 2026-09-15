/**
 * Tests for the protocol-derived BTC supply leg.
 *
 * Every expected value here is derived from the Bitcoin issuance schedule itself, by
 * arithmetic stated in the test. Nothing is copied from blockchain.info, from a block
 * explorer, or from any other third-party supply dataset -- that is the whole point of
 * methodology 1.2.0, and a test that took its expectations from the retired source would
 * quietly reintroduce the dependency the phase exists to remove.
 *
 * Where a boundary value is checked against a closed form, the closed form is written out
 * independently rather than by calling the implementation, so the test can actually fail.
 */
import { describe, expect, it } from "vitest";

import {
  FIRST_ZERO_SUBSIDY_ERA,
  FIRST_ZERO_SUBSIDY_HEIGHT,
  HALVING_INTERVAL_BLOCKS,
  INITIAL_BLOCK_SUBSIDY_SATS,
  MAX_MONEY_SATS,
  MAX_SCHEDULED_SUPPLY_SATS,
  SATS_PER_BTC,
  SupplyDerivationError,
  blockSubsidySats,
  cumulativeScheduledSubsidySats,
  deriveScheduledSupply,
  halvingEra,
  satsToBtc,
} from "./supply";

/**
 * An independent reference implementation: sum block by block, with no era algebra at
 * all. Deliberately the slowest possible way to compute this, so that it shares no
 * reasoning with the implementation under test beyond the protocol rule itself. Only
 * usable over small heights, which is exactly where the boundaries live.
 */
function naiveCumulativeSats(height: number): bigint {
  let total = 0n;
  for (let h = 0; h <= height; h += 1) {
    const era = Math.floor(h / HALVING_INTERVAL_BLOCKS);
    total += era >= FIRST_ZERO_SUBSIDY_ERA ? 0n : INITIAL_BLOCK_SUBSIDY_SATS >> BigInt(era);
  }
  return total;
}

describe("the issuance schedule's constants", () => {
  it("starts at 50 BTC and halves every 210,000 blocks", () => {
    expect(INITIAL_BLOCK_SUBSIDY_SATS).toBe(5_000_000_000n);
    expect(INITIAL_BLOCK_SUBSIDY_SATS / SATS_PER_BTC).toBe(50n);
    expect(HALVING_INTERVAL_BLOCKS).toBe(210_000);
  });

  it("truncates to zero subsidy at era 33, because 2**32 < 5e9 < 2**33", () => {
    // Stated as the inequality that actually decides it, not as a remembered constant.
    expect(2n ** 32n).toBeLessThan(INITIAL_BLOCK_SUBSIDY_SATS);
    expect(INITIAL_BLOCK_SUBSIDY_SATS).toBeLessThan(2n ** 33n);
    expect(INITIAL_BLOCK_SUBSIDY_SATS >> 32n).toBe(1n);
    expect(INITIAL_BLOCK_SUBSIDY_SATS >> 33n).toBe(0n);
    expect(FIRST_ZERO_SUBSIDY_ERA).toBe(33);
    expect(FIRST_ZERO_SUBSIDY_HEIGHT).toBe(6_930_000);
  });
});

describe("genesis and the inclusive-height convention", () => {
  it("counts the genesis block: height 0 is one block's subsidy, not zero", () => {
    expect(halvingEra(0)).toBe(0);
    expect(blockSubsidySats(0)).toBe(5_000_000_000n);
    expect(cumulativeScheduledSubsidySats(0)).toBe(5_000_000_000n);
    expect(satsToBtc(cumulativeScheduledSubsidySats(0))).toBe(50);
  });

  it("height 1 is two blocks' subsidy", () => {
    expect(cumulativeScheduledSubsidySats(1)).toBe(10_000_000_000n);
    expect(satsToBtc(cumulativeScheduledSubsidySats(1))).toBe(100);
  });

  it("each successive height adds exactly that block's subsidy", () => {
    for (const h of [0, 1, 2, 100, 209_998, 209_999, 210_000, 419_999, 420_000]) {
      const step = cumulativeScheduledSubsidySats(h + 1) - cumulativeScheduledSubsidySats(h);
      expect(step).toBe(blockSubsidySats(h + 1));
    }
  });
});

describe("halving boundaries", () => {
  // Every boundary the brief names, plus the whole of the first two eras' edges.
  const boundaries = [
    0, 1, 209_999, 210_000, 210_001, 419_999, 420_000, 420_001, 629_999, 630_000, 630_001,
    839_999, 840_000, 840_001, 1_049_999, 1_050_000, 1_050_001,
  ];

  it("the subsidy halves exactly on the boundary block, never one block early or late", () => {
    for (const era of [1, 2, 3, 4, 5]) {
      const boundary = era * HALVING_INTERVAL_BLOCKS;
      expect(blockSubsidySats(boundary - 1)).toBe(INITIAL_BLOCK_SUBSIDY_SATS >> BigInt(era - 1));
      expect(blockSubsidySats(boundary)).toBe(INITIAL_BLOCK_SUBSIDY_SATS >> BigInt(era));
      expect(blockSubsidySats(boundary) * 2n).toBe(blockSubsidySats(boundary - 1));
    }
  });

  it("cumulative supply at each boundary matches a block-by-block summation", () => {
    for (const h of boundaries) {
      expect(cumulativeScheduledSubsidySats(h)).toBe(naiveCumulativeSats(h));
    }
  });

  it("the last block of era n closes that era at a round number of BTC", () => {
    // Closed form, written out independently: eras 0..n-1 complete means
    // 210_000 * 50 * (2 - 2**-(n-1)) BTC, i.e. 210_000 * (sum of the halving series).
    const cases: Array<[number, number]> = [
      [0, 210_000 * 50],
      [1, 210_000 * (50 + 25)],
      [2, 210_000 * (50 + 25 + 12.5)],
      [3, 210_000 * (50 + 25 + 12.5 + 6.25)],
    ];
    for (const [era, expectedBtc] of cases) {
      const lastHeightOfEra = (era + 1) * HALVING_INTERVAL_BLOCKS - 1;
      expect(satsToBtc(cumulativeScheduledSubsidySats(lastHeightOfEra))).toBe(expectedBtc);
    }
    // The four completed eras above are 19,687,500 BTC. Stated so the number is legible.
    expect(satsToBtc(cumulativeScheduledSubsidySats(839_999))).toBe(19_687_500);
  });
});

describe("the final non-zero era and the first zero era", () => {
  it("era 32 pays exactly one satoshi per block", () => {
    const era32Start = 32 * HALVING_INTERVAL_BLOCKS;
    expect(blockSubsidySats(era32Start)).toBe(1n);
    expect(blockSubsidySats(era32Start + 12_345)).toBe(1n);
    expect(blockSubsidySats(FIRST_ZERO_SUBSIDY_HEIGHT - 1)).toBe(1n);
  });

  it("era 33 onward pays nothing, and supply stops growing forever", () => {
    expect(blockSubsidySats(FIRST_ZERO_SUBSIDY_HEIGHT)).toBe(0n);
    expect(blockSubsidySats(FIRST_ZERO_SUBSIDY_HEIGHT + 1)).toBe(0n);
    expect(blockSubsidySats(50_000_000)).toBe(0n);

    const terminal = cumulativeScheduledSubsidySats(FIRST_ZERO_SUBSIDY_HEIGHT - 1);
    expect(cumulativeScheduledSubsidySats(FIRST_ZERO_SUBSIDY_HEIGHT)).toBe(terminal);
    expect(cumulativeScheduledSubsidySats(FIRST_ZERO_SUBSIDY_HEIGHT + 1_000_000)).toBe(terminal);
    expect(cumulativeScheduledSubsidySats(1_000_000_000)).toBe(terminal);
  });

  it("the terminal supply is the full halving series and sits strictly below 21,000,000", () => {
    // Independent closed form: sum over eras of 210_000 * floor(5e9 / 2**e).
    let expected = 0n;
    for (let e = 0; e < FIRST_ZERO_SUBSIDY_ERA; e += 1) {
      expected += BigInt(HALVING_INTERVAL_BLOCKS) * (INITIAL_BLOCK_SUBSIDY_SATS >> BigInt(e));
    }
    expect(MAX_SCHEDULED_SUPPLY_SATS).toBe(expected);
    expect(MAX_SCHEDULED_SUPPLY_SATS).toBe(2_099_999_997_690_000n);
    expect(satsToBtc(MAX_SCHEDULED_SUPPLY_SATS)).toBeCloseTo(20_999_999.9769, 4);
    // Integer truncation of the halving series is why it never reaches the nominal cap.
    expect(MAX_SCHEDULED_SUPPLY_SATS).toBeLessThan(MAX_MONEY_SATS);
    expect(MAX_MONEY_SATS - MAX_SCHEDULED_SUPPLY_SATS).toBe(2_310_000n);
  });
});

describe("invariants", () => {
  const heights = [
    0, 1, 2, 209_999, 210_000, 420_000, 630_000, 840_000, 967_000, 1_050_000, 2_100_000,
    6_929_999, 6_930_000, 10_000_000,
  ];

  it("supply is never negative and never exceeds the 21,000,000 BTC cap", () => {
    for (const h of heights) {
      const sats = cumulativeScheduledSubsidySats(h);
      expect(sats >= 0n).toBe(true);
      expect(sats <= MAX_MONEY_SATS).toBe(true);
    }
  });

  it("the per-block subsidy is never negative", () => {
    for (const h of heights) {
      expect(blockSubsidySats(h) >= 0n).toBe(true);
    }
  });

  it("supply is monotonically non-decreasing in height", () => {
    let previous = -1n;
    for (const h of heights) {
      const sats = cumulativeScheduledSubsidySats(h);
      expect(sats >= previous).toBe(true);
      previous = sats;
    }
  });

  it("supply strictly increases while any subsidy remains, and is flat after", () => {
    for (const h of [0, 1_000, 839_999, 840_000, 6_929_998]) {
      expect(cumulativeScheduledSubsidySats(h + 1)).toBeGreaterThan(
        cumulativeScheduledSubsidySats(h),
      );
    }
    for (const h of [6_930_000, 7_000_000, 20_000_000]) {
      expect(cumulativeScheduledSubsidySats(h + 1)).toBe(cumulativeScheduledSubsidySats(h));
    }
  });
});

describe("rejecting heights that cannot be a block height", () => {
  it("refuses a non-integer height rather than truncating it", () => {
    expect(() => cumulativeScheduledSubsidySats(840_000.5)).toThrow(SupplyDerivationError);
    try {
      cumulativeScheduledSubsidySats(840_000.5);
    } catch (error) {
      expect((error as SupplyDerivationError).problem).toBe("HEIGHT_NOT_INTEGER");
    }
  });

  it("refuses NaN and Infinity", () => {
    expect(() => cumulativeScheduledSubsidySats(Number.NaN)).toThrow(SupplyDerivationError);
    expect(() => cumulativeScheduledSubsidySats(Number.POSITIVE_INFINITY)).toThrow(
      SupplyDerivationError,
    );
  });

  it("refuses a negative height", () => {
    try {
      cumulativeScheduledSubsidySats(-1);
      expect.unreachable("a negative height must not produce a supply");
    } catch (error) {
      expect((error as SupplyDerivationError).problem).toBe("HEIGHT_NEGATIVE");
    }
  });
});

describe("the satoshi/BTC boundary", () => {
  it("converts exactly at the scale of a real supply", () => {
    expect(satsToBtc(0n)).toBe(0);
    expect(satsToBtc(1n)).toBe(1e-8);
    expect(satsToBtc(100_000_000n)).toBe(1);
    expect(satsToBtc(2_008_460_312_500_000n)).toBe(20_084_603.125);
  });

  it("keeps satoshi counts out of double arithmetic entirely", () => {
    // A real supply exceeds Number.MAX_SAFE_INTEGER / 5. The accumulator must be bigint.
    const sats = cumulativeScheduledSubsidySats(967_072);
    expect(typeof sats).toBe("bigint");
    expect(sats > BigInt(Number.MAX_SAFE_INTEGER) / 5n).toBe(true);
  });
});

describe("the derivation record", () => {
  it("carries the height, era, block subsidy and supply, with satoshis as strings", () => {
    const derived = deriveScheduledSupply(840_000);
    expect(derived).toEqual({
      blockHeight: 840_000,
      halvingEra: 4,
      blockSubsidySats: "312500000",
      scheduledSupplySats: "1968750312500000",
      scheduledSupplyBtc: 19_687_503.125,
    });
  });

  it("round-trips through JSON without passing a satoshi count through a double", () => {
    const derived = deriveScheduledSupply(967_072);
    const reloaded = JSON.parse(JSON.stringify(derived)) as typeof derived;
    expect(BigInt(reloaded.scheduledSupplySats)).toBe(cumulativeScheduledSubsidySats(967_072));
  });

  it("is deterministic: the same height always yields the same supply", () => {
    for (const h of [0, 210_000, 840_000, 967_072]) {
      expect(deriveScheduledSupply(h)).toEqual(deriveScheduledSupply(h));
    }
  });
});

describe("the current issuance era", () => {
  it("places today's chain in era 4, paying 3.125 BTC per block", () => {
    // The fourth halving activated at height 840,000. A height in the 960,000s is era 4.
    expect(halvingEra(967_072)).toBe(4);
    expect(blockSubsidySats(967_072)).toBe(312_500_000n);
    expect(satsToBtc(blockSubsidySats(967_072))).toBe(3.125);
  });

  it("puts scheduled supply just above 20,084,000 BTC at a height in the 967,000s", () => {
    const btc = satsToBtc(cumulativeScheduledSubsidySats(967_072));
    expect(btc).toBeGreaterThan(20_084_000);
    expect(btc).toBeLessThan(20_085_000);
  });
});
