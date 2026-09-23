/**
 * Flexible Capacity methodology 1.0.0.
 *
 * Every analytical judgement the product makes lives here or in the document this file is pinned
 * to. Ingestion makes none: EIA-930 hourly demand is recorded as the publisher reported it, and
 * nothing in the Power Delivery path knows Flexible Capacity exists.
 *
 * What 1.0.0 decides, and what it deliberately refuses to decide, is the substance of this phase:
 *
 *   It decides that the peak reference is the modelled period's own observed maximum, that the
 *   scenario control is an annual curtailment *energy* allowance rather than a count of hours,
 *   that missing hours are excluded and never interpolated, and that the new load is flat with no
 *   rebound.
 *
 *   It refuses to model storage, because interruptible load and storage are not additive and
 *   Urdais holds no deployed-storage inventory for any market; and it refuses to convert
 *   electrical headroom into compute capacity, because nothing in this repository performs that
 *   conversion and no source supports it.
 *
 * Authorisation is a registry check. The presence of the methodology document on disk grants
 * nothing -- a filesystem read is what broke Transmission Headroom's first production cron, where
 * `docs/` is not in the serverless bundle.
 */

import type { FlexibleCapacityMarket, PeakReferenceRule } from "@/lib/flexible-capacity/types";

export const METHODOLOGY_SLUG = "flexible-capacity";
export const METHODOLOGY_VERSION = "1.1.0";
export const METHODOLOGY_DOCUMENT_PATH = "docs/methodology/flexible-capacity.md";

/**
 * SHA-256 of the approved document. Binds this code to the exact bytes that were approved, so a
 * silent edit to the rules cannot pass as the version the figures claim.
 */
export const METHODOLOGY_DOCUMENT_SHA256 =
  "6b902ec56f1314d64cb2130d4475c13e7dd45e93c887067cca9c2cd79420b21e";

/** The published metric. The only quantity 1.0.0 authorises this product to state. */
export const METRIC_CODE = "curtailment_enabled_headroom_gw";

/**
 * Framings this product may not use, in code, copy, API field names or documentation.
 *
 * The output is electrical load headroom under a scenario. Every term below asserts something the
 * model does not establish: that the headroom is compute, that it is capacity rather than a
 * counterfactual, or that it is unlocked rather than hypothetical. The retired mock used the first
 * three of them, which is how this list came to be written down.
 */
export const FORBIDDEN_OUTPUT_TERMS = [
  "unlocked_compute_gw",
  "unlocked compute",
  "additional compute capacity",
  "compute capacity unlocked",
  "total unlocked",
  "unlocked capacity",
] as const;

/** The peak reference rule 1.0.0 adopts. */
export const PEAK_REFERENCE_RULE: PeakReferenceRule = "modeled_period_observed_peak";

/** Alpha's upper bound. A guardrail on the model's domain, not a claim about feasibility. */
export const MAX_ANNUAL_CURTAILMENT_ENERGY_FRACTION = 0.05;

/** The default scenario set. Urdais parameters, recomputed from EIA-930; never copied figures. */
export const DEFAULT_ALPHA_SCENARIOS = [0.0025, 0.005, 0.01] as const;

export const DEFAULT_ALPHA = 0.005;

/**
 * Minimum share of a market-local year that must be present before it may be modelled.
 *
 * Calibrated against measured EIA-930 history rather than chosen. A full backfill of local year
 * 2025 across all seven markets returned 100.0000% for ERCOT, MISO and SPP, 99.9886% for PJM,
 * NYISO and ISO-NE, and 99.9772% for CAISO -- a worst case of two absent hours in 8,760. The floor
 * sits at 99.5%, roughly twenty times that worst case, so an ordinary year passes comfortably
 * while a year that has lost more than about 44 hours does not.
 *
 * It is a floor on *quantity*, and quantity is not the whole risk: 44 hours scattered through a
 * mild spring matter far less than 44 consecutive hours of an August heatwave. `PEAK_REGION_RULE`
 * covers the worst case of that -- the peak day itself must be complete -- and the residual, a
 * bound on contiguous gaps elsewhere, stays unresolved and blocks publication rather than being
 * invented. Methodology 1.0.0 §7.
 */
