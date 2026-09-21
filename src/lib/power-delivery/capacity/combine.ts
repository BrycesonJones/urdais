/**
 * What may be combined with what.
 *
 * PD-4 has no cross-market formula and will not get one; the arithmetic that eventually exists
 * is market-specific and signed. What can be settled now, before any of it is written, is which
 * combinations are categorically invalid — and the reason to settle it now is that every one of
 * these mistakes produces a plausible number rather than an error.
 *
 * There is deliberately no sum function here. These are guards, and a caller that wants a total
 * must first say what it is totalling and prove the parts belong together.
 */

import type {
  CapacityBasis, CapacityPeriod, CapacityQuantityKind, CapacityUnit,
} from "@/lib/power-delivery/capacity/types";

export class CapacityCombinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapacityCombinationError";
  }
}

/** The facts about a value that decide whether it may be combined with another. */
export type CombinableQuantity = {
  quantityKind: CapacityQuantityKind;
  period: CapacityPeriod;
  unit: CapacityUnit;
  capacityBasis: CapacityBasis | null;
  gridAreaId: string;
  gridSubareaId: string | null;
  gridInterfaceId: string | null;
};

const samePeriod = (a: CapacityPeriod, b: CapacityPeriod): boolean =>
  a.periodBasis === b.periodBasis && a.targetYear === b.targetYear && a.targetSeason === b.targetSeason;

/** Whole-market, one locality, or one interface — and never a mixture of those. */
function grainOf(quantity: CombinableQuantity): "interface" | "locality" | "market" {
  if (quantity.gridInterfaceId !== null) return "interface";
  if (quantity.gridSubareaId !== null) return "locality";
  return "market";
}

/**
 * Throw unless every quantity may take part in one arithmetic step. Refuses, in order: an empty
 * set, mixed classifications, mixed period bases or periods, mixed units, mixed capacity bases,
 * mixed markets, and mixed geographic grains.
 */
export function assertCombinable(quantities: readonly CombinableQuantity[], purpose: string): void {
  if (quantities.length === 0) {
    throw new CapacityCombinationError(`${purpose}: nothing to combine`);
  }
  const [first, ...rest] = quantities as [CombinableQuantity, ...CombinableQuantity[]];

  // A rate is not an addend. Two localities' capacity requirements, each a percentage of its own
  // peak, do not add up to anything; neither does a reserve margin plus a megawatt.
  for (const quantity of quantities) {
    if (quantity.unit === "percent") {
      throw new CapacityCombinationError(
        `${purpose}: a value stated as a percent is a rate, not an amount, and is never an addend`,
      );
    }
  }

  for (const other of rest) {
    // A capability and a requirement are not addends. Whether they may be differenced is a
    // methodology question; that they may not be summed is not.
    if (other.quantityKind !== first.quantityKind) {
      throw new CapacityCombinationError(
        `${purpose}: cannot combine a ${first.quantityKind} with a ${other.quantityKind}; they measure different things`,
      );
    }
    if (!samePeriod(first.period, other.period)) {
      throw new CapacityCombinationError(
        `${purpose}: cannot combine ${first.period.periodBasis} ${first.period.targetYear}${first.period.targetSeason ? ` ${first.period.targetSeason}` : ""} with ${other.period.periodBasis} ${other.period.targetYear}${other.period.targetSeason ? ` ${other.period.targetSeason}` : ""}`,
      );
    }
    if (other.unit !== first.unit) {
      throw new CapacityCombinationError(`${purpose}: cannot combine ${first.unit} with ${other.unit}`);
    }
    if (other.capacityBasis !== first.capacityBasis) {
      throw new CapacityCombinationError(
        `${purpose}: cannot combine a ${first.capacityBasis ?? "basis-less"} figure with a ${other.capacityBasis ?? "basis-less"} one; UCAP and ICAP differ by the forced-outage treatment`,
      );
    }
    if (other.gridAreaId !== first.gridAreaId) {
      throw new CapacityCombinationError(`${purpose}: cannot combine values from two markets`);
    }
    if (grainOf(other) !== grainOf(first)) {
      throw new CapacityCombinationError(
        `${purpose}: cannot combine a ${grainOf(first)} value with a ${grainOf(other)} value`,
      );
    }
  }

  // A network limit is not supply. It bounds a result; adding limits together produces a number
  // describing no boundary that exists.
  if (first.quantityKind === "constraint") {
    throw new CapacityCombinationError(
      `${purpose}: network constraints are not additive; a limit bounds a result rather than contributing to one`,
    );
  }
  // Nested localities double-count: a PJM LDA inside another LDA is counted once in each.
  if (grainOf(first) === "locality" && quantities.length > 1) {
    const localities = new Set(quantities.map((quantity) => quantity.gridSubareaId));
    if (localities.size !== quantities.length) {
      throw new CapacityCombinationError(`${purpose}: the same locality appears more than once`);
    }
  }
}

/**
 * Capability minus requirement is a margin; it is the one cross-kind operation with an obvious
 * meaning, and it is still only valid when everything else about the two values agrees.
 */
export function assertDifferenceable(
  capability: CombinableQuantity,
  requirement: CombinableQuantity,
  purpose: string,
): void {
  if (capability.quantityKind !== "capability") {
    throw new CapacityCombinationError(`${purpose}: the minuend is a ${capability.quantityKind}, not a capability`);
  }
  if (requirement.quantityKind !== "requirement") {
    throw new CapacityCombinationError(`${purpose}: the subtrahend is a ${requirement.quantityKind}, not a requirement`);
  }
  // Everything except the classification must still agree.
  assertCombinable(
    [{ ...capability, quantityKind: "capability" }, { ...requirement, quantityKind: "capability" }],
    purpose,
  );
}

/**
 * There is no seven-market capacity total and this function exists to say so where someone would
 * otherwise write one. PD-2's coincident load aggregate is a different thing: hourly measurements
 * at one instant. Capacities are accredited over different periods, on different bases, against
 * different reliability standards, and adding them produces a number describing no system.
 */
/**
 * Localities nest. PJM's MAAC contains EMAAC, which contains PS, and each area's published
 * capability already counts every resource inside the areas below it; PJM states the nesting in
 * Schedule 10.1 of the Reliability Assurance Agreement rather than in any artifact Urdais
 * ingests, so nothing here knows which areas overlap. Adding locality figures together therefore
 * double counts by an amount this code cannot even measure, and the operation is refused outright
 * instead of guarded by a hierarchy Urdais would have to invent.
 */
export function refuseNestedSubareaTotal(marketSlug: string): never {
  throw new CapacityCombinationError(
    `there is no total across ${marketSlug} localities: they nest, each one's figure already counts the areas inside it, and the nesting is published in a tariff this pipeline does not ingest`,
  );
}

export function refuseSevenMarketCapacityTotal(): never {
  throw new CapacityCombinationError(
    "there is no seven-market deliverable capacity total: the markets accredit capacity on different bases, over different delivery periods, against different reliability standards",
  );
}
