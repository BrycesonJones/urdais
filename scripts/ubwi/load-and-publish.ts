/**
 * Load the UBWI denominator and numerator into the database, record the calculation, and
 * publish it if and only if the gate passes.
 *
 * The pipeline itself lives in @/lib/ubwi/run, which the scheduled job at
 * `/api/cron/ubwi` also calls. This file is the operator's door to it and nothing more:
 * argument parsing, a resolved database url, and printed output. Keeping the logic in one
 * place is what stops the scheduled path and the manual path from ever disagreeing about
 * what may be published.
 *
 * Idempotent by construction, and now daily-idempotent as well. Re-running with identical
 * inputs inserts no duplicate vintage, no duplicate numerator observation, no duplicate
 * calculation and no duplicate publication, and a second run on the same UTC observation
 * date converges on the point that already exists rather than adding another.
 *
 * The numerator is retrieved live, here as in the scheduled job. `--dry-run` retrieves and
 * prints the observation without writing anything, which is the safe way to see the current
 * BTC/USD round, its age and the chain tip without touching the published series.
 *
 * Usage:
 *   npm run ubwi:load                        load and record; publish only if the gate passes
 *   npm run ubwi:load -- --local             allow the local development database
 *   npm run ubwi:load -- --dry-run           retrieve and print, write nothing
 */
import { calculateUbwi } from "@/lib/ubwi/calculate";
import { CHAINLINK_BTC_USD_FEED } from "@/lib/ubwi/chainlink";
import { evaluateGate } from "@/lib/ubwi/gate";
import { liveNumeratorProvider } from "@/lib/ubwi/retrieve/numerator-provider";
import { isNumeratorRetrievalError } from "@/lib/ubwi/retrieve/problems";
import { resolveUbwiRpcEndpoints } from "@/lib/ubwi/retrieve/rpc";
import {
  priceRoundAgeSeconds,
  runDailyUbwiPublication,
  ubwiObservationDate,
} from "@/lib/ubwi/run";
import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";

/**
 * The open client, so the entrypoint can close it however `main` finishes. A script that
 * completes its work and then hangs looks exactly like a script that is still working,
 * which is the worst way for a publication run to end.
 */
let openSql: { end: () => Promise<void> } | null = null;

async function closeSql(): Promise<void> {
  const sql = openSql;
  openSql = null;
  if (sql) await sql.end();
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const allowLocalDefault = process.argv.includes("--local");

  const now = new Date().toISOString();
  const observationDate = ubwiObservationDate(now);

  // Retrieved once, here, and then handed to the pipeline. Retrieving again inside the run
  // would print one observation and publish a different one.
  console.log(`reading the numerator through ${resolveUbwiRpcEndpoints().join(", ")}`);
  const retrieval = await liveNumeratorProvider()().catch((error: unknown) => {
    if (isNumeratorRetrievalError(error)) {
      console.error(`\nno numerator could be retrieved: ${error.message}`);
      console.error("nothing was written.");
      process.exit(1);
    }
    throw error;
  });

  const feed = retrieval.observation.chainlink!;
  console.log(
    `BTC/USD ${retrieval.observation.priceUsd} at round ${feed.roundId} ` +
      `(phase ${feed.phaseId}, aggregator round ${feed.aggregatorRoundId}), ` +
      `updated ${new Date(feed.updatedAt * 1000).toISOString()}, ${retrieval.chainlink.ageSeconds} s old`,
  );
  console.log(
    `chain tip ${retrieval.observation.blockHeight} from ` +
      `${retrieval.height.heightSources.join(" and ")}; ` +
      `scheduled supply ${retrieval.observation.supplyBtc} BTC`,
  );
  console.log(
    `cross-check ${feed.rpcCrossCheckSource ?? "none"} (${retrieval.chainlink.crossCheckMode}), ` +
      `legs read ${retrieval.observationWindowSeconds} s apart`,
  );

  const calculation = calculateUbwi({ calculatedAt: now, numerator: retrieval.observation });
  const gate = evaluateGate(calculation);
  const priceAge = priceRoundAgeSeconds(calculation, now);

  console.log(`observation date ${observationDate} (UTC)`);
  console.log(`UBWI ${calculation.ubwiPercent.toFixed(4)} %   gate ${gate.passed ? "PASSED" : "REFUSED"}`);
  if (!gate.passed) {
    for (const f of gate.findings) console.log(`  [${f.code}] ${f.detail}`);
  }
  if (priceAge !== null) {
    console.log(
      `price round ${priceAge} s old at this instant (heartbeat ${CHAINLINK_BTC_USD_FEED.heartbeatSeconds} s)`,
    );
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

  const sql = await createTokenSqlExecutor(url);
  openSql = sql;

  const result = await runDailyUbwiPublication(sql, { now, calculation });
  console.log(`\n${result.outcome}: ${result.detail}`);
  if (result.calculationId) console.log(`calculation ${result.calculationId}`);
  if (result.publicationId) console.log(`publication ${result.publicationId}`);

  // A refusal is not a crash, but it is not a success either: an operator and a cron log
  // both need to see that today produced no point.
  if (
    result.outcome === "gate_refused" ||
    result.outcome === "observation_stale" ||
    result.outcome === "retrieval_failed"
  ) {
    process.exit(1);
  }
}

main()
  .then(async () => {
    // The pg client holds the event loop open. Until Phase 2F the script never reached
    // here -- the gate refused and it exited non-zero -- so a successful publication was
    // the first run that could hang on an unclosed connection, and did.
    await closeSql();
  })
  .catch(async (error: unknown) => {
    const e = error as Error;
    console.error(`${e.name}: ${e.message}`);
    await closeSql();
    process.exit(1);
  });
