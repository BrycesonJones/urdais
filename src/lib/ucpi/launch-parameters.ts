/**
 * Reference implementation of the UCPI-H100-SXM launch parameters ratified at
 * 0.1.3-draft (docs/methodology/ucpi-h100-sxm.md): the seller-level reduction
 * rule, the bundle-envelope floor, and the zero-carry freshness rule.
 *
 * Like market-breadth.ts this states rules in executable form so they can be
 * tested. It reads no data, evaluates no other gate, and is not a normalizer.
 */

/** One eligible offer inside a seller's cell, already normalized to the index unit. */
export type CellOffer = {
  /** Accelerators the buyer takes in this offer; quantity variants within the per-accelerator class. */
  acceleratorCount: number;
  /** Normalized price in index currency per accelerator-hour, unrounded. */
  pricePerAcceleratorHour: number;
  /** Tier, zone or machine identifier; disclosed, never used for selection except as a tiebreak record. */
  variant?: string;
};

export type SellerReduction = {
  /** The smallest accelerator count the seller offers in the cell: the canonical quantity. */
  canonicalQuantity: number;
  /** The lowest accessible price among variants at the canonical quantity. */
  representativePrice: number;
  /** The offer that supplied it, retained for lineage. */
  selected: CellOffer;
  /** How many eligible offers were considered, and how many sat at the canonical quantity. */
  consideredCount: number;
  canonicalCount: number;
};

/**
 * The 0.1.3 rule: a fixed selection on the quantity dimension, then the family's
 * seller minimum within it. A seller cannot lower its observation by adding
 * larger-quantity variants.
 */
export function sellerRepresentativePrice(offers: readonly CellOffer[]): SellerReduction {
  if (offers.length === 0) throw new RangeError("a seller-level reduction over no eligible offers is not defined");
  for (const o of offers) {
    if (!Number.isInteger(o.acceleratorCount) || o.acceleratorCount < 1) {
      throw new RangeError(`accelerator count must be a positive integer, got ${o.acceleratorCount}`);
    }
    if (!(o.pricePerAcceleratorHour > 0) || !Number.isFinite(o.pricePerAcceleratorHour)) {
      throw new RangeError(`price must be a finite positive number, got ${o.pricePerAcceleratorHour}`);
    }
  }
  const canonicalQuantity = Math.min(...offers.map((o) => o.acceleratorCount));
  const atCanonical = offers.filter((o) => o.acceleratorCount === canonicalQuantity);
  const selected = atCanonical.reduce((best, o) => (o.pricePerAcceleratorHour < best.pricePerAcceleratorHour ? o : best));
  return {
    canonicalQuantity,
    representativePrice: selected.pricePerAcceleratorHour,
    selected,
    consideredCount: offers.length,
    canonicalCount: atCanonical.length,
  };
}

/** The family's provisional default, kept so the two rules can be compared in tests. */
export function sellerMinimum(offers: readonly CellOffer[]): number {
  if (offers.length === 0) throw new RangeError("no offers");
  return Math.min(...offers.map((o) => o.pricePerAcceleratorHour));
}

/** The seller median alternative, with the family's even-N convention. */
export function sellerMedian(offers: readonly CellOffer[]): number {
  if (offers.length === 0) throw new RangeError("no offers");
  const sorted = offers.map((o) => o.pricePerAcceleratorHour).sort((a, b) => a - b);
  const n = sorted.length;
  return n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

/** The bundle-envelope floor declared at 0.1.3: host memory per accelerator at least the device memory. */
export const HOST_MEMORY_FLOOR_GB_PER_ACCELERATOR = 80;

export type EnvelopeOutcome = "within" | "outside" | "unknown";

/** Only host memory is gated; virtual CPU and storage are heterogeneity, never gated. */
export function bundleEnvelope(hostMemoryGbPerAccelerator: number | null | undefined): EnvelopeOutcome {
  if (hostMemoryGbPerAccelerator == null) return "unknown";
  if (!Number.isFinite(hostMemoryGbPerAccelerator) || hostMemoryGbPerAccelerator < 0) {
    throw new RangeError(`host memory must be a non-negative finite number, got ${hostMemoryGbPerAccelerator}`);
  }
  return hostMemoryGbPerAccelerator >= HOST_MEMORY_FLOOR_GB_PER_ACCELERATOR ? "within" : "outside";
}

export type FreshnessOutcome = "eligible" | "PRICE_STALE" | "AVAILABILITY_STALE" | "SOURCE_UNAVAILABLE";

/**
 * The zero-carry rule: both evidence dimensions must have been observed on the
 * calculation date. Dates are ISO calendar dates (YYYY-MM-DD) in the calculation
 * calendar; a null observation date means the source was not observed at all.
 */
export function freshnessOnCalculationDate(input: {
  calculationDate: string;
  priceObservedOn: string | null;
  availabilityObservedOn: string | null;
}): FreshnessOutcome {
  const { calculationDate, priceObservedOn, availabilityObservedOn } = input;
  if (priceObservedOn === null && availabilityObservedOn === null) return "SOURCE_UNAVAILABLE";
  if (priceObservedOn !== calculationDate) return "PRICE_STALE";
  if (availabilityObservedOn !== calculationDate) return "AVAILABILITY_STALE";
  return "eligible";
}
