/**
 * The public UEPI surface: the day-ahead wholesale power benchmarks Urdais may publish.
 *
 * **There is no headline UEPI number.** Specification 1.0.0 §C.14 forbids a composite and any
 * derived cross-market statistic: the series measure different price constructs in different
 * timezones, and an average of them would be a figure with no referent. The payload says so
 * rather than inviting a client to compute one.
 *
 * Markets Urdais stores and does not publish are **absent**, not present with a null value. MISO
 * and SPP forbid derivative works, PJM requires membership, and ISO-NE has a posture of
 * internal-only. All four have real released values in production and none of them appears here.
 *
 * The response is validated against its own contract before it is served. A leaked internal
 * series id, a database identifier, a retired demo instrument id, a specification digest that is
 * not the frozen one, or a percentage beside a non-positive endpoint answers 500 rather than
 * shipping a number nobody checked.
 */

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { describeDatabaseError } from "@/lib/db/connection";
import { loadUepiReadModel } from "@/lib/uepi/read/load";
import { unconfiguredUepiReadModel, validatePublicUepi } from "@/lib/uepi/read/read-model";
import type { SqlExecutor } from "@/lib/uepi/store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    return Response.json(unconfiguredUepiReadModel());
  }

  let sql: SqlExecutor & { end: () => Promise<void> };
  try {
    sql = await createTokenSqlExecutor(databaseUrl);
  } catch (error) {
    // Handled here rather than thrown at the framework. A pooler culling a session or refusing
    // a new one is an ordinary production event -- it killed nine batches of the UEPI backfill
    // -- and it arrives before there is any executor to close, so an escaping error produces a
    // 500 with no line in the log saying which surface failed or why.
    console.error(`uepi read: could not connect (${describeDatabaseError(error)})`);
    return new Response(null, { status: 500 });
  }

  try {
    const model = await loadUepiReadModel(sql);
    const reasons = validatePublicUepi(JSON.parse(JSON.stringify(model)) as unknown);
    if (reasons.length > 0) {
      console.error(`uepi read: response failed its own contract (${reasons.join("; ")})`);
      return new Response(null, { status: 500 });
    }
    return Response.json(model);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`uepi read: load failed (${detail})`);
    return new Response(null, { status: 500 });
  } finally {
    await sql.end();
  }
}
