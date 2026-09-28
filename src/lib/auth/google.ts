/**
 * Whether "Continue with Google" may be shown, and how it is started.
 *
 * ## The authority is Supabase, not a flag of our own
 *
 * The obvious design is an environment variable — and it has exactly the failure
 * this module exists to prevent. A flag can be switched on before Google is
 * configured, and then Urdais renders a button that predictably fails. So
 * availability is read from the project's own public settings endpoint, which
 * reports `external.google` as the truth about whether the provider is enabled.
 * It cannot drift from reality, because it *is* reality.
 *
 * Server-side, and unreachable from the browser: there is no query parameter,
 * cookie or header that turns the button on.
 *
 * ## Fails closed, and caches
 *
 * An unreachable settings endpoint, a malformed answer, or an unconfigured project
 * all mean "not available", so the button is absent rather than broken. The answer
 * is cached for the process's lifetime because it changes when an operator edits a
 * dashboard, not between requests — and a page render should not depend on a live
 * HTTP call to a third party. Enabling Google therefore takes effect on the next
 * deployment, which is stated in the documentation rather than left to surprise
 * someone.
 */

import { readSupabaseConfig, type ProcessEnvLike } from "@/lib/auth/config";

/** The provider id, in the one place it is spelled. */
export const GOOGLE_PROVIDER = "google" as const;

type Availability = { readonly available: boolean; readonly reason: "configured" | "provider_disabled" | "unconfigured" | "unreachable" };

const UNCONFIGURED: Availability = { available: false, reason: "unconfigured" };

/** Process-lifetime cache. Cleared only by a new deployment. */
let cached: Availability | null = null;

/** For tests: forget what was learned. */
export function resetGoogleAvailabilityCache(): void {
  cached = null;
}

/**
 * Ask the project whether Google is enabled.
 *
 * `GET /auth/v1/settings` is public and unauthenticated — it is what a Supabase
 * client reads to know which providers to offer — so this needs no secret.
 */
async function fetchAvailability(env: ProcessEnvLike): Promise<Availability> {
  const configured = readSupabaseConfig(env);
  if ("problem" in configured) return UNCONFIGURED;

  try {
    const response = await fetch(`${configured.config.url}/auth/v1/settings`, {
      headers: { apikey: configured.config.publishableKey },
      // The answer changes with a dashboard edit, not with a request.
      cache: "force-cache",
    });
    if (!response.ok) return { available: false, reason: "unreachable" };

    const body = (await response.json()) as { external?: Record<string, unknown> };
    const enabled = body?.external?.[GOOGLE_PROVIDER] === true;
    return enabled ? { available: true, reason: "configured" } : { available: false, reason: "provider_disabled" };
  } catch {
    return { available: false, reason: "unreachable" };
  }
}

/**
 * Whether the Google button should be rendered at all.
 *
 * Not rendered when unavailable, rather than rendered disabled. A disabled control
 * for something that may never be configured is clutter that asks the reader to
 * wonder what they are missing; its absence asks nothing.
 */
export async function googleAuthAvailability(env: ProcessEnvLike = process.env): Promise<Availability> {
  if (cached) return cached;
  cached = await fetchAvailability(env);
  return cached;
}

export async function isGoogleAuthAvailable(env: ProcessEnvLike = process.env): Promise<boolean> {
  return (await googleAuthAvailability(env)).available;
}
