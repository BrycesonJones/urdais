/**
 * The public Transmission Headroom surface.
 *
 * Two markets, kept structurally apart, because they measure different things over different
 * populations: NYISO's is the interfaces it publishes, ERCOT's is whichever constraints dispatch
 * was actively tracking. There is no top-level total, no average and no combined utilization, and
 * the read model's own contract check refuses to serve a payload that has grown one.
 *
 * A failed contract answers 500. Serving a page of numbers nobody checked is worse than serving
 * nothing, and there is no mock to fall back to.
 *
 * `?market=&entity=&limit=` returns one entity's observation history instead of the summary.
 * History stays market- and entity-specific: there is deliberately no cross-market history route.
 */

import {
  loadTransmissionAnalytics, unavailableTransmissionModel, validateTransmissionModel,
} from "@/lib/transmission-headroom/analytics/read";
import { loadEntityHistory } from "@/lib/transmission-headroom/analytics/history";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) return Response.json(unavailableTransmissionModel());

  const url = new URL(request.url);
  const market = url.searchParams.get("market");
  const entity = url.searchParams.get("entity");

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    if (market !== null && entity !== null) {
      if (market !== "nyiso" && market !== "ercot") {
        return Response.json({ error: "unknown market" }, { status: 400 });
      }
      const limitRaw = Number(url.searchParams.get("limit") ?? "200");
      // Bounded by default: an interface can hold tens of thousands of observations and the page
      // has no use for them on first paint.
      const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 200;
      return Response.json(await loadEntityHistory(sql, market, entity, limit));
    }

    const model = await loadTransmissionAnalytics(sql);
    const problems = validateTransmissionModel(model);
    if (problems.length > 0) {
      console.error(`transmission headroom contract failed: ${problems.join("; ")}`);
      return Response.json({ error: "contract_failed" }, { status: 500 });
    }
    return Response.json(model);
  } catch (error) {
    console.error(`transmission headroom read failed: ${
      error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
    return Response.json({ error: "unavailable" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
