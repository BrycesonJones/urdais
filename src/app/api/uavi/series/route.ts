/**
 * The published UAVI series.
 *
 * Only canonical published observations, in ascending date order. Where none exist the array is
 * empty -- not a flat line at some plausible volatility, not a synthetic lookback, not a seeded
 * random walk. UAVI's history begins at its first live publication and there is nothing before it
 * to serve.
 *
 * A requested window that predates the series returns the points that exist. Nothing is
 * backfilled to make a range look full: a one-year selector over four days of history shows four
 * days, and a chart that fills the rest is describing a market that never happened. This matters
 * more for a volatility index than for a price index, because a plausible-looking volatility
 * series is exactly what a reader would use to judge whether the current reading is high.
 */

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { loadUaviSeries, unconfiguredUaviSeries } from "@/lib/uavi/read/load";
import { validatePublicUaviSeries } from "@/lib/uavi/read/read-model";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    return Response.json(unconfiguredUaviSeries());
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const model = await loadUaviSeries(sql);
    const reasons = validatePublicUaviSeries(JSON.parse(JSON.stringify(model)) as unknown);
    if (reasons.length > 0) {
      console.error(`uavi series: response failed its own contract (${reasons.join("; ")})`);
      return new Response(null, { status: 500 });
    }
    return Response.json(model);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`uavi series: load failed (${detail})`);
    return new Response(null, { status: 500 });
  } finally {
    await sql.end();
  }
}
