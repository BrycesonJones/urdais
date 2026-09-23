/**
 * The public Flexible Capacity surface.
 *
 * This is the whole product contract. If the chart component disappeared tomorrow, what this file
 * returns would still describe Flexible Capacity completely: the frontend renders this, it does
 * not define it, and the API serialises the same object the page receives.
 *
 * It recomputes nothing. FC-3 solved every scenario under the approved methodology, validated it
 * against its output contract, and stored it beside the run that produced it. Re-solving here
 * would create a second, unversioned definition of the product; instead this reads what was
 * stored and normalises it into a shape an external client can use without knowing the schema.
 *
 * **A refusal is a result.** Methodology 1.1.0 refuses a market-year whose coverage is short,
 * whose peak day has a hole in it, whose data has a contiguous gap longer than an hour, or whose
 * maximum is not a peak any publisher can have meant. Those years appear here with their reason,
 * not as absences. Hiding them would leave a year selector with unexplained holes and would quietly
 * imply that the years shown are the only ones that exist.
 *
 * **There is no total.** Each market sets its own peak reference from its own demand. Markets are
 * never summed, no national figure exists, and the contract check refuses a payload that has grown
 * one.
 */

import {
  DEFAULT_ALPHA, DEFAULT_ALPHA_SCENARIOS, MAXIMUM_CONTIGUOUS_GAP_HOURS, METHODOLOGY_SLUG,
  METHODOLOGY_VERSION, MINIMUM_ANNUAL_COVERAGE, PEAK_PLAUSIBILITY_MAX_OVER_P999,
  PEAK_REFERENCE_RULE, PEAK_REGION_RULE, STANDING_LIMITATIONS,
  assertMethodologyApproved, assertPublicationAuthorized,
} from "@/lib/flexible-capacity/methodology";
import { MARKET_TIMEZONES } from "@/lib/flexible-capacity/period";
import type { FlexibleCapacitySqlExecutor } from "@/lib/flexible-capacity/analytics/store";
import {
  FLEXIBLE_CAPACITY_MARKETS, type FlexibleCapacityMarket,
} from "@/lib/flexible-capacity/types";

export const METHODOLOGY_PATH = "/docs/methodology/flexible-capacity";

export const SEPARATION_NOTE =
  "Each balancing authority sets its own peak reference from its own demand. Markets are never "
  + "summed and there is no national Flexible Capacity figure: headroom in one market cannot serve "
  + "load in another, which is the transmission question this methodology does not represent.";

export const SCENARIO_NOTE =
  "A scenario over observed demand, not a measurement of available capacity. It estimates how much "
  + "additional flat electrical load could have stayed below the modelled year's observed peak if "
  + "that new load accepted the selected annual curtailment-energy allowance.";

/** Why a whole product, rather than one market-year, has nothing to show. */
export type AvailabilityState = "available" | "unavailable";

export type UnavailableReason =
  | "no_database_configured"
  | "no_validated_analytics"
  | "methodology_not_approved"
  | "publication_not_authorized";

/** Why one market-year has no scenario. The codes are methodology 1.1.0's own refusal reasons. */
export type EligibilityState = "eligible" | "ineligible";

export type IneligibilityReason =
  | "annual_coverage_below_floor"
  | "peak_day_incomplete"
  | "contiguous_gap_too_long"
  | "peak_implausible"
  | "gap_threshold_unresolved"
  | "series_empty"
  | "not_modelled";

export type ScenarioView = {
  /** The annual curtailment energy allowance, as a fraction. */
  readonly alpha: number;
  /** alpha x T. An energy equivalence, never a count of clock hours. */
  readonly equivalentFullLoadHours: number;
  readonly curtailmentEnabledHeadroomMw: number;
  readonly curtailmentEnabledHeadroomGw: number;
  readonly curtailedEnergyMwh: number;
  readonly allowedCurtailmentEnergyMwh: number;
  /** Hours in which any curtailment occurs. A different quantity from the line above. */
  readonly clockHours: number;
  readonly eventCount: number;
  readonly meanEventDurationHours: number;
  readonly maxEventDurationHours: number;
};

export type ObservedBasis = {
  readonly peakMw: number;
  readonly peakAtUtc: string;
  /** The peak instant rendered in the market's own zone, which is where a peak belongs. */
  readonly peakAtLocal: string;
  readonly observationCount: number;
  readonly expectedObservationCount: number;
  readonly coverageRatio: number;
  readonly missingHours: number;
  readonly maximumContiguousGapHours: number;
  readonly periodStartUtc: string;
  readonly periodEndUtc: string;
};

