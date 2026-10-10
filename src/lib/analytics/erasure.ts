/**
 * Erasing one Urdais account's analytics from PostHog.
 *
 * ## What is erased
 *
 * An identified browser's PostHog person has the Urdais account id as a distinct
 * id; `identify()` merged the browser's anonymous id into the same person. Deleting
 * the person by that distinct id therefore removes the profile *and* every distinct
 * id merged into it, and `delete_events: true` queues deletion of every event
 * associated with it — including anonymous browsing from before sign-in on a
 * browser that was later identified.
 *
 * Not reached, because there is nothing to reach:
 * - cookieless events (`$posthog_cookieless`), which carry no identifier;
 * - personless server events, sent with a random distinct id and no person;
 * - anonymous activity on a browser that never signed in, which was never linked.
 *
 * ## The API, as PostHog implements it
 *
 * `POST /api/projects/{project_id}/persons/bulk_delete/` with
 * `{ distinct_ids: [...], delete_events: true }` (at most 1,000 ids), authorised by a
 * personal API key with the `person:write` scope. It answers 202: the person is
 * removed "shortly after", and event deletion is *queued* — PostHog runs it off-peak
 * (weekends on PostHog Cloud) and deletes only events captured before the request.
 * (posthog/api/person.py, `PersonViewSet.bulk_delete`.)
 *
 * ## Where it runs
 *
 * Server-side only. The personal key can delete data across the project, so it is
 * never `NEXT_PUBLIC_`, never logged, and never reaches a browser. Called by
 * account deletion (`@/lib/account/analytics-erasure`, after the response and from
 * the daily `/api/cron/analytics-erasure`) and by the operator tool
 * `scripts/analytics/erase-posthog-person.ts`.
 */

export const POSTHOG_PERSONAL_API_KEY_VAR = "POSTHOG_PERSONAL_API_KEY";
export const POSTHOG_PROJECT_ID_VAR = "POSTHOG_PROJECT_ID";

export type ErasureConfig = {
  /** The private API origin, e.g. `https://eu.posthog.com` — not the ingestion host. */
  readonly apiHost: string;
  readonly projectId: string;
  readonly personalApiKey: string;
};

export type ErasureOutcome =
  | { readonly kind: "queued"; readonly personsFound: number }
  | { readonly kind: "not_configured"; readonly missing: readonly string[] }
  | { readonly kind: "failed"; readonly status: number | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PostHog's private API host for an ingestion host. The ingestion hosts
 * (`us.i.posthog.com`, `eu.i.posthog.com`) accept events only.
 */
export function apiHostForIngestionHost(ingestionHost: string): string | null {
  try {
    const url = new URL(ingestionHost);
    const match = /^(us|eu)\.i\.posthog\.com$/.exec(url.hostname);
    return match ? `https://${match[1]}.posthog.com` : null;
  } catch {
    return null;
  }
}

/** The configuration from the environment, or the names (never values) of what is missing. */
export function erasureConfig(env: Record<string, string | undefined> = process.env): ErasureConfig | { missing: string[] } {
  const missing: string[] = [];
  const personalApiKey = env[POSTHOG_PERSONAL_API_KEY_VAR]?.trim() ?? "";
  const projectId = env[POSTHOG_PROJECT_ID_VAR]?.trim() ?? "";
  const apiHost = apiHostForIngestionHost(env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ?? "");
  if (!personalApiKey.startsWith("phx_")) missing.push(POSTHOG_PERSONAL_API_KEY_VAR);
  if (!/^\d+$/.test(projectId)) missing.push(POSTHOG_PROJECT_ID_VAR);
  if (!apiHost) missing.push("NEXT_PUBLIC_POSTHOG_HOST");
  if (missing.length > 0) return { missing };
  return { apiHost: apiHost!, projectId, personalApiKey };
}

/** The request `erasePostHogPerson` sends, separated so a dry run can print it. */
export function erasureRequest(config: ErasureConfig, accountId: string): { url: string; body: { distinct_ids: string[]; delete_events: true } } {
  return {
    url: `${config.apiHost}/api/projects/${config.projectId}/persons/bulk_delete/`,
    body: { distinct_ids: [accountId], delete_events: true },
  };
}

/**
 * Ask PostHog to delete one account's person and queue deletion of its events.
 * Never throws, and never includes the key or the response body in its result.
 */
export async function erasePostHogPerson(
  accountId: string,
  config: ErasureConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ErasureOutcome> {
  // Only ever an Urdais account id: refusing anything else is what keeps a typo
  // (or a pasted email) from deleting the wrong person.
  if (!UUID.test(accountId)) return { kind: "failed", status: null };
  const request = erasureRequest(config, accountId);
  try {
    const response = await fetchImpl(request.url, {
      method: "POST",
      headers: { authorization: `Bearer ${config.personalApiKey}`, "content-type": "application/json" },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 202 && response.status !== 200) return { kind: "failed", status: response.status };
    const summary = (await response.json().catch(() => ({}))) as { persons_found?: unknown };
    return { kind: "queued", personsFound: typeof summary.persons_found === "number" ? summary.persons_found : 0 };
  } catch {
    return { kind: "failed", status: null };
  }
}
