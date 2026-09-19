import { tokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { coincidentActualLoad, hourlyActualLoadHistory, latestHourlyActualLoadByMarket, latestOperationalDemandForecast, powerFreshness } from "@/lib/power-delivery/read/load";

/** Server-only read surface. Internal pipeline tables are never exposed to browser clients. */
export async function loadPowerDeliveryOperationalData(input: { areaId?: string; start: string; end: string }) {
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: process.env.NODE_ENV === "development" });
  if (!url) return null;
  const sql = await tokenSqlExecutor(url);
  const [latestActual, aggregate, operationalForecast, freshness, areaHistory] = await Promise.all([
    latestHourlyActualLoadByMarket(sql), coincidentActualLoad(sql, input.start, input.end),
    latestOperationalDemandForecast(sql), powerFreshness(sql),
    input.areaId ? hourlyActualLoadHistory(sql, input.areaId, input.start, input.end) : Promise.resolve([]),
  ]);
  return { latestActual, aggregate, operationalForecast, freshness, areaHistory };
}
