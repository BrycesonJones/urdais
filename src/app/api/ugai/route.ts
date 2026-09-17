/**
 * The public UGAI surface: the Urdais Global AI Index, in index points.
 *
 * What it serves is Urdais's own derived output. The closing prices, float factors, share counts
 * and source payloads behind it are licensed or rights-constrained inputs and stay internal;
 * re-serving them would make this a mirror of somebody else's data rather than an index over it.
 *
 * While UGAI has not begun live publication this returns a null level with the reason. That is
 * the intended state and not an outage, so it answers 200 -- an index that has not launched is a
 * normal domain state, and a 500 here would put a real incident and a deliberate one in the same
 * bucket.
 *
 * The response fails its own contract rather than serving a number nobody checked: a non-live
 * state carrying a level, a change percent with no previous level, or any restricted input field,
 * and the route answers 500.
 */

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { loadUgaiReadModel } from "@/lib/ugai/read/load";
import { unconfiguredUgaiReadModel, validatePublicUgai } from "@/lib/ugai/read/read-model";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    return Response.json(unconfiguredUgaiReadModel());
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const model = await loadUgaiReadModel(sql);
    const reasons = validatePublicUgai(JSON.parse(JSON.stringify(model)) as unknown);
    if (reasons.length > 0) {
      console.error(`ugai read: response failed its own contract (${reasons.join("; ")})`);
      return new Response(null, { status: 500 });
    }
    return Response.json(model);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`ugai read: load failed (${detail})`);
    return new Response(null, { status: 500 });
  } finally {
    await sql.end();
  }
}