export type MarketYearView = {
  readonly year: number;
  readonly eligibility: {
    readonly state: EligibilityState;
    readonly reason: IneligibilityReason | null;
    /** Plain-language detail, safe to render. Never an internal error or a stack. */
    readonly detail: string | null;
  };
  /** Null for a refused year: there is no observed basis worth publishing for one. */
  readonly observed: ObservedBasis | null;
  /** Empty for a refused year. A refusal never carries a headroom figure. */
  readonly scenarios: readonly ScenarioView[];
};

export type MarketView = {
  readonly slug: FlexibleCapacityMarket;
  readonly name: string;
  readonly timezone: string;
  /** Every modelled year, newest first, refusals included. */
  readonly years: readonly MarketYearView[];
  /** The newest year that produced scenarios, or null when none did. */
  readonly latestEligibleYear: number | null;
  /** The newest year modelled at all, eligible or not. */
  readonly latestModelledYear: number | null;
};

export type FlexibleCapacityReadModel = {
  readonly product: { readonly slug: string; readonly title: string; readonly summary: string };
  readonly methodology: {
    readonly slug: string;
    readonly version: string;
    readonly digest: string | null;
    readonly documentPath: string;
    readonly title: string;
    /** Registry approval state at read time, not a claim from a document. */
    readonly approved: boolean;
  };
  readonly availability: { readonly state: AvailabilityState; readonly reason: UnavailableReason | null };
  readonly generatedAt: string;
  /** When the newest stored scenario was calculated. Null when nothing is stored. */
  readonly calculatedAt: string | null;
  readonly assumptions: {
    readonly annualCurtailmentEnergyFractions: readonly number[];
    readonly defaultAlpha: number;
    readonly peakReferenceRule: string;
    readonly peakRegionRule: string;
    readonly batteryEnabled: false;
    readonly marketAggregationRule: string;
    readonly minimumAnnualCoverage: number;
    readonly maximumContiguousGapHours: number | null;
    readonly peakPlausibilityMaxOverP999: number;
  };
  readonly source: {
    readonly name: string;
    readonly attribution: string;
    readonly measure: string;
  };
  readonly markets: readonly MarketView[];
  readonly limitations: readonly string[];
  readonly notes: readonly string[];
};

const PRODUCT = {
  slug: "flexible-capacity",
  title: "Flexible Capacity",
  summary: "Curtailment-enabled headroom: how much additional flat electrical load a balancing "
    + "authority could have carried below its own observed peak, for a stated annual "
    + "curtailment-energy allowance.",
} as const;

const MARKET_NAMES: Readonly<Record<FlexibleCapacityMarket, string>> = {
  ercot: "ERCOT", pjm: "PJM", miso: "MISO", spp: "SPP",
  caiso: "CAISO", nyiso: "NYISO", "iso-ne": "ISO-NE",
};

const SOURCE = {
  name: "EIA Form 930, hourly demand",
  attribution: "U.S. Energy Information Administration, Hourly Electric Grid Monitor (Form EIA-930).",
  measure: "Observed hourly actual demand, by balancing authority.",
} as const;

function baseModel(now: () => Date): Omit<FlexibleCapacityReadModel, "availability" | "markets" | "calculatedAt" | "methodology"> {
  return {
    product: PRODUCT,
    generatedAt: now().toISOString(),
    assumptions: {
      annualCurtailmentEnergyFractions: [...DEFAULT_ALPHA_SCENARIOS],
      defaultAlpha: DEFAULT_ALPHA,
      peakReferenceRule: PEAK_REFERENCE_RULE,
      peakRegionRule: PEAK_REGION_RULE,
      batteryEnabled: false,
      marketAggregationRule: "per_balancing_authority_no_aggregation",
      minimumAnnualCoverage: MINIMUM_ANNUAL_COVERAGE,
      maximumContiguousGapHours: MAXIMUM_CONTIGUOUS_GAP_HOURS,
      peakPlausibilityMaxOverP999: PEAK_PLAUSIBILITY_MAX_OVER_P999,
    },
    source: SOURCE,
    limitations: STANDING_LIMITATIONS,
    notes: [SCENARIO_NOTE, SEPARATION_NOTE],
  };
}

/**
 * The model served when there is nothing to serve.
 *
 * A real object rather than an error, because "no scenario has been published yet" is a state the
 * product has and should describe, not a failure. It carries the methodology and the assumptions
 * so a client can still say what the product *would* mean.
 */
export function unavailableFlexibleCapacityModel(
  reason: UnavailableReason = "no_validated_analytics",
  options: { now?: () => Date; approved?: boolean } = {},
): FlexibleCapacityReadModel {
  const now = options.now ?? (() => new Date());
  return {
    ...baseModel(now),
    methodology: {
      slug: METHODOLOGY_SLUG, version: METHODOLOGY_VERSION, digest: null,
      documentPath: METHODOLOGY_PATH, title: "Flexible Capacity",
      approved: options.approved ?? false,
    },
    availability: { state: "unavailable", reason },
    calculatedAt: null,
    markets: [],
  };
}

