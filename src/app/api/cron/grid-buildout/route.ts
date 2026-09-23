/**
 * The scheduled Grid Buildout refresh.
 *
 * Daily, against sources that publish two and three times a year. That looks profligate and is
 * not: snapshot identity is checked before any work, so a day on which neither publisher moved
 * writes nothing at all, and the cost of asking is one content hash per source. What it buys is a
 * bound on how long a genuinely new vintage can sit unnoticed, which is one day rather than
 * however long until someone thinks to look.
 *
 * The route is thin and deliberately holds no policy. It authenticates, delegates to the
 * operational runner, and reports what happened. Ingestion, the methodology guard, the analytics
 * and every validation layer are the same reviewed code the manual path uses; there is no
 * scheduler-only branch anywhere in the chain, which is the point.
 *
 * A failed run answers 500 and leaves the previous publication current. That is not a fallback to
 * stale data, it is the correct outcome: the last validated publication remains the best available
 * answer, and the freshness gate reports its age honestly rather than pretending a failed attempt
 * refreshed anything.
 */

import { timingSafeEqual } from "node:crypto";

import { gridBuildoutFreshness } from "@/lib/grid-buildout/operations/freshness";
import { runScheduledGridBuildout } from "@/lib/grid-buildout/operations/scheduled-run";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function equalSecret(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function cronRequestAuthorized(authorization: string | null, secret: string | undefined): boolean {
  const expected = secret?.trim();
  return Boolean(expected && authorization?.startsWith("Bearer ")
    && equalSecret(authorization.slice(7), expected));
}

export async function GET(request: Request): Promise<Response> {
  if (!cronRequestAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) return Response.json({ ok: false, reason: "no_database_configured" }, { status: 503 });

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const outcome = await runScheduledGridBuildout(sql, { trigger: "scheduled" });
    const freshness = await gridBuildoutFreshness(sql);

    if (outcome.status === "failed") {
      console.error(`grid buildout cron: ${outcome.failedPhase} failed (${outcome.errorClass}): `
        + `${outcome.errorDetail ?? "no detail"}`);
    } else {
      console.log(`grid buildout cron: ${outcome.status}, analytics ${outcome.analyticsRun ?? "-"} `
        + `${outcome.analyticsRunId ?? "-"}, freshness ${freshness.status}, ${outcome.elapsedMs}ms`);
    }

    return Response.json({
      ok: outcome.status !== "failed",
      jobRunId: outcome.jobRunId,
      status: outcome.status,
      published: outcome.published,
      analytics: {
        runId: outcome.analyticsRunId, run: outcome.analyticsRun,
        methodologyVersion: outcome.methodologyVersion,
      },
      sources: outcome.sources,
      // Reported on failure too, so an operator can see at a glance whether the still-current
      // publication is old enough to matter yet.
      freshness: {
        status: freshness.status, lastPublishedAt: freshness.lastPublishedAt,
        ageHours: freshness.ageHours, staleAfterHours: freshness.staleAfterHours,
      },
      ...(outcome.status === "failed"
        ? { failedPhase: outcome.failedPhase, errorClass: outcome.errorClass }
        : {}),
      elapsedMs: outcome.elapsedMs,
    }, { status: outcome.status === "failed" ? 500 : 200 });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`grid buildout cron: ${detail}`);
    return Response.json({ ok: false, reason: "failed" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
