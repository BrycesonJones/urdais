/**
 * The scheduled Token Price verification watchdog.
 *
 * Read the name carefully: this route verifies *that someone verified*, and collects nothing.
 * It issues no request to any provider, parses no pricing page, and writes no row. It reads
 * the frozen benchmarks Urdais already holds and reports how long it has been since a person
 * last checked each provider.
 *
 * It is deliberately not `/api/cron/tokens`, because there is no such job and a future reader
 * should not be able to mistake this for one. Every Wave-1 token source is `research_usable`
 * and `under_review` in the registry and none is machine-readable, and
 * docs/methodology/token-price.md is explicit that whether Urdais may retrieve those pages on
 * a schedule "is still open" for every one of them. Production acquisition is therefore a
 * person running `scripts/tokens/verify-production.ts` with `--verified-by` and `--evidence`,
 * which is how the 14 September 2026 benchmarks were created and the only way the next ones
 * may be. Automating the reading would require a collection right Urdais does not have.
 *
 * What this fixes is the failure mode that hid that: Token Price records an observation only
 * when a source price changes, so "unchanged, correctly" and "nobody has looked in weeks"
 * produce identical data. Production sat on a single 14 September row for two days and
 * nothing said so. Now the run says so, every day, in one line.
 *
 * A non-ok report is not an outage. It is a request for a person, and the route answers 200
 * either way so the cron history shows a working job with something to report rather than a
 * broken one. Only a genuine systemic failure -- no database, an unreadable store -- is a
 * non-2xx.
 */

import { timingSafeEqual } from "node:crypto";

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { loadPersistedBenchmarks } from "@/lib/tokens/read/benchmark-store";
import { freshnessSummary, verificationFreshness } from "@/lib/tokens/verification-freshness";

// Reads the production store on every invocation.
export const dynamic = "force-dynamic";
// One read of a handful of rows.
export const maxDuration = 30;

/** Length-independent comparison; `timingSafeEqual` throws on a length mismatch. */
function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The same shared secret the news, UBWI, UCPI and UTVI routes use. An absent secret fails
 * closed: an unconfigured deployment refuses to run rather than exposing an open trigger.
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
    // Named without being quoted: the variable is missing, and its value is never something
    // a log should carry.
    console.error("token verification cron: no DATABASE_URL is configured; nothing was checked");
    return Response.json({ ok: false, reason: "no_database_configured" }, { status: 503 });
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const report = verificationFreshness(await loadPersistedBenchmarks(sql), new Date());
    // A due review is a finding, not a failure, so it is logged as a warning and answered 200.
    const line = `token verification cron: ${freshnessSummary(report)}`;
    if (report.ok) console.log(line);
    else console.warn(line);
    return Response.json(report, { status: 200 });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`token verification cron: check failed (${detail})`);
    return Response.json({ ok: false, reason: "check_failed" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
