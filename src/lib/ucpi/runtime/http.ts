/**
 * Production HTTP policy for provider retrievals.
 *
 * Conservative defaults, all configurable: a per-request timeout, a bounded
 * number of attempts with exponential backoff and jitter, retry only on
 * transient statuses, honour Retry-After on 429 and 503, never retry an
 * authentication failure, and never retry past the deadline the caller
 * supplies, which is at most the calculation window's cutoff. The client is an
 * interface so tests mock it and nothing here touches the network unless the
 * default client is explicitly chosen.
 */

import type { RequestSpec } from "@/lib/ucpi/domain";
import type { Credential } from "@/lib/ucpi/runtime/config";
import type { EventSink } from "@/lib/ucpi/runtime/events";

export type HttpResponse = {
  status: number;
  headers: Readonly<Record<string, string>>;
  bodyText: string;
  contentType: string | null;
};

export interface HttpClient {
  /** Performs one request. Must reject with HttpTimeoutError when `timeoutMs` elapses. */
  send(input: { method: "GET" | "POST"; url: string; headers: Readonly<Record<string, string>>; timeoutMs: number }): Promise<HttpResponse>;
}

export type HttpPolicy = {
  requestTimeoutMs: number;
  maxAttempts: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  backoffMultiplier: number;
  /** Fraction of the backoff added as jitter, from a caller-supplied random source. */
  jitterFraction: number;
  retryableStatuses: readonly number[];
  /** A Retry-After larger than this is treated as "not before the deadline" and stops retrying. */
  maxRetryAfterMs: number;
};

export const DEFAULT_HTTP_POLICY: HttpPolicy = {
  requestTimeoutMs: 20_000,
  maxAttempts: 4,
  initialBackoffMs: 2_000,
  maxBackoffMs: 60_000,
  backoffMultiplier: 2,
  jitterFraction: 0.2,
  retryableStatuses: [408, 425, 429, 500, 502, 503, 504],
  maxRetryAfterMs: 15 * 60_000,
};

export class HttpTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`request to ${url} exceeded ${timeoutMs} ms`);
    this.name = "HttpTimeoutError";
  }
}

export class HttpAuthError extends Error {
  readonly status: number;
  constructor(status: number, url: string) {
    super(`authentication failed (${status}) for ${url}; not retried`);
    this.name = "HttpAuthError";
    this.status = status;
  }
}

export class HttpRetryExhaustedError extends Error {
  readonly attempts: number;
  readonly lastStatus: number | null;
  constructor(attempts: number, lastStatus: number | null, reason: string) {
    super(`gave up after ${attempts} attempt(s): ${reason}`);
    this.name = "HttpRetryExhaustedError";
    this.attempts = attempts;
    this.lastStatus = lastStatus;
  }
}

export class HttpDeadlineError extends Error {
  constructor(deadline: string, reason: string) {
    super(`cannot retry past the deadline ${deadline}: ${reason}`);
    this.name = "HttpDeadlineError";
  }
}

export class HttpStatusError extends Error {
  readonly status: number;
  constructor(status: number, url: string) {
    super(`unexpected status ${status} from ${url}`);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

export class MalformedResponseError extends Error {
  constructor(detail: string) {
    super(`response body is not valid JSON: ${detail}`);
    this.name = "MalformedResponseError";
  }
}

export class SchemaDriftError extends Error {
  readonly path: string;
  constructor(path: string, detail: string) {
    super(`response does not match the documented schema at ${path}: ${detail}`);
    this.name = "SchemaDriftError";
    this.path = path;
  }
}

export type Clock = () => Date;
export type Sleep = (ms: number) => Promise<void>;
export type Random = () => number;

/** Parses Retry-After as delay seconds or an HTTP date; null when absent or unparseable. */
export function parseRetryAfterMs(value: string | undefined, now: Date): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at - now.getTime());
}

export function backoffMs(attempt: number, policy: HttpPolicy, random: Random): number {
  const base = Math.min(policy.maxBackoffMs, policy.initialBackoffMs * Math.pow(policy.backoffMultiplier, attempt - 1));
  return Math.round(base * (1 + policy.jitterFraction * random()));
}

export type ExecuteInput = {
  request: RequestSpec;
  credential: Credential | null;
  client: HttpClient;
  policy?: Partial<HttpPolicy>;
  /** Retries never continue at or after this instant. The caller passes the calculation cutoff or an earlier bound. */
  deadline: Date;
  clock: Clock;
  sleep: Sleep;
  random?: Random;
  events: EventSink;
  source: string;
};

export type ExecuteOutput = {
  response: HttpResponse;
  attempts: number;
  requestedAt: Date;
  completedAt: Date;
};

