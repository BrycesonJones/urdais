/**
 * The HTTP behaviour UMPI uses against two government APIs.
 *
 * Restraint is the design goal. These are public statistical services with no commercial SLA,
 * and a collector that hammers them on failure is both rude and counterproductive. So: a small
 * fixed number of attempts, exponential backoff, retries only for failures that could plausibly
 * succeed on a second try, and no retry at all for a rejected key or a malformed request.
 *
 * Credentials never leave this module in a readable form. `redactUrl` is applied before any
 * value is logged, stored in a retrieval record, or put in an error message.
 */

import { UmpiTransportError } from "./errors";

/** Query parameters whose values are secret and must never be persisted or logged. */
const SECRET_PARAMS = new Set(["servicekey", "authkey", "apikey", "api_key", "key"]);

/**
 * A URL safe to store. Secret-bearing parameters keep their names — the shape of the request is
 * operationally useful — and lose their values entirely.
 */
export function redactUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "[unparseable url]";
  }
  for (const name of [...parsed.searchParams.keys()]) {
    if (SECRET_PARAMS.has(name.toLowerCase())) parsed.searchParams.set(name, "REDACTED");
  }
  return parsed.toString();
}

/**
 * ECOS puts the key in a path segment rather than a query parameter, so a path-aware redaction
 * is needed as well. The key is always the segment immediately after `/api/{Service}`.
 */
export function redactEcosUrl(url: string, key: string): string {
  if (key.length === 0) return url;
  return url.split(encodeURIComponent(key)).join("REDACTED").split(key).join("REDACTED");
}

export type HttpResponse = {
  status: number;
  contentType: string | null;
  body: string;
  byteLength: number;
  /**
   * Cookies the server set, in `name=value` form, ready to send back.
   *
   * Carried because one official source needs them: the Korea Customs portal answers its own
   * query only within the public session its index page establishes. That session is not a
   * credential and identifies nobody — it is the same state a browser holds after loading a
   * public page — but the request fails without it.
   */
  cookies: string[];
};

export type HttpRequestInit = {
  signal: AbortSignal;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
};

export type HttpFetcher = (url: string, init: HttpRequestInit) => Promise<Response>;

export type HttpOptions = {
  timeoutMs?: number;
  attempts?: number;
  /** Injected in tests; defaults to global fetch. */
  fetcher?: HttpFetcher;
  /** Injected in tests so backoff does not actually sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Applied to the URL before it appears in any error message. */
  redact?: (url: string) => string;
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  /** Cookies from a previous response, sent back as a session. */
  cookies?: readonly string[];
};

/** `name=value` from a Set-Cookie line, dropping attributes. */
function cookiePairs(response: Response): string[] {
  const raw =
    typeof (response.headers as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (response.headers as { getSetCookie: () => string[] }).getSetCookie()
      : response.headers.get("set-cookie")
        ? [response.headers.get("set-cookie") as string]
        : [];
  return raw.map((line) => line.split(";", 1)[0]!.trim()).filter((pair) => pair.includes("="));
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 408, 429 and 5xx may succeed on a retry. Everything else is the caller's fault or the key's. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export async function fetchText(url: string, options: HttpOptions = {}): Promise<HttpResponse> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const attempts = options.attempts ?? 3;
  const fetcher = options.fetcher ?? ((target, init) => fetch(target, init as RequestInit));
  const sleep = options.sleep ?? defaultSleep;
  const redact = options.redact ?? redactUrl;
  const safeUrl = redact(url);

  let lastError: UmpiTransportError | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { ...(options.headers ?? {}) };
      if (options.cookies && options.cookies.length > 0) headers.cookie = options.cookies.join("; ");
      const response = await fetcher(url, {
        signal: controller.signal,
        method: options.method ?? "GET",
        ...(options.body === undefined ? {} : { body: options.body }),
        ...(Object.keys(headers).length === 0 ? {} : { headers }),
      });
      const body = await response.text();
      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        lastError = new UmpiTransportError(
          `${safeUrl} returned HTTP ${response.status}`,
          response.status,
          retryable,
        );
        if (!retryable) throw lastError;
      } else {
        return {
          status: response.status,
          contentType: response.headers.get("content-type"),
          body,
          byteLength: Buffer.byteLength(body, "utf8"),
          cookies: cookiePairs(response),
        };
      }
    } catch (error) {
      if (error instanceof UmpiTransportError) {
        if (!error.retryable) throw error;
        lastError = error;
      } else {
        const aborted = error instanceof Error && error.name === "AbortError";
        lastError = new UmpiTransportError(
          aborted ? `${safeUrl} timed out after ${timeoutMs}ms` : `${safeUrl} could not be reached`,
          null,
          true,
          { cause: error },
        );
      }
    } finally {
      clearTimeout(timer);
    }
    // Backoff, but only between attempts: no sleep after the last one.
    if (attempt < attempts) await sleep(500 * 2 ** (attempt - 1));
  }
  throw lastError ?? new UmpiTransportError(`${safeUrl} failed`, null, true);
}
