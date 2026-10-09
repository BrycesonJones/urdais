/**
 * Browser start-up: PostHog, initialised once, before the app hydrates.
 *
 * `instrumentation-client.ts` is the Next convention (15.3+) for code that runs
 * once per page load ahead of React, and it is where PostHog's own Next.js guide
 * puts `posthog.init`. Running here rather than in a provider component means
 * there is no React tree to wrap, no hydration boundary to cross, and no chance of
 * a Strict Mode double-mount initialising twice.
 *
 * Everything — the configuration, consent, Do Not Track — is decided in
 * `startAnalytics`; see `@/lib/analytics/consent-client` for the settings and the
 * reasons for them. With no configuration, in `next dev` and in tests it does
 * nothing at all, and every call in `@/lib/analytics/client` is a no-op.
 */

import { startAnalytics } from "@/lib/analytics/consent-client";

startAnalytics();
