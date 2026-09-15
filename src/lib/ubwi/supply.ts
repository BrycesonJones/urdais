/**
 * The UBWI BTC supply leg: protocol-scheduled cumulative block subsidy.
 *
 * Methodology 1.2.0 replaces the externally reported circulating-supply dataset with
 * arithmetic:
 *
 *   BTC supply = the protocol-scheduled cumulative block subsidy through the reference
 *   block height, excluding transaction fees and without lost-coin adjustment.
 *
 * Why this is a rights change and not only an engineering one. Until 1.2.0 the supply leg
 * was read from Blockchain.com's Explorer API, whose retained terms grant retrieval and
 * scope the service "solely for informational purposes" -- which does not grant the
 * commercial derived-index publication Urdais performs. That was the last external rights
 * blocker on the numerator. Bitcoin's issuance schedule is not a dataset anybody licenses:
 * it is consensus arithmetic, reproducible by anyone from the block height alone. Deriving
 * the quantity rather than retrieving it removes the dependency outright rather than
 * negotiating it.
 *
 * What this quantity is, stated precisely, because the difference matters:
 *
 *   - It is the sum of the coinbase subsidies the protocol *scheduled* for blocks 0
 *     through the reference height.
 *   - It is NOT exact created supply. Miners have historically underclaimed coinbase
 *     rewards -- claiming less than the schedule allowed -- and those coins were never
 *     created. Scheduled issuance is therefore very slightly *above* exact created supply.
 *   - It is NOT circulating, spendable or recoverable supply. No lost-coin adjustment is
 *     applied, because no lost-coin estimate is deterministic and a non-deterministic
 *     adjustment inside a published index is an opinion wearing a number's clothes.
 *   - Transaction fees are excluded. Fees are redistributed, not issued, and including
 *     them would double-count coins already counted in an earlier block's subsidy.
 *
 * The naming throughout is `scheduled` for exactly that reason. See ./rights.ts for why
 * the derivation carries the rights state `derived_from_protocol` rather than any state
 * that would assert a third-party licence.
 *
 * ## Height convention
 *
 * Every function here answers one question:
 *
 *   "What is the cumulative scheduled subsidy for all blocks up to **and including**
 *   reference block height H?"
 *
 * The convention is INCLUSIVE of the reference height, and genesis is height 0. So
 * `cumulativeScheduledSubsidySats(0)` is 5_000_000_000 -- one block's worth, the genesis
 * subsidy -- and not zero. This is stated rather than implied because an off-by-one here
 * is a 3.125 BTC error that no downstream check would catch.
 *
 * Note that the genesis coinbase is famously unspendable: it is not in any UTXO set and
 * those 50 BTC can never move. It is nonetheless included, because excluding it would be a
 * spendability adjustment and 1.2.0 makes none. The quantity is what the protocol
 * scheduled, not what can be spent.
 *
 * ## Arithmetic
 *
 * All internal arithmetic is integer satoshis in `bigint`. Nothing accumulates in
 * floating point. Cumulative issuance near the cap is on the order of 2.1e15 satoshis,
 * which exceeds `Number.MAX_SAFE_INTEGER` (~9.007e15) by less than a factor of five --
 * close enough that a single careless intermediate would be silently wrong rather than
 * loudly wrong. Conversion to decimal BTC happens once, at the boundary, and only for
 * display and for the market-capitalization product.
 */

/** The genesis subsidy, in satoshis. 50 BTC. */
export const INITIAL_BLOCK_SUBSIDY_SATS = 5_000_000_000n;

/** Blocks between halvings. */
export const HALVING_INTERVAL_BLOCKS = 210_000;

/** Satoshis in one bitcoin. */
export const SATS_PER_BTC = 100_000_000n;

/**
 * The nominal 21,000,000 BTC cap, in satoshis: the bound every scheduled supply must
 * respect. The schedule never actually reaches it -- integer truncation of the halving
 * series stops it short, see `MAX_SCHEDULED_SUPPLY_SATS` -- and the bound is an invariant
 * rather than a target.
 */
export const MAX_MONEY_SATS = 2_100_000_000_000_000n;

/**
 * The era at which the subsidy truncates to zero.
 *
 * 5_000_000_000 lies between 2**32 and 2**33, so the integer halving series reaches 1
 * satoshi at era 32 and 0 at era 33. The last block to carry any subsidy at all is
 * therefore the last block of era 32, and every block from height 6,930,000 onward is
 * scheduled zero. Bitcoin Core guards at 64 halvings for C++ reasons that do not apply to
 * arbitrary-precision integers; the real cutoff is 33 and it is stated here rather than
 * inherited.
 */
export const FIRST_ZERO_SUBSIDY_ERA = 33;

/** The first block height whose scheduled subsidy is zero. */
export const FIRST_ZERO_SUBSIDY_HEIGHT = FIRST_ZERO_SUBSIDY_ERA * HALVING_INTERVAL_BLOCKS;

/** Why a height could not be turned into a supply. */
export type SupplyDerivationProblem =
  | "HEIGHT_NOT_INTEGER"
  | "HEIGHT_NEGATIVE"
  | "SUPPLY_NEGATIVE"
  | "SUPPLY_ABOVE_CAP";

export class SupplyDerivationError extends Error {
  constructor(readonly problem: SupplyDerivationProblem, message: string) {
    super(message);
    this.name = "SupplyDerivationError";
  }
}

