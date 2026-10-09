/**
 * The browser side of analytics: three calls, each of which may silently do
 * nothing.
 *
 * PostHog is initialised once, in `src/instrumentation-client.ts`, and only when
 * `analyticsConfig()` says so. Every function here checks that it actually loaded
 * and swallows anything PostHog throws, so a component that records an event
 * behaves identically whether analytics is on, off, blocked by an extension, or
 * broken. Analytics never decides whether a click works.
 */

import posthog from "posthog-js";

import { identificationAllowed, reapplyConsentAfterReset } from "@/lib/analytics/consent-client";
import type { AnalyticsEventName } from "@/lib/analytics/events";

type Properties = Readonly<Record<string, string | number | boolean | null>>;

function loaded(): boolean {
  return typeof window !== "undefined" && posthog.__loaded === true;
}

/** Record one custom event. */
export function track(event: AnalyticsEventName, properties: Properties = {}): void {
  if (!loaded()) return;
  try {
    posthog.capture(event, { ...properties });
  } catch {
    // Never surfaced: see the module comment.
  }
}

/**
 * Tie this browser to an Urdais account — only with analytics consent.
 *
 * A visitor who declined, or has not yet chosen where consent comes first, is
 * never identified: their browser stays cookieless or silent, and nothing links
 * it to the account.
 *
 * The account id is the stable internal key (`identity.accounts.id`), the same id
 * server-side events use, so a browser's anonymous history and the webhook's
 * `subscription_completed` land on one person. No email, name or other profile
 * field is sent.
 *
 * Calling it again with the same id is a no-op, so pages may render it freely.
 */
export function identifyAccount(accountId: string): void {
  if (!loaded()) return;
  try {
    if (!identificationAllowed()) return;
    if (posthog.get_distinct_id() !== accountId) posthog.identify(accountId);
  } catch {
    // Never surfaced.
  }
}

/**
 * Forget the account on this browser: sign-out, deletion, or a page that found no
 * session for a browser PostHog still believes is identified.
 *
 * Only resets an identified browser. Resetting an anonymous one would discard its
 * own anonymous id and, with it, the acquisition history it was building.
 */
export function resetIdentity(): void {
  if (!loaded()) return;
  try {
    if (posthog.get_property("$user_state") !== "identified") return;
    posthog.reset();
    // `reset()` also clears PostHog's consent flag. Signing out must not change
    // the visitor's analytics choice, so it is put back.
    reapplyConsentAfterReset();
  } catch {
    // Never surfaced.
  }
}
