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

import { tokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
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
};

async function main(): Promise<void> {
  const verifiedBy = arg("verified-by");
  const evidence = arg("evidence");
  if (!verifiedBy || !evidence) {
    console.error("refusing to run: --verified-by and --evidence are required; a verification nobody signed is not a verification");
    process.exit(2);
  }

  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (!url) {
    console.error("no database url; set the token database environment or run against the local stack");
    process.exit(2);
  }

  const sql = await tokenSqlExecutor(url);
  const verifiedAt = arg("verified-at") ?? new Date().toISOString();
  const run = await runProductionVerification(
    sql,
    { verifiedBy, evidence, verifiedAt },
    process.argv.includes("--expect") ? EXPECTED : {},
  );

  console.log(`verified at ${verifiedAt} by ${verifiedBy}`);
  for (const row of run.verifications) {
    console.log(
      `  ${row.provider.padEnd(10)} ${row.legs.providerModelId.padEnd(18)} input $${row.legs.input.toFixed(2)}  output $${row.legs.output.toFixed(2)}  Token Price $${row.legs.benchmark.toFixed(2)} per 1M tokens`,
    );
  }
  console.log(`observations inserted: ${run.written.observationsInserted}; retrievals inserted: ${run.written.retrievalsInserted}; benchmarks frozen: ${run.benchmarks.inserted}`);
  console.log("no source-rights column was written; automated production collection remains gated as before.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
