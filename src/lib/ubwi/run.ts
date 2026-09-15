/**
 * The UBWI daily production run: load the denominator and numerator, record the
 * calculation, and publish it if and only if everything that guards a publication agrees.
 *
 * This module is the pipeline. `scripts/ubwi/load-and-publish.ts` is a command-line
 * wrapper around it and `/api/cron/ubwi` is a scheduled wrapper around it, and neither
 * carries a line of calculation or publication logic of its own. A scheduler that
 * reimplemented any part of this would eventually publish something the manual path
 * would have refused.
 *
 * ## The cadence
 *
 * UBWI publishes at most one point per UTC day. It is a wealth index, not a trading
 * product: Bitcoin's share of global wealth does not need an hourly print, and the
 * denominator's national balance sheets change a few times a year. Daily is frequent
 * enough that protocol-scheduled supply and the BTC price both move visibly between
 * points, and slow enough that every point can be a real, separately verified
 * observation.
 *
 * ## The four timestamps, which are four different things
 *
 *   - **Scheduled observation date** -- the UTC calendar date the run is for. This is the
 *     daily identity, and it is derived from the intended observation instant, not from
 *     whenever the process happened to start.
 *   - **Calculation time** -- `ubwi_calculations.calculated_at`, when the arithmetic ran.
 *   - **Chainlink `updatedAt`** -- when the price round the numerator used was written on
 *     chain, recorded on `btc_chainlink_observations`. Not when Urdais read it, and
 *     emphatically not the UBWI publication date.
 *   - **Publication/frozen time** -- `ubwi_publications.published_at`, set at the moment
 *     the point is frozen. This is the canonical UBWI chronology: it is what the read
 *     model orders by, what the "Updated" line shows, and what the chart's x-axis is.
 *
 * The daily identity is the UTC date of `published_at`, so the identity and the
 * chronology cannot drift apart into two different notions of "which day is this point".
 *
 * ## Idempotency
 *
 * Every step is keyed on its own content, not on the clock:
 *
 *   - a wealth vintage is one per (rule version, reference date, observed subtotal)
 *   - a numerator observation is one per (block height, observed instant)
 *   - a calculation is one per (vintage, numerator observation, methodology version)
 *   - a publication is one per calculation, enforced by a unique constraint
 *   - and, added for this cadence, at most one non-superseded frozen publication per UTC
 *     observation date, enforced by a partial unique index in the database
 *
 * The date check here makes a repeat run converge quietly; the index makes two runs that
 * overlap in time converge too, because the loser of the race gets a unique violation and
 * reports the winner's publication rather than a second point. A scheduler retry, a
 * redeployment, an operator running the command by hand and the cron firing at the same
 * moment all end with one frozen point for the day.
 */

import { calculateUbwi, METHODOLOGY_VERSION, RESIDUAL_MODEL_VERSION } from "@/lib/ubwi/calculate";
import { CHAINLINK_BTC_USD_FEED } from "@/lib/ubwi/chainlink";
import { evaluateGate } from "@/lib/ubwi/gate";
import type { NumeratorProvider } from "@/lib/ubwi/retrieve/numerator-provider";
import { liveNumeratorProvider } from "@/lib/ubwi/retrieve/numerator-provider";
import type { RetrievalProblem } from "@/lib/ubwi/retrieve/problems";
import { isNumeratorRetrievalError } from "@/lib/ubwi/retrieve/problems";
import { sourceInterface } from "@/lib/ubwi/rights";
import type { UbwiCalculation } from "@/lib/ubwi/types";

