/**
 * The scheduled delivery gap calculation.
 *
 * Planning datasets, not operational ones: the inputs change when ERCOT publishes a new load
 * forecast or a new capacity report, which is a few times a year. A daily run is not about
 * catching a change quickly — it is about the gap never being the stale half of a pair for long
 * after one arrives. The calculation is cheap and idempotent, so a day on which nothing changed
 * writes nothing and costs one small query.
 *
 * It runs after the power delivery ingestion slot, so that a day which brings a new source
 * release has ingested it before the gap is recalculated against it.
 */

import { timingSafeEqual } from "node:crypto";

import { calculateDeliveryGaps } from "@/lib/power-delivery/gap/calculate";
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
    const report = await calculateDeliveryGaps(sql);
    const wrote = report.outcomes.reduce((total, outcome) => total + outcome.inserted + outcome.revised, 0);
    console.log(`power delivery gap cron: ${JSON.stringify(report.outcomes.filter((outcome) => outcome.paired > 0))}`);
    return Response.json({ ok: true, methodologyVersion: report.methodologyVersion, wrote, outcomes: report.outcomes });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`power delivery gap cron: failed (${detail})`);
    return Response.json({ ok: false, reason: "calculation_failed" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
