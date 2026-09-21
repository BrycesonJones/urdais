/**
 * The scheduled interconnection queue calculation.
 *
 * The canonical sources refresh on their own cadences — CAISO daily, PJM and MISO continuously,
 * ERCOT and NYISO monthly, SPP weekly — so a daily recalculation is about the analytics never
 * being stale for long after an ingestion, not about catching a change within the hour.
 *
 * A day on which no canonical input moved costs one small query and writes nothing: the run is
 * identified by the methodology version and a digest of the inputs it read, so an unchanged
 * digest resolves to the run already recorded.
 *
 * It runs after the queue ingestion slot, so a day that brings a new source release has ingested
 * it before the metrics are recalculated against it.
 */

import { timingSafeEqual } from "node:crypto";

import { runQueueAnalytics } from "@/lib/interconnection-queue/analytics/run";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function equalSecret(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(authorization: string | null, secret: string | undefined): boolean {
  const expected = secret?.trim();
  return Boolean(expected && authorization?.startsWith("Bearer ") && equalSecret(authorization.slice(7), expected));
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) return Response.json({ ok: false, reason: "no_database_configured" }, { status: 503 });

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const outcome = await runQueueAnalytics(sql);
    if (outcome.status === "failed") {
      console.error(`interconnection queue cron: failed (${outcome.error})`);
      return Response.json({ ok: false, reason: "calculation_failed" }, { status: 500 });
    }
    if (outcome.status === "dry_run") {
      return Response.json({ ok: false, reason: "unexpected_dry_run" }, { status: 500 });
    }
    console.log(`interconnection queue cron: run ${outcome.run}, ${outcome.resultsInserted} results, `
      + `${outcome.liveResults} live, ${outcome.blockedResults} blocked`);
    return Response.json({
      ok: true, methodologyVersion: outcome.methodologyVersion, run: outcome.run,
      resultsInserted: outcome.resultsInserted, liveResults: outcome.liveResults,
      blockedResults: outcome.blockedResults, deferredResults: outcome.deferredResults,
    });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`interconnection queue cron: failed (${detail})`);
    return Response.json({ ok: false, reason: "calculation_failed" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
