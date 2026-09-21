/**
 * Delivery gaps.
 *
 *   npm run power-delivery:delivery-gap
 *   npm run power-delivery:delivery-gap -- --market ercot
 *
 * Calculates the gaps the approved methodology supports and reports, for every other market, what
 * blocks one. A market missing from the output would be a market nobody decided about.
 */

import { calculateDeliveryGaps } from "@/lib/power-delivery/gap/calculate";
import { EXCLUDED_GAP_MARKETS, GAP_PAIRINGS } from "@/lib/power-delivery/gap/eligibility";
import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";

const MARKETS = [...GAP_PAIRINGS.map((p) => p.marketSlug), ...EXCLUDED_GAP_MARKETS.map((m) => m.marketSlug)];

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main(): Promise<void> {
  const market = flag("market");
  if (market !== null && !MARKETS.includes(market)) {
    console.error(`usage: [--market <${MARKETS.join("|")}>]`);
    process.exit(2);
  }
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (url === null) throw new Error("no database URL is configured");
  const sql = await createTokenSqlExecutor(url);
  try {
    console.log(JSON.stringify(await calculateDeliveryGaps(sql, market === null ? {} : { markets: [market] }), null, 2));
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
