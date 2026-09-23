/**
 * The scheduled UMPI check.
 *
 * Daily, for a monthly product, and deliberately so. UMPI's two agencies publish on calendar days
 * that move — the Bank of Korea between the 19th and 22nd, both agencies around Korean public
 * holidays whose dates shift every year — so a single monthly job pinned to one day would either
 * fire before the figure exists or wait days after it appeared. A narrow daily check costs two
 * small requests and finds the new month on the morning it arrives.
 *
 * **Scheduled at 23:30 UTC.** The Bank of Korea releases to ECOS at 08:00 KST, which is 23:00 UTC
 * the previous day, so a check half an hour later catches a new reference month the same day it
 * appears rather than a day late. It also collides with no existing cron; the rest of the
 * Urdais schedule occupies 00:00–10:15 UTC.
 *
 * One consequence is worth naming: a 23:30 UTC run happens on the previous UTC calendar day from
 * the Korean morning it observes, so the due-date arithmetic — which is in UTC — treats the month
 * as due a few hours later than Korea would. That errs toward calling a figure "not yet due",
 * which is the safe direction: it can delay a `stale` verdict by a day, and can never produce a
 * false one.
 *
 * The route does almost nothing itself. All of the orchestration, locking and recording is in
 * `runUmpiOperations`, so the hand-run `npm run umpi:ops` and this take the identical path.
 */

import { timingSafeEqual } from "node:crypto";

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { isHealthy } from "@/lib/umpi/ops/freshness";
import { runUmpiOperations } from "@/lib/umpi/ops/run";

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
    const result = await runUmpiOperations(sql, { trigger: "cron" });

    // A run that found nothing new is the ordinary outcome for eleven months of every twelve, and
    // reporting it as a failure would teach an operator to ignore this endpoint. What makes the
    // run unhealthy is a failed stage, or a series whose currentness cannot be vouched for.
    const ok = result.skippedReason === null
      && result.outcome !== "failed"
      && result.outcome !== "partial_failure"
      && result.checks.every((check) => isHealthy(check.freshness.state));

    if (!ok) {
      console.error(
        `umpi cron: run ${result.runId ?? "-"} ${result.outcome}, freshness ${result.freshnessState}`
        + result.checks
          .filter((check) => check.failure !== null || !isHealthy(check.freshness.state))
          .map((check) => ` | ${check.seriesCode}: ${check.freshness.state}`
            + (check.failure === null ? "" : ` (${check.failure.stage}/${check.failure.class})`))
          .join(""),
      );
    }

    console.log(
      `umpi cron: run ${result.runId ?? "-"} (${result.outcome}), freshness ${result.freshnessState}, `
      + `${Date.now() - startedAt}ms`,
    );

    return Response.json({
      ok,
      runId: result.runId,
      outcome: result.outcome,
      freshness: result.freshnessState,
      skippedReason: result.skippedReason,
      series: result.checks.map((check) => ({
        seriesCode: check.seriesCode,
        reachable: check.reachable,
        window: { from: check.requestedFrom, to: check.requestedTo },
        sourceLatestMonth: check.sourceLatestMonth,
        publishedMonth: check.publishedMonth,
        observationsWritten: check.observationsWritten,
        observationsRevised: check.observationsRevised,
        derivationRan: check.derivationRan,
        freshness: check.freshness.state,
        reason: check.freshness.reason,
        ...(check.failure === null ? {} : { failure: { stage: check.failure.stage, class: check.failure.class } }),
      })),
      elapsedMs: Date.now() - startedAt,
    }, { status: ok ? 200 : 500 });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`umpi cron: ${detail}`);
    return Response.json({ ok: false, reason: "failed" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
