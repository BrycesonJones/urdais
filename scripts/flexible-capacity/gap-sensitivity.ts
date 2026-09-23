/**
 * The FC-3 gap-sensitivity study.
 *
 *   npm run flexible-capacity:gap-study -- --years 2023,2024,2025
 *   npm run flexible-capacity:gap-study -- --years 2025 --market ercot --exhaustive
 *
 * Reads canonical observations, manufactures missing data by deleting contiguous blocks of known
 * length at known places, and measures what that does to the scenario result. Writes nothing.
 *
 * `--exhaustive` additionally tests every admissible placement for one market-year, which is slow
 * and exists to confirm the analytic worst-case search is not missing anything.
 *
 * The output is methodology evidence, not a product figure. Nothing it prints may be published.
 */

import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { DEFAULT_ALPHA_SCENARIOS } from "@/lib/flexible-capacity/methodology";
import { assessCoverage, localYearWindow } from "@/lib/flexible-capacity/period";
import { maxContiguousGapHours } from "@/lib/flexible-capacity/analytics/eligibility";
import {
  GAP_LENGTHS_HOURS, exhaustiveWorstCase, runGapExperiments, summarise,
  type GapExperiment,
} from "@/lib/flexible-capacity/research/gap-sensitivity";
import { FLEXIBLE_CAPACITY_MARKETS, type FlexibleCapacityMarket, type HourlyLoadPoint }
  from "@/lib/flexible-capacity/types";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

type Sql = Awaited<ReturnType<typeof createTokenSqlExecutor>>;

async function loadSeries(
  sql: Sql, market: FlexibleCapacityMarket, startUtc: string, endUtc: string,
): Promise<HourlyLoadPoint[]> {
  const { rows } = await sql.query(
    `select po.period_start, po.value_mw::float8 as value_mw
       from pipeline.power_observations po
       join reference.grid_areas ga on ga.id = po.grid_area_id
       join reference.power_metrics pm on pm.id = po.power_metric_id
      where ga.slug = $1 and pm.code = 'actual_load'
        and po.superseded_by_id is null
        and po.period_start >= $2::timestamptz and po.period_start < $3::timestamptz
      order by po.period_start`,
    [market, startUtc, endUtc],
  );
  return rows.map((row) => ({
    periodStartUtc: new Date(row.period_start as string | Date).toISOString(),
    valueMw: Number(row.value_mw),
  }));
}

async function main(): Promise<void> {
  const years = (flag("years") ?? "2023,2024,2025").split(",").map((value) => Number(value.trim()));
  const only = flag("market") as FlexibleCapacityMarket | null;
  const exhaustive = process.argv.includes("--exhaustive");
  const markets = only === null ? FLEXIBLE_CAPACITY_MARKETS : [only];

  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (!url) throw new Error("no database URL is configured");
  const sql = await createTokenSqlExecutor(url);

  try {
    const inventory: unknown[] = [];
    const experiments: GapExperiment[] = [];

    for (const market of markets) {
      for (const localYear of years) {
        const period = localYearWindow(market, localYear);
        const series = await loadSeries(sql, market, period.startUtc, period.endUtc);
        if (series.length === 0) {
          inventory.push({ market, localYear, status: "no observations" });
          continue;
        }
        // A very low floor here: the study must be able to describe a year it would reject.
        const coverage = assessCoverage(series, period, 0.0001);
        const baseline = DEFAULT_ALPHA_SCENARIOS.map((alpha) => ({
          alpha, ...summarise(series, alpha),
        }));
        inventory.push({
          market, localYear,
          expectedHours: coverage.expectedObservationCount,
          presentHours: coverage.observationCount,
          missingHours: coverage.missingObservationCount,
          coveragePercent: Number((coverage.coverageRatio * 100).toFixed(4)),
          maxContiguousGapHours: maxContiguousGapHours(coverage),
          gapCount: coverage.gaps.length,
          gaps: coverage.gaps.slice(0, 8),
          baseline: baseline.map((entry) => ({
            alpha: entry.alpha,
            headroomGw: Number((entry.headroomMw / 1000).toFixed(4)),
            peakMw: entry.peakReferenceMw,
            clockHours: entry.curtailmentClockHours,
            events: entry.curtailmentEventCount,
            maxEventHours: entry.maxCurtailmentEventHours,
          })),
        });

        // Only a complete year can host a controlled deletion experiment: deleting from a year
        // that is already missing hours would confound the manufactured gap with the real one.
        if (coverage.missingObservationCount !== 0) continue;
        for (const alpha of DEFAULT_ALPHA_SCENARIOS) {
          for (const gapHours of GAP_LENGTHS_HOURS) {
            experiments.push(...runGapExperiments(series, period, market, alpha, gapHours));
          }
        }
      }
    }

    const confirmations: unknown[] = [];
    if (exhaustive) {
      const market = (only ?? "ercot") as FlexibleCapacityMarket;
      const localYear = years[years.length - 1]!;
      const period = localYearWindow(market, localYear);
      const series = await loadSeries(sql, market, period.startUtc, period.endUtc);
      for (const gapHours of [6, 24, 48]) {
        const alpha = 0.005;
        const best = exhaustiveWorstCase(series, period, alpha, gapHours);
        const analytic = runGapExperiments(series, period, market, alpha, gapHours)
          .reduce((worst, entry) => (entry.relativeChange > worst.relativeChange ? entry : worst));
        confirmations.push({
          market, localYear, alpha, gapHours,
          exhaustiveWorstRelativeChange: best.relativeChange,
          exhaustiveWorstStartUtc: best.startUtc,
          analyticWorstRelativeChange: analytic.relativeChange,
          analyticWorstStartUtc: analytic.gapStartUtc,
          analyticFoundTheWorst: Math.abs(best.relativeChange - analytic.relativeChange) < 1e-9,
        });
      }
    }

    console.log(JSON.stringify({
      note: "Methodology evidence for FC-3. No figure here is a published Urdais value.",
      years, markets, inventory, confirmations,
      experiments: experiments.map((entry) => ({
        market: entry.market, localYear: entry.localYear, alpha: entry.alpha,
        gapHours: entry.gapHours, placement: entry.placement, gapStartUtc: entry.gapStartUtc,
        baselineHeadroomMw: Number(entry.baseline.headroomMw.toFixed(3)),
        perturbedHeadroomMw: Number(entry.perturbed.headroomMw.toFixed(3)),
        absoluteChangeMw: Number(entry.absoluteChangeMw.toFixed(3)),
        relativeChangePercent: Number((entry.relativeChange * 100).toFixed(5)),
        peakReferenceChanged: entry.peakReferenceChanged,
        clockHoursDelta: entry.perturbed.curtailmentClockHours - entry.baseline.curtailmentClockHours,
        eventCountDelta: entry.perturbed.curtailmentEventCount - entry.baseline.curtailmentEventCount,
      })),
    }, null, 2));
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
