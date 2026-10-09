/**
 * Browser start-up: PostHog, initialised once, before the app hydrates.
 *
 * `instrumentation-client.ts` is the Next convention (15.3+) for code that runs
 * once per page load ahead of React, and it is where PostHog's own Next.js guide
 * puts `posthog.init`. Running here rather than in a provider component means
 * there is no React tree to wrap, no hydration boundary to cross, and no chance of
 * a Strict Mode double-mount initialising twice.
 *
 * When `analyticsConfig()` returns null — no key, a malformed key, `next dev`, or
 * a test — this file does nothing at all, and every call in `@/lib/analytics/client`
 * becomes a no-op.
 *
 * ## The settings, and why
 *
 * - `capture_pageview: "history_change"` — one `$pageview` on load and one per
 *   client-side navigation, driven by the History API. App Router navigations are
 *   pushState calls, so nothing in Urdais records pageviews by hand, and nothing
 *   should: a second recorder is how pageviews double.
 * - `person_profiles: "identified_only"` — anonymous visitors are counted (web
 *   analytics, funnels, attribution) without a person profile each.
 * - **Session replay off**, and surveys, product tours, conversations and every
 *   other remotely loaded extension with it: `disable_external_dependency_loading`
 *   stops PostHog fetching any further script, whatever the project settings later
 *   say. Turning replay on is a decision, made here, not a dashboard toggle.
 * - `mask_personal_data_properties` — ad click ids (gclid, fbclid, …) are masked.
 *   UTM parameters are not affected.
 * - `respect_dnt` — a browser sending Do Not Track sends no analytics.
 * - `before_send` — credentials in URLs are redacted; see `@/lib/analytics/privacy`.
 *
 * Autocapture stays on with PostHog's defaults: it never records input values, and
 * the one element that displays an email address (`/account`) is marked
 * `ph-no-capture`.
 */

import posthog from "posthog-js";

import { analyticsConfig } from "@/lib/analytics/config";
import { redactSensitiveUrls } from "@/lib/analytics/privacy";

const config = analyticsConfig();

if (config) {
  try {
    posthog.init(config.key, {
      api_host: config.host,
      defaults: "2026-08-30",
      capture_pageview: "history_change",
      person_profiles: "identified_only",
      disable_session_recording: true,
      disable_surveys: true,
      disable_product_tours: true,
      disable_conversations: true,
      disable_external_dependency_loading: true,
      mask_personal_data_properties: true,
      respect_dnt: true,
      before_send: redactSensitiveUrls,
    });
  } catch {
    // Analytics failing to start must not stop Urdais from starting.
  }
}
