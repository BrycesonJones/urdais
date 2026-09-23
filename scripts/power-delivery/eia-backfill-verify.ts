/**
 * Verify backfilled EIA-930 history against the Flexible Capacity coverage rule.
 *
 *   npm run power-delivery:eia-backfill-verify -- --local-year 2025
 *   npm run power-delivery:eia-backfill-verify -- --local-year 2025 --market ercot --scenarios
 *
 * Reads and reports. It writes nothing, stores nothing and publishes nothing: FC-2 owns no
 * analytical persistence, and the figures `--scenarios` prints are a demonstration that the
 * contract runs end to end on real evidence, not a published Urdais value.
 *
 * What it checks, per market-local year: how many canonical hours are present against how many the
 * period contains, where the absent ones are, whether supersession left any hour with two live
 * rows, and what the observed peak is with the local time it occurred.
 */

import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { MINIMUM_ANNUAL_COVERAGE, PEAK_REFERENCE_RULE, DEFAULT_ALPHA_SCENARIOS }
  from "@/lib/flexible-capacity/methodology";
import { MARKET_TIMEZONES, assessCoverage, assessPeakRegion, localYearWindow }
  from "@/lib/flexible-capacity/period";
import { runFlexibleCapacityScenario } from "@/lib/flexible-capacity/scenario";
import { FLEXIBLE_CAPACITY_MARKETS, type FlexibleCapacityMarket, type HourlyLoadPoint }
  from "@/lib/flexible-capacity/types";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const localTime = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));

async function main(): Promise<void> {
  const localYear = Number(flag("local-year") ?? new Date().getUTCFullYear() - 1);
  if (!Number.isInteger(localYear)) throw new Error("--local-year must be a whole year");
  const only = flag("market") as FlexibleCapacityMarket | null;
  const withScenarios = process.argv.includes("--scenarios");
  const markets = only === null ? FLEXIBLE_CAPACITY_MARKETS : [only];

  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (!url) throw new Error("no database URL is configured");
  const sql = await createTokenSqlExecutor(url);

  try {
    const report: unknown[] = [];
    for (const market of markets) {
      const period = localYearWindow(market, localYear);

      // Live canonical hours only: a superseded row is history, not evidence of coverage.
      const { rows } = await sql.query(
        `select po.period_start, po.value_mw::float8 as value_mw
           from pipeline.power_observations po
           join reference.grid_areas ga on ga.id = po.grid_area_id
           join reference.power_metrics pm on pm.id = po.power_metric_id
          where ga.slug = $1 and pm.code = 'actual_load'
            and po.superseded_by_id is null
            and po.period_start >= $2::timestamptz and po.period_start < $3::timestamptz
          order by po.period_start`,
        [market, period.startUtc, period.endUtc],
      );

      const series: HourlyLoadPoint[] = rows.map((row) => ({
        periodStartUtc: new Date(row.period_start as string | Date).toISOString(),
        valueMw: Number(row.value_mw),
      }));

      // A duplicate live hour would mean supersession failed; assessCoverage refuses it outright,
      // so catching here reports the defect rather than aborting the whole sweep.
      let coverage;
      try {
        coverage = assessCoverage(series, period, MINIMUM_ANNUAL_COVERAGE);
      } catch (error) {
        report.push({
          market, localYear, defect: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      const peak = series.reduce(
        (best, point) => (point.valueMw > best.valueMw ? point : best),
        series[0] ?? { periodStartUtc: period.startUtc, valueMw: Number.NaN });

      const entry: Record<string, unknown> = {
        market,
        localYear,
        timezone: period.timezone,
        window: { startUtc: period.startUtc, endUtc: period.endUtc },
        expectedHours: coverage.expectedObservationCount,
        canonicalHours: coverage.observationCount,
        missingHours: coverage.missingObservationCount,
        coveragePercent: Number((coverage.coverageRatio * 100).toFixed(4)),
        meetsFloor: coverage.meetsThreshold,
        floorPercent: MINIMUM_ANNUAL_COVERAGE * 100,
        longestGapHours: coverage.gaps.reduce((longest, gap) => Math.max(longest, gap.hours), 0),
        gaps: coverage.gaps.slice(0, 5),
        observedPeakMw: peak.valueMw,
        observedPeakUtc: peak.periodStartUtc,
        observedPeakLocal: Number.isNaN(peak.valueMw)
          ? null : localTime(peak.periodStartUtc, MARKET_TIMEZONES[market]),
        // The topological half of the coverage rule: a peak set from a day with holes in it is the
        // one defect the annual ratio cannot show, so it is reported next to the ratio.
        peakRegion: Number.isNaN(peak.valueMw)
          ? null : assessPeakRegion(series, period, peak.periodStartUtc),
      };

      if (withScenarios && coverage.meetsThreshold) {
        entry.demonstrationScenarios = DEFAULT_ALPHA_SCENARIOS.map((alpha) => {
          const run = runFlexibleCapacityScenario({
            market, modeledPeriod: period, hourlyLoadSeries: series,
            annualCurtailmentEnergyFraction: alpha, peakReferenceRule: PEAK_REFERENCE_RULE,
          });
          return {
            alpha,
            equivalentFullLoadHours: Number(run.assumptions.equivalentFullLoadHours.toFixed(2)),
            headroomGw: Number(run.result.curtailmentEnabledHeadroomGw.toFixed(4)),
            curtailedEnergyMwh: Math.round(run.result.curtailedEnergyMwh),
            budgetMwh: Math.round(run.result.curtailmentBudgetMwh),
            curtailmentClockHours: run.result.curtailmentClockHours,
            events: run.result.curtailmentEventCount,
            maxEventHours: run.result.maxCurtailmentEventHours,
          };
        });
      }
      report.push(entry);
    }
    console.log(JSON.stringify({
      note: "Coverage verification only. No figure here is a published Urdais value.",
      localYear, report,
    }, null, 2));
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
