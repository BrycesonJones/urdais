/**
 * Manually verified production acquisition for Wave-1 Token Price.
 *
 * A person reads each provider's own published pricing page, this script
 * ingests the retained artifact through the ordinary parser and normalization
 * path, checks the legs the methodology's designated model requires, and
 * freezes the resulting production benchmarks.
 *
 * It states no collection permission and writes no registry column. Automated
 * production retrieval stays exactly as gated as it was.
 *
 * Usage:
 *   npx tsx scripts/tokens/verify-production.ts --verified-by "Name" --evidence "what you checked" [--expect]
 *
 * The intent must be explicit: without --verified-by and --evidence the script
 * refuses to run, because an unattributed verification is not one.
 */

import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { runProductionVerification } from "@/lib/tokens/verify-production";
import type { Wave1Provider } from "@/lib/tokens/types";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** Expectations are checked against the artifact, never substituted for it. */
const EXPECTED: Partial<Record<Wave1Provider, { input: number; output: number }>> = {
  anthropic: { input: 10, output: 50 },
  openai: { input: 10, output: 50 },
  xai: { input: 2, output: 6 },
  google: { input: 2, output: 12 },
  alibaba: { input: 2, output: 6 },
  // DeepSeek has no expectation because it has no designated legs: it publishes
  // no standard rate, so its headline value is withheld by design.
};

async function main(): Promise<void> {
  const verifiedBy = arg("verified-by");
  const evidence = arg("evidence");
  if (!verifiedBy || !evidence) {
    console.error("refusing to run: --verified-by and --evidence are required; a verification nobody signed is not a verification");
    process.exit(2);
  }

  // The database must be named deliberately. A verification that lands in the
  // wrong place is worse than one that does not run, so there is no silent
  // local fallback: --local is an explicit statement that this is development.
  const local = process.argv.includes("--local");
  const explicit = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (local && explicit) {
    console.error("refusing to run: --local was passed but a database url is configured; drop one of them so the target is unambiguous");
    process.exit(2);
  }
  if (!local && !explicit) {
    console.error("refusing to run: no database url is configured.");
    console.error("  set DATABASE_URL (or URDAIS_DATABASE_URL) to the database this verification belongs in,");
    console.error("  or pass --local to write to the local development database.");
    process.exit(2);
  }
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: local });
  if (!url) {
    console.error("refusing to run: the database url could not be resolved for this environment");
    process.exit(2);
  }
  console.log(`target: ${url.replace(/:\/\/([^:@/]+)(:[^@]*)?@/, "://$1:***@")}${local ? " (local development)" : ""}`);

  // A private, owned client rather than the shared read pool. This command
  // writes inside a `begin`/`commit`, and a transaction is a property of one
  // backend: split across a pool's connections, its statements are not in the
  // transaction the rollback would undo. The shared pool is `max: 1` today, so
  // this worked -- by arithmetic, not by construction.
  const sql = await createTokenSqlExecutor(url);
  const verifiedAt = arg("verified-at") ?? new Date().toISOString();
  const run = await runProductionVerification(
    sql,
    { verifiedBy, evidence, verifiedAt },
    process.argv.includes("--expect") ? EXPECTED : {},
  ).finally(() => sql.end());

  console.log(`verified at ${verifiedAt} by ${verifiedBy}`);
  for (const row of run.verifications) {
    console.log(
      `  ${row.provider.padEnd(10)} ${row.legs.providerModelId.padEnd(18)} input $${row.legs.input.toFixed(2)}  output $${row.legs.output.toFixed(2)}  Token Price $${row.legs.benchmark.toFixed(2)} per 1M tokens`,
    );
  }
  for (const row of run.withheld) {
    console.log(`  ${row.provider.padEnd(10)} ${"(withheld)".padEnd(18)} ${row.reason}, ${row.observations} observation(s) collected`);
  }
  const inserted = run.written.observationsInserted;
  const retrievals = run.written.retrievalsInserted;
  const frozen = run.benchmarks.inserted;
  const decisions = run.benchmarks.withheld;
  // Retrievals count. Reporting "nothing inserted" while writing a retrieval row
  // into an append-only table is how a verification that is not idempotent looks
  // exactly like one that is.
  console.log(
    inserted === 0 && retrievals === 0 && frozen === 0 && decisions === 0
      ? "nothing inserted: this verification was already recorded, and the frozen benchmarks and withholding decisions already exist."
      : `inserted ${inserted} observation(s) and ${retrievals} retrieval(s); froze ${frozen} benchmark(s) and recorded ${decisions} withholding decision(s).`,
  );
  for (const conflict of run.benchmarks.conflicts) console.error(`  conflict: ${conflict}`);
  if (run.withheld.length > 0) {
    console.log(
      `withheld: ${run.withheld.map((row) => row.provider).join(", ")} collected in full, no headline value published. This is a recorded decision, not a gap -- and it is now written to pipeline.token_price_benchmarks as one.`,
    );
  }
  console.log("no source-rights column was written; automated production collection remains gated as before.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
