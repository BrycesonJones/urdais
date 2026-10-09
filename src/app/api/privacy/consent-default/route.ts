/**
 * `GET /api/privacy/consent-default` — what applies to this visitor before they
 * choose: `{ "default": "granted" | "pending" }`.
 *
 * The browser cannot see its own country, and reading it in the root layout would
 * make every page — the static docs included — render per request. So the
 * consent banner asks here, once per full page load, and only while the visitor
 * has not chosen. The answer is derived from Vercel's `x-vercel-ip-country`; no
 * country, no IP and nothing else is returned or stored.
 */

import { NextResponse } from "next/server";

import { requestConsentDefault } from "@/lib/analytics/request-consent";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { default: await requestConsentDefault() },
    // Per visitor and per location: never shared, never stored.
    { headers: { "cache-control": "private, no-store" } },
  );
}
