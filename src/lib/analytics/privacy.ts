/**
 * What never leaves the browser in an analytics event: credentials in URLs.
 *
 * PostHog records the page URL and the referrer on every event. Most Urdais URLs
 * are harmless, but a few carry a credential or a lookup key in the query string
 * or the fragment for the length of one redirect:
 *
 * | where | what |
 * | --- | --- |
 * | `/auth/confirm?token_hash=…` | an email verification token |
 * | OAuth callbacks, `?code=…` | an authorization code |
 * | `/access/complete?session_id=…` | a Stripe Checkout Session id |
 * | `checkout.stripe.com/…#…`, `…#access_token=…` | as the referrer, a payment page or an implicit-flow token |
 *
 * So every URL-valued property is passed through `sanitizeUrl` in PostHog's
 * `before_send` hook: the fragment is dropped entirely and the named parameters are
 * redacted. UTM parameters and ordinary navigation parameters are kept, because
 * acquisition attribution is the point of collecting a URL at all. PostHog derives
 * its `utm_*` properties from the URL *before* this hook runs, so redaction here
 * cannot cost attribution.
 */

import type { CaptureResult } from "posthog-js";

/** Query parameters redacted wherever they appear. Compared case-insensitively. */
export const SENSITIVE_URL_PARAMS: readonly string[] = Object.freeze([
  "code",
  "token",
  "token_hash",
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
  "id_token",
  "session_id",
  "email",
]);

const REDACTED = "[redacted]";

/**
 * Which properties hold a URL: every key ending in `url` or `referrer`.
 *
 * A pattern rather than a list, because PostHog adds such properties over time
 * (`$current_url`, `$referrer`, `$initial_*`, `$session_entry_*`, …) and a list is
 * exactly how one gets missed — `$session_entry_url` was, until a browser check
 * caught it. Domain-only (`$referring_domain`) and path-only (`$pathname`)
 * properties carry no query string and are left alone.
 */
const URL_PROPERTY = /(url|referrer)$/i;

/** The URL without its fragment and with sensitive parameters redacted. Never throws. */
export function sanitizeUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // Not an absolute URL ("$direct", or a malformed value): the fragment is the
    // only part that can be removed safely without parsing.
    return value.split("#")[0]!;
  }

  url.hash = "";
  // Collected first: `set` while iterating would revisit entries.
  const names = [...new Set(url.searchParams.keys())];
  for (const name of names) {
    if (SENSITIVE_URL_PARAMS.includes(name.toLowerCase())) url.searchParams.set(name, REDACTED);
  }
  return url.toString();
}

function sanitizeBag(bag: Record<string, unknown> | undefined): void {
  if (!bag) return;
  for (const [key, value] of Object.entries(bag)) {
    if (typeof value === "string" && URL_PROPERTY.test(key)) bag[key] = sanitizeUrl(value);
  }
}

/** PostHog `before_send`: sanitise every URL-valued property, on the event and on the person. */
export function redactSensitiveUrls(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  sanitizeBag(event.properties);
  sanitizeBag(event.$set);
  sanitizeBag(event.$set_once);
  return event;
}
