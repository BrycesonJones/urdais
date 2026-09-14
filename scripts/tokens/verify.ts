/**
 * Wave-1 verification output. Loads the canonical token catalog the same way
 * the application does, and prints the observations each provider produced.
 * Read-only; it publishes nothing and changes no registry state.
 *
 * Usage: npx tsx scripts/tokens/verify.ts [--json]
 */

import { visibleTokenPricesResponse, loadTokenReadCatalog } from "@/lib/tokens/read/load";
import { tokenVisibilityMode } from "@/lib/tokens/read/publication";
import { TOKEN_BENCHMARK_REQUIREMENTS, TOKEN_PRODUCT_BENCHMARK } from "@/lib/tokens/read/benchmark";
import { tokenVerificationReports } from "@/lib/tokens/read/verification";

async function main(): Promise<void> {
  const catalog = await loadTokenReadCatalog();
  const response = visibleTokenPricesResponse(catalog);
  const reports = tokenVerificationReports(response.series);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ benchmark: TOKEN_PRODUCT_BENCHMARK, mode: tokenVisibilityMode(), reports }, null, 2));
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
  console.log(`\nproduct benchmark: ${TOKEN_PRODUCT_BENCHMARK.status}`);
  if (TOKEN_PRODUCT_BENCHMARK.status === "undefined") {
    console.log("no lab-level token price is published. still required:");
    for (const line of TOKEN_BENCHMARK_REQUIREMENTS) console.log(`  - ${line}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