function urlWithParameters(request: RequestSpec): string {
  const keys = Object.keys(request.parameters);
  if (keys.length === 0) return request.url;
  const qs = keys
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(request.parameters[k]!)}`)
    .join("&");
  return `${request.url}?${qs}`;
}

/** Executes a request under the policy. Auth failures and non-retryable statuses surface immediately. */
export async function executeWithPolicy(input: ExecuteInput): Promise<ExecuteOutput> {
  const policy: HttpPolicy = { ...DEFAULT_HTTP_POLICY, ...input.policy };
  const random = input.random ?? Math.random;
  const url = urlWithParameters(input.request);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (input.request.requiredHeaders.includes("Authorization")) {
    if (input.credential === null) throw new Error(`request to ${input.source} requires Authorization but no credential was supplied`);
    headers.Authorization = input.credential.authorizationHeader();
  }
  const requestedAt = input.clock();
  let lastStatus: number | null = null;
  let lastReason = "";

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    const started = input.clock();
    if (started.getTime() >= input.deadline.getTime()) throw new HttpDeadlineError(input.deadline.toISOString(), lastReason || "window closed before the first attempt");
    input.events.emit({ type: "provider_request_started", source: input.source, attempt, url: input.request.url });
    let response: HttpResponse;
    try {
      response = await input.client.send({ method: input.request.method, url, headers, timeoutMs: policy.requestTimeoutMs });
    } catch (error) {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      lastReason = reason;
      lastStatus = null;
      const willRetry = attempt < policy.maxAttempts;
      input.events.emit({ type: "provider_request_failed", source: input.source, attempt, status: null, reason, willRetry });
      if (!willRetry) throw new HttpRetryExhaustedError(attempt, null, reason);
      await waitBeforeRetry(backoffMs(attempt, policy, random), input, lastReason);
      continue;
    }
    const completedAt = input.clock();
    if (response.status >= 200 && response.status < 300) {
      input.events.emit({
        type: "provider_request_succeeded",
        source: input.source,
        attempt,
        status: response.status,
        bytes: response.bodyText.length,
        durationMs: completedAt.getTime() - started.getTime(),
      });
      return { response, attempts: attempt, requestedAt, completedAt };
    }
    lastStatus = response.status;
    lastReason = `status ${response.status}`;
    if (response.status === 401 || response.status === 403) {
      input.events.emit({ type: "provider_request_failed", source: input.source, attempt, status: response.status, reason: lastReason, willRetry: false });
      throw new HttpAuthError(response.status, input.request.url);
    }
    const retryable = policy.retryableStatuses.includes(response.status);
    const willRetry = retryable && attempt < policy.maxAttempts;
    input.events.emit({ type: "provider_request_failed", source: input.source, attempt, status: response.status, reason: lastReason, willRetry });
    if (!retryable) throw new HttpStatusError(response.status, input.request.url);
    if (!willRetry) throw new HttpRetryExhaustedError(attempt, response.status, lastReason);

    let delay = backoffMs(attempt, policy, random);
    if (response.status === 429 || response.status === 503) {
      const retryAfter = parseRetryAfterMs(response.headers["retry-after"] ?? response.headers["Retry-After"], completedAt);
      input.events.emit({ type: "rate_limited", source: input.source, attempt, retryAfterMs: retryAfter });
      if (retryAfter !== null) {
        if (retryAfter > policy.maxRetryAfterMs) throw new HttpDeadlineError(input.deadline.toISOString(), `Retry-After of ${retryAfter} ms exceeds the policy maximum`);
        delay = Math.max(delay, retryAfter);
      }
    }
    await waitBeforeRetry(delay, input, lastReason);
  }
  throw new HttpRetryExhaustedError(policy.maxAttempts, lastStatus, lastReason);
}

async function waitBeforeRetry(delayMs: number, input: ExecuteInput, reason: string): Promise<void> {
  const resumeAt = input.clock().getTime() + delayMs;
  if (resumeAt >= input.deadline.getTime()) throw new HttpDeadlineError(input.deadline.toISOString(), `${reason}; next attempt would fall after the deadline`);
  await input.sleep(delayMs);
}

export function parseJsonBody(response: HttpResponse): unknown {
  try {
    return JSON.parse(response.bodyText) as unknown;
  } catch (error) {
    throw new MalformedResponseError(error instanceof Error ? error.message : String(error));
  }
}

/** The default client, using the platform fetch with an abort-based timeout. Only chosen explicitly by a runtime entry point. */
export const fetchHttpClient: HttpClient = {
  async send(input) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const res = await fetch(input.url, { method: input.method, headers: input.headers, signal: controller.signal });
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
      return { status: res.status, headers, bodyText: await res.text(), contentType: res.headers.get("content-type") };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new HttpTimeoutError(input.url, input.timeoutMs);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  },
};
