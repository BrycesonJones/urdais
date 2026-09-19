/**
 * The Available Compute Capacity snapshot: how much rentable AI compute is
 * visibly available right now.
 *
 * The response fails its own contract rather than serving a number nobody
 * checked. The specific failure it guards is a zero standing in for an
 * absence — "0 GPUs available" is a claim about the compute market, and the
 * true statement when no permitted source reports availability is that Urdais
 * cannot see any, which is a different sentence and is served as one.
 *
 * While no source interface both exposes an availability signal and permits
 * its use, this returns a null snapshot with the reason and the full source
 * coverage behind it. That is the intended state, not an outage.
 */

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { loadCapacityReadModel } from "@/lib/capacity/read/load";
import { emptyCapacityReadModel, emptyCoverage, validatePublicCapacity } from "@/lib/capacity/read/read-model";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    return Response.json(emptyCapacityReadModel("not_configured", emptyCoverage()));
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const model = await loadCapacityReadModel(sql);
    const reasons = validatePublicCapacity(JSON.parse(JSON.stringify(model)) as unknown);
    if (reasons.length > 0) {
      console.error(`capacity read: response failed its own contract (${reasons.join("; ")})`);
      return new Response(null, { status: 500 });
    }
    return Response.json(model);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`capacity read: load failed (${detail})`);
    // A failed read is an outage, not an observation of zero capacity.
    return new Response(null, { status: 500 });
  } finally {
    await sql.end();
  }
}
