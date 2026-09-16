/**
 * The scheduled Model Frontier capability check.
 *
 * Vercel Cron issues a GET here once per UTC day and nothing else does. The route takes no
 * input: not a date, not a source, not a mode. There is no shape of request that could ask it
 * to ingest something other than the published Epoch bundle, or to write when the source has
 * not moved.
 *
 * **Most runs write nothing, and that is the design.** Epoch publishes when models are
 * evaluated, not on a calendar, so the ordinary outcome is a bundle whose bytes hash to the
 * last ingested ones — and the run then records no retrieval, no observation, no link and no
 * price selection. The response says `source unchanged`, which is a successful scheduled check
 * and **not** a capability rollover. Conflating those two would make every quiet day look like
 * new data, which is the precise failure this product spent a phase learning to avoid.
 *
 * Daily is cheap because of that idempotence: one download of roughly two megabytes, a hash,
 * and a comparison. Polling harder would not make Epoch publish sooner.
 *
 * Unlike the Token Price watchdog next door, this route genuinely collects. It may, because
 * the bundle carries its own CC BY 4.0 grant — and it re-checks that grant on every run rather
 * than trusting the day the source was approved.
 */

import { timingSafeEqual } from "node:crypto";

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { frontierRunSummary, runFrontierCapability } from "@/lib/frontier/run";

// Reads and writes the production store on every invocation.
export const dynamic = "force-dynamic";
// One download of a few megabytes, a hash, and at most a few hundred row writes.
export const maxDuration = 120;

/** Length-independent comparison; `timingSafeEqual` throws on a length mismatch. */
function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The same shared secret the news, UBWI, UCPI, UTVI and token-verification routes use. An
 * absent secret fails closed: an unconfigured deployment refuses to run rather than exposing
 * an open trigger that writes to production.
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
    // Named without being quoted: the variable is missing, and its value is never something a
    // log should carry.
    console.error("frontier cron: no DATABASE_URL is configured; nothing was checked or ingested");
    return Response.json({ ok: false, reason: "no_database_configured" }, { status: 503 });
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const result = await runFrontierCapability(sql, { trigger: "scheduled" });
    const summary = frontierRunSummary(result);

    if (!result.ok) {
      // A real ingestion or check failure is a non-2xx, so the cron history shows a failed job
      // rather than a green one with bad news inside the payload.
      console.error(`frontier cron: ${summary}`);
      return Response.json({ ...result, ok: false, summary }, { status: 502 });
    }

    console.log(`frontier cron: ${summary}`);
    return Response.json(
      {
        ...result,
        ok: true,
        summary,
        // The three states, named rather than inferred from whether a count is zero.
        schedulerRan: true,
        sourceChecked: true,
        capabilityRollover: result.sourceChanged,
      },
      { status: 200 },
    );
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`frontier cron: unhandled failure (${detail})`);
    return Response.json({ ok: false, reason: "unhandled", detail }, { status: 502 });
  } finally {
    await sql.end();
  }
}
