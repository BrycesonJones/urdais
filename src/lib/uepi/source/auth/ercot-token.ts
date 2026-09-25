/**
 * ERCOT's public-API token flow: acquire once, hold in memory, reuse until it is nearly expired.
 *
 * ERCOT issues an id token that lives about an hour, and a backfill of thirteen months is hundreds
 * of requests. Asking for a token per request would be both rude and slow, and writing one to disk
 * would turn an hour-long secret into a permanent one. So the token lives in a module-scoped cache,
 * is reused while it has real life left, and is re-acquired exactly twice: when it expires, and
 * when the API says it is no longer accepted.
 *
 * Nothing here returns a token to a caller in a form that invites logging: the cache hands back an
 * `Authorization` header, already assembled, and every error path runs its message through
 * redaction first.
 */

import {
  UepiCredentialError, readErcotCredentials, redactSecrets,
  type EnvLike, type ErcotCredentials,
} from "@/lib/uepi/source/auth/credentials";

export const ERCOT_TOKEN_ENDPOINT =
  "https://ercotb2c.b2clogin.com/ercotb2c.onmicrosoft.com/B2C_1_PUBAPI-ROPC-FLOW/oauth2/v2.0/token";

/** ERCOT's own public client id for the ROPC flow. Not a secret; it is in ERCOT's documentation. */
export const ERCOT_CLIENT_ID = "fec253ea-0d06-4272-a5e6-b478baeecd70";

/**
 * Re-acquire this long before expiry rather than at it.
 *
 * A token that expires mid-request fails the request, and the retry costs more than the minute of
 * life given up here.
 */
const RENEW_BEFORE_MS = 5 * 60_000;

type CachedToken = { token: string; expiresAtMs: number };

export type TokenFetcher = (url: string, init: {
  method: string; body: string; headers: Record<string, string>; signal: AbortSignal;
}) => Promise<Response>;

export type ErcotTokenOptions = {
  env?: EnvLike;
  fetcher?: TokenFetcher;
  now?: () => number;
  timeoutMs?: number;
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One process-wide token holder.
 *
 * A class rather than a bare module variable so a test can hold its own, and so a caller can
 * invalidate the cached token without reaching into module state.
 */
export class ErcotTokenCache {
  private cached: CachedToken | null = null;
  /** Counts acquisitions. Read by tests to prove reuse; carries nothing secret. */
  private acquisitions = 0;

  constructor(private readonly options: ErcotTokenOptions = {}) {}

  get acquisitionCount(): number {
    return this.acquisitions;
  }

  /** Discard the cached token. Called when the API rejects it before its stated expiry. */
  invalidate(): void {
    this.cached = null;
  }

  private credentials(): ErcotCredentials {
    return readErcotCredentials(this.options.env ?? process.env);
  }

  /** The headers an authenticated ERCOT request needs, with a live token. */
  async authorizationHeaders(): Promise<Record<string, string>> {
    const { subscriptionKey } = this.credentials();
    const token = await this.token();
    return {
      authorization: `Bearer ${token}`,
      "ocp-apim-subscription-key": subscriptionKey,
    };
  }

  private async token(): Promise<string> {
    const now = (this.options.now ?? Date.now)();
    if (this.cached !== null && this.cached.expiresAtMs - RENEW_BEFORE_MS > now) {
      return this.cached.token;
    }
    const acquired = await this.acquire();
    this.cached = acquired;
    return acquired.token;
  }

  private async acquire(): Promise<CachedToken> {
    const credentials = this.credentials();
    const secrets = [credentials.username, credentials.password, credentials.subscriptionKey];
    const fetcher = this.options.fetcher ?? ((url, init) => fetch(url, init as RequestInit));
    const timeoutMs = this.options.timeoutMs ?? 30_000;
    const attempts = this.options.attempts ?? 3;
    const sleep = this.options.sleep ?? defaultSleep;
    const now = this.options.now ?? Date.now;

    // The body carries the username and password. It is assembled here, used once, and never
    // returned, stored or logged -- not even in a failure path.
    const body = new URLSearchParams({
      username: credentials.username,
      password: credentials.password,
      grant_type: "password",
      scope: `openid ${ERCOT_CLIENT_ID} offline_access`,
      client_id: ERCOT_CLIENT_ID,
      response_type: "id_token",
    }).toString();

    let lastStatus: number | null = null;
    let lastDetail = "no attempt was made";
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(ERCOT_TOKEN_ENDPOINT, {
          method: "POST",
          body,
          headers: { "content-type": "application/x-www-form-urlencoded" },
          signal: controller.signal,
        });
        lastStatus = response.status;
        const text = await response.text();
        if (!response.ok) {
          // A rejected credential will not succeed on a retry; a 429 or a 5xx might.
          const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
          lastDetail = `the token endpoint returned HTTP ${response.status}`;
          if (!retryable) {
            throw new UepiCredentialError("ercot", response.status,
              `authentication failed: ${redactSecrets(lastDetail, secrets)}`);
          }
        } else {
          const payload = JSON.parse(text) as { id_token?: string; expires_in?: number };
          if (typeof payload.id_token !== "string" || payload.id_token === "") {
            throw new UepiCredentialError("ercot", response.status,
              "the token endpoint returned no id_token");
          }
          this.acquisitions += 1;
          const lifetimeSeconds = typeof payload.expires_in === "number" ? payload.expires_in : 3_600;
          return { token: payload.id_token, expiresAtMs: now() + lifetimeSeconds * 1_000 };
        }
      } catch (error) {
        if (error instanceof UepiCredentialError) throw error;
        const aborted = error instanceof Error && error.name === "AbortError";
        lastDetail = aborted
          ? `the token endpoint timed out after ${timeoutMs}ms`
          : "the token endpoint could not be reached";
      } finally {
        clearTimeout(timer);
      }
      if (attempt < attempts) await sleep(1_000 * 2 ** (attempt - 1));
    }
    throw new UepiCredentialError("ercot", lastStatus,
      `authentication failed: ${redactSecrets(lastDetail, secrets)}`);
  }
}

/** The process-wide cache the adapter uses. Tests construct their own. */
export const ercotTokenCache = new ErcotTokenCache();
