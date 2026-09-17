/**
 * The scheduled UTVI run.
 *
 * Vercel Cron issues a GET here once per UTC day and nothing else does. The route takes no
 * input: not a date, not a window, not a mode. The dates follow from the server's clock at
 * invocation, so there is no shape of request that could ask for a different day, a second
 * point, or a value the pipeline did not calculate.
 *
 * Cadence. One invocation, two reads: the day that just closed, and the day before it for
 * settlement confirmation. Running at 02:00 UTC puts collection two hours after the day closed.
 *
 * Every authenticated scheduled invocation now records a narrow operational heartbeat after
 * it reaches the database. The heartbeat is not UTVI data: it only proves that the schedule
 * ran and records the summarized outcome. Operator and scheduled runs are distinct so a manual
 * recovery can never be mistaken for proof that Vercel Cron is alive.
 */

import { timingSafeEqual } from "node:crypto";

import { recordUtviHeartbeat } from "@/lib/operations/model-economics-heartbeats";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { runDailyUtvi, utviRunSummary } from "@/lib/utvi/run";
import { readApiKey, UTVI_API_KEY_ENV } from "@/lib/utvi/source/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

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
    console.error("utvi cron: no DATABASE_URL is configured; nothing was collected or published");
    return Response.json({ ok: false, reason: "no_database_configured" }, { status: 503 });
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  const ranAt = new Date().toISOString();
  try {
    if (readApiKey() === null) {
      const detail = `${UTVI_API_KEY_ENV} is not configured; the source cannot be read`;
      await recordUtviHeartbeat(sql, {
        ranAt,
        trigger: "scheduled",
        outcome: "failed",
        collectionDate: null,
        settlementDate: null,
        summary: { reason: "no_source_credential" },
        detail,
      });
      console.error(`utvi cron: ${detail}`);
      return Response.json({ ok: false, reason: "no_source_credential" }, { status: 503 });
    }

    const result = await runDailyUtvi(sql);
    const summary = utviRunSummary(result);
    await recordUtviHeartbeat(sql, {
      ranAt,
      trigger: "scheduled",
      outcome: result.ok ? "succeeded" : "failed",
      collectionDate: result.collectionDate,
      settlementDate: result.settlementDate,
      summary,
      detail: result.ok ? null : "UTVI daily run completed with one or more failed retrieval/date outcomes",
    });

    console.log(`utvi cron: ${JSON.stringify(summary)}`);
    return Response.json({ ok: result.ok, ...summary }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    try {
      await recordUtviHeartbeat(sql, {
        ranAt,
        trigger: "scheduled",
        outcome: "failed",
        collectionDate: null,
        settlementDate: null,
        summary: { reason: "run_failed" },
        detail,
      });
    } catch {
      // The original failure is the one the route must report; heartbeat persistence may itself
      // be what failed, and must not replace that evidence with a second exception.
    }
    console.error(`utvi cron: run failed (${detail})`);
    return Response.json({ ok: false, reason: "run_failed" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
