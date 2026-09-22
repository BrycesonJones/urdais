/**
 * The public UMPI surface: two independent monthly DRAM index series.
 *
 * There is no headline UMPI number. The family holds a quality-adjusted price index produced by
 * the Bank of Korea and a unit-value index Urdais derives from Korea Customs figures; they
 * measure different things, and the payload says so rather than inviting a client to average
 * them.
 *
 * The response is validated against its own contract before it is served. A leaked internal
 * identifier, a missing unit-value warning, or any demo vocabulary reaching production answers
 * 500 rather than shipping a number nobody checked.
 */

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { loadUmpiReadModel } from "@/lib/umpi/read/load";
import { unconfiguredUmpiReadModel, validatePublicUmpi } from "@/lib/umpi/read/read-model";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    return Response.json(unconfiguredUmpiReadModel());
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const model = await loadUmpiReadModel(sql);
    const reasons = validatePublicUmpi(JSON.parse(JSON.stringify(model)) as unknown);
    if (reasons.length > 0) {
      console.error(`umpi read: response failed its own contract (${reasons.join("; ")})`);
      return new Response(null, { status: 500 });
    }
    return Response.json(model);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`umpi read: load failed (${detail})`);
    return new Response(null, { status: 500 });
  } finally {
    await sql.end();
  }
}
