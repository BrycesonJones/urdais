/**
 * The contract the published surface must satisfy before anyone sees it.
 *
 * Separate from `validate.ts`, which checks a *stored* scenario against the methodology. This
 * checks the *payload*: that the shape a client receives is internally coherent, that a refused
 * market-year is not carrying a headroom figure anyway, that no cross-market total has appeared,
 * and that none of the retired mock's vocabulary has found its way back into a field name.
 *
 * The last of those is the reason this file exists rather than trusting the read model. The mock
 * published `unlockedGw`, `interruptibleGw`, `batteryGw` and an undefined `flexibleHoursPerYear`,
 * and the cheapest moment to catch any of them returning is the moment before serialisation.
 */

import {
  DEFAULT_ALPHA_SCENARIOS, FORBIDDEN_OUTPUT_TERMS, MAX_ANNUAL_CURTAILMENT_ENERGY_FRACTION,
  METHODOLOGY_SLUG, METHODOLOGY_VERSION,
} from "@/lib/flexible-capacity/methodology";
import { FLEXIBLE_CAPACITY_MARKETS } from "@/lib/flexible-capacity/types";
import type { FlexibleCapacityReadModel } from "@/lib/flexible-capacity/analytics/read";

/** Field names the retired mock used. None may appear anywhere in a served payload. */
export const RETIRED_FIELD_NAMES = [
  "unlockedGw", "interruptibleGw", "batteryGw", "flexibleHoursPerYear",
  "interruptibleLoadGw", "batteryShiftableLoadGw",
] as const;

function walkKeys(value: unknown, visit: (key: string) => void): void {
  if (Array.isArray(value)) { for (const item of value) walkKeys(item, visit); return; }
  if (value === null || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    visit(key);
    walkKeys(item, visit);
  }
}

