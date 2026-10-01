/**
 * `POST /api/contact` — the contact modal's delivery endpoint.
 *
 * | situation | status | body |
 * | --- | --- | --- |
 * | delivered | 200 | `{ ok: true }` |
 * | body not JSON, too large, or failing validation | 400 | `{ ok: false, error: "invalid_input" }` |
 * | not configured, provider rejected or unreachable | 500 | `{ ok: false, error: "delivery_failed" }` |
 *
 * Only POST is exported, so Next answers every other method with 405. Every
 * failure body is one of those two fixed strings: nothing from the provider, the
 * environment or an exception ever reaches the client. The log line for a
 * failure names a reason code, and never the reader's address or message.
 *
 * There is no rate limiting yet; the repository has no limiter, and the strict
 * size limits here bound what any single request can cost.
 */

import { NextResponse } from "next/server";

import { deliverContactMessage } from "@/lib/contact/delivery";
import { validateContactInput } from "@/lib/contact/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Comfortably above the largest valid payload (5,000-character message, 254-character email). */
const MAX_BODY_BYTES = 32 * 1024;

function invalidInput(): NextResponse {
  return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return invalidInput();
    body = JSON.parse(raw);
  } catch {
    return invalidInput();
  }

  const validation = validateContactInput(body);
  if (!validation.ok) return invalidInput();

  let result;
  try {
    result = await deliverContactMessage(validation.value);
  } catch {
    result = { ok: false as const, reason: "unexpected" as const };
  }

  if (!result.ok) {
    const detail =
      result.reason === "not_configured"
        ? ` (missing ${result.missing.join(", ")})`
        : result.reason === "provider_rejected"
          ? ` (status ${result.status})`
          : "";
    console.error(`contact: delivery failed: ${result.reason}${detail}`);
    return NextResponse.json({ ok: false, error: "delivery_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
