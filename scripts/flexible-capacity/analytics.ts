/**
 * Run the Flexible Capacity scenario engine.
 *
 *   npm run flexible-capacity:analytics -- --years 2023,2024,2025
 *   npm run flexible-capacity:analytics -- --years 2025 --market ercot
 *   npm run flexible-capacity:analytics -- --years 2025 --research
 *   npm run flexible-capacity:analytics -- --violations
 *
 * A production run refuses to model a market-year whose contiguous-gap threshold is unresolved.
 * `--research` permits that, for sensitivity work; it records `run_kind = 'research'` so a later
 * publication can tell the two apart, and it never authorises publication -- that gate is
 * `assertPublicationAuthorized`, over the registry, and is not consulted here because FC-3
 * publishes nothing.
 */

import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { DEFAULT_ALPHA_SCENARIOS } from "@/lib/flexible-capacity/methodology";
import { runFlexibleCapacityAnalytics } from "@/lib/flexible-capacity/analytics/run";
import { flexibleCapacityViolations } from "@/lib/flexible-capacity/analytics/store";
import { FLEXIBLE_CAPACITY_MARKETS, type FlexibleCapacityMarket } from "@/lib/flexible-capacity/types";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main(): Promise<void> {
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (!url) throw new Error("no database URL is configured");
  const sql = await createTokenSqlExecutor(url);

  try {
    if (process.argv.includes("--violations")) {
      const violations = await flexibleCapacityViolations(sql);
      console.log(JSON.stringify({ violations, clean: violations.length === 0 }, null, 2));
      if (violations.length > 0) process.exitCode = 1;
      return;
    }

    const years = (flag("years") ?? "2025").split(",").map((value) => Number(value.trim()));
    if (years.some((year) => !Number.isInteger(year))) throw new Error("--years must be whole years");
    const only = flag("market") as FlexibleCapacityMarket | null;
    if (only !== null && !FLEXIBLE_CAPACITY_MARKETS.includes(only)) {
      throw new Error(`--market must be one of ${FLEXIBLE_CAPACITY_MARKETS.join(", ")}`);
    }
    const research = process.argv.includes("--research");
    const alphaFlag = flag("alpha");
    const alphaScenarios = alphaFlag === null
      ? [...DEFAULT_ALPHA_SCENARIOS] : alphaFlag.split(",").map((value) => Number(value.trim()));

    const outcome = await runFlexibleCapacityAnalytics(sql, {
      markets: only === null ? [...FLEXIBLE_CAPACITY_MARKETS] : [only],
      localYears: years,
      alphaScenarios,
      runKind: research ? "research" : "production",
      allowUnresolvedGapThreshold: research,
    });

    console.log(JSON.stringify(outcome, null, 2));
    if (outcome.status !== "validated") process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
