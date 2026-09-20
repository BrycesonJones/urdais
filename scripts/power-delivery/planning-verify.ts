/**
 * Read verification for planning demand: what Urdais holds, and what it may show.
 *
 *   npm run power-delivery:planning-verify
 *
 * Reads through the PD-3B read model rather than around it, so the publication decision printed
 * here is the decision a page would get. A market with no vintage prints its rights position
 * anyway, because "blocked" and "absent" are different states and an operator needs to see which.
 */

import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { latestVintageByMarketInternal, planningRightsMetadataInternal } from "@/lib/power-delivery/planning/read";
import { mayPublishPlanningForecast } from "@/lib/power-delivery/planning/rights";
import { PLANNING_ADAPTERS, PLANNING_SOURCE_BLOCKERS } from "@/lib/power-delivery/planning/ingest/registry";

async function main(): Promise<void> {
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (url === null) throw new Error("no database URL is configured");
  const sql = await createTokenSqlExecutor(url);
  try {
    const vintages = await latestVintageByMarketInternal(sql);
    const report = [];
    for (const vintage of vintages) {
      const scenarios = await sql.query(
        `select s.native_scenario_key, s.native_scenario_label, s.is_reference,
                count(p.id) filter (where p.superseded_by_id is null) as points,
                min(p.target_year) as first_year, max(p.target_year) as last_year,
                array_agg(distinct p.target_period_kind) as grains,
                array_agg(distinct p.geographic_grain) as geographies
           from pipeline.planning_forecast_scenarios s
           left join pipeline.planning_forecast_points p on p.scenario_id = s.id
          where s.vintage_id = $1
          group by s.id order by s.is_reference desc, s.native_scenario_key`,
        [vintage.id],
      );
      const decision = mayPublishPlanningForecast({
        rights: vintage.rights, publicationState: vintage.publicationState,
        purpose: "public_raw_planning_value_display",
      });
      report.push({
        market: vintage.marketName,
        sourceInterface: vintage.sourceInterfaceSlug,
        latestVintage: vintage.nativeVintageKey,
        reportTitle: vintage.reportTitle,
        publishedAt: vintage.publishedAt.slice(0, 10),
        rightsClassification: vintage.rightsClassification,
        publication: {
          allowed: decision.allowed,
          reasonCode: decision.reasonCode,
          attribution: decision.attributionText,
          unresolvedIssue: decision.unresolvedIssue,
        },
        scenarios: scenarios.rows.map((row) => ({
          key: String(row.native_scenario_key),
          label: String(row.native_scenario_label),
          isReference: row.is_reference === true,
          points: Number(row.points),
          horizon: row.first_year == null ? null : `${row.first_year}-${row.last_year}`,
          grains: (row.grains as string[]).filter(Boolean),
          geographies: (row.geographies as string[]).filter(Boolean),
        })),
        totalPoints: scenarios.rows.reduce((sum, row) => sum + Number(row.points), 0),
      });
    }

    const noData = [];
    for (const blocker of PLANNING_SOURCE_BLOCKERS) {
      const rights = await planningRightsMetadataInternal(sql, blocker.sourceInterfaceSlug);
      const publicRight = rights.find((right) => right.purpose === "public_raw_planning_value_display") ?? null;
      const decision = mayPublishPlanningForecast({
        rights: publicRight, publicationState: "internal_only",
        purpose: "public_raw_planning_value_display",
      });
      noData.push({
        market: blocker.marketSlug,
        sourceInterface: blocker.sourceInterfaceSlug,
        state: "no vintage ingested",
        blockerKind: blocker.kind,
        rightsClassification: publicRight?.rightsClassification ?? null,
        wouldPublish: decision.allowed,
        reasonCode: decision.reasonCode,
      });
    }

    console.log(JSON.stringify({
      adaptersImplemented: Object.keys(PLANNING_ADAPTERS),
      marketsWithData: report,
      marketsWithoutData: noData,
    }, null, 2));
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
