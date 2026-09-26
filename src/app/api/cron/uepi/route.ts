/**
 * The daily UEPI run.
 *
 * One scheduled request per day advances every ingestible market through the reviewed pipeline,
 * records what happened in `pipeline.uepi_ingestion_runs`, and then evaluates freshness from the
 * released values -- in that order, and with the second deliberately not derived from the first.
 *
 * **A 200 from this route does not mean UEPI is fresh.** It means the run completed without a
 * source or database error, which is exactly what a morning looks like when every market has
 * published nothing new. The freshness verdict in the response is computed from the head of each
 * series and is the answer to that separate question; an operator watching only the HTTP status
 * would have watched a frozen product succeed every day.
 *
 * The status code follows the *run*, in the convention the other Urdais crons use: 200 all
 * markets clear, 207 some errored, 502 all did.
 */

import { timingSafeEqual } from "node:crypto";

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { describeDatabaseError } from "@/lib/db/connection";
import { loadUepiFreshness, recordScheduledRun } from "@/lib/uepi/ops/store";
import { runScheduledUepi } from "@/lib/uepi/ops/scheduled-run";

export const dynamic = "force-dynamic";
/**
 * Six markets, each asked for a trailing window whose days are almost all already stored.
 *
 * A stored day costs one query and no network call, so a steady-state run is roughly six
 * retrievals. 300 seconds is the headroom for the case that is not steady state -- a market
 * returning after an outage with several days to collect, against sources that are paced
 * deliberately and have answered HTTP 429 before.
 */
export const maxDuration = 300;

function equalSecret(presented: string, expected: string): boolean {
  const a = Buffer.from(presented); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The same Bearer check the other twelve Urdais crons use, and the same single secret. */
function uepiCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  const expected = secret?.trim();
  return Boolean(expected && authorization?.startsWith("Bearer ") && equalSecret(authorization.slice(7), expected));
}

export async function GET(request: Request): Promise<Response> {
  // Fails closed when the secret is absent: an unset CRON_SECRET must make the route
  // unreachable, never open.
  if (!uepiCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) return Response.json({ ok: false, reason: "no_database_configured" }, { status: 503 });

  let sql;
  try {
    sql = await createTokenSqlExecutor(databaseUrl);
  } catch (error) {
    console.error(`uepi cron: could not connect (${describeDatabaseError(error)})`);
    return Response.json({ ok: false, reason: "no_database_connection" }, { status: 503 });
  }

  try {
    const run = await runScheduledUepi({
      sql,
      trigger: "scheduled",
      // A dropped pooled connection costs one retried day rather than the rest of the run.
      reconnect: () => createTokenSqlExecutor(databaseUrl),
    });
    // Evaluated after the run, from the released values, so the verdict describes the product's
    // state now -- including the case where the run succeeded and advanced nothing.
    const freshness = await loadUepiFreshness(sql, new Date());
    try {
      await recordScheduledRun(sql, run, freshness);
    } catch (error) {
      // A ledger write that fails must not turn a successful ingestion into a failed one. The
      // values are already committed; losing the record of them is worth a loud log, not a
      // rollback of work that was correct.
      console.error(`uepi cron: run ledger write failed (${describeDatabaseError(error)})`);
    }
    console.log(
      `uepi cron: ${run.outcome}, released ${run.released}, freshness ${freshness.worstStatus} ` +
        `(${freshness.series.filter((series) => series.status === "fail").map((series) => series.seriesId).join(",") || "none failing"})`,
    );
    return Response.json(
      { ...run, freshness },
      { status: run.outcome === "succeeded" ? 200 : run.outcome === "partial" ? 207 : 502 },
    );
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`uepi cron: failed (${detail})`);
    return Response.json({ ok: false, reason: "run_failed" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
