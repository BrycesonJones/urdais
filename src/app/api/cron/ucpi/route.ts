/**
 * The scheduled UCPI listed-GPU run.
 *
 * Vercel Cron issues a GET here once per UTC day and nothing else does. The route takes no
 * input: not a date, not an instrument, not a mode. The collection date is the server's own
 * clock at invocation and the calculation date follows from it, so there is no shape of
 * request that could ask for a different day, a second point, or a value the pipeline did
 * not calculate.
 *
 * Like the UBWI route it is not a public endpoint, and no page request reaches it. A
 * publication trigger anyone could fire would let a stranger decide when Urdais publishes an
 * index; a page that published on render would publish once per visitor.
 *
 * Cadence. One request per instrument per day, five instruments, so five of the source's
 * 1,000 daily requests. The source asks that responses be cached an hour or more and a daily
 * job satisfies that with room to spare. Publication is daily because the methodology's
 * calendar is a UTC calendar date with a cutoff at the next midnight, so a date's value
 * cannot be calculated until that date is over. Collecting more often would not let the
 * index print more often; it would only add intra-day observations the methodology has no
 * rule for selecting between. The two cadences are therefore the same here by the
 * methodology's choice, not by accident, and running at 01:00 UTC means the calculation
 * happens an hour after its cutoff rather than racing it.
 *
 * Outcomes are distinguishable from the response without reading the log. Per instrument,
 * `calculation` is `published`, `delayed`, `unavailable` (the structural participant rule
 * produced no value), `blocked` (a publication gate refused, with the reasons), `not_approved`,
 * `no_observations`, `already_calculated` (the day already has its point) or `failed`. Only a
 * 500 with `reason: "run_failed"` is an outage; the rest are the pipeline working.
 */

import { timingSafeEqual } from "node:crypto";

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { runDailyUcpi, ucpiRunSummary } from "@/lib/ucpi/runtime/daily-run";

// Reads and writes the production store on every invocation.
export const dynamic = "force-dynamic";
// Five keyless GETs and five calculations, each of a few dozen rows. Sixty seconds is
// generous and still far under the daily interval.
export const maxDuration = 60;

/**
 * Length-independent comparison. `timingSafeEqual` throws on a length mismatch, which would
 * itself leak the secret's length, so the lengths are checked first and a mismatch is
 * reported as an ordinary failure.
 */
function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Vercel sends the project's CRON_SECRET as `Authorization: Bearer <secret>`. An absent
 * secret fails closed: an unconfigured deployment refuses to run rather than exposing an
 * open trigger. This is the same shared secret the news and UBWI routes use; a second
 * secret would be one more thing to rotate and nothing more.
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
    console.error("ucpi cron: no DATABASE_URL is configured; nothing was collected or published");
    return Response.json({ ok: false, reason: "no_database_configured" }, { status: 503 });
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const result = await runDailyUcpi(sql);
    const summary = ucpiRunSummary(result);
    console.log(`ucpi cron: ${JSON.stringify(summary)}`);
    return Response.json({ ok: true, ...summary }, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`ucpi cron: run failed (${detail})`);
    return Response.json({ ok: false, reason: "run_failed" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
