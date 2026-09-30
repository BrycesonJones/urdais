/**
 * `POST /api/stripe/webhook` — the billing authority's front door.
 *
 * ## The raw body is the signed thing
 *
 * Stripe signs the exact bytes it sent. `await request.text()` is used and the
 * result is handed to `constructEvent` untouched: no `request.json()`, no
 * normalisation, no re-serialisation. Parsing and re-encoding JSON changes key
 * order and whitespace, which changes the bytes, which invalidates a signature
 * that was perfectly good — and the failure looks like Stripe misbehaving.
 *
 * ## Status codes are instructions to Stripe
 *
 * Stripe retries on any non-2xx, with backoff, for days. That makes the status
 * code a decision about whether the problem can fix itself:
 *
 * | situation | status | why |
 * | --- | --- | --- |
 * | processed, duplicate, or ignored | 200 | done; stop sending |
 * | bad or missing signature | 400 | retrying will not produce a valid one |
 * | no account for the subscription | 400 | retrying will not make one exist |
 * | database or Stripe API failure | 500 | transient; **please** retry |
 * | not configured | 500 | an operator has to act, and silence would hide it |
 *
 * Returning 200 on a failure is the one genuinely dangerous answer: Stripe stops
 * retrying and the entitlement is never written. A subscriber who paid is locked
 * out, with nothing in the Stripe dashboard to suggest why.
 *
 * ## What is never logged
 *
 * The signing secret, the secret key, the raw body, and the signature header. Event
 * ids and subscription ids are logged because an operator cannot reconcile without
 * them and neither is a credential.
 */

import { type NextRequest, NextResponse } from "next/server";

import { STRIPE_WEBHOOK_SECRET_VAR, describeUnavailability } from "@/lib/billing/mode";
import { stripeContext } from "@/lib/billing/stripe";
import { processStripeEvent } from "@/lib/billing/webhook";
import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";

/** Node, not Edge: the Stripe SDK's signature verification needs Node crypto. */
export const runtime = "nodejs";
/** Never cached, never prerendered. */
export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const context = stripeContext();
  if (context.kind === "unavailable") {
    // 500 rather than 404: a webhook arriving at a deployment that cannot process
    // it is a configuration fault, and Stripe's retries are the thing most likely
    // to get it noticed.
    console.error(`stripe webhook: not configured (${describeUnavailability(context.availability)})`);
    return json(500, { error: "billing is not configured" });
  }
  const { stripe, availability } = context;

  const signingSecret = (process.env[STRIPE_WEBHOOK_SECRET_VAR] ?? "").trim();
  if (signingSecret === "") {
    console.error(`stripe webhook: ${STRIPE_WEBHOOK_SECRET_VAR} is not set`);
    return json(500, { error: "webhook signing secret is not configured" });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    // Not an error worth retrying, and not worth logging the absent header either.
    return json(400, { error: "missing stripe-signature" });
  }

  // The bytes Stripe signed, unmodified.
  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, signingSecret);
  } catch {
    // Deliberately no detail from the exception and no body in the log: a forged
    // request is attacker-controlled content, and the only fact worth recording is
    // that verification failed.
    console.error("stripe webhook: signature verification failed");
    return json(400, { error: "invalid signature" });
  }

  const databaseUrl = resolveTokenDatabaseUrl();
  if (!databaseUrl) {
    console.error(`stripe webhook: no database configured (event ${event.id})`);
    return json(500, { error: "no database configured" });
  }

  try {
    const sql = await tokenSqlExecutor(databaseUrl);
    const outcome = await processStripeEvent(stripe, sql, event, availability.mode);

    switch (outcome.kind) {
      case "processed":
        console.log(`stripe webhook: ${event.type} ${event.id} -> ${outcome.detail}`);
        return json(200, { received: true });
      case "ignored":
        console.log(`stripe webhook: ${event.type} ${event.id} ignored (${outcome.detail})`);
        return json(200, { received: true, ignored: true });
      case "rejected":
        console.error(`stripe webhook: ${event.type} ${event.id} rejected (${outcome.detail})`);
        return json(400, { error: "event cannot be processed" });
      case "failed":
        console.error(`stripe webhook: ${event.type} ${event.id} failed (${outcome.detail})`);
        return json(500, { error: "processing failed" });
    }
  } catch (error) {
    // Nothing was committed — `applySubscriptionEvent` rolls back, event claim
    // included — so a retry starts clean.
    console.error(`stripe webhook: ${event.type} ${event.id} threw (${error instanceof Error ? error.message : "error"})`);
    return json(500, { error: "processing failed" });
  }
}