function assertUsableHeight(height: number): void {
  if (!Number.isInteger(height)) {
    throw new SupplyDerivationError(
      "HEIGHT_NOT_INTEGER",
      `block height must be an integer, received ${height}`,
    );
  }
  if (height < 0) {
    throw new SupplyDerivationError(
      "HEIGHT_NEGATIVE",
      `block height must be non-negative, received ${height}`,
    );
  }
}

/** The halving era a height falls in. Genesis is era 0. */
export function halvingEra(height: number): number {
  assertUsableHeight(height);
  return Math.floor(height / HALVING_INTERVAL_BLOCKS);
}

/**
 * The scheduled subsidy of the single block at `height`, in satoshis.
 *
 * Integer right-shift, which is the protocol's own rule: the subsidy is halved by integer
 * division, so the truncation is part of consensus and not an approximation of it.
 */
export function blockSubsidySats(height: number): bigint {
  const era = halvingEra(height);
  if (era >= FIRST_ZERO_SUBSIDY_ERA) return 0n;
  return INITIAL_BLOCK_SUBSIDY_SATS >> BigInt(era);
}

/**
 * Cumulative scheduled subsidy for all blocks from genesis up to **and including**
 * `height`, in satoshis.
 *
 * Closed over eras rather than looped over blocks: every block within an era carries the
 * same subsidy, so the sum is a short series of multiplications whose length is bounded by
 * 33 regardless of how large the height is.
 */
export function cumulativeScheduledSubsidySats(height: number): bigint {
  assertUsableHeight(height);
  const era = halvingEra(height);

  let total = 0n;
  const completeEras = Math.min(era, FIRST_ZERO_SUBSIDY_ERA);
  for (let e = 0; e < completeEras; e += 1) {
    total += BigInt(HALVING_INTERVAL_BLOCKS) * (INITIAL_BLOCK_SUBSIDY_SATS >> BigInt(e));
  }
  if (era < FIRST_ZERO_SUBSIDY_ERA) {
    // The partial era: blocks era*interval .. height, inclusive of both ends.
    const blocksInPartialEra = BigInt(height - era * HALVING_INTERVAL_BLOCKS + 1);
    total += blocksInPartialEra * (INITIAL_BLOCK_SUBSIDY_SATS >> BigInt(era));
  }

  // Invariants checked rather than asserted in a comment. These cannot fire for any
  // reachable height; they exist so that a future edit to the series above cannot
  // silently produce an impossible supply.
  if (total < 0n) {
    throw new SupplyDerivationError(
      "SUPPLY_NEGATIVE",
      `scheduled supply at height ${height} is negative`,
    );
  }
  if (total > MAX_MONEY_SATS) {
    throw new SupplyDerivationError(
      "SUPPLY_ABOVE_CAP",
      `scheduled supply at height ${height} exceeds the 21,000,000 BTC cap`,
    );
  }
  return total;
}

/**
 * The asymptotic total the schedule actually reaches: every block from genesis through the
 * last subsidised block. Strictly below the nominal cap, because integer truncation of the
 * halving series discards the remainder at every step.
 */
export const MAX_SCHEDULED_SUPPLY_SATS = cumulativeScheduledSubsidySats(
  FIRST_ZERO_SUBSIDY_HEIGHT - 1,
);

/**
 * Satoshis to decimal BTC. The single conversion boundary.
 *
 * Exact for every reachable supply: a satoshi count below 2.1e15 divided by 1e8 is
 * representable, and the division is by a power of ten performed on values well inside
 * the double's integer range once split into whole and fractional parts.
 */
export function satsToBtc(sats: bigint): number {
  const whole = sats / SATS_PER_BTC;
  const remainder = sats % SATS_PER_BTC;
  return Number(whole) + Number(remainder) / Number(SATS_PER_BTC);
}

/** A supply quantity and the height and rule that produced it. */
export type ScheduledSupply = {
  /** The reference height, inclusive. */
  blockHeight: number;
  /** The halving era the reference height falls in. */
  halvingEra: number;
  /** The scheduled subsidy of the block at the reference height, in satoshis. */
  blockSubsidySats: string;
  /** Cumulative scheduled issuance through the reference height, in satoshis. */
  scheduledSupplySats: string;
  /** The same quantity in decimal BTC, at the conversion boundary. */
  scheduledSupplyBtc: number;
};

/**
 * Derive the scheduled supply at a reference height.
 *
 * `bigint` values cross the boundary as decimal strings rather than as numbers, so that a
 * frozen lineage record round-trips through JSON and through the database without ever
 * passing a satoshi count through a double.
 */
export function deriveScheduledSupply(blockHeight: number): ScheduledSupply {
  const sats = cumulativeScheduledSubsidySats(blockHeight);
  return {
    blockHeight,
    halvingEra: halvingEra(blockHeight),
    blockSubsidySats: blockSubsidySats(blockHeight).toString(),
    scheduledSupplySats: sats.toString(),
    scheduledSupplyBtc: satsToBtc(sats),
  };
}

/**
 * The derivation's own version, frozen onto every published point.
 *
 * It moves only if the arithmetic above changes. The Bitcoin issuance schedule is not
 * expected to change, but "the schedule cannot change" is an assumption about the world
 * and a published point should record which implementation produced it either way.
 */
export const SUPPLY_DERIVATION_VERSION = "1.0.0" as const;

/**
 * The derivation's identity, recorded where a source interface slug would otherwise sit.
 *
 * This is deliberately not a source interface. There is no provider, no terms document and
 * no licence, because no third party supplies the quantity. See ./rights.ts.
 */
export const PROTOCOL_SUPPLY_DERIVATION = "bitcoin-protocol-subsidy-schedule" as const;
