/**
 * Model Frontier production readiness. Read-only.
 *
 * Reports per benchmark and fails closed, because the failure this must catch is a chart that
 * still renders. A frontier missing half its models looks exactly like a frontier; every
 * remaining point is correct, the axes are right, and nothing anywhere says the picture is
 * partial. So the exclusion counts are output, not exceptions, and the assertions that would
 * make a point *wrong* rather than *absent* are what set the exit code.
 *
 * Usage:
 *   npm run frontier:production:check                against the resolved database
 *   npm run frontier:production:check -- --local     allow the local development database
 */

import { deriveAll } from "@/lib/frontier/read/derive";
import { loadAttribution, loadJoinableRows, methodologyApproved } from "@/lib/frontier/read/load";
import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";
import { MODEL_FRONTIER_COST_BOUNDARY } from "@/lib/frontier/types";

async function main(): Promise<void> {
  const allowLocalDefault = process.argv.includes("--local");
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault });
  if (!url) {
    console.error("no database url is configured; set DATABASE_URL or pass --local.");
    process.exitCode = 1;
    return;
  }

  const sql = await tokenSqlExecutor(url);
  const failures: string[] = [];
  const fail = (detail: string) => failures.push(detail);

  const methodology = await methodologyApproved(sql);
  if (methodology === null) fail("no Model Frontier methodology version exists");
  else if (!methodology.approved) fail(`methodology ${methodology.version} is ${"not approved"}; nothing may publish under it`);
  console.log(`methodology     ${methodology?.version ?? "(none)"} ${methodology?.approved ? "approved" : "NOT APPROVED"}`);

  const attribution = await loadAttribution(sql);
  if (attribution === null) fail("no successful source retrieval, so no citation can be rendered");
  else console.log(`source          retrieved ${attribution.retrievedAt}, ${attribution.license}`);

  const rows = await loadJoinableRows(sql);
  const benchmarks = deriveAll(rows);
  console.log("");

  for (const benchmark of benchmarks) {
    const e = benchmark.exclusions;
    console.log(`${benchmark.label}`);
    console.log(`  raw observations      ${benchmark.rawObservationCount}`);
    console.log(`  evidenced joins       ${benchmark.points.length + e.no_eligible_price}`);
    console.log(`  plotted configurations${String(benchmark.points.length).padStart(6)}`);
    console.log(`  distinct models       ${benchmark.distinctModelCount}`);
    console.log(`  on the frontier       ${benchmark.frontierCount}`);
    console.log(`  excluded: unmapped ${e.unmapped}, ambiguous ${e.ambiguous}, no eligible price ${e.no_eligible_price}`);
    if (benchmark.capabilityAsOfRange) {
      console.log(`  capability dated      ${benchmark.capabilityAsOfRange.first} .. ${benchmark.capabilityAsOfRange.last}`);
    }
    console.log(`  price dated           ${benchmark.priceAsOf ?? "-"}`);

    if (benchmark.points.length === 0) {
      fail(`${benchmark.label} has no plotted configuration`);
      console.log("");
      continue;
    }

    // Everything below would make a *point* wrong rather than absent, so each is a failure.
    for (const point of benchmark.points) {
      if (!(point.blendedPrice > 0)) fail(`${benchmark.label}: ${point.id} has a non-positive blended price`);
      if (point.score < point.scoreMin || point.score > point.scoreMax) {
        fail(`${benchmark.label}: ${point.id} scores ${point.score}, outside ${point.scoreMin}-${point.scoreMax}`);
      }
      if (!point.capabilityAsOf || !point.priceAsOf) fail(`${benchmark.label}: ${point.id} is missing a date`);
      if (!point.providerModelId) fail(`${benchmark.label}: ${point.id} plots without a canonical SKU`);
    }

    // The derivation refuses duplicates by throwing, so reaching here means none exist. Assert
    // it anyway: the property the frontier's determinism rests on is worth stating.
    const keys = new Set(benchmark.points.map((p) => `${p.providerModelId}|${p.configuration ?? ""}`));
    if (keys.size !== benchmark.points.length) fail(`${benchmark.label}: duplicate (SKU, configuration) pair plotted`);
    console.log("");
  }

  // A non-evidenced identity must never reach a chart. Checked against the loaded rows rather
  // than the derived ones, so the assertion does not depend on the thing it is checking.
  const leaked = rows.filter((row) => row.linkState !== "evidenced" && row.providerModelId !== null);
  if (leaked.length > 0) fail(`${leaked.length} observation(s) carry a model without an evidenced link`);

  console.log(`boundary        "${MODEL_FRONTIER_COST_BOUNDARY.slice(0, 72)}..."`);
  console.log("");

  if (failures.length === 0) {
    console.log("model frontier: ready");
  } else {
    console.log(`model frontier: ${failures.length} failure(s):`);
    for (const detail of failures) console.log(`  ${detail}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
