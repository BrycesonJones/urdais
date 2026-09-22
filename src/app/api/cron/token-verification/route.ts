/**
 * The scheduled Token Price verification watchdog.
 *
 * Read the name carefully: this route verifies *that someone verified*, and collects nothing.
 * It answers from `pipeline.token_price_verifications` -- the durable record of people having
 * checked -- rather than from frozen benchmark instants, which move only when a price moves
 * and so said nothing at all about an unchanged review.
 * It issues no request to any provider, parses no pricing page, and writes no price observation.
 * Production acquisition remains a person running the verified operator workflow with evidence.
 *
 * The one write this route now makes is an operations heartbeat. It records that the watchdog
 * ran, the verification age it observed, and whether human review is due. That heartbeat grants
 * no collection right and contains no provider price data. Scheduled and operator triggers are
 * kept distinct so a manual check can never prove scheduler liveness.
 */

import { timingSafeEqual } from "node:crypto";

import { recordTokenVerificationHeartbeat } from "@/lib/operations/model-economics-heartbeats";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { loadPersistedBenchmarks } from "@/lib/tokens/read/benchmark-store";
import { loadVerificationEvents } from "@/lib/tokens/read/verification-events";
import { freshnessSummary, verificationFreshness } from "@/lib/tokens/verification-freshness";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
    console.error("token verification cron: no DATABASE_URL is configured; nothing was checked");
    return Response.json({ ok: false, reason: "no_database_configured" }, { status: 503 });
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  const ranAt = new Date().toISOString();
  try {
    // Both halves of the question, and neither stands in for the other: the
    // attestations say when a person last looked, the frozen rows say whether
    // there was anything valid for them to look at.
    const [benchmarks, verifications] = await Promise.all([loadPersistedBenchmarks(sql), loadVerificationEvents(sql)]);
    const report = verificationFreshness(benchmarks, verifications, new Date(ranAt));
    const latestVerifiedAt = report.providers
      .map((provider) => provider.lastVerifiedAt)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1) ?? null;

    await recordTokenVerificationHeartbeat(sql, {
      ranAt,
      trigger: "scheduled",
      outcome: report.ok ? "current" : "review_due",
      checkedAt: report.checkedAt,
      reviewIntervalDays: report.reviewIntervalDays,
      latestVerifiedAt,
      reviewDue: report.reviewDue,
      neverVerified: report.neverVerified,
      summary: {
        providers: report.providers.map((provider) => ({
          provider: provider.provider,
          state: provider.state,
          lastVerifiedAt: provider.lastVerifiedAt,
          ageDays: provider.ageDays,
          latestStatus: provider.latestStatus,
          lastVerifiedBy: provider.lastVerifiedBy,
          verificationEvents: provider.verificationEvents,
        })),
      },
      detail: null,
    });

    const line = `token verification cron: ${freshnessSummary(report)}`;
    if (report.ok) console.log(line);
    else console.warn(line);
    return Response.json(report, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    try {
      await recordTokenVerificationHeartbeat(sql, {
        ranAt,
        trigger: "scheduled",
        outcome: "failed",
        checkedAt: null,
        reviewIntervalDays: null,
        latestVerifiedAt: null,
        reviewDue: [],
        neverVerified: [],
        summary: { reason: "check_failed" },
        detail,
      });
    } catch {
      // Preserve the original failure if the database cannot persist its own heartbeat.
    }
    console.error(`token verification cron: check failed (${detail})`);
    return Response.json({ ok: false, reason: "check_failed" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
