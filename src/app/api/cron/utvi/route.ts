/**
 * The scheduled UTVI run.
 *
 * Vercel Cron issues a GET here once per UTC day and nothing else does. The route takes no
 * input: not a date, not a window, not a mode. The dates follow from the server's clock at
 * invocation, so there is no shape of request that could ask for a different day, a second
 * point, or a value the pipeline did not calculate.
 *
 * Like the UCPI and UBWI routes it is not a public endpoint and no page request reaches it.
 *
 * Cadence. One invocation, two reads: the day that just closed, and the day before it for
 * settlement confirmation. Two of the source's five hundred daily requests. Running at
 * 02:00 UTC puts the collection two hours after the day closed, which matters because the
 * source clamps `end_date` to the last completed day and will not serve a partial one — and
 * because the just-closed day is still accruing at that point, which is why its value is
 * published provisionally and confirmed the next day rather than trusted once.
 *
 * Outcomes are readable from the response without opening a log. Per date, `snapshot` is
 * `created`, `confirmed`, `revised`, `settled` or `no_rows`; `calculation` is `recorded`,
 * `skipped_no_coverage`, `skipped_unchanged` or `failed`; and `publication` is `published`,
 * `superseded`, `not_attempted` or a named refusal. While the methodology is a draft, every
 * publication reads `refused_methodology_not_approved`, and that is the intended state rather
 * than an outage.
 */

import { timingSafeEqual } from "node:crypto";

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { runDailyUtvi, utviRunSummary } from "@/lib/utvi/run";
import { readApiKey, UTVI_API_KEY_ENV } from "@/lib/utvi/source/client";

// Reads and writes the production store on every invocation.
export const dynamic = "force-dynamic";
// Two authenticated GETs of a few dozen rows each, plus two calculations.
export const maxDuration = 60;

/** Length-independent comparison; `timingSafeEqual` throws on a length mismatch. */
function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The same shared secret the news, UBWI and UCPI routes use. An absent secret fails closed:
 * an unconfigured deployment refuses to run rather than exposing an open trigger.
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
    // Named without being quoted: the variable is missing, and its value is never something
    // a log should carry.
    console.error("utvi cron: no DATABASE_URL is configured; nothing was collected or published");
    return Response.json({ ok: false, reason: "no_database_configured" }, { status: 503 });
  }

  if (readApiKey() === null) {
    console.error(`utvi cron: ${UTVI_API_KEY_ENV} is not configured; the source cannot be read`);
    return Response.json({ ok: false, reason: "no_source_credential" }, { status: 503 });
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const result = await runDailyUtvi(sql);
    const summary = utviRunSummary(result);
    console.log(`utvi cron: ${JSON.stringify(summary)}`);
    return Response.json({ ok: result.ok, ...summary }, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`utvi cron: run failed (${detail})`);
    return Response.json({ ok: false, reason: "run_failed" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