const localTime = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));

const number = (value: unknown): number => Number(value);

/** Refusal codes the analytics layer records, mapped onto the ones this contract publishes. */
function ineligibilityReason(codes: readonly string[]): IneligibilityReason {
  const known: IneligibilityReason[] = [
    "peak_implausible", "peak_day_incomplete", "contiguous_gap_too_long",
    "annual_coverage_below_floor", "gap_threshold_unresolved", "series_empty",
  ];
  return known.find((code) => codes.includes(code)) ?? "not_modelled";
}

/**
 * Load the published surface.
 *
 * Two gates before any figure is assembled, and they answer different questions. The methodology
 * guard asks whether the rules are authorised; the publication guard asks whether every value
 * those rules need has been decided. Both are registry reads, and either failing means the model
 * comes back unavailable rather than partly populated.
 *
 * Version selection is explicit. Only results tied to the approved methodology version are read,
 * so results calculated under a superseded version stay stored and can never become current by
 * accident.
 */
export async function loadFlexibleCapacityReadModel(
  sql: FlexibleCapacitySqlExecutor,
  options: { now?: () => Date } = {},
): Promise<FlexibleCapacityReadModel> {
  const now = options.now ?? (() => new Date());

  let methodologyVersionId: string;
  try {
    ({ methodologyVersionId } = await assertMethodologyApproved(sql));
  } catch {
    return unavailableFlexibleCapacityModel("methodology_not_approved", { now, approved: false });
  }
  try {
    await assertPublicationAuthorized(sql);
  } catch {
    return unavailableFlexibleCapacityModel("publication_not_authorized", { now, approved: true });
  }

  const digestRow = await sql.query(
    `select content_hash from reference.methodology_versions where id = $1`, [methodologyVersionId]);
  const digest = digestRow.rows[0]?.content_hash == null ? null : String(digestRow.rows[0]!.content_hash);

  // Results, newest calculation first, for the approved version only. Results are append-only and
  // are reused across runs, so they are read by methodology version rather than by run id.
  const results = await sql.query(
    `select ga.slug as market, r.local_year, r.alpha::float8 as alpha,
            r.equivalent_full_load_hours::float8 as equivalent_full_load_hours,
            r.headroom_mw::float8 as headroom_mw,
            r.curtailed_energy_mwh::float8 as curtailed_energy_mwh,
            r.curtailment_budget_mwh::float8 as curtailment_budget_mwh,
            r.curtailment_clock_hours, r.curtailment_event_count,
            r.mean_curtailment_event_hours::float8 as mean_curtailment_event_hours,
            r.max_curtailment_event_hours,
            r.peak_reference_mw::float8 as peak_reference_mw, r.peak_reference_at,
            r.observation_count, r.expected_observation_count,
            r.missing_observation_count, r.coverage_ratio::float8 as coverage_ratio,
            r.max_contiguous_gap_hours, r.period_start, r.period_end, r.calculated_at
       from pipeline.flexible_capacity_scenario_results r
       join reference.grid_areas ga on ga.id = r.grid_area_id
      where r.methodology_version_id = $1
      order by ga.slug, r.local_year desc, r.alpha, r.calculated_at desc`,
    [methodologyVersionId],
  );

  // Refusals come from the newest validated run: a market-year it declined to model is a product
  // result, and the run ledger is where the reason lives.
  const runs = await sql.query(
    `select market_years_skipped
       from pipeline.flexible_capacity_analytics_runs
      where methodology_version_id = $1 and run_status = 'validated' and run_kind = 'production'
      order by started_at desc limit 1`,
    [methodologyVersionId],
  );
  const skippedRaw = runs.rows[0]?.market_years_skipped;
  const skipped = Array.isArray(skippedRaw) ? skippedRaw as Record<string, unknown>[] : [];

  type YearAccumulator = { observed: ObservedBasis; scenarios: Map<number, ScenarioView>; calculatedAt: string };
  const byMarket = new Map<FlexibleCapacityMarket, Map<number, YearAccumulator>>();
  let newestCalculatedAt: string | null = null;

  for (const row of results.rows) {
    const market = String(row.market) as FlexibleCapacityMarket;
    if (!FLEXIBLE_CAPACITY_MARKETS.includes(market)) continue;
    const year = Number(row.local_year);
    const calculatedAt = new Date(row.calculated_at as string | Date).toISOString();
    if (newestCalculatedAt === null || calculatedAt > newestCalculatedAt) newestCalculatedAt = calculatedAt;

    const years = byMarket.get(market) ?? new Map<number, YearAccumulator>();
    byMarket.set(market, years);
    const peakAtUtc = new Date(row.peak_reference_at as string | Date).toISOString();
    const existing = years.get(year) ?? {
      calculatedAt,
      observed: {
        peakMw: number(row.peak_reference_mw),
        peakAtUtc,
        peakAtLocal: localTime(peakAtUtc, MARKET_TIMEZONES[market]),
        observationCount: Number(row.observation_count),
        expectedObservationCount: Number(row.expected_observation_count),
        coverageRatio: number(row.coverage_ratio),
        missingHours: Number(row.missing_observation_count),
        maximumContiguousGapHours: Number(row.max_contiguous_gap_hours),
        periodStartUtc: new Date(row.period_start as string | Date).toISOString(),
        periodEndUtc: new Date(row.period_end as string | Date).toISOString(),
      },
      scenarios: new Map<number, ScenarioView>(),
    };
    years.set(year, existing);

    const alpha = number(row.alpha);
    // Ordered newest calculation first, so the first row for an alpha is the one that stands.
    if (!existing.scenarios.has(alpha)) {
      existing.scenarios.set(alpha, {
        alpha,
        equivalentFullLoadHours: number(row.equivalent_full_load_hours),
        curtailmentEnabledHeadroomMw: number(row.headroom_mw),
        curtailmentEnabledHeadroomGw: number(row.headroom_mw) / 1000,
        curtailedEnergyMwh: number(row.curtailed_energy_mwh),
        allowedCurtailmentEnergyMwh: number(row.curtailment_budget_mwh),
        clockHours: Number(row.curtailment_clock_hours),
        eventCount: Number(row.curtailment_event_count),
        meanEventDurationHours: number(row.mean_curtailment_event_hours),
        maxEventDurationHours: Number(row.max_curtailment_event_hours),
      });
    }
  }

  // Refusals join the same market/year map, so the year selector shows a complete run of years.
  const refusals = new Map<string, { reason: IneligibilityReason; detail: string }>();
  for (const entry of skipped) {
    const market = String(entry.market ?? "") as FlexibleCapacityMarket;
    const year = Number(entry.localYear);
    if (!FLEXIBLE_CAPACITY_MARKETS.includes(market) || !Number.isInteger(year)) continue;
    const codes = Array.isArray(entry.failureCodes) ? entry.failureCodes.map(String) : [];
    refusals.set(`${market}|${year}`, {
      reason: ineligibilityReason(codes),
      detail: typeof entry.reason === "string" ? entry.reason : "",
    });
    if (!byMarket.has(market)) byMarket.set(market, new Map());
  }

  const markets: MarketView[] = [];
  for (const market of FLEXIBLE_CAPACITY_MARKETS) {
    const years = byMarket.get(market);
    if (years === undefined && ![...refusals.keys()].some((key) => key.startsWith(`${market}|`))) continue;

    const yearNumbers = new Set<number>([...(years?.keys() ?? [])]);
    for (const key of refusals.keys()) {
      const [slug, year] = key.split("|");
      if (slug === market) yearNumbers.add(Number(year));
    }

    const views: MarketYearView[] = [...yearNumbers].sort((left, right) => right - left).map((year) => {
      const refusal = refusals.get(`${market}|${year}`);
      const accumulated = years?.get(year);
      if (refusal !== undefined || accumulated === undefined) {
        return {
          year,
          eligibility: {
            state: "ineligible" as const,
            reason: refusal?.reason ?? "not_modelled",
            detail: refusal?.detail === "" ? null : refusal?.detail ?? null,
          },
          observed: null,
          scenarios: [],
        };
      }
      return {
        year,
        eligibility: { state: "eligible" as const, reason: null, detail: null },
        observed: accumulated.observed,
        scenarios: [...accumulated.scenarios.values()].sort((left, right) => left.alpha - right.alpha),
      };
    });

    const eligibleYears = views.filter((view) => view.eligibility.state === "eligible").map((view) => view.year);
    markets.push({
      slug: market,
      name: MARKET_NAMES[market],
      timezone: MARKET_TIMEZONES[market],
      years: views,
      latestEligibleYear: eligibleYears.length === 0 ? null : Math.max(...eligibleYears),
      latestModelledYear: views.length === 0 ? null : Math.max(...views.map((view) => view.year)),
    });
  }

  const anyEligible = markets.some((market) => market.latestEligibleYear !== null);
  return {
    ...baseModel(now),
    methodology: {
      slug: METHODOLOGY_SLUG, version: METHODOLOGY_VERSION, digest,
      documentPath: METHODOLOGY_PATH, title: "Flexible Capacity", approved: true,
    },
    availability: anyEligible
      ? { state: "available", reason: null }
      : { state: "unavailable", reason: "no_validated_analytics" },
    calculatedAt: newestCalculatedAt,
    markets,
  };
}
