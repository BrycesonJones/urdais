/**
 * The published UGAI series.
 *
 * Only canonical published observations, in ascending date order. Where none exist the array is
 * empty -- not a base point at 1,000, not a synthetic lookback, not a flat line. UGAI's history
 * begins at its first live publication and there is nothing before it to serve.
 *
 * A requested window that predates the series returns the points that exist. Nothing is
 * backfilled to make a range look full: twelve days of history shown under a three-month window
 * is twelve days, and a chart that fills the rest is describing a market that never happened.
 */

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { loadUgaiSeries, unconfiguredUgaiSeries } from "@/lib/ugai/read/load";
import { validatePublicUgaiSeries } from "@/lib/ugai/read/read-model";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    return Response.json(unconfiguredUgaiSeries());
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const model = await loadUgaiSeries(sql);
    const reasons = validatePublicUgaiSeries(JSON.parse(JSON.stringify(model)) as unknown);
    if (reasons.length > 0) {
      console.error(`ugai series: response failed its own contract (${reasons.join("; ")})`);
      return new Response(null, { status: 500 });
    }
    return Response.json(model);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`ugai series: load failed (${detail})`);
    return new Response(null, { status: 500 });
  } finally {
    await sql.end();
  }
}