export const MINIMUM_ANNUAL_COVERAGE = 0.995;

/** 1.0.0: curtailed energy is forgone. It is not deferred into a later hour. */
export const REBOUND_MODEL = "no_rebound";

/** 1.0.0: the hypothetical new load is the same in every hour of the modelled period. */
export const MODELED_LOAD_SHAPE = "flat";

/** 1.0.0: storage contributes nothing. See §9. */
export const BATTERY_ENABLED = false;

/** Published per balancing authority. There is no total, and markets are never added. */
export const MARKET_SCOPE = "per_balancing_authority_no_aggregation";

/**
 * The value a parameter carries when it has an identity but no defensible number yet.
 *
 * Load-bearing, not decorative: `assertPublicationAuthorized` refuses to publish while any
 * parameter of the approved version still reads this.
 */
export const UNRESOLVED = "unresolved";

/**
 * Which hours must be completely present for the peak reference to be trustworthy.
 *
 * The coverage floor bounds how *many* hours are absent; this bounds *where*. The local calendar
 * day containing the observed maximum must be complete, so the reference is never set by a
 * surviving shoulder hour of a day whose actual peak is missing. Deterministic from the observed
 * series and requiring no invented threshold, which is why 1.0.0 can adopt it.
 *
 * It is a necessary condition, not a sufficient one. A complete peak day cannot prove that a gap
 * elsewhere in the year did not contain a higher value; that residual is what
 * `maximum_contiguous_gap_hours` covers, and it stays unresolved.
 */
export const PEAK_REGION_RULE = "local_calendar_day_of_observed_peak";

/**
 * The longest run of consecutive absent hours a market-year may contain and still be modelled.
 *
 * Resolved by FC-3's controlled-deletion study over three years and seven markets, not chosen.
 * Full design and results: `docs/research/flexible-capacity/fc3-gap-sensitivity.md`.
 *
 * Two measurements decide it.
 *
 * **The observed gaps are bimodal.** Across fourteen complete market-years, a gap is either a
 * single isolated hour or a publisher outage of 22 to 25 hours. Nothing between 2 and 21 hours
 * was ever observed. So every threshold in [1, 21] admits exactly the same market-years.
 *
 * **Distortion grows steeply with length.** Worst-case overstatement of D*, adversarially placed
 * outside the peak day, is 3.19% at one hour and 13.40% at twelve. Since the whole interval
 * [1, 21] admits the same years, the choice is free in product terms and the tightest bound wins.
 *
 * At one hour the bound is 3.19% at alpha = 0.25%, 1.58% at 0.50% and 0.77% at 1.00% -- one-sided,
 * always in the direction of overstating headroom, and roughly a sixth of the smallest
 * year-over-year movement measured in D* itself (20.8%). It is a real limitation, reported rather
 * than hidden.
 */
export const MAXIMUM_CONTIGUOUS_GAP_HOURS: number | null = 1;

/**
 * How far a market-year's maximum may exceed the 99.9th percentile of its own hourly loads.
 *
 * This rule exists because FC-3 found a case no coverage rule could catch. SPP published
 * 3,621,097 MW for the hour beginning 2023-06-12T22:00 -- sixty-five times the market's real
 * annual peak of about 56 GW. The year is 100% complete, has no gaps at all, and passes every
 * other condition; taken at face value it produces 3,597 GW of headroom, which is not a number
 * about anything.
 *
 * Canonical evidence is never repaired, so the value stays exactly as the publisher sent it and
 * the *market-year* is refused instead. The factor is measured rather than assumed: across the
 * twenty genuine market-years the maximum sits between 1.008 and 1.063 times the 99.9th
 * percentile, because a real annual peak is by definition near the top of its own distribution.
 * A factor of 1.5 is seven times the widest genuine separation and forty-four times below the
 * defect, so it cannot plausibly reject a real peak and cannot plausibly admit that one.
 */
export const PEAK_PLAUSIBILITY_MAX_OVER_P999 = 1.5;

/** The market FC-3 validates against first, because its history is deepest and its peak sharpest. */
export const VALIDATION_MARKET: FlexibleCapacityMarket = "ercot";

