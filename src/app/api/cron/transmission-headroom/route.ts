/**
 * The scheduled Transmission Headroom refresh.
 *
 * Incremental only. It ingests whatever each source currently exposes and recalculates; it never
 * touches a historical archive, because re-walking twenty years of NYISO monthly zips on a daily
 * schedule would be both pointless and ruinous.
 *
 * ERCOT is refreshed first and deliberately. Its listing is a rolling seven-day window with no
 * archive, so an artifact missed for a week is gone permanently, whereas a missed NYISO day can be
 * recovered from a monthly zip at any time. If the run has to fail partway, it should fail after
 * the unrecoverable half has succeeded.
 *
 * Analytics are recalculated last and resolve by input digest, so a day on which no source moved
 * reuses the run already recorded rather than writing a second copy of the same numbers.
 */

import { timingSafeEqual } from "node:crypto";

import { runTransmissionIngestion } from "@/lib/transmission-headroom/ingest/run";
import { runTransmissionAnalytics } from "@/lib/transmission-headroom/analytics/run";
import { transmissionCurrentness } from "@/lib/transmission-headroom/read";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function equalSecret(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(authorization: string | null, secret: string | undefined): boolean {
  const expected = secret?.trim();
  return Boolean(expected && authorization?.startsWith("Bearer ")
    && equalSecret(authorization.slice(7), expected));
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) return Response.json({ ok: false, reason: "no_database_configured" }, { status: 503 });

  const startedAt = Date.now();
  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    // ERCOT first: its window is the only unrecoverable one.
    const ingestion = await runTransmissionIngestion(sql, ["ercot", "nyiso"]);
    const analytics = await runTransmissionAnalytics(sql);
    const currentness = await transmissionCurrentness(sql);

    if (analytics.status === "failed") {
      console.error(`transmission headroom cron: analytics failed (${analytics.error})`);
      return Response.json({ ok: false, reason: "analytics_failed", detail: analytics.error },
        { status: 500 });
    }

    const sources = ingestion.outcomes.map((outcome) => ({
      source: outcome.source,
      status: outcome.status,
      artifactsDiscovered: outcome.artifactsDiscovered,
      artifactsAlreadyHeld: outcome.artifactsAlreadyHeld,
      newObservations: outcome.totals.flows,
      newMargins: outcome.totals.margins,
      ...(outcome.error === undefined ? {} : { error: outcome.error }),
    }));

    const ok = ingestion.ok;
    if (!ok) console.error(`transmission headroom cron: an ingestion source failed`);
    console.log(`transmission headroom cron: run ${analytics.runId ?? "-"} (${analytics.run}), `
      + `${analytics.results ?? 0} results in ${Date.now() - startedAt}ms`);

    return Response.json({
      ok,
      sources,
      currentness: currentness.map((entry) => ({
        source: entry.sourceSlug, status: entry.status, ageHours: entry.ageHours,
        retentionAtRisk: entry.retentionAtRisk,
      })),
      analytics: {
        runId: analytics.runId, run: analytics.run,
        methodologyVersion: analytics.methodologyVersion,
        inputDigest: analytics.inputDigest, results: analytics.results,
        byStatus: analytics.byStatus,
      },
      elapsedMs: Date.now() - startedAt,
    }, { status: ok ? 200 : 500 });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`transmission headroom cron: ${detail}`);
    return Response.json({ ok: false, reason: "failed" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
