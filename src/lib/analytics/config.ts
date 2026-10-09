/**
 * PostHog configuration, and the rule that decides whether analytics runs at all.
 *
 * Both values are `NEXT_PUBLIC_*` and public by design: a PostHog *project* key
 * (`phc_…`) can only write events, and it ships to every browser that loads the
 * snippet on any PostHog site. This module is safe to import from client and
 * server alike, the same contract `@/config/env` and `@/lib/auth/config` state.
 *
 * ## Off unless every condition holds
 *
 * Analytics is optional infrastructure. A missing or malformed value turns it off
 * — it never throws, and nothing in Urdais depends on it being on. It runs only
 * when:
 *
 *   - both variables are set, the key is a project key and the host is https;
 *   - the build is a production build. `next dev` sends nothing, so a developer
 *     whose `.env.local` holds the production key does not pollute production
 *     analytics, and `vitest` (NODE_ENV=test) sends nothing either.
 *
 * Preview deployments are production builds, so the variables belong in Vercel's
 * Production scope only. See docs/architecture/analytics.md.
 *
 * ## The personal API key is refused
 *
 * PostHog also issues personal API keys (`phx_…`), which read and administer the
 * whole organisation. One pasted into `NEXT_PUBLIC_POSTHOG_KEY` would be inlined
 * into the browser bundle. Refusing it here cannot un-ship it, but it does stop
 * the build from *working*, which is how the mistake gets noticed.
 */

export const POSTHOG_KEY_VAR = "NEXT_PUBLIC_POSTHOG_KEY";
export const POSTHOG_HOST_VAR = "NEXT_PUBLIC_POSTHOG_HOST";

export type AnalyticsConfig = {
  /** The project key (`phc_…`). Public. */
  readonly key: string;
  /** The ingestion origin, e.g. `https://us.i.posthog.com`, without a trailing slash. */
  readonly host: string;
};

export type AnalyticsEnv = {
  readonly key: string | undefined;
  readonly host: string | undefined;
  readonly nodeEnv: string | undefined;
};

/**
 * The real environment. Each `NEXT_PUBLIC_*` is read by its literal name, which is
 * the only form Next inlines into the browser bundle.
 */
function processEnv(): AnalyticsEnv {
  return {
    key: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    nodeEnv: process.env.NODE_ENV,
  };
}

/** The configuration, or null when analytics is off. Never throws. */
export function analyticsConfig(env: AnalyticsEnv = processEnv()): AnalyticsConfig | null {
  if (env.nodeEnv !== "production") return null;

  const key = env.key?.trim() ?? "";
  const host = env.host?.trim().replace(/\/+$/, "") ?? "";
  if (key === "" || host === "") return null;

  if (!key.startsWith("phc_")) {
    // Names the variable, never the value.
    console.error(`analytics: ${POSTHOG_KEY_VAR} is not a PostHog project key (phc_…); analytics is off`);
    return null;
  }

  try {
    if (new URL(host).protocol !== "https:") throw new Error("not https");
  } catch {
    console.error(`analytics: ${POSTHOG_HOST_VAR} is not an https origin; analytics is off`);
    return null;
  }

  return { key, host };
}
