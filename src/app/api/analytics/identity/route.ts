/**
 * `GET /api/analytics/identity` — which Urdais account, if any, this request's
 * session belongs to: `{ "accountId": "<uuid>" | null }`.
 *
 * A browser PostHog has identified keeps that account id across visits. If the
 * account was deleted, or the reader signed out on another device, or the session
 * simply ended, that browser would go on sending events under an id that no
 * longer belongs to anyone — and after an erasure, recreate the person PostHog
 * just deleted. So before PostHog starts on an identified browser (at most every
 * ten minutes per tab),
 * the browser asks here, and resets unless the answer matches.
 *
 * It answers only about the caller's own session and takes no input. No session
 * cookie: null without touching Supabase. It never provisions an account
 * (`readUrdaisAccountId`), and any failure answers null — which resets the
 * browser, the privacy-safe direction.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { readUrdaisAccountId } from "@/lib/auth/accounts";
import { resolveSupabaseIdentity } from "@/lib/auth/identity";
import { hasSupabaseAuthCookie } from "@/lib/auth/session";
import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";

export const dynamic = "force-dynamic";

async function currentAccountId(): Promise<string | null> {
  try {
    const jar = await cookies();
    if (!hasSupabaseAuthCookie(jar.getAll().map((cookie) => cookie.name))) return null;
    const resolution = await resolveSupabaseIdentity();
    if (resolution.kind !== "authenticated") return null;
    const databaseUrl = resolveTokenDatabaseUrl();
    if (!databaseUrl) return null;
    return await readUrdaisAccountId(await tokenSqlExecutor(databaseUrl), resolution.identity.subject);
  } catch {
    return null;
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ accountId: await currentAccountId() }, { headers: { "cache-control": "private, no-store" } });
}