/**
 * The parameter registry as this code expects to find it.
 *
 * Mirrored rather than read at runtime so that a drift between the approved parameters and the
 * code that relies on them is a failing test, not a wrong number in production.
 * `methodology.test.ts` asserts the two agree; the database is the authority.
 */
export type MethodologyParameter = {
  readonly numericValue: number | null;
  readonly textValue: string | null;
  readonly status: "approved" | "draft";
};

export const METHODOLOGY_PARAMETERS = {
  annual_curtailment_energy_fraction_default: { numericValue: DEFAULT_ALPHA, textValue: null, status: "approved" },
  annual_curtailment_energy_fraction_maximum: { numericValue: MAX_ANNUAL_CURTAILMENT_ENERGY_FRACTION, textValue: null, status: "approved" },
  annual_curtailment_energy_fraction_scenarios: { numericValue: null, textValue: "0.0025,0.0050,0.0100", status: "approved" },
  battery_enabled: { numericValue: null, textValue: "false", status: "approved" },
  curtailment_dispatch_foresight: { numericValue: null, textValue: "perfect_within_period", status: "approved" },
  demand_response_inventory: { numericValue: null, textValue: "not_used_in_methodology_1_1_0", status: "approved" },
  deployed_storage_inventory: { numericValue: null, textValue: "not_used_in_methodology_1_1_0", status: "approved" },
  market_scope: { numericValue: null, textValue: MARKET_SCOPE, status: "approved" },
  maximum_contiguous_gap_hours: { numericValue: MAXIMUM_CONTIGUOUS_GAP_HOURS, textValue: null, status: "approved" },
  minimum_annual_coverage: { numericValue: MINIMUM_ANNUAL_COVERAGE, textValue: null, status: "approved" },
  missing_hour_treatment: { numericValue: null, textValue: "excluded_no_interpolation", status: "approved" },
  modeled_load_shape: { numericValue: null, textValue: MODELED_LOAD_SHAPE, status: "approved" },
  peak_reference_rule: { numericValue: null, textValue: PEAK_REFERENCE_RULE, status: "approved" },
  peak_plausibility_max_over_p999: { numericValue: PEAK_PLAUSIBILITY_MAX_OVER_P999, textValue: null, status: "approved" },
  peak_region_coverage_rule: { numericValue: null, textValue: PEAK_REGION_RULE, status: "approved" },
  rebound_model: { numericValue: null, textValue: REBOUND_MODEL, status: "approved" },
  solver_method: { numericValue: null, textValue: "bisection_on_feasible_interval", status: "approved" },
  solver_tolerance_mw: { numericValue: 0.000001, textValue: null, status: "approved" },
  validation_market: { numericValue: null, textValue: VALIDATION_MARKET, status: "approved" },
} satisfies Readonly<Record<string, MethodologyParameter>>;

export class MethodologyRegistrationError extends Error {
  constructor(detail: string) {
    super(`flexible capacity methodology ${METHODOLOGY_VERSION} is not usable: ${detail}`);
    this.name = "MethodologyRegistrationError";
  }
}

/**
 * The authorisation gate for anything that may become a published figure.
 *
 * Registry-backed on purpose. It reads the approval state and the approved digest from the
 * database and needs no filesystem at all, so it behaves identically in a serverless bundle where
 * the repository is not present.
 */
