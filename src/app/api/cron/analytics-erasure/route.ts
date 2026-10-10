/**
 * The daily analytics-erasure sweep.
 *
 * Settles every account deletion held at `auth_deleted` for at least an hour (see
 * `@/lib/account/analytics-erasure`): asks PostHog to delete the deleted account's
 * person and queue its events for deletion, then completes the deletion. It is the
 * only path that settles them, and retries every day until PostHog accepts. It also
 * completes any deletion that stopped at `auth_deleted` for another reason.
 *
 * Answers 500 while anything remains held, so a PostHog outage or missing erasure
 * credentials show up in the cron log every day until fixed. Nothing is lost
 * meanwhile: a held record keeps the account id until PostHog accepts the request.
 */

import { timingSafeEqual } from "node:crypto";

import { settleHeldDeletions } from "@/lib/account/analytics-erasure";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const summary = await settleHeldDeletions(sql);
    const ok = summary.held === 0;
    // Counts and codes only: never an account id.
    const line = `analytics erasure cron: completed ${summary.completed}, erasure requested ${summary.erasure_requested}, held ${summary.held}, skipped ${summary.skipped}`
      + (summary.codes.length > 0 ? ` (${summary.codes.join(", ")})` : "");
    if (ok) console.log(line);
    else console.error(line);
    return Response.json({ ok, ...summary }, { status: ok ? 200 : 500 });
  } catch (error) {
    console.error(`analytics erasure cron: failed (${error instanceof Error ? error.name : "error"})`);
    return Response.json({ ok: false, reason: "sweep_failed" }, { status: 500 });
  } finally {
    await sql.end();
  }
}
