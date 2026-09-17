/**
 * The public UAVI surface: the Urdais AI Volatility Index, in annualized volatility points.
 *
 * What it serves is Urdais's own derived output. The option quotes, contracts, strikes, forwards
 * and per-strip variances behind it are licensed inputs and stay internal; re-serving them would
 * make this a redistribution of somebody else's market data rather than an index over it.
 *
 * While UAVI has not begun live publication this returns a null level with the reason. That is
 * the intended state and not an outage, so it answers 200 -- an index that has not launched is a
 * normal domain state, and a 500 here would put a real incident and a deliberate one in the same
 * bucket.
 *
 * The response fails its own contract rather than serving a number nobody checked: a non-live
 * state carrying a level, a change percent with no previous level, a live level without its
 * coverage, or any option-level field, and the route answers 500.
 */

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { loadUaviReadModel } from "@/lib/uavi/read/load";
import { unconfiguredUaviReadModel, validatePublicUavi } from "@/lib/uavi/read/read-model";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    return Response.json(unconfiguredUaviReadModel());
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const model = await loadUaviReadModel(sql);
    const reasons = validatePublicUavi(JSON.parse(JSON.stringify(model)) as unknown);
    if (reasons.length > 0) {
      console.error(`uavi read: response failed its own contract (${reasons.join("; ")})`);
      return new Response(null, { status: 500 });
    }
    return Response.json(model);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`uavi read: load failed (${detail})`);
    return new Response(null, { status: 500 });
  } finally {
    await sql.end();
  }
}