export async function assertMethodologyApproved(
  sql: { query: (text: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
): Promise<{ methodologyVersionId: string }> {
  const result = await sql.query(
    `select mv.id, mv.version, mv.status, mv.content_hash
       from reference.methodology_versions mv
       join reference.methodologies m on m.id = mv.methodology_id
      where m.slug = $1 and mv.version = $2`,
    [METHODOLOGY_SLUG, METHODOLOGY_VERSION],
  );
  const row = result.rows[0];
  if (row === undefined) throw new MethodologyRegistrationError("it is not registered");
  if (String(row.status) !== "approved") {
    throw new MethodologyRegistrationError(`it is ${String(row.status)}, not approved`);
  }
  if (String(row.content_hash) !== METHODOLOGY_DOCUMENT_SHA256) {
    throw new MethodologyRegistrationError(
      `the registered digest ${String(row.content_hash)} is not the ${METHODOLOGY_DOCUMENT_SHA256} `
      + "this code was written against");
  }
  return { methodologyVersionId: String(row.id) };
}

export class MethodologyPublicationBlockedError extends Error {
  readonly unresolvedParameters: readonly string[];
  constructor(unresolved: readonly string[]) {
    super(
      `flexible capacity ${METHODOLOGY_VERSION} may not publish: `
      + `${unresolved.length} methodology parameter(s) are unresolved or unapproved `
      + `(${unresolved.join(", ")}). Resolving them is an authorisation decision, not a code change.`);
    this.name = "MethodologyPublicationBlockedError";
    this.unresolvedParameters = unresolved;
  }
}

export type PublicationAuthorization = {
  readonly methodologyVersionId: string;
  readonly parameterCount: number;
};

/**
 * The gate anything that publishes must pass, in addition to `assertMethodologyApproved`.
 *
 * The two gates answer different questions, and collapsing them would lose the one that matters
 * here. `assertMethodologyApproved` asks whether the *rules* are authorised; this asks whether
 * every value those rules need has actually been decided. A version can be legitimately approved
 * while individual parameters remain open -- that is the whole point of registering an unresolved
 * parameter rather than omitting it -- and a calculation may still be run under those conditions
 * for validation and sensitivity work. What may not happen is that such a run reaches the public.
 *
 * So this **fails closed**: while any parameter of the approved version is not approved, or still
 * carries the `unresolved` sentinel, publication raises. Three parameters are deliberately in that
 * state at 1.0.0, which means Flexible Capacity ships unable to publish until a founder decision
 * resolves them. That is the intended posture, not an oversight: the alternative is an engine that
 * treats "nobody has decided this yet" as "proceed".
 *
 * Registry-backed, like every other authorisation in this product. It reads the rows; it never
 * consults the mirrored constants, which exist only so a drift between the two fails a test.
 */
export async function assertPublicationAuthorized(
  sql: { query: (text: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
): Promise<PublicationAuthorization> {
  const { methodologyVersionId } = await assertMethodologyApproved(sql);
  const result = await sql.query(
    `select parameter_key, status, text_value
       from reference.methodology_parameters
      where methodology_version_id = $1
      order by parameter_key`,
    [methodologyVersionId],
  );
  if (result.rows.length === 0) {
    throw new MethodologyPublicationBlockedError(["<no parameters are registered at all>"]);
  }
  const blocking = result.rows
    .filter((row) => String(row.status) !== "approved"
      || String(row.text_value ?? "").trim().toLowerCase() === UNRESOLVED)
    .map((row) => String(row.parameter_key));
  if (blocking.length > 0) throw new MethodologyPublicationBlockedError(blocking);
  return { methodologyVersionId, parameterCount: result.rows.length };
}

/**
 * Standing limitations, attached to every result rather than left to documentation.
 *
 * The first two exist because the retired mock made exactly those claims, and the third because
 * SPP's own resource-adequacy report already nets demand response out of its demand figures: a
 * future phase that ingests a demand-response inventory and adds it to this scenario would count
 * the same megawatts twice. The note is carried now, while the mistake is still impossible.
 */
export const STANDING_LIMITATIONS: readonly string[] = [
  "A scenario over observed demand, not a forecast and not a measurement of available capacity.",
  "Electrical load headroom. It is not compute capacity, and no conversion to compute is performed or implied.",
  "Generation adequacy only: no transmission, distribution, interconnection or local deliverability limit is represented.",
  "Assumes the new load is flat and that its curtailment is dispatched in exactly the hours required.",
  "Curtailed energy is forgone, not deferred; no rebound is modelled.",
  "Storage contributes nothing in 1.0.0, and is not additive with curtailable load.",
  "Demand response is not an input. Some publishers already net demand response out of demand, so adding an inventory later without accounting for that would double count it.",
  "Published per balancing authority. Markets are not summed and no national figure exists.",
  "A single missing hour outside the peak day can overstate headroom by up to 3.19% at the smallest published curtailment allowance.",
  "A market-year whose maximum is implausibly far above its own distribution is refused, not corrected; the published value stays as the publisher sent it.",
];
