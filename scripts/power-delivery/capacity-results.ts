/**
 * Deliverable capacity results.
 *
 *   npm run power-delivery:capacity-results
 *   npm run power-delivery:capacity-results -- --market ercot
 *
 * Calculates the results the approved methodology supports and reports, for every other market,
 * why it produces none. A market that is absent from the output would be a market nobody decided
 * about, so every one of the seven appears either with results or with its reason.
 *
 * Nothing here publishes. A result is written at `publication_candidate` only when the methodology
 * approves the market and the rights determination permits showing a derived value; everything
 * else is retained at `internal_only`.
 */

import { calculateDeliverableCapacity } from "@/lib/power-delivery/capacity/deliverable/calculate";
import { ALL_CAPACITY_MARKETS } from "@/lib/power-delivery/capacity/deliverable/methodology";
import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main(): Promise<void> {
  const market = flag("market");
  if (market !== null && !ALL_CAPACITY_MARKETS.includes(market)) {
    console.error(`usage: [--market <${ALL_CAPACITY_MARKETS.join("|")}>]`);
    process.exit(2);
  }
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (url === null) throw new Error("no database URL is configured");
  const sql = await createTokenSqlExecutor(url);
  try {
    const report = await calculateDeliverableCapacity(sql, market === null ? {} : { markets: [market] });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
