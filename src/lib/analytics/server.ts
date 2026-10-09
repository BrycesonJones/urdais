/**
 * Server-side analytics events: the two funnel steps the browser cannot be trusted
 * to report.
 *
 * - `checkout_started` — recorded when Stripe has actually created a Checkout
 *   Session, not when a button was pressed.
 * - `subscription_completed` — recorded when an entitlement *becomes* active, which
 *   only a signed webhook or a server-side reconciliation against Stripe can cause.
 *   Never the success redirect: see `@/lib/billing/webhook`.
 *
 * Both are keyed on the Urdais account id, the same distinct id the browser
 * identifies with, so they join the reader's anonymous history in PostHog.
 *
 * ## Sent after the response
 *
 * Events are queued with Next's `after()`, so the webhook answers Stripe and the
 * Server Action redirects without waiting on PostHog. Every failure is swallowed:
 * PostHog being down, slow or unconfigured never changes a billing outcome. The
 * cost is that a lost request loses an event — analytics, not accounting.
 *
 * Import from server code only. It reads no secret (the project key is public),
 * but `posthog-node` has no business in a browser bundle.
 */

import { createHash } from "node:crypto";
import { after } from "next/server";
import { PostHog } from "posthog-node";

import { analyticsConfig } from "@/lib/analytics/config";
import { ANALYTICS_EVENTS, type AnalyticsEventName } from "@/lib/analytics/events";

export type ServerEvent = {
  readonly distinctId: string;
  readonly event: AnalyticsEventName;
  readonly properties?: Readonly<Record<string, string | number | boolean | null>>;
  /**
   * A stable event id. PostHog treats a repeated uuid for the same person, event
   * and timestamp as one event, so a deterministic id is a second line of defence
   * against double-counting behind the database's own once-only guarantee.
   */
  readonly uuid?: string;
  readonly timestamp?: Date;
};

/** How long a capture may take before it is abandoned. */
const REQUEST_TIMEOUT_MS = 3_000;

/**
 * A deterministic RFC 4122-shaped UUID (version 5 layout, SHA-256 based) for a
 * string. Used so the same business fact always produces the same event id.
 */
export function stableEventUuid(seed: string): string {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function send(config: { key: string; host: string }, input: ServerEvent): Promise<void> {
  let client: PostHog | null = null;
  try {
    client = new PostHog(config.key, {
      host: config.host,
      flushAt: 1,
      flushInterval: 0,
      requestTimeout: REQUEST_TIMEOUT_MS,
      fetchRetryCount: 1,
    });
    await client.captureImmediate({
      distinctId: input.distinctId,
      event: input.event,
      properties: { ...input.properties },
      // The server's location says where Vercel runs, not where the reader is.
      disableGeoip: true,
      ...(input.uuid ? { uuid: input.uuid } : {}),
      ...(input.timestamp ? { timestamp: input.timestamp } : {}),
    });
  } catch (error) {
    console.warn(`analytics: ${input.event} was not recorded (${error instanceof Error ? error.name : "error"})`);
  } finally {
    await client?.shutdown(REQUEST_TIMEOUT_MS).catch(() => undefined);
  }
}

/** Queue one event to be sent after the response. A no-op when analytics is off. Never throws. */
export function captureServerEvent(input: ServerEvent): void {
  try {
    const config = analyticsConfig();
    if (!config) return;
    after(() => send(config, input));
  } catch {
    // Chiefly `after()` outside a request scope (a script, a test): there is no
    // response to wait for, and no reason to send analytics from there at all.
  }
}

/** `checkout_started`: Stripe has created a Checkout Session for this account. */
export function recordCheckoutStarted(accountId: string, sourcePage: string | null): void {
  captureServerEvent({
    distinctId: accountId,
    event: ANALYTICS_EVENTS.checkoutStarted,
    properties: { product_name: "Urdais Premium", access_tier: "premium", source_page: sourcePage },
  });
}

/**
 * `subscription_completed`: this account's entitlement has just become active.
 *
 * The caller only invokes it for a transition the database reported as new (see
 * `applySubscriptionEvent`), and the uuid is derived from the subscription, so a
 * retried webhook, a resent event, or a webhook racing the post-checkout
 * reconciliation cannot produce a second conversion.
 */
export function recordSubscriptionCompleted(input: {
  readonly accountId: string;
  readonly subscriptionId: string;
  readonly livemode: boolean;
  readonly via: "webhook" | "reconciliation";
}): void {
  captureServerEvent({
    distinctId: input.accountId,
    event: ANALYTICS_EVENTS.subscriptionCompleted,
    uuid: stableEventUuid(`subscription_completed:${input.subscriptionId}`),
    properties: {
      product_name: "Urdais Premium",
      access_tier: "premium",
      livemode: input.livemode,
      confirmed_by: input.via,
    },
  });
}
