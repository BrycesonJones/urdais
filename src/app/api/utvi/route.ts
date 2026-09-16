/**
 * The public UTVI surface: the Observed Token Volume Index, in tokens per day.
 *
 * What it serves is a derived Urdais statistic. Per-model rows, permaslugs and the source's
 * own identifiers stay internal — they are the machinery behind the value, and re-serving
 * them would make this a mirror of somebody else's API rather than an index over it.
 *
 * The response fails its own contract rather than serving a number nobody checked: no
 * universe descriptor, no required citation, or a percentage change that arrived as zero where
 * it should have been null, and the route answers 500.
 *
 * While the UTVI methodology is a draft nothing is published, so this returns a null snapshot
 * with the reason. That is the intended state, not an outage.
 */

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { loadUtviReadModel, unconfiguredUtviReadModel } from "@/lib/utvi/read/load";
import { validatePublicUtvi } from "@/lib/utvi/read/read-model";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    return Response.json(unconfiguredUtviReadModel());
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const model = await loadUtviReadModel(sql);
    const reasons = validatePublicUtvi(JSON.parse(JSON.stringify(model)) as unknown);
    if (reasons.length > 0) {
      console.error(`utvi read: response failed its own contract (${reasons.join("; ")})`);
      return new Response(null, { status: 500 });
    }
    return Response.json(model);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`utvi read: load failed (${detail})`);
    return new Response(null, { status: 500 });
  } finally {
    await sql.end();
  }
}
