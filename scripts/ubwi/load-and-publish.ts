/**
 * Load the UBWI denominator and numerator into the database, record the calculation, and
 * publish it if and only if the gate passes.
 *
 * Idempotent by construction. Re-running with identical inputs inserts no duplicate
 * vintage, no duplicate numerator observation, no duplicate calculation and no duplicate
 * publication, and leaves a frozen point untouched. Identity comes from the inputs
 * themselves -- the numerator's block height and observation instant, the vintage's
 * reference date and model version -- not from a timestamp taken at run time.
 *
 * The publication step refuses a gate-refused calculation both here and in the database.
 * That is deliberate duplication: an operator with psql should hit the same wall.
 *
 * Usage:
 *   npm run ubwi:load                        load and record; publish only if the gate passes
 *   npm run ubwi:load -- --local             allow the local development database
 *   npm run ubwi:load -- --dry-run           print what would be written, write nothing
 */
import { calculateUbwi, METHODOLOGY_VERSION, RESIDUAL_MODEL_VERSION } from "@/lib/ubwi/calculate";
import { evaluateGate } from "@/lib/ubwi/gate";
import { sourceInterface } from "@/lib/ubwi/rights";
import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import type { UbwiCalculation } from "@/lib/ubwi/types";

type Sql = { query(text: string, params: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }> };

const RULE_SLUG = "observed-set-ratio-cwon-tail";
const GATE_VERSION = "1.0.0";

async function one(sql: Sql, text: string, params: readonly unknown[] = []): Promise<Record<string, unknown> | null> {
  const { rows } = await sql.query(text, params);
  return rows[0] ?? null;
}

/** Look up an id, or fail with a message that names the missing reference row. */
async function requireId(sql: Sql, text: string, params: readonly unknown[], what: string): Promise<string> {
  const row = await one(sql, text, params);
  if (!row || typeof row.id !== "string") {
    throw new Error(`missing reference data: ${what}. Apply the UBWI migrations first.`);
  }
  return row.id;
}

async function loadDenominator(sql: Sql, c: UbwiCalculation): Promise<string> {
  const ruleId = await requireId(
    sql,
    "select id from reference.wealth_estimation_rules where slug = $1 and version = $2",
    [RULE_SLUG, RESIDUAL_MODEL_VERSION],
    `estimation rule ${RULE_SLUG} ${RESIDUAL_MODEL_VERSION}`,
  );

  // Identity: one vintage per (rule version, reference date, observed subtotal). Re-running
  // the same inputs finds the existing row rather than inserting a second.
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

async function loadNumerator(sql: Sql, c: UbwiCalculation): Promise<string> {
  const n = c.numerator;
  // Identity: one observation per (block height, observed instant).
  const existing = await one(
    sql,
    "select id from pipeline.btc_market_observations where block_height = $1 and observed_at = $2",
    [n.blockHeight, n.observedAt],
  );
  if (existing && typeof existing.id === "string") return existing.id;

  const supplyIfaceId = await requireId(
    sql,
    "select id from reference.source_interfaces where slug = $1",
    [n.supplySourceInterface],
    `supply interface ${n.supplySourceInterface}`,
  );
  const inserted = await one(
    sql,
    `insert into pipeline.btc_market_observations (
       observed_at, block_height, height_confirmed_by, supply_btc, supply_construction,
       supply_source_interface_id, price_rule, price_source_interface_id, venue_count,
       price_usd, market_cap_usd, retrieved_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
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
    ],
  );
  const observationId = inserted!.id as string;

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

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const allowLocalDefault = process.argv.includes("--local");

  const calculation = calculateUbwi({ calculatedAt: new Date().toISOString() });
  const gate = evaluateGate(calculation);

  console.log(`UBWI ${calculation.ubwiPercent.toFixed(4)} %   gate ${gate.passed ? "PASSED" : "REFUSED"}`);
  if (!gate.passed) {
    for (const f of gate.findings) console.log(`  [${f.code}] ${f.detail}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: nothing was written.");
    return;
  }

  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault });
  if (!url) {
    console.error("refusing to run: no database url is configured.");
    console.error("  remedy: set DATABASE_URL (or URDAIS_DATABASE_URL), or pass --local.");
    process.exit(2);
  }
  console.log(`target ${url.replace(/:\/\/([^:@/]+)(:[^@]*)?@/, "://$1:***@")}`);

  // A single client, and the whole load in one transaction: the vintage subtotal check is
  // a deferred constraint trigger, so the components must land together or the first one
  // inserted would be compared against the finished subtotal.
  const sql = await createTokenSqlExecutor(url);

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
  console.log(`vintage    ${vintageId}`);
  console.log(`numerator  ${btcId}`);

  const instrumentId = await requireId(sql, "select id from reference.instruments where symbol = 'UBWI'", [], "instrument UBWI");
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
    `select id, gate_passed from pipeline.ubwi_calculations
      where wealth_vintage_id = $1 and btc_observation_id = $2 and methodology_version_id = $3`,
    [vintageId, btcId, mvId],
  );

  let calcId: string;
  if (existingCalc && typeof existingCalc.id === "string") {
    calcId = existingCalc.id;
    console.log(`calculation ${calcId} (already recorded; not duplicated)`);
  } else {
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
        instrumentId, specId, mvId, gateId, btcId, vintageId,
        calculation.calculatedAt,
        "urdais-ubwi/load-and-publish",
        calculation.numerator.marketCapUsd,
        calculation.totalGlobalWealthUsd,
        calculation.ubwiPercent,
        calculation.observedShareOfTotal,
        calculation.modeledShareOfTotal,
        calculation.sensitivity.lowPercent,
        calculation.sensitivity.highPercent,
        gate.passed,
        JSON.stringify(gate.findings),
        // No predecessor exists, so there is no change to state. History begins here.
        "no previous production observation exists",
      ],
    );
    calcId = row!.id as string;
    console.log(`calculation ${calcId} (recorded)`);

    for (const s of calculation.scenarios) {
      await sql.query(
        `insert into pipeline.ubwi_sensitivity_scenarios
           (calculation_id, scenario_key, label, tail_ratio, imputed_wealth_usd, total_wealth_usd, ubwi_percent, is_central)
         values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing`,
        [calcId, s.key, s.label, s.tailRatio, s.imputedWealthUsd, s.totalGlobalWealthUsd, s.ubwiPercent, s.key === "central"],
      );
    }
  }

  if (!gate.passed) {
    console.log("\nthe publication gate refused this calculation; nothing is published.");
    console.log("the calculation is retained so the refusal itself is auditable.");
    process.exit(1);
  }

  const existingPub = await one(
    sql,
    "select id, frozen_at from pipeline.ubwi_publications where calculation_id = $1",
    [calcId],
  );
  if (existingPub) {
    console.log(`publication ${existingPub.id} already exists, frozen ${String(existingPub.frozen_at)}; unchanged.`);
    return;
  }

  const now = new Date().toISOString();
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
      calcId, now, "urdais-ubwi/load-and-publish",
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
  console.log(`published and frozen: ${pub!.id}`);
}

main().catch((error: unknown) => {
  const e = error as Error;
  console.error(`${e.name}: ${e.message}`);
  process.exit(1);
});
