/**
 * The UBWI V1 publication gate.
 *
 * A gate must be set against the feasible frontier, not against an intuition about what
 * a good number looks like. A threshold above the frontier is not a high standard: it is
 * a permanent refusal disguised as one, taken silently. Phases 2A and 2B both proposed an
 * imputed-share ceiling of 25 %, which Phase 2C showed requires 68.44 % observed GDP
 * coverage against a measured frontier of 55.72 % -- a bound no denominator the global
 * statistical system can produce would ever meet.
 *
 * So every threshold here is checked against the stored frontier measurement, and the
 * check that a threshold sits below the frontier is itself a gate. A configured bound
 * above the frontier is refused as a configuration error rather than quietly refusing
 * every calculation forever.
 *
 * The gate is not weakened to make a calculation pass. When it refuses, it refuses.
 */
import { LATEST_COMPLETE_YEAR } from "./observations";
import { checkNumerator, numeratorSourceInterfaces } from "./numerator";
import {
  SOURCE_INTERFACES,
  effectiveRightsStatus,
  mayPublishNumeratorFrom,
  sourceInterface,
} from "./rights";
import { checkTermsArtifactShape } from "./terms-integrity";
import { satisfiesVintageRule } from "./calculate";
import type { UbwiCalculation } from "./types";

/**
 * The measured feasible frontier: the rights-cleared observed GDP coverage reachable
 * from national balance sheets that exist and are published today. Every threshold below
 * is checked against it.
 */
export const FEASIBLE_FRONTIER = {
  /** Reachable on today's publications. */
  nearTermCoverage: 0.5572,
  /** Reachable only if nineteen further statistical offices began valuing land. */
  counterfactualCoverage: 0.6293,
  measuredOn: "2026-09-14",
  source: "docs/research/ubwi-phase2c-denominator-hardening.md, Part 6",
} as const;

export type GateThresholds = {
  version: string;
  /** Maximum modeled share of the wealth denominator. The binding bound. */
  maxImputedShareOfWealth: number;
  /** Minimum rights-cleared observed share of world GDP at market exchange rates. */
  minRightsClearedGdpCoverage: number;
  /** Maximum age, in years, of a component's reference year at the calculation date. */
  maxVintageAgeYears: number;
  /** Maximum spread, in years, between the oldest and newest component. */
  maxVintageDispersionYears: number;
  /** An economy above this share of world GDP must be named on the published surface. */
  majorEconomyDisclosureThreshold: number;
};

/**
 * Production V1 thresholds.
 *
 * The imputed-share bound of 40 % is the tightest satisfiable bound: Phase 2C's inverse
 * computation puts <= 25 % at 68.44 % coverage and <= 35 % at 57.31 %, both above the
 * 55.72 % frontier. The coverage bound of 52 % is the same constraint stated in the other
 * unit and moves with it; it is derived, not chosen as a round number.
 */
export const PRODUCTION_V1_THRESHOLDS: GateThresholds = {
  version: "1.0.0",
  maxImputedShareOfWealth: 0.4,
  minRightsClearedGdpCoverage: 0.52,
  maxVintageAgeYears: 4,
  maxVintageDispersionYears: 4,
  majorEconomyDisclosureThreshold: 0.03,
};

/**
 * Why a gate refused. Each code names one condition; nothing is overloaded into a
 * generic failure, because the operator response differs by kind.
 */
export type GateFailureCode =
  | "CONSTITUENT_NOT_RIGHTS_CLEARED"
  | "SOURCE_NOT_RIGHTS_CLEARED"
  | "IMPUTED_SHARE_ABOVE_CEILING"
  | "COVERAGE_BELOW_FLOOR"
  | "INTERPOLATED_STOCK_PRESENT"
  | "VINTAGE_RULE_VIOLATED"
  | "VINTAGE_DISPERSION_EXCEEDED"
  | "CONSUMER_DURABLES_NOT_STRIPPED"
  | "SENSITIVITY_UNAVAILABLE"
  | "METHODOLOGY_VERSION_MISSING"
  | "MODEL_VERSION_MISSING"
  | "SOURCE_LINEAGE_INCOMPLETE"
  | "FX_LINEAGE_INCOMPLETE"
  | "MAJOR_ECONOMY_NOT_DISCLOSED"
  | "NUMERATOR_INVALID"
  | "NUMERATOR_SOURCE_NOT_RIGHTS_CLEARED"
  | "TERMS_ARTIFACT_INTEGRITY_FAILED"
  | "THRESHOLD_ABOVE_FEASIBLE_FRONTIER";

