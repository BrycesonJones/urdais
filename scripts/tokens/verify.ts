/**
 * Wave-1 verification output. Loads the canonical token catalog the same way
 * the application does, and prints the observations each provider produced.
 * Read-only; it publishes nothing and changes no registry state.
 *
 * Usage: npx tsx scripts/tokens/verify.ts [--json]
 */

import { visibleTokenPricesResponse, loadTokenReadCatalog } from "@/lib/tokens/read/load";
import { tokenVisibilityMode } from "@/lib/tokens/read/publication";
import { TOKEN_PRICE_BENCHMARK_NAME, TOKEN_PRICE_METHODOLOGY_VERSION, TOKEN_PRICE_UNIT_CAPTION } from "@/lib/tokens/read/benchmark";
import { providerBenchmarks } from "@/lib/tokens/read/benchmark-series";
import { tokenVerificationReports } from "@/lib/tokens/read/verification";

async function main(): Promise<void> {
  const catalog = await loadTokenReadCatalog();
  const response = visibleTokenPricesResponse(catalog);
  const reports = tokenVerificationReports(response.series);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ methodologyVersion: TOKEN_PRICE_METHODOLOGY_VERSION, mode: tokenVisibilityMode(), benchmarks: providerBenchmarks(response.series), reports }, null, 2));
    return;
  }

  console.log(`visibility: ${tokenVisibilityMode()}`);
  console.log(`models in catalog: ${catalog.models.length}; observations: ${catalog.observations.length}`);
  if (reports.length === 0) console.log("no canonical observations visible; run npm run tokens:preview:seed");
  for (const report of reports) {
    console.log(`\n${report.providerName} (${report.providerSlug}) — ${report.models} model(s), ${report.observations} observation(s)`);
    for (const row of report.rows) {
      const extras = [row.serviceTier === "standard" ? null : row.serviceTier, row.contextTier, row.cacheTtl, row.region].filter(Boolean).join(" · ");
      console.log(`  ${row.displayName.padEnd(24)} ${row.facet.padEnd(22)} $${row.priceUsdPer1m.toFixed(2).padStart(8)} / 1M${extras ? `   [${extras}]` : ""}`);
    }
  }
  console.log(`\n${TOKEN_PRICE_BENCHMARK_NAME} v${TOKEN_PRICE_METHODOLOGY_VERSION}`);
  for (const row of providerBenchmarks(response.series)) {
    if (row.status === "value") {
      const change = row.series.percentageChange === null ? "change withheld" : `${row.series.percentageChange}%`;
      console.log(`  ${row.providerName.padEnd(12)} ${row.series.benchmarkModelName.padEnd(20)} $${row.series.priceUsdPer1m.toFixed(2).padStart(8)} ${TOKEN_PRICE_UNIT_CAPTION}   (${row.series.history.length} point(s), ${change})`);
    } else {
      console.log(`  ${row.providerName.padEnd(12)} withheld: ${row.reason}${row.providerModelId ? ` (${row.providerModelId})` : ""}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
