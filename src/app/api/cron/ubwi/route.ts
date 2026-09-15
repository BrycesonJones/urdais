/**
 * The scheduled UBWI publication.
 *
 * Vercel Cron issues a GET here once per UTC day and nothing else does. The route takes
 * no input: not a date, not a mode, not a value. The observation instant is the server's
 * own clock at invocation and the daily identity is derived from it, so there is no shape
 * of request that could ask for a different day, a second point, or a number the pipeline
 * did not calculate.
 *
 * It is emphatically not a public endpoint, and no page request reaches it. A publication
 * trigger that anyone could fire would let a stranger decide when Urdais publishes an
 * index, and a page that published on render would publish once per visitor.
 *
 * Everything it does is in @/lib/ubwi/run, which the operator command calls too. The
 * route's whole job is authentication, a database connection, and a summary in the log.
 */

import { timingSafeEqual } from "node:crypto";

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { runDailyUbwiPublication, ubwiRunSummary } from "@/lib/ubwi/run";

// Reads and writes the production store on every invocation.
export const dynamic = "force-dynamic";
// The denominator's components are written row by row inside one transaction. A run takes
// seconds; sixty is generous and still well under the daily interval.
export const maxDuration = 60;

/**
 * Length-independent comparison. `timingSafeEqual` throws on a length mismatch, which
 * would itself leak the secret's length, so the lengths are checked first and a mismatch
 * is reported as an ordinary failure.
 */
function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Vercel sends the project's CRON_SECRET as `Authorization: Bearer <secret>`. An absent
 * secret fails closed: an unconfigured deployment refuses to publish rather than exposing
 * an open trigger.
 */
export function cronRequestAuthorized(authorization: string | null, secret: string | undefined): boolean {
  const expected = secret?.trim();
  if (!expected) return false;
  if (!authorization?.startsWith("Bearer ")) return false;
  return secretMatches(authorization.slice("Bearer ".length), expected);
}

export async function GET(request: Request): Promise<Response> {
  if (!cronRequestAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    // Named without being quoted: the variable is missing, and its value is never
    // something a log should carry.
    console.error("ubwi cron: no DATABASE_URL is configured; nothing was published");
    return Response.json({ ok: false, reason: "no_database_configured" }, { status: 503 });
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const result = await runDailyUbwiPublication(sql, { now: new Date().toISOString() });
    const summary = ubwiRunSummary(result);
    console.log(`ubwi cron: ${JSON.stringify(summary)}`);
    // A gate refusal and a stale observation are the pipeline working, not an outage, and
    // a day that already has its point is the cadence working. None of them is a 500: a
    // scheduler that retries on those would be retrying something that must not change.
    return Response.json({ ok: true, ...summary }, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`ubwi cron: run failed (${detail})`);
    return Response.json({ ok: false, reason: "run_failed" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
