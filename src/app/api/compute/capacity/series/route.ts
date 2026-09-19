/**
 * The Available Compute Capacity history.
 *
 * Serves only days that were actually observed. There is no interpolation, no
 * carry-forward and no zero-filling of gaps: a day Urdais did not observe is a
 * day absent from the series, because a zero-filled gap and a genuine collapse
 * in supply would be drawn identically.
 *
 * `observedDays` travels with the points so the surface can offer only the
 * ranges the data supports rather than a fixed 1M/3M/1Y control over three
 * days of history.
 *
 * Optional filters: `gpu`, `provider`, `region`.
 */

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { loadCapacityReadModel } from "@/lib/capacity/read/load";
import { emptyCapacityReadModel, emptyCoverage } from "@/lib/capacity/read/read-model";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    const model = emptyCapacityReadModel("not_configured", emptyCoverage());
    return Response.json({
      dataset: model.dataset,
      methodology: model.methodology,
      points: [],
      observedDays: 0,
      unavailableReason: model.unavailableReason,
      publicReason: model.publicReason,
    });
  }

  const url = new URL(request.url);
  const gpu = url.searchParams.get("gpu");
  const provider = url.searchParams.get("provider");
  const region = url.searchParams.get("region");

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const model = await loadCapacityReadModel(sql, new Date(), { gpu, provider, region });
    return Response.json({
      dataset: model.dataset,
      methodology: model.methodology,
      disclaimers: model.disclaimers,
      filters: { gpu, provider, region },
      points: model.history.points,
      observedDays: model.history.observedDays,
      coverage: model.coverage,
      unavailableReason: model.unavailableReason,
      publicReason: model.publicReason,
    });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`capacity series: load failed (${detail})`);
    return new Response(null, { status: 500 });
  } finally {
    await sql.end();
  }
}
