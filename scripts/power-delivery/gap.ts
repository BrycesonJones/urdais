/**
 * Delivery gaps.
 *
 *   npm run power-delivery:gap -- --dry-run
 *   npm run power-delivery:gap -- --write
 *   npm run power-delivery:gap -- --write --market ercot
 *
 * Calculates the gaps the approved methodology supports and reports, for every other market, what
 * blocks one. A market missing from the output would be a market nobody decided about.
 *
 * Writing is opt-in. The calculation is cheap and idempotent — a rerun over unchanged inputs
 * writes nothing — so it is safe to run on a schedule, but a run that was meant to be a look
 * should not leave rows behind because someone forgot a flag.
 */

import { calculateDeliveryGaps } from "@/lib/power-delivery/gap/calculate";
import { EXCLUDED_GAP_MARKETS, GAP_PAIRINGS } from "@/lib/power-delivery/gap/eligibility";
import { loadDeliveryGapReadModel } from "@/lib/power-delivery/gap/read";
import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";

const MARKETS = [...GAP_PAIRINGS.map((p) => p.marketSlug), ...EXCLUDED_GAP_MARKETS.map((m) => m.marketSlug)];

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const dryRun = process.argv.includes("--dry-run");
  if (write === dryRun) {
    console.error("usage: --dry-run | --write  [--market <slug>]");
    process.exit(2);
  }
  const market = flag("market");
  if (market !== null && !MARKETS.includes(market)) {
    console.error(`usage: [--market <${MARKETS.join("|")}>]`);
    process.exit(2);
  }
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (url === null) throw new Error("no database URL is configured");
  const sql = await createTokenSqlExecutor(url);
  try {
    if (dryRun) {
      // A dry run reports what would be served without touching the tables: the read model is a
      // pure read, and it already says whether anything is stale or withheld.
      const model = await loadDeliveryGapReadModel(sql);
      console.log(JSON.stringify({
        mode: "dry-run", lifecycle: model.lifecycle, reason: model.reason,
        methodologyVersion: model.methodology.version, points: model.series.length,
        calculatedAt: model.calculatedAt,
        markets: [
          { marketSlug: model.marketSlug, status: "public_gap_eligible", points: model.series.length },
          ...model.otherMarkets.map((entry) => ({ marketSlug: entry.marketSlug, status: entry.status, points: 0 })),
        ],
      }, null, 2));
      return;
    }
    console.log(JSON.stringify(await calculateDeliveryGaps(sql, market === null ? {} : { markets: [market] }), null, 2));
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