export function validateFlexibleCapacityReadModel(model: FlexibleCapacityReadModel): string[] {
  const problems: string[] = [];
  const fail = (detail: string): void => { problems.push(detail); };

  // ---------------------------------------------------------------- identity and methodology
  if (model.product.slug !== "flexible-capacity") fail("the product slug is not this product's");
  if (model.methodology.slug !== METHODOLOGY_SLUG) fail("the methodology slug is not this product's");
  if (model.methodology.version !== METHODOLOGY_VERSION) {
    fail(`the methodology version is ${model.methodology.version}, not the ${METHODOLOGY_VERSION} in force`);
  }
  if (!["available", "unavailable"].includes(model.availability.state)) {
    fail(`availability state ${model.availability.state} is not a state this contract has`);
  }
  if (model.availability.state === "unavailable" && model.availability.reason === null) {
    fail("an unavailable model gives no reason");
  }
  if (model.availability.state === "available") {
    if (!model.methodology.approved) fail("an available model rests on an unapproved methodology");
    if (model.methodology.digest === null) fail("an available model carries no methodology digest");
    if (model.calculatedAt === null) fail("an available model says nothing was calculated");
    if (model.markets.length === 0) fail("an available model has no markets");
  }
  if (model.methodology.digest !== null && !/^[0-9a-f]{64}$/.test(model.methodology.digest)) {
    fail("the methodology digest is not a SHA-256");
  }
  if (Number.isNaN(Date.parse(model.generatedAt))) fail("generatedAt is not an instant");

  // ---------------------------------------------------------------- assumptions
  if (model.assumptions.batteryEnabled !== false) fail("the payload claims a storage contribution");
  if (model.assumptions.marketAggregationRule !== "per_balancing_authority_no_aggregation") {
    fail("the payload does not carry the no-aggregation rule");
  }
  const declared = [...model.assumptions.annualCurtailmentEnergyFractions].sort((a, b) => a - b);
  if (declared.join(",") !== [...DEFAULT_ALPHA_SCENARIOS].sort((a, b) => a - b).join(",")) {
    fail("the declared scenario set is not the approved one");
  }

  // ---------------------------------------------------------------- markets and years
  const seenMarkets = new Set<string>();
  for (const market of model.markets) {
    if (!FLEXIBLE_CAPACITY_MARKETS.includes(market.slug)) {
      fail(`${market.slug} is not one of the seven balancing authorities`);
    }
    if (seenMarkets.has(market.slug)) fail(`${market.slug} appears twice`);
    seenMarkets.add(market.slug);

    const seenYears = new Set<number>();
    for (const year of market.years) {
      if (seenYears.has(year.year)) fail(`${market.slug} ${year.year} appears twice`);
      seenYears.add(year.year);
      if (!Number.isInteger(year.year) || year.year < 2015 || year.year > 2100) {
        fail(`${market.slug} has an implausible modelled year ${year.year}`);
      }

      if (year.eligibility.state === "ineligible") {
        // A refusal is a result, and it never carries a figure.
        if (year.scenarios.length > 0) fail(`${market.slug} ${year.year} is refused but carries scenarios`);
        if (year.observed !== null) fail(`${market.slug} ${year.year} is refused but carries an observed basis`);
        if (year.eligibility.reason === null) fail(`${market.slug} ${year.year} is refused with no reason`);
        continue;
      }

      if (year.eligibility.reason !== null) fail(`${market.slug} ${year.year} is eligible but gives a refusal reason`);
      if (year.observed === null) fail(`${market.slug} ${year.year} is eligible with no observed basis`);
      if (year.scenarios.length === 0) fail(`${market.slug} ${year.year} is eligible with no scenarios`);

      const observed = year.observed;
      if (observed !== null) {
        if (!(observed.peakMw > 0)) fail(`${market.slug} ${year.year} has a non-positive peak`);
        if (observed.coverageRatio <= 0 || observed.coverageRatio > 1) {
          fail(`${market.slug} ${year.year} has a coverage ratio outside (0, 1]`);
        }
        if (observed.observationCount + observed.missingHours !== observed.expectedObservationCount) {
          fail(`${market.slug} ${year.year} coverage arithmetic does not close`);
        }
        if (Number.isNaN(Date.parse(observed.peakAtUtc))) fail(`${market.slug} ${year.year} has no peak instant`);
      }

      const seenAlphas = new Set<number>();
      let previousHeadroom = -Infinity;
      for (const scenario of [...year.scenarios].sort((a, b) => a.alpha - b.alpha)) {
        if (seenAlphas.has(scenario.alpha)) fail(`${market.slug} ${year.year} repeats alpha ${scenario.alpha}`);
        seenAlphas.add(scenario.alpha);
        if (scenario.alpha < 0 || scenario.alpha > MAX_ANNUAL_CURTAILMENT_ENERGY_FRACTION) {
          fail(`${market.slug} ${year.year} has alpha ${scenario.alpha} outside the methodology range`);
        }
        for (const [key, value] of Object.entries(scenario)) {
          if (!Number.isFinite(value)) fail(`${market.slug} ${year.year} alpha ${scenario.alpha}: ${key} is not finite`);
          if (value < 0) fail(`${market.slug} ${year.year} alpha ${scenario.alpha}: ${key} is negative`);
        }
        if (scenario.curtailedEnergyMwh > scenario.allowedCurtailmentEnergyMwh
          + 1e-9 * (scenario.allowedCurtailmentEnergyMwh + 1)) {
          fail(`${market.slug} ${year.year} alpha ${scenario.alpha} spent more than its allowance`);
        }
        if (Math.abs(scenario.curtailmentEnabledHeadroomGw * 1000 - scenario.curtailmentEnabledHeadroomMw) > 1e-6) {
          fail(`${market.slug} ${year.year} alpha ${scenario.alpha}: GW and MW disagree`);
        }
        if (scenario.eventCount > scenario.clockHours) {
          fail(`${market.slug} ${year.year} alpha ${scenario.alpha} has more events than curtailed hours`);
        }
        if (scenario.maxEventDurationHours > scenario.clockHours) {
          fail(`${market.slug} ${year.year} alpha ${scenario.alpha} has an event longer than its curtailed hours`);
        }
        if (observed !== null && scenario.clockHours > observed.observationCount) {
          fail(`${market.slug} ${year.year} alpha ${scenario.alpha} curtails more hours than the year holds`);
        }
        // More allowance can never buy less headroom.
        if (scenario.curtailmentEnabledHeadroomMw < previousHeadroom - 1e-9) {
          fail(`${market.slug} ${year.year}: headroom falls as alpha rises`);
        }
        previousHeadroom = scenario.curtailmentEnabledHeadroomMw;
      }
    }

    // The "latest" figures must actually be in the list they summarise.
    const years = market.years.map((year) => year.year);
    if (market.latestModelledYear !== null && !years.includes(market.latestModelledYear)) {
      fail(`${market.slug} names a latest modelled year it does not carry`);
    }
    const eligible = market.years.filter((year) => year.eligibility.state === "eligible").map((year) => year.year);
    if (market.latestEligibleYear !== null && !eligible.includes(market.latestEligibleYear)) {
      fail(`${market.slug} names a latest eligible year that is not eligible`);
    }
    if (eligible.length > 0 && market.latestEligibleYear !== Math.max(...eligible)) {
      fail(`${market.slug} does not name its newest eligible year`);
    }
  }

  // ---------------------------------------------------------------- what may not be here
  // No aggregate object: every figure belongs to exactly one balancing authority, so a market
  // whose slug is not one of the seven, or any top-level total, is a contract failure.
  for (const forbidden of ["total", "national", "combined", "aggregate", "allMarkets"]) {
    if (forbidden in (model as unknown as Record<string, unknown>)) {
      fail(`the payload carries a cross-market '${forbidden}'`);
    }
  }

  const offendingKeys = new Set<string>();
  walkKeys(model, (key) => {
    if ((RETIRED_FIELD_NAMES as readonly string[]).includes(key)) offendingKeys.add(key);
  });
  for (const key of offendingKeys) fail(`the payload carries the retired mock field '${key}'`);

  const serialised = JSON.stringify(model).toLowerCase();
  for (const term of FORBIDDEN_OUTPUT_TERMS) {
    // The limitations deliberately say the product is *not* compute capacity, so the check is on
    // field names and on the affirmative framings, not on any occurrence of the word.
    if (term === "unlocked_compute_gw" || term === "unlocked capacity" || term === "total unlocked") {
      if (serialised.includes(term.toLowerCase())) fail(`the payload uses the forbidden framing '${term}'`);
    }
  }

  return problems;
}
