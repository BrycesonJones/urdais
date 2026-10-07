/**
 * The scheduled interconnection queue refresh: ingest, check, gate, then calculate.
 *
 * The canonical sources refresh on their own cadences — CAISO and ISO-NE daily, PJM and MISO
 * continuously, SPP weekly, ERCOT and NYISO monthly — so one daily pass ingests each in turn,
 * records a source check for each, and only then recalculates. A day on which nothing moved
 * writes a check per source and nothing else: snapshots are content-addressed, and the analytics
 * run is identified by the methodology version and a digest of its inputs.
 *
 * The route is thin and holds no policy; the runner does. If any published market's inputs are
 * stale or missing, the analytics are not attempted, the previous validated run stays served, and
 * this answers 500 so the gap is visible. A source that failed also answers 500, even when the
 * others were current enough to recalculate. A source that ingested with a deferred archive
 * artifact did not fail: the deferral is listed in its result and check, and the answer is 200
 * unless the freshness gate or the analytics say otherwise.
 */

import { timingSafeEqual } from "node:crypto";

import { runScheduledQueueRefresh } from "@/lib/interconnection-queue/operations/scheduled-run";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";

export const dynamic = "force-dynamic";
// Seven publishers retrieved in sequence, one of them a three-workbook archive walk.
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
    const outcome = await runScheduledQueueRefresh(sql);
    const analytics = outcome.analytics;

    if (!outcome.ok) {
      console.error(`interconnection queue cron: ${outcome.reason ?? "failed"}; `
        + outcome.sources.map((source) => `${source.source} ${source.status}/${source.currentness}`).join(", ")
        + (outcome.stale.length === 0 ? ""
          : `; stale: ${outcome.stale.map((row) => `${row.marketSlug} (${row.condition})`).join(", ")}`)
        + (analytics?.status === "failed" ? `; analytics: ${analytics.error}` : ""));
    } else {
      const deferred = outcome.sources.filter((source) => source.deferred.length > 0);
      // Reachable and current, but the content has not moved in longer than expected: a warning,
      // never a failure.
      const unchanged = outcome.currentness.filter((row) => row.contentUnchangedWarning);
      console.log(`interconnection queue cron: ${outcome.status}`
        + (analytics?.status === "calculated"
          ? `, run ${analytics.run}, ${analytics.resultsInserted} results, ${analytics.liveResults} live`
          : "")
        + (deferred.length === 0 ? ""
          : `, deferred: ${deferred.map((source) => `${source.source} ${source.deferred.length}`).join(", ")}`)
        + (unchanged.length === 0 ? ""
          : `, content unchanged: ${unchanged.map((row) => `${row.marketSlug} ${row.contentAgeHours}h`).join(", ")}`)
        + `, ${outcome.elapsedMs}ms`);
    }

    return Response.json({
      ok: outcome.ok,
      status: outcome.status,
      reason: outcome.reason,
      ...(outcome.reason === "inputs_stale" ? { stale: outcome.stale } : {}),
      sources: outcome.sources,
      // Reported on every outcome, so an operator can see which publisher is behind and by how much.
      currentness: outcome.currentness.map((row) => ({
        marketSlug: row.marketSlug, sourceInterfaceSlug: row.sourceInterfaceSlug,
        publishable: row.publishable, status: row.status, condition: row.condition, basis: row.basis,
        lastCheckedAt: row.lastCheckedAt, lastSuccessfulCheckAt: row.lastSuccessfulCheckAt,
        latestObservedAt: row.latestObservedAt, ageHours: row.ageHours,
        contentAgeHours: row.contentAgeHours, contentUnchangedWarning: row.contentUnchangedWarning,
        sourcePublishedAt: row.sourcePublishedAt, publicationAgeHours: row.publicationAgeHours,
        staleAfterHours: Number.isFinite(row.staleAfterHours) ? row.staleAfterHours : null,
      })),
      analytics: analytics?.status === "calculated"
        ? {
          methodologyVersion: analytics.methodologyVersion, runId: analytics.runId, run: analytics.run,
          resultsInserted: analytics.resultsInserted, liveResults: analytics.liveResults,
          blockedResults: analytics.blockedResults, deferredResults: analytics.deferredResults,
        }
        : analytics === null ? null : { status: analytics.status },
      elapsedMs: outcome.elapsedMs,
    }, { status: outcome.ok ? 200 : 500 });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`interconnection queue cron: failed (${detail})`);
    return Response.json({ ok: false, reason: "failed" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
