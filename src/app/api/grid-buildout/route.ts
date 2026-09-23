/**
 * The public Grid Buildout Velocity surface.
 *
 * Two markets that measure different things and are never combined: ERCOT counts what was
 * energised, CAISO measures how far schedules moved from the dates recorded at approval. There is
 * no Grid Buildout total, and the read model's own contract check refuses to serve a payload that
 * has grown one.
 *
 * The route is deliberately thin. Every rule lives in methodology 1.0.0 and every figure was
 * calculated and validated by the approved analytical layer before it reached storage; this reads
 * that, checks the contract, and serialises it.
 *
 * A failed contract answers 500. Serving numbers nobody checked is worse than serving nothing, and
 * there is no mock to fall back to.
 */

import {
  loadGridBuildoutReadModel, unavailableGridBuildoutModel, validateGridBuildoutModel,
} from "@/lib/grid-buildout/analytics/read";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) return Response.json(unavailableGridBuildoutModel());

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const model = await loadGridBuildoutReadModel(sql);
    const problems = validateGridBuildoutModel(model);
    if (problems.length > 0) {
      console.error(`grid buildout contract failed: ${problems.join("; ")}`);
      return Response.json({ error: "contract_failed" }, { status: 500 });
    }
    return Response.json(model);
  } catch (error) {
    // An unapproved methodology lands here too, which is the point: the surface fails closed
    // rather than publishing figures whose rules cannot be shown to be approved.
    console.error(`grid buildout read failed: ${
      error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
    return Response.json({ error: "unavailable" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