export type GateFinding = {
  code: GateFailureCode;
  detail: string;
  remedy: string;
};

export type GateResult = {
  passed: boolean;
  thresholdsVersion: string;
  findings: readonly GateFinding[];
  /** What each bound actually measured, reported whether it passed or failed. */
  measures: {
    imputedShareOfWealth: number;
    rightsClearedGdpCoverage: number;
    vintageDispersionYears: number;
    oldestReferenceYear: number;
    newestReferenceYear: number;
    rightsClearedConstituents: number;
    totalConstituents: number;
  };
};

export function evaluateGate(
  calculation: UbwiCalculation,
  thresholds: GateThresholds = PRODUCTION_V1_THRESHOLDS,
  latestCompleteYear: number = LATEST_COMPLETE_YEAR,
): GateResult {
  const findings: GateFinding[] = [];
  const economies = calculation.observed;

  // A threshold above the frontier would refuse every denominator forever while looking
  // like a quality rule. Refuse the configuration instead, loudly.
  if (thresholds.minRightsClearedGdpCoverage > FEASIBLE_FRONTIER.nearTermCoverage) {
    findings.push({
      code: "THRESHOLD_ABOVE_FEASIBLE_FRONTIER",
      detail:
        `the configured coverage floor of ${pct(thresholds.minRightsClearedGdpCoverage)} exceeds the ` +
        `measured near-term feasible frontier of ${pct(FEASIBLE_FRONTIER.nearTermCoverage)}`,
      remedy:
        "a bound above the frontier is a permanent refusal, not a standard; lower the bound or re-measure the frontier",
    });
  }

  // Every directly observed constituent rights-cleared. The only absolute gate, and the
  // only one that can be lost by accident rather than by decision.
  const notCleared = economies.filter((e) => e.rightsStatus !== "cleared");
  if (notCleared.length > 0) {
    findings.push({
      code: "CONSTITUENT_NOT_RIGHTS_CLEARED",
      detail: `${notCleared.length} observed constituent(s) not rights-cleared: ${notCleared
        .map((e) => `${e.economy} (${e.rightsStatus})`)
        .join(", ")}`,
      remedy: "clear the source's terms or drop the constituent; never publish an uncleared one",
    });
  }

  // The constituent's own state must agree with the state its source interface derives
  // from a retained terms artifact. A component cannot be cleared by assertion.
  const unclearedSources = new Set<string>();
  for (const economy of economies) {
    const iface = sourceInterface(economy.sourceInterface);
    if (iface === undefined) {
      findings.push({
        code: "SOURCE_LINEAGE_INCOMPLETE",
        detail: `${economy.economy} names source interface "${economy.sourceInterface}", which is not registered`,
        remedy: "register the interface with its retained terms artifact",
      });
      continue;
    }
    if (effectiveRightsStatus(iface) !== "cleared") {
      unclearedSources.add(iface.slug);
    }
  }
  if (unclearedSources.size > 0) {
    findings.push({
      code: "SOURCE_NOT_RIGHTS_CLEARED",
      detail: `source interface(s) not cleared against a retained terms artifact: ${[...unclearedSources].join(", ")}`,
      remedy: "retrieve and review the terms, and retain the artifact with its hash",
    });
  }

  // No silently interpolated national wealth stocks. A stock is never bridged across
  // periods; an economy whose latest publication is too old is excluded instead.
  const interpolated = economies.filter((e) => e.observationStatus !== "observed");
  if (interpolated.length > 0) {
    findings.push({
      code: "INTERPOLATED_STOCK_PRESENT",
      detail: `${interpolated.map((e) => e.economy).join(", ")} carry a non-observed status inside the observed set`,
      remedy: "drop the component; the residual model is the only place a modeled figure belongs",
    });
  }

  // Consumer durables are outside the SNA asset boundary. A compiler that includes them
  // must have them stripped, with the amount and the source line recorded.
  const durables = economies.filter((e) => e.consumerDurablesTreatment === "included_not_stripped");
  if (durables.length > 0) {
    findings.push({
      code: "CONSUMER_DURABLES_NOT_STRIPPED",
      detail: `${durables.map((e) => e.economy).join(", ")} include consumer durables without stripping them`,
      remedy: "strip the durables line from the published total or drop the component",
    });
  }

  // Vintage.
  const stale = economies.filter((e) => !satisfiesVintageRule(e, latestCompleteYear));
  if (stale.length > 0) {
    findings.push({
      code: "VINTAGE_RULE_VIOLATED",
      detail: `${stale
        .map((e) => `${e.economy} ${e.referenceDate} (${latestCompleteYear - e.referenceYear}y)`)
        .join(", ")} exceed the ${thresholds.maxVintageAgeYears}-year vintage bound`,
      remedy: "drop the component rather than bridging or interpolating it forward",
    });
  }

  const years = economies.map((e) => e.referenceYear);
  const oldest = years.length > 0 ? Math.min(...years) : latestCompleteYear;
  const newest = years.length > 0 ? Math.max(...years) : latestCompleteYear;
  const dispersion = newest - oldest;
  if (dispersion > thresholds.maxVintageDispersionYears) {
    findings.push({
      code: "VINTAGE_DISPERSION_EXCEEDED",
      detail: `components span ${dispersion} years (${oldest}-${newest}), above the ${thresholds.maxVintageDispersionYears}-year bound`,
      remedy: "drop the oldest components; the bound is satisfied automatically once the age bound is",
    });
  }

  // FX lineage. An end-period stock needs an end-period fixing at or before its own
  // reference date; Phase 2B measured the wrong-basis error at up to 6.6 % per country.
  for (const economy of economies) {
    const usd = economy.currency === "USD";
    const missing =
      economy.fx.basis !== "end_period" ||
      !Number.isFinite(economy.fx.rateLcuPerUsd) ||
      (!usd && (economy.fx.fixingDate === null || economy.fx.sourceInterface === "")) ||
      (!usd && economy.fx.fixingDate !== null && economy.fx.fixingDate > economy.referenceDate);
    if (missing) {
      findings.push({
        code: "FX_LINEAGE_INCOMPLETE",
        detail: `${economy.economy} has incomplete or non-end-period FX lineage (basis ${economy.fx.basis}, fixing ${economy.fx.fixingDate ?? "none"}, reference ${economy.referenceDate})`,
        remedy: "record the last end-period fixing at or before the component's reference date, with its source",
      });
    }
  }

  // Source lineage completeness: every component names a series, a reference date and an
  // interface, or it cannot be reproduced.
  for (const economy of economies) {
    if (economy.sourceSeries.trim() === "" || economy.referenceDate.trim() === "") {
      findings.push({
        code: "SOURCE_LINEAGE_INCOMPLETE",
        detail: `${economy.economy} is missing a source series identifier or a reference date`,
        remedy: "record the compiler's own series identifier, not the concept name",
      });
    }
  }

  // The two binding bounds.
  const imputed = calculation.imputedShareOfWealth / 100;
  if (imputed > thresholds.maxImputedShareOfWealth) {
    findings.push({
      code: "IMPUTED_SHARE_ABOVE_CEILING",
      detail: `modeled residual is ${pct(imputed)} of the wealth denominator, above the ${pct(thresholds.maxImputedShareOfWealth)} ceiling`,
      remedy:
        "raise rights-cleared observed coverage; the ceiling is checked against the feasible frontier and is not lowered to make a calculation pass",
    });
  }

  const coverage = calculation.coverage.rightsClearedGdpCoverage;
  if (coverage < thresholds.minRightsClearedGdpCoverage) {
    findings.push({
      code: "COVERAGE_BELOW_FLOOR",
      detail: `rights-cleared observed GDP coverage is ${pct(coverage)}, below the ${pct(thresholds.minRightsClearedGdpCoverage)} floor`,
      remedy: "add a rights-cleared national balance sheet; do not relax the floor",
    });
  }

  // Sensitivity must exist and must be a real range.
  if (
    calculation.scenarios.length < 2 ||
    !(calculation.sensitivity.highPercent > calculation.sensitivity.lowPercent)
  ) {
    findings.push({
      code: "SENSITIVITY_UNAVAILABLE",
      detail: "the calculation carries no reproducible sensitivity range",
      remedy: "compute the scenario panel from the versioned residual-model assumptions",
    });
  }

  if (calculation.methodologyVersion.trim() === "") {
    findings.push({
      code: "METHODOLOGY_VERSION_MISSING",
      detail: "no methodology version is recorded on the calculation",
      remedy: "record the approved methodology version the calculation ran under",
    });
  }
  if (calculation.residualModelVersion.trim() === "") {
    findings.push({
      code: "MODEL_VERSION_MISSING",
      detail: "no residual-model version is recorded on the calculation",
      remedy: "record the residual-model version the denominator was built under",
    });
  }

  // Major-economy disclosure. The gate is on the disclosure, not on the observation.
  const observedCodes = new Set(economies.map((e) => e.economy));
  const undisclosed = calculation.unobservedMajorEconomies.filter(
    (e) =>
      e.gdpShareOfWorld >= thresholds.majorEconomyDisclosureThreshold &&
      !observedCodes.has(e.economy) &&
      e.reason.trim() === "",
  );
  if (undisclosed.length > 0) {
    findings.push({
      code: "MAJOR_ECONOMY_NOT_DISCLOSED",
      detail: `${undisclosed.map((e) => e.economy).join(", ")} exceed the disclosure threshold with no stated reason`,
      remedy: "name the economy, its GDP weight and why it is unobserved on the published surface",
    });
  }

  // Numerator arithmetic.
  const numeratorProblems = checkNumerator(calculation.numerator);
  if (numeratorProblems.length > 0) {
    findings.push({
      code: "NUMERATOR_INVALID",
      detail: `the Bitcoin market capitalization observation fails its own checks: ${numeratorProblems.join(", ")}`,
      remedy: "re-take the observation; supply, height, venue rows and the median must agree",
    });
  }

  // Numerator rights. Until Phase 2D this was checked only by the readiness report, which
  // meant the gate could pass a calculation whose price Urdais was not permitted to
  // publish. The numerator's sources are held to the same standard as the denominator's:
  // cleared against a retained terms artifact, for the use actually performed.
  // Phase 2E widens what satisfies this by exactly one state and no more.
  // `inferred_permitted` passes here because an explicit product decision says Urdais
  // proceeds on the inference; `under_review` and `blocked` still refuse. The denominator
  // is untouched by this: its constituents are checked against `"cleared"` literally,
  // above, and cannot reach `mayPublishNumeratorFrom` at all.
  const numeratorSlugs = numeratorSourceInterfaces(calculation.numerator);
  const numeratorProblemsBySlug = new Map<string, string>();
  for (const slug of numeratorSlugs) {
    const iface = sourceInterface(slug);
    if (iface === undefined) {
      numeratorProblemsBySlug.set(slug, "not registered");
      continue;
    }
    const status = effectiveRightsStatus(iface);
    if (!mayPublishNumeratorFrom(status)) numeratorProblemsBySlug.set(slug, status);
  }
  if (numeratorProblemsBySlug.size > 0) {
    findings.push({
      code: "NUMERATOR_SOURCE_NOT_RIGHTS_CLEARED",
      detail:
        `numerator source(s) not cleared for the use actually performed -- retaining the reading, ` +
        `deriving a commercial index from it and displaying it: ` +
        [...numeratorProblemsBySlug].map(([slug, state]) => `${slug} (${state})`).join(", "),
      remedy:
        "clear the interface's terms for that use and retain the artifact, or replace the venue under " +
        "a defined eligibility rule; a venue may not be swapped silently, because the venue set is part " +
        "of the methodology",
    });
  }

  // The evidence behind every rights state must be structurally sound. This cannot prove
  // a hash is right -- only `npm run ubwi:verify-terms` against the retained bytes can do
  // that -- but it refuses a hash that is not a hash, a 404 body cited as terms, a
  // retrieval timestamped in the future, and one hash cited for two different documents.
  // Checked against the wall clock, not the calculation instant: evidence retrieved
  // after a calculation is still evidence, and the thing being caught here is a
  // timestamp that could not have happened at all.
  const shapeFindings = checkTermsArtifactShape(SOURCE_INTERFACES);
  if (shapeFindings.length > 0) {
    findings.push({
      code: "TERMS_ARTIFACT_INTEGRITY_FAILED",
      detail: `${shapeFindings.length} terms-artifact record(s) fail their structural checks: ${shapeFindings
        .map((f) => `${f.slug} (${f.problem})`)
        .join(", ")}`,
      remedy:
        "re-retrieve the document, hash the actual bytes, and quote a clause that occurs in it; " +
        "no hash may be typed by hand",
    });
  }

  return {
    passed: findings.length === 0,
    thresholdsVersion: thresholds.version,
    findings,
    measures: {
      imputedShareOfWealth: imputed,
      rightsClearedGdpCoverage: coverage,
      vintageDispersionYears: dispersion,
      oldestReferenceYear: oldest,
      newestReferenceYear: newest,
      rightsClearedConstituents: calculation.coverage.rightsClearedEconomyCount,
      totalConstituents: economies.length,
    },
  };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(2)} %`;
}
