/**
 * Open-weight vs Proprietary production readiness. Read-only.
 *
 * Fails closed, because the failure this must catch is a section that still renders. A volume
 * split drawn from three classified models out of four hundred looks exactly like a volume
 * split: the bar is full width, the percentages sum to 100, and nothing anywhere says the
 * picture is mostly Unclassified. So coverage is *output* — printed prominently, never an
 * exception — and the assertions that set the exit code are the ones that would make a number
 * **wrong** rather than **partial**.
 *
 * The one coverage figure that is a failure is classified volume falling to nothing, because a
 * section whose every slice is Unclassified is not a comparison and should not publish.
 *
 * Usage:
 *   npm run open-weight:production:check                against the resolved database
 *   npm run open-weight:production:check -- --local     allow the local development database
 */

import { deriveAll } from "@/lib/frontier/read/derive";
import { loadJoinableRows } from "@/lib/frontier/read/load";
import { deriveComparisons, deriveVolumeShare } from "@/lib/open-weight/derive";
import { loadAccessClasses, loadClassificationCensus, loadVolumeRows, methodologyApproved } from "@/lib/open-weight/load";
import { publicClassOf } from "@/lib/open-weight/classification";
import { MINIMUM_FRONTIER_SAMPLE, OPEN_WEIGHT_BOUNDARY, VOLUME_WINDOW_DAYS } from "@/lib/open-weight/types";
import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";

/** Percentage-point tolerance: truncating integer division can fall short of 100 by a hair. */
const RECONCILIATION_TOLERANCE_POINTS = 0.001;

/** Below this share of classified volume the comparison is not worth publishing. */
const MINIMUM_CLASSIFIED_PERCENT = 25;

