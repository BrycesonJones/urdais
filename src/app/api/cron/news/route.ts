/**
 * Scheduled news ingestion.
 *
 * Vercel Cron issues a GET here on the Urdais news cadence and nothing else
 * does. The route takes no input: not a mode, not a source, not an endpoint.
 * Everything it ingests comes from the registry, and the mode is production,
 * hard-coded. There is no shape of request that could widen what it retrieves
 * or cause it to publish research data.
 *
 * It is deliberately not a public endpoint. An unauthenticated ingestion
 * trigger on a public origin lets anyone make Urdais hammer eight publishers,
 * which is a way to lose the permission this whole pipeline rests on.
 */

import { timingSafeEqual } from "node:crypto";

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { productionRunSummary, runProductionNewsIngestion } from "@/lib/news/run";

// Reads and writes the production store on every invocation.
export const dynamic = "force-dynamic";
// Eight feeds, a few hundred kilobytes each. A full run takes seconds against
// a live network, so it cannot still be going when the next one is due.
export const maxDuration = 60;

/**
 * Length-independent comparison. `timingSafeEqual` throws on a length
 * mismatch, which would itself leak the secret's length, so the lengths are
 * checked first and a mismatch is reported as an ordinary failure.
 */
function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Vercel sends the project's CRON_SECRET as `Authorization: Bearer <secret>`.
 * An absent secret fails closed: an unconfigured deployment refuses to ingest
 * rather than exposing an open trigger.
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
    // Named without being quoted: the variable is missing, and its value is
    // never something a log should carry.
    console.error("news cron: no DATABASE_URL is configured; nothing was ingested");
    return Response.json({ ok: false, reason: "no_database_configured" }, { status: 503 });
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const result = await runProductionNewsIngestion(sql);
    const summary = productionRunSummary(result);
    console.log(`news cron: ${JSON.stringify(summary)}`);
    // Every source failing is a failed run and says so in the status code, so
    // the cron log distinguishes it from a quiet one. Losing one source of
    // eight is not a failed run; the pipeline isolates it and the summary names it.
    const ok = result.sourcesSucceeded > 0;
    return Response.json({ ok, ...summary }, { status: ok ? 200 : 500 });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`news cron: run failed (${detail})`);
    return Response.json({ ok: false, reason: "run_failed" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
