/**
 * Building capacity measurements from what a source said.
 *
 * Every measurement in the dataset is constructed here, and these constructors
 * are total: given a source reading they return either a measurement or a
 * refusal with a reason. There is no path that produces a quantity the source
 * did not state, because there is no constructor that accepts a quantity
 * without one.
 *
 * Three confusions this module refuses, all of which produce plausible numbers
 * and all of which are wrong:
 *
 *   "available", no count   -> Tier 3. Not 1. An availability is not an inventory.
 *   nothing / a failure     -> Tier 4. Not 0. Not knowing is not knowing none.
 *   a price, a listing      -> nothing at all. Not an input to this module.
 *
 * The third is why `fromPriceObservation` does not exist, and why the only
 * quantity-bearing entry points demand both a number and the source field it
 * was read from.
 */

import type {
  CapacityAvailabilityState,
  CapacityMeasurement,
  CapacityQuantityUnit,
} from "@/lib/capacity/domain";

export type NormalizationResult =
  | { ok: true; measurement: CapacityMeasurement }
  | { ok: false; reason: string };

const STATES: readonly CapacityAvailabilityState[] = [
  "available",
  "limited",
  "waitlisted",
  "sold_out",
  "quote_required",
  "unknown",
];

/** Tier 4. What a source that said nothing, or a retrieval that failed, produces. */
export function unknownCapacity(): CapacityMeasurement {
  return { kind: "unknown" };
}

/**
 * Tier 1. An explicitly reported count.
 *
 * Zero is accepted and is meaningful — the source was asked and reported none.
 * A non-integer, a negative, or a non-finite value is refused rather than
 * rounded, because a quantity that needs repair was not really stated.
 */
export function exactQuantity(
  quantity: number,
  unit: CapacityQuantityUnit,
  state: CapacityAvailabilityState | null = null,
): NormalizationResult {
  if (!Number.isFinite(quantity)) return { ok: false, reason: "quantity is not a finite number" };
  if (!Number.isInteger(quantity)) return { ok: false, reason: "quantity is not an integer" };
  if (quantity < 0) return { ok: false, reason: "quantity is negative" };
  return { ok: true, measurement: { kind: "exact_quantity", quantity, unit, state } };
}

/**
 * Tier 2. Bounds the source stated.
 *
 * A degenerate range where min equals max is a count expressed as a range, and
 * it is promoted to Tier 1 rather than stored as a range that pretends to less
 * precision than the source offered.
 */
export function quantityRange(
  min: number,
  max: number,
  unit: CapacityQuantityUnit,
  state: CapacityAvailabilityState | null = null,
): NormalizationResult {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ok: false, reason: "range bound is not a finite number" };
  if (!Number.isInteger(min) || !Number.isInteger(max)) return { ok: false, reason: "range bound is not an integer" };
  if (min < 0) return { ok: false, reason: "range minimum is negative" };
  if (max < min) return { ok: false, reason: "range maximum is below its minimum" };
  if (min === max) return exactQuantity(min, unit, state);
  return { ok: true, measurement: { kind: "quantity_range", min, max, unit, state } };
}

/**
 * Tier 3. Availability with no number attached.
 *
 * This constructor takes no quantity and has nowhere to put one. "unknown" is
 * refused here on purpose: a source that told us nothing is Tier 4, and
 * letting it in as a state would put it in the coverage count as though it had
 * reported something.
 */
export function availabilityOnly(state: CapacityAvailabilityState): NormalizationResult {
  if (!STATES.includes(state)) return { ok: false, reason: `unrecognized availability state: ${state}` };
  if (state === "unknown") {
    return { ok: false, reason: "an unknown availability state is a Tier 4 observation, not a Tier 3 one" };
  }
  return { ok: true, measurement: { kind: "availability_state", state } };
}

/**
 * Map a source's own availability wording to the family vocabulary.
 *
 * Per-interface rules live with their adapters; this handles only the shapes
 * the family vocabulary already names. An unrecognized word maps to null, and
 * the caller records Tier 4 — never a guess, and never the nearest-looking
 * state, because "low" and "sold out" are one word apart and opposite.
 */
export function mapAvailabilityWord(word: string | null | undefined): CapacityAvailabilityState | null {
  if (word === null || word === undefined) return null;
  const normalized = word.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "") return null;
  switch (normalized) {
    case "available":
    case "high":
    case "in_stock":
      return "available";
    case "limited":
    case "low":
    case "medium":
      return "limited";
    case "waitlist":
    case "waitlisted":
      return "waitlisted";
    case "sold_out":
    case "unavailable":
    case "out_of_stock":
    case "none":
      return "sold_out";
    case "quote_required":
    case "contact_sales":
      return "quote_required";
    default:
      return null;
  }
}

/**
 * Convert a counted unit to accelerators.
 *
 * The conversion runs only where accelerators-per-unit is separately evidenced.
 * Without it the observation keeps its own unit and aggregates only against
 * others in that unit — an unconverted node count is still a true observation,
 * and a guessed conversion would not be.
 */
export function toAccelerators(
  measurement: CapacityMeasurement,
  gpusPerUnit: number | null,
): CapacityMeasurement | null {
  if (measurement.kind !== "exact_quantity" && measurement.kind !== "quantity_range") return null;
  if (measurement.unit === "accelerator") return measurement;
  if (gpusPerUnit === null || !Number.isInteger(gpusPerUnit) || gpusPerUnit <= 0) return null;
  if (measurement.kind === "exact_quantity") {
    return { ...measurement, quantity: measurement.quantity * gpusPerUnit, unit: "accelerator" };
  }
  return {
    ...measurement,
    min: measurement.min * gpusPerUnit,
    max: measurement.max * gpusPerUnit,
    unit: "accelerator",
  };
}