function trillions(tokens: string): string {
  return (Number(BigInt(tokens) / 1_000_000_000n) / 1000).toFixed(1);
}

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
  if (methodology === null) fail("no Open-weight methodology version exists");
  else if (!methodology.approved) fail(`methodology ${methodology.version} is not approved; nothing may publish under it`);
  console.log(`methodology     ${methodology?.version ?? "(none)"} ${methodology?.approved ? "approved" : "NOT APPROVED"}`);

  // ---- classification census. Output, because a small set is a stage of work, not a defect.
  const census = await loadClassificationCensus(sql);
  console.log("");
  console.log("live classifications");
  for (const row of census) console.log(`  ${row.accessClass.padEnd(28)}${String(row.count).padStart(5)}`);
  if (census.length === 0) fail("no model carries a live access classification");
  for (const row of census) {
    // A class the fold does not recognise would throw inside a page render, on a real request.
    try {
      publicClassOf(row.accessClass);
    } catch {
      fail(`access class ${row.accessClass} has no public fold`);
    }
  }

  // The schema forbids these, so a row here means a constraint was dropped or bypassed.
  const { rows: badEvidence } = await sql.query(
    `select count(*)::int as n from reference.model_access_classes
      where superseded_by_id is null
        and ((access_class like 'open_weights%' and evidence_url is null)
             or (access_class = 'api_only_closed_weights' and evidence_type = 'no_evidence_found'))`,
    [],
  );
  if (Number(badEvidence[0]?.n ?? 0) > 0) {
    fail(`${badEvidence[0]!.n} classification(s) assert a class their evidence does not support`);
  }

  const { rows: badLinks } = await sql.query(
    `select count(*)::int as n from reference.utvi_model_links
      where link_state = 'evidenced' and model_id is null`,
    [],
  );
  if (Number(badLinks[0]?.n ?? 0) > 0) {
    fail(`${badLinks[0]!.n} evidenced link(s) resolve to no canonical model`);
  }

  // ---- volume
  const volumeRows = await loadVolumeRows(sql, VOLUME_WINDOW_DAYS);
  console.log("");
  if (volumeRows.length === 0) {
    fail("the trailing window contains no observations");
  } else {
    const volume = deriveVolumeShare(volumeRows, VOLUME_WINDOW_DAYS);
    console.log(`volume window   ${volume.firstDate} .. ${volume.lastDate} (${volume.windowDays} days requested)`);
    console.log(`total observed  ${trillions(volume.totalObservedTokens)}T tokens`);
    for (const slice of volume.slices) {
      const models = slice.publicClass === "unclassified" ? "" : ` (${volume.modelCounts[slice.publicClass]} models)`;
      console.log(`  ${slice.publicClass.padEnd(14)}${slice.sharePercent.toFixed(2).padStart(7)} %  ${trillions(slice.tokens)}T${models}`);
    }
    const u = volume.unclassifiedBreakdown;
    console.log(`  unclassified is source-aggregated ${trillions(u.sourceAggregated)}T, unlinked ${trillions(u.unlinked)}T, undetermined ${trillions(u.undetermined)}T, non-commercial ${trillions(u.noncommercial)}T`);

    const sum = volume.slices.reduce((total, slice) => total + slice.sharePercent, 0);
    if (Math.abs(sum - 100) > RECONCILIATION_TOLERANCE_POINTS) {
      fail(`volume shares sum to ${sum.toFixed(6)} %, not 100 %`);
    }

    const classified = volume.slices
      .filter((slice) => slice.publicClass !== "unclassified")
      .reduce((total, slice) => total + slice.sharePercent, 0);
    console.log(`  classified      ${classified.toFixed(2)} % of observed volume`);
    if (classified < MINIMUM_CLASSIFIED_PERCENT) {
      fail(`only ${classified.toFixed(2)} % of observed volume is classified; below the ${MINIMUM_CLASSIFIED_PERCENT} % floor this is not a comparison`);
    }
  }

  // ---- capability and price, per benchmark
  //
  // The points are Model Frontier's, through Model Frontier's derivation. That is the property
  // worth stating: this command cannot report a different efficient set from the one the chart
  // draws, because there is only one set.
  const views = deriveAll(await loadJoinableRows(sql));
  const classes = await loadAccessClasses(sql);
  const comparisons = deriveComparisons(views, classes);
  console.log("");
  if (comparisons.length === 0) {
    console.log("no benchmark carries a plotted configuration; capability and price panels report no comparison");
  }
  for (const comparison of comparisons) {
    const { capabilityGap: capability, priceGap: price, configurations: all, frontierConfigurations: eff } = comparison;
    const view = views.find((candidate) => candidate.slug === comparison.slug)!;
    console.log(comparison.label);
    console.log(`  configurations    open-weight ${all.open_weight}, proprietary ${all.proprietary}, unclassified ${all.unclassified}`);
    console.log(`  pareto-efficient  open-weight ${eff.open_weight}, proprietary ${eff.proprietary}, unclassified ${eff.unclassified}`);
    console.log(`  open-weight best  ${capability.openWeight ? `${(capability.openWeight.score * 100).toFixed(1)} % ${capability.openWeight.label} @ $${capability.openWeight.blendedUsdPer1m.toFixed(2)}` : "-"}`);
    console.log(`  proprietary best  ${capability.proprietary ? `${(capability.proprietary.score * 100).toFixed(1)} % ${capability.proprietary.label} @ $${capability.proprietary.blendedUsdPer1m.toFixed(2)}` : "-"}`);
    console.log(`  gap               ${capability.gap === null ? "not comparable" : `${(capability.gap * 100).toFixed(1)} points`}`);
    console.log(`  open-weight median${price.openWeight ? ` $${price.openWeight.medianBlendedUsdPer1m.toFixed(2)} (n=${price.openWeight.configurationCount})` : " -"}`);
    console.log(`  proprietary median${price.proprietary ? ` $${price.proprietary.medianBlendedUsdPer1m.toFixed(2)} (n=${price.proprietary.configurationCount})` : " -"}`);
    console.log(`  ratio             ${price.ratioPublishable && price.ratio !== null ? `${price.ratio.toFixed(2)}x` : `withheld (n < ${MINIMUM_FRONTIER_SAMPLE} in a class)`}`);
    console.log(`  prices as of      ${comparison.priceAsOf ?? "-"}`);

    // Everything below would make a reported number wrong rather than absent.
    for (const side of [price.openWeight, price.proprietary]) {
      if (side !== null && !(side.medianBlendedUsdPer1m > 0)) {
        fail(`${comparison.label}: ${side.publicClass} median price is not positive`);
      }
    }

    // The sample floor, asserted rather than trusted to the renderer: a ratio present without
    // the sample behind it is the one number this design exists to prevent.
    const meetsFloor =
      (price.openWeight?.configurationCount ?? 0) >= MINIMUM_FRONTIER_SAMPLE &&
      (price.proprietary?.configurationCount ?? 0) >= MINIMUM_FRONTIER_SAMPLE;
    if (price.ratio !== null && !meetsFloor) {
      fail(`${comparison.label}: a ratio is published on fewer than ${MINIMUM_FRONTIER_SAMPLE} efficient configurations`);
    }
    if (price.ratioPublishable !== meetsFloor) {
      fail(`${comparison.label}: ratioPublishable disagrees with the sample counts`);
    }

    // The efficient set must partition exactly into the three classes, and must equal the
    // count Model Frontier itself reports. A disagreement here means this section is
    // describing a frontier the chart above it is not drawing.
    const partition = eff.open_weight + eff.proprietary + eff.unclassified;
    if (partition !== view.frontierCount) {
      fail(`${comparison.label}: ${partition} classified efficient configurations against Model Frontier's ${view.frontierCount}`);
    }
    if (all.open_weight + all.proprietary + all.unclassified !== view.points.length) {
      fail(`${comparison.label}: configuration counts do not partition the plotted points`);
    }
    console.log("");
  }

  console.log(`boundary        "${OPEN_WEIGHT_BOUNDARY.slice(0, 72)}..."`);
  console.log("");

  if (failures.length === 0) {
    console.log("open-weight vs proprietary: ready");
  } else {
    console.log(`open-weight vs proprietary: ${failures.length} failure(s):`);
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
