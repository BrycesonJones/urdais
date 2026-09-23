/**
 * The public Flexible Capacity surface.
 *
 * A scenario product, per balancing authority and per modelled year. Each market sets its own peak
 * reference from its own demand, so there is no total and no national figure; the read model's
 * contract check refuses a payload that has grown one.
 *
 * The route is deliberately thin. Every rule lives in methodology 1.1.0 and every figure was
 * solved and validated by the approved analytical layer before it reached storage; this reads
 * that, checks the contract, and serialises it. Nothing is calculated here.
 *
 * Refused market-years are served, not hidden. A year that methodology 1.1.0 declined to model --
 * for a gap longer than an hour, an incomplete peak day, or a maximum that is not a peak any
 * publisher can have meant -- appears with its reason and no figure. A client that only showed
 * the years carrying numbers would silently imply those were the only years that exist.
 *
 * A failed contract answers 500. Serving numbers nobody checked is worse than serving nothing,
 * and there is no mock to fall back to.
 */

import {
  loadFlexibleCapacityReadModel, unavailableFlexibleCapacityModel,
} from "@/lib/flexible-capacity/analytics/read";
import { validateFlexibleCapacityReadModel } from "@/lib/flexible-capacity/analytics/read-contract";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) return Response.json(unavailableFlexibleCapacityModel("no_database_configured"));

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const model = await loadFlexibleCapacityReadModel(sql);
    const problems = validateFlexibleCapacityReadModel(model);
    if (problems.length > 0) {
      console.error(`flexible capacity contract failed: ${problems.join("; ")}`);
      return Response.json({ error: "contract_failed" }, { status: 500 });
    }
    return Response.json(model);
  } catch (error) {
    // An unapproved methodology and an unauthorised publication are handled inside the read model,
    // which returns an unavailable payload rather than throwing. Reaching here means something
    // else went wrong, and the surface fails closed rather than guessing.
    console.error(`flexible capacity read failed: ${
      error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
    return Response.json({ error: "unavailable" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