export type UbwiSql = {
  query(text: string, params: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

const RULE_SLUG = "observed-set-ratio-cwon-tail";
const GATE_VERSION = "1.0.0";

/**
 * The daily schedule, in Vercel cron syntax: 06:00 UTC, every day.
 *
 * Why 06:00 and not midnight. The news job already holds `0 0 * * *`, and midnight is the
 * one time of day where a few seconds of clock skew, a retry that straddles the hour, or
 * a queued invocation that lands late changes which UTC date the run belongs to. The
 * daily identity is a UTC date, so a boundary run is exactly the case that could produce
 * two points for one intended observation or none for another. 06:00 UTC is six hours
 * clear of both boundaries: no plausible delay moves it across a date line. It is a fixed
 * UTC hour, so no daylight-saving transition anywhere shifts it, and it is close to the
 * 04:33 UTC hour at which the first production point was frozen, which keeps the
 * accumulated series roughly evenly spaced.
 */
export const UBWI_DAILY_CRON_SCHEDULE = "0 6 * * *";
export const UBWI_DAILY_CRON_PATH = "/api/cron/ubwi";
/** The documented observation hour, kept beside the schedule it must agree with. */
export const UBWI_DAILY_OBSERVATION_UTC_HOUR = 6;

/** The scheduled observation date: the UTC calendar date of an instant, as `YYYY-MM-DD`. */
export function ubwiObservationDate(instant: Date | string): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new Error(`not a valid instant: ${String(instant)}`);
  return date.toISOString().slice(0, 10);
}

export type UbwiRunOutcome =
  /** A new point was frozen for this observation date. */
  | "published"
  /** A frozen point already exists for this observation date; nothing was written. */
  | "already_published"
  /** The publication gate refused. The calculation is recorded; no point exists. */
  | "gate_refused"
  /** The price round is older than the feed's heartbeat at the observation instant. */
  | "observation_stale"
  /**
   * No numerator could be retrieved at all: an endpoint was unreachable, the two RPC
   * endpoints disagreed about the round, the two chain-tip sources disagreed about the
   * height, a response did not decode, or the assembled observation failed its own checks.
   *
   * Kept separate from `observation_stale` because they are different facts about the
   * world. Stale means the sources answered and the answer is too old to use; this means
   * the sources did not give a usable answer. Both write nothing.
   */
  | "retrieval_failed";

export type UbwiRunResult = {
  outcome: UbwiRunOutcome;
  /** The UTC date this run was for. */
  observationDate: string;
  /** When the arithmetic ran. */
  calculatedAt: string;
  /** Null where the run failed before a calculation existed, which only retrieval can do. */
  valuePercent: number | null;
  methodologyVersion: string;
  residualModelVersion: string;
  publicationId: string | null;
  calculationId: string | null;
  gateFailures: string[];
  /** Age of the price round at the observation instant, in seconds. */
  priceAgeSeconds: number | null;
  /** Which fail-closed retrieval problem ended the run, where one did. */
  retrievalProblem: RetrievalProblem | null;
  /** One line an operator or a cron log can read without further lookup. */
  detail: string;
};

async function one(
  sql: UbwiSql,
  text: string,
  params: readonly unknown[] = [],
): Promise<Record<string, unknown> | null> {
  const { rows } = await sql.query(text, params);
  return rows[0] ?? null;
}

/** Look up an id, or fail with a message that names the missing reference row. */
async function requireId(
  sql: UbwiSql,
  text: string,
  params: readonly unknown[],
  what: string,
): Promise<string> {
  const row = await one(sql, text, params);
  if (!row || typeof row.id !== "string") {
    throw new Error(`missing reference data: ${what}. Apply the UBWI migrations first.`);
  }
  return row.id;
}

export async function loadDenominator(sql: UbwiSql, c: UbwiCalculation): Promise<string> {
  const ruleId = await requireId(
    sql,
    "select id from reference.wealth_estimation_rules where slug = $1 and version = $2",
    [RULE_SLUG, RESIDUAL_MODEL_VERSION],
    `estimation rule ${RULE_SLUG} ${RESIDUAL_MODEL_VERSION}`,
  );

  // Identity: one vintage per (rule version, reference date, observed subtotal). Re-running
  // the same inputs finds the existing row rather than inserting a second. This is also
  // what makes a daily cadence cheap on the denominator: the wealth vintage is expected to
  // stay put for months at a time, until a national balance sheet is admitted through the
  // normal methodology and provenance process, and every day in between reuses it.
  const referenceDate = c.observed
    .map((e) => e.referenceDate)
    .reduce((latest, d) => (d > latest ? d : latest), "0000-00-00");

  const existing = await one(
    sql,
    `select id from pipeline.wealth_vintages
      where estimation_rule_id = $1 and reference_date = $2
        and abs(observed_wealth_usd - $3::numeric) <= $3::numeric * 1e-9`,
    [ruleId, referenceDate, c.observedWealthUsd],
  );
  if (existing && typeof existing.id === "string") return existing.id;

  const inserted = await one(
    sql,
    `insert into pipeline.wealth_vintages (
       estimation_rule_id, reference_date, compiled_at,
       observed_wealth_usd, imputed_wealth_usd, total_wealth_usd,
       observed_ratio, tail_calibration, central_tail_ratio,
       unobserved_gdp_usd, world_gdp_usd, world_gdp_source,
       observed_economy_count, observed_gdp_coverage, rights_cleared_gdp_coverage,
       observed_wealth_coverage, imputed_share_of_wealth, notes
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     returning id`,
    [
      ruleId,
      referenceDate,
      c.calculatedAt,
      c.observedWealthUsd,
      c.modeledWealthUsd,
      c.observedWealthUsd + c.modeledWealthUsd,
      c.residual.observedRatio,
      c.residual.tailCalibration,
      c.residual.centralTailRatio,
      c.residual.unobservedGdpUsd,
      c.residual.worldGdpUsd,
      c.residual.worldGdpSource,
      c.coverage.observedEconomyCount,
      c.coverage.observedGdpCoverage,
      c.coverage.rightsClearedGdpCoverage,
      c.coverage.observedWealthCoverage,
      c.modeledWealthUsd / (c.observedWealthUsd + c.modeledWealthUsd),
      `UBWI Production V1. Excluded by the vintage rule: ${c.excluded.map((e) => `${e.economy} ${e.referenceDate}`).join(", ")}.`,
    ],
  );
  const vintageId = inserted!.id as string;

  for (const e of c.observed) {
    const ifaceId = await requireId(
      sql,
      "select id from reference.source_interfaces where slug = $1",
      [e.sourceInterface],
      `source interface ${e.sourceInterface}`,
    );
    const fxId =
      e.fx.sourceInterface === "ecb-euro-reference-rates"
        ? await requireId(
            sql,
            "select id from reference.source_interfaces where slug = $1",
            [e.fx.sourceInterface],
            `FX interface ${e.fx.sourceInterface}`,
          )
        : null;
    const iface = sourceInterface(e.sourceInterface);
    await sql.query(
      `insert into pipeline.wealth_vintage_components (
         vintage_id, economy_code, reference_date, value_national_currency, currency, value_usd,
         fx_basis, fx_rate_lcu_per_usd, fx_fixing_date, fx_source_interface_id,
         source_interface_id, source_series, source_type, source_frequency, period_selection_rule,
         acquisition_mode, verification_evidence, observation_status, rights_status,
         land_treatment, consumer_durables_treatment,
         consumer_durables_stripped_usd, consumer_durables_source_series,
         gdp_usd_2024, gdp_usd_reference_year, note
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
      [
        vintageId,
        e.economy,
        e.referenceDate,
        e.valueNationalCurrency,
        e.currency,
        e.valueUsd,
        e.fx.basis,
        e.fx.rateLcuPerUsd,
        e.fx.fixingDate,
        fxId,
        ifaceId,
        e.sourceSeries,
        e.sourceType,
        e.economy === "CAN" ? "quarterly" : "annual",
        e.economy === "CAN"
          ? "the latest published observation at or before 31 December of the latest complete calendar year"
          : null,
        e.acquisitionMode,
        e.acquisitionMode === "manual_verified"
          ? `Read from the first-party ${iface?.providerName ?? "compiler"} table and retained. ${e.sourceSeries}`
          : null,
        e.observationStatus,
        e.rightsStatus,
        e.landTreatment,
        e.consumerDurablesTreatment,
        // The schema requires both the amount and the compiler's own line wherever
        // durables were stripped, so that two compilers are not summed on different bases.
        e.consumerDurablesStrippedUsd ?? null,
        e.consumerDurablesSourceSeries ?? null,
        e.gdpUsd2024,
        e.gdpUsdReferenceYear,
        e.note,
      ],
    );
  }

  for (const e of c.unobservedMajorEconomies) {
    await sql.query(
      `insert into pipeline.wealth_vintage_unobserved_economies
         (vintage_id, economy_code, economy_name, gdp_share_of_world, reason)
       values ($1,$2,$3,$4,$5) on conflict do nothing`,
      [vintageId, e.economy, e.name, e.gdpShareOfWorld, e.reason],
    );
  }

  return vintageId;
}

export async function loadNumerator(sql: UbwiSql, c: UbwiCalculation): Promise<string> {
  const n = c.numerator;
  // Identity: one observation per (block height, observed instant).
  const existing = await one(
    sql,
    "select id from pipeline.btc_market_observations where block_height = $1 and observed_at = $2",
    [n.blockHeight, n.observedAt],
  );
  if (existing && typeof existing.id === "string") return existing.id;

  // Null under `protocol_scheduled`: no third party supplies the quantity, so there is no
  // interface to resolve. Looking one up would invent the dependency 1.2.0 removed.
  const supplyIfaceId =
    n.supplySourceInterface === undefined
      ? null
      : await requireId(
          sql,
          "select id from reference.source_interfaces where slug = $1",
          [n.supplySourceInterface],
          `supply interface ${n.supplySourceInterface}`,
        );
  const derivation = n.supplyDerivation;
  const inserted = await one(
    sql,
    `insert into pipeline.btc_market_observations (
       observed_at, block_height, height_confirmed_by, supply_btc, supply_construction,
       supply_source_interface_id, price_rule, price_source_interface_id, venue_count,
       price_usd, market_cap_usd, retrieved_at,
       supply_derivation, supply_derivation_version, supply_rights_basis,
       halving_era, block_subsidy_sats, scheduled_supply_sats
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning id`,
    [
      n.observedAt,
      n.blockHeight,
      n.heightSources,
      n.supplyBtc,
      n.supplyConstruction,
      supplyIfaceId,
      n.priceRule,
      await requireId(
        sql,
        "select id from reference.source_interfaces where slug = $1",
        [n.priceSourceInterface],
        `price interface ${n.priceSourceInterface}`,
      ),
      n.venues?.length ?? null,
      n.priceUsd,
      n.marketCapUsd,
      n.observedAt,
      derivation?.derivation ?? null,
      derivation?.derivationVersion ?? null,
      derivation?.rightsBasis ?? null,
      derivation?.halvingEra ?? null,
      derivation?.blockSubsidySats ?? null,
      derivation?.scheduledSupplySats ?? null,
    ],
  );
  const observationId = inserted!.id as string;

  // The per-source height evidence. Under methodology 1.2.0 the height is the sole input to
  // the supply, so each independent reading is frozen: endpoint, raw bytes, parsed integer,
  // retrieval time and provenance. The database's deferred trigger enforces that at least
  // two readings exist, that they agree exactly, and that they agree with the height the
  // supply was derived from.
  for (const reading of n.heightObservations ?? []) {
    await sql.query(
      `insert into pipeline.btc_height_observations
         (observation_id, source, raw_value, block_height, retrieved_at, provenance)
       values ($1,$2,$3,$4,$5,$6) on conflict do nothing`,
      [
        observationId,
        reading.source,
        reading.rawValue,
        reading.blockHeight,
        reading.retrievedAt,
        reading.provenance,
      ],
    );
  }

  // The Chainlink round, frozen whole. A published point that cannot be re-read from the
  // chain later is not reproducible, and a round id alone stops identifying a round once
  // the aggregator behind the proxy has been replaced.
  const feed = n.chainlink;
  if (feed !== undefined) {
    await sql.query(
      `insert into pipeline.btc_chainlink_observations (
         observation_id, chain_id, proxy_address, aggregator_address, aggregator_type_and_version,
         feed_description, decimals, proxy_version, round_id, phase_id, aggregator_round_id,
         answer, normalized_usd, started_at, updated_at, answered_in_round, retrieval_timestamp,
         block_number, block_hash, rpc_source, rpc_cross_check_source
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                 to_timestamp($14), to_timestamp($15), $16, to_timestamp($17), $18,$19,$20,$21)
       on conflict do nothing`,
      [
        observationId,
        feed.chainId,
        feed.proxyAddress,
        feed.aggregatorAddress,
        feed.aggregatorTypeAndVersion,
        feed.description,
        feed.decimals,
        feed.proxyVersion,
        feed.roundId,
        feed.phaseId,
        feed.aggregatorRoundId,
        feed.answer,
        feed.normalizedUsd,
        feed.startedAt,
        feed.updatedAt,
        feed.answeredInRound,
        feed.retrievalTimestamp,
        feed.blockNumber,
        feed.blockHash,
        feed.rpcSource,
        feed.rpcCrossCheckSource,
      ],
    );
  }

  const venueSlug: Record<string, string> = {
    coinbase: "coinbase-spot",
    bitstamp: "bitstamp-ticker",
    kraken: "kraken-ticker",
  };
  for (const v of n.venues ?? []) {
    const venueId = await requireId(
      sql,
      "select id from reference.source_interfaces where slug = $1",
      [venueSlug[v.venue] ?? v.venue],
      `venue interface for ${v.venue}`,
    );
    await sql.query(
      `insert into pipeline.btc_venue_quotes (observation_id, venue_interface_id, price_usd, retrieved_at, selected)
       values ($1,$2,$3,$4,$5) on conflict do nothing`,
      [observationId, venueId, v.priceUsd, n.observedAt, v.selected],
    );
  }
  return observationId;
}

/**
 * Age of the numerator's price round at the intended observation instant, in seconds, or
 * null where the observation carries no Chainlink lineage at all.
 *
 * This is deliberately a different question from the one `validateChainlinkObservation`
 * asks. That check measures `retrievalTimestamp - updatedAt`: how old the round was when
 * Urdais read it, which is a property frozen into the observation and correctly stays true
 * forever. A scheduled run needs the other measurement -- how old the round is *now*,
 * at the observation this run is supposed to be making. Without it, a daily job would
 * happily republish a price that was fresh when it was captured and is now days old, and
 * every point after the first would be the same observation wearing a new date.
 */
export function priceRoundAgeSeconds(calculation: UbwiCalculation, now: string): number | null {
  const feed = calculation.numerator.chainlink;
  if (feed === undefined) return null;
  const nowUnix = Math.floor(new Date(now).getTime() / 1000);
  return nowUnix - feed.updatedAt;
}

/**
 * Run the daily production publication for one intended observation instant.
 *
 * The numerator is retrieved at execution time unless the caller supplies a calculation.
 * That is the whole of what the live-retrieval slice changed here: everything below this
 * line already existed and is reused rather than reimplemented.
 *
 * Every fail-closed rule that guarded the manual path still guards this one, and two more
 * are added for the cadence:
 *
 *   - a numerator that could not be retrieved -- an unreachable endpoint, two RPC endpoints
 *     that disagree about the round, two chain-tip sources that disagree about the height,
 *     a response that does not decode, an observation that fails its own checks -- ends the
 *     run before a connection is used for anything
 *   - a price round older than the feed's heartbeat at the observation instant is refused
 *     before anything is written
 *   - a stale, wrong-feed or wrong-network Chainlink round, a block-height disagreement, a
 *     failed denominator gate and a rights or provenance failure all reach the same place:
 *     the gate refuses, the calculation is recorded so the refusal is auditable, and no
 *     publication row is created
 *   - a day that fails produces no point at all, and the next day that passes simply
 *     publishes its own. Nothing is interpolated into the gap, and nothing is back-filled
 *     into it later.
 */
export async function runDailyUbwiPublication(
  sql: UbwiSql,
  options: {
    /** The intended observation instant, ISO 8601. Injected, never read from the clock here. */
    now: string;
    /**
     * A ready-made calculation, for the callers that already have one: the operator command
     * prints a calculation before deciding to write it, and the tests need determinism.
     * Supplying one skips retrieval; supplying none retrieves.
     */
    calculation?: UbwiCalculation;
    /**
     * Where a numerator comes from when none is supplied. Defaults to the live retrieval
     * against the Chainlink proxy and the two chain-tip sources.
     *
     * This is the seam that ended the compile-time numerator. Before it, a scheduled run
     * recalculated the one committed observation every day and correctly refused to publish
     * it, so the series could never grow. There is no path from here to that constant.
     */
    retrieveNumerator?: NumeratorProvider;
    publisherIdentity?: string;
  },
): Promise<UbwiRunResult> {
  const now = options.now;
  const observationDate = ubwiObservationDate(now);
  const publisherIdentity = options.publisherIdentity ?? "urdais-ubwi/load-and-publish";

  let calculation: UbwiCalculation;
  if (options.calculation !== undefined) {
    calculation = options.calculation;
  } else {
    const retrieve = options.retrieveNumerator ?? liveNumeratorProvider();
    try {
      const retrieval = await retrieve();
      calculation = calculateUbwi({ calculatedAt: now, numerator: retrieval.observation });
    } catch (error) {
      // Fail closed, before a single row is written and before a connection is used for
      // anything. A run that could not observe the world publishes nothing and says why.
      if (!isNumeratorRetrievalError(error)) throw error;
      const stale = error.problem === "FEED_OBSERVATION_STALE";
      return {
        observationDate,
        calculatedAt: now,
        valuePercent: null,
        methodologyVersion: METHODOLOGY_VERSION,
        residualModelVersion: RESIDUAL_MODEL_VERSION,
        gateFailures: [],
        priceAgeSeconds: null,
        retrievalProblem: error.problem,
        outcome: stale ? "observation_stale" : "retrieval_failed",
        publicationId: null,
        calculationId: null,
        detail:
          `no numerator could be retrieved for ${observationDate}: ${error.message}. ` +
          "nothing was written",
      };
    }
  }

  const gate = evaluateGate(calculation);
  const priceAgeSeconds = priceRoundAgeSeconds(calculation, now);

  const base = {
    observationDate,
    calculatedAt: calculation.calculatedAt,
    valuePercent: calculation.ubwiPercent,
    methodologyVersion: METHODOLOGY_VERSION,
    residualModelVersion: RESIDUAL_MODEL_VERSION,
    gateFailures: gate.findings.map((f) => f.code),
    priceAgeSeconds,
    retrievalProblem: null,
  };

  // Freshness first, before a single row is written. A numerator whose price round has
  // aged past the heartbeat is not an observation of today; publishing it would put a
  // stale price under a new date, which is the one way a daily cadence could manufacture
  // history without anybody writing a fake number.
  if (priceAgeSeconds !== null && priceAgeSeconds > CHAINLINK_BTC_USD_FEED.heartbeatSeconds) {
    return {
      ...base,
      outcome: "observation_stale",
      publicationId: null,
      calculationId: null,
      detail:
        `the price round is ${priceAgeSeconds} s old at ${now}, past the ` +
        `${CHAINLINK_BTC_USD_FEED.heartbeatSeconds} s heartbeat; no point is published for ${observationDate}`,
    };
  }

  const already = await frozenPublicationOn(sql, observationDate);
  if (already !== null) {
    return {
      ...base,
      outcome: "already_published",
      publicationId: already,
      calculationId: null,
      detail: `a frozen point already exists for ${observationDate} (${already}); nothing was written`,
    };
  }

  // One transaction for the whole load: the vintage subtotal check is a deferred
  // constraint trigger, so the components must land together or the first one inserted
  // would be compared against the finished subtotal.
  let vintageId: string;
  let btcId: string;
  await sql.query("begin", []);
  try {
    vintageId = await loadDenominator(sql, calculation);
    btcId = await loadNumerator(sql, calculation);
    await sql.query("commit", []);
  } catch (error) {
    await sql.query("rollback", []);
    throw error;
  }

  const instrumentId = await requireId(
    sql,
    "select id from reference.instruments where symbol = 'UBWI'",
    [],
    "instrument UBWI",
  );
  const specId = await requireId(
    sql,
    "select id from reference.instrument_spec_versions where instrument_id = $1 and version = $2",
    [instrumentId, METHODOLOGY_VERSION],
    `spec version ${METHODOLOGY_VERSION}`,
  );
  const mvId = await requireId(
    sql,
    `select mv.id from reference.methodology_versions mv
       join reference.methodologies m on m.id = mv.methodology_id
      where m.slug = 'ubwi' and mv.version = $1`,
    [METHODOLOGY_VERSION],
    `methodology version ${METHODOLOGY_VERSION}`,
  );
  const gateId = await requireId(
    sql,
    "select id from reference.ubwi_publication_gates where version = $1",
    [GATE_VERSION],
    `publication gate ${GATE_VERSION}`,
  );

  // Identity: one calculation per (vintage, numerator observation, methodology version).
  const existingCalc = await one(
    sql,
    `select id from pipeline.ubwi_calculations
      where wealth_vintage_id = $1 and btc_observation_id = $2 and methodology_version_id = $3`,
    [vintageId, btcId, mvId],
  );

  let calcId: string;
  if (existingCalc && typeof existingCalc.id === "string") {
    calcId = existingCalc.id;
  } else {
    // The percentage change lives in the read model, which resolves it from the frozen
    // publication history under the same methodology and residual-model versions. The
    // calculation row records why it holds no change of its own, and that reason has to
    // stay true after the first point: saying "no previous production observation exists"
    // on day two would be a false statement in an audit record.
    const priorPublication = await one(
      sql,
      `select id from pipeline.ubwi_publications
        where frozen_at is not null and superseded_by_id is null limit 1`,
      [],
    );
    const changeWithheldReason =
      priorPublication === null
        ? "no previous production observation exists"
        : "the change against the previous production observation is resolved by the read model from the frozen publication history";

    const row = await one(
      sql,
      `insert into pipeline.ubwi_calculations (
         instrument_id, instrument_spec_version_id, methodology_version_id, gate_version_id,
         btc_observation_id, wealth_vintage_id, run_kind, calculated_at, calculator_identity,
         numerator_usd, denominator_usd, ubwi_percent,
         observed_share_percent, modeled_share_percent,
         sensitivity_low_percent, sensitivity_high_percent,
         gate_passed, gate_findings, change_withheld_reason
       ) values ($1,$2,$3,$4,$5,$6,'production',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       returning id`,
      [
        instrumentId,
        specId,
        mvId,
        gateId,
        btcId,
        vintageId,
        calculation.calculatedAt,
        publisherIdentity,
        calculation.numerator.marketCapUsd,
        calculation.totalGlobalWealthUsd,
        calculation.ubwiPercent,
        calculation.observedShareOfTotal,
        calculation.modeledShareOfTotal,
        calculation.sensitivity.lowPercent,
        calculation.sensitivity.highPercent,
        gate.passed,
        JSON.stringify(gate.findings),
        changeWithheldReason,
      ],
    );
    calcId = row!.id as string;

    for (const s of calculation.scenarios) {
      await sql.query(
        `insert into pipeline.ubwi_sensitivity_scenarios
           (calculation_id, scenario_key, label, tail_ratio, imputed_wealth_usd, total_wealth_usd, ubwi_percent, is_central)
         values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing`,
        [
          calcId,
          s.key,
          s.label,
          s.tailRatio,
          s.imputedWealthUsd,
          s.totalGlobalWealthUsd,
          s.ubwiPercent,
          s.key === "central",
        ],
      );
    }
  }

  if (!gate.passed) {
    return {
      ...base,
      outcome: "gate_refused",
      publicationId: null,
      calculationId: calcId,
      detail:
        `the publication gate refused this calculation; no point is published for ${observationDate}. ` +
        "the calculation is retained so the refusal itself is auditable",
    };
  }

  const existingPub = await one(
    sql,
    "select id from pipeline.ubwi_publications where calculation_id = $1",
    [calcId],
  );
  if (existingPub && typeof existingPub.id === "string") {
    return {
      ...base,
      outcome: "already_published",
      publicationId: existingPub.id,
      calculationId: calcId,
      detail: `publication ${existingPub.id} already exists for this calculation; unchanged`,
    };
  }

  try {
    const pub = await one(
      sql,
      `insert into pipeline.ubwi_publications (
         calculation_id, published_at, frozen_at, publisher_identity,
         published_value_percent, published_total_wealth_usd, published_market_cap_usd,
         published_observed_share, published_modeled_share,
         published_low_percent, published_high_percent,
         methodology_version, residual_model_version
       ) values ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [
        calcId,
        now,
        publisherIdentity,
        calculation.ubwiPercent,
        calculation.totalGlobalWealthUsd,
        calculation.numerator.marketCapUsd,
        calculation.observedShareOfTotal,
        calculation.modeledShareOfTotal,
        calculation.sensitivity.lowPercent,
        calculation.sensitivity.highPercent,
        METHODOLOGY_VERSION,
        RESIDUAL_MODEL_VERSION,
      ],
    );
    return {
      ...base,
      outcome: "published",
      publicationId: (pub!.id as string) ?? null,
      calculationId: calcId,
      detail: `published and frozen ${String(pub!.id)} for ${observationDate}`,
    };
  } catch (error) {
    // The loser of a race between two overlapping runs. The daily unique index refused the
    // second insert, which is the index doing exactly its job; the run converges on the
    // winner's point rather than reporting a failure or retrying into a duplicate.
    if (isUniqueViolation(error)) {
      const winner = await frozenPublicationOn(sql, observationDate);
      return {
        ...base,
        outcome: "already_published",
        publicationId: winner,
        calculationId: calcId,
        detail:
          `another run published ${observationDate} concurrently` +
          (winner === null ? "" : ` (${winner})`) +
          "; this run wrote no second point",
      };
    }
    throw error;
  }
}

/** The frozen, non-superseded publication for a UTC observation date, if one exists. */
async function frozenPublicationOn(sql: UbwiSql, observationDate: string): Promise<string | null> {
  const row = await one(
    sql,
    `select id from pipeline.ubwi_publications
      where frozen_at is not null and superseded_by_id is null
        and (published_at at time zone 'utc')::date = $1::date
      limit 1`,
    [observationDate],
  );
  return row && typeof row.id === "string" ? row.id : null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}

/** The one-line, secret-free summary a cron log or an operator terminal carries. */
export function ubwiRunSummary(result: UbwiRunResult): Record<string, unknown> {
  return {
    outcome: result.outcome,
    observationDate: result.observationDate,
    // Null where retrieval failed before there was anything to calculate. Reported as null
    // rather than as a zero, because a cron log that says "0.0000 %" on a day nothing was
    // observed is a log that has invented a number.
    valuePercent: result.valuePercent === null ? null : Number(result.valuePercent.toFixed(4)),
    methodologyVersion: result.methodologyVersion,
    residualModelVersion: result.residualModelVersion,
    publicationId: result.publicationId,
    priceAgeSeconds: result.priceAgeSeconds,
    retrievalProblem: result.retrievalProblem,
    gateFailures: result.gateFailures,
    detail: result.detail,
  };
}
