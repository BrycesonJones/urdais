/**
 * The OpenRouter dataset client. Narrow on purpose.
 *
 * It reads one documented endpoint with one grain and no other. That is a rights constraint
 * as much as a design one: the licence covers the data these endpoints return, while
 * OpenRouter's terms prohibit scraping the site, so the HTML rankings page and every
 * third-party mirror are out of bounds. There is no URL parameter and no host override —
 * nothing a caller can pass makes this fetch somewhere else.
 *
 * Four behaviours come straight from Phase 1A's measurements:
 *
 *   `category` and `language_type` are refused before the request is built, because they
 *   read a sampled dataset whose token totals arrive as genuine fractions;
 *
 *   `meta.end_date` is treated as authoritative, because the endpoint clamps a requested end
 *   date down to the last completed UTC day and says so only there;
 *
 *   a 401 or 403 is never retried, because no amount of retrying fixes a credential;
 *
 *   responses carry `cache-control: max-age=60`, so a caller wanting to observe a revision
 *   must space its reads beyond that. The client exposes the header rather than hiding it.
 *
 * The API key is read from the environment, sent in one header, and never logged, returned or
 * put in an error message.
 */

import { assertDailyContract, hashResponseBody } from "@/lib/utvi/normalize";
import {
  UTVI_SOURCE_ENDPOINT,
  UtviSourceError,
  type RetrievalResult,
  type SourceResponse,
} from "@/lib/utvi/types";

export const UTVI_API_KEY_ENV = "OPENROUTER_API_KEY" as const;

/** Parameters the client will send. Deliberately not the source's full set. */
export type DatasetRequest = {
  startDate: string;
  endDate: string;
};

export type DatasetClientOptions = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Retries for transient failures only. Never for an auth or contract failure. */
  maxAttempts?: number;
  retryDelayMs?: number;
  now?: () => Date;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1_500;

/** Statuses worth a second try. A 429 is transient; a 401 is a fact about the key. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/** Parameters that would substitute an estimate for an observation. */
const FORBIDDEN_PARAMETERS = ["category", "language_type"] as const;

export function readApiKey(env: Record<string, string | undefined> = process.env): string | null {
  const key = env[UTVI_API_KEY_ENV]?.trim();
  return key ? key : null;
}

/**
 * Build the query for one daily read.
 *
 * `period=day` is always explicit rather than relying on the default, so the stored
 * `request_parameters` record what was asked for and the database's own refusal of
 * non-daily grains has something to check.
 */
export function buildRequestParameters(request: DatasetRequest): Record<string, string> {
  for (const forbidden of FORBIDDEN_PARAMETERS) {
    if (forbidden in request) {
      throw new UtviSourceError("malformed", `${forbidden} reads a sampled, estimated dataset and is never requested`);
    }
  }
  return { start_date: request.startDate, end_date: request.endDate, period: "day" };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Read one window of the dataset.
 *
 * Returns a `RetrievalResult` for every outcome rather than throwing on failure, because a
 * failed retrieval is a fact the pipeline records — it is the difference between "we looked
 * and the source was down" and "nobody looked", and only the first of those can be
 * distinguished later if it was written down.
 *
 * The one thing it does throw for is a missing key: a run with no credential has not failed
 * to retrieve anything, it has failed to be configured, and recording that as a retrieval
 * would put a fictional attempt in the ledger.
 */
export async function fetchDailyRankings(
  request: DatasetRequest,
  options: DatasetClientOptions = {},
): Promise<RetrievalResult> {
  const apiKey = options.apiKey?.trim() || readApiKey();
  if (!apiKey) {
    throw new UtviSourceError("transport_error", `${UTVI_API_KEY_ENV} is not configured`);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const now = options.now ?? (() => new Date());

  const parameters = buildRequestParameters(request);
  const url = new URL(UTVI_SOURCE_ENDPOINT);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  const requestUrl = url.toString();

  const base = {
    requestedStartDate: request.startDate,
    requestedEndDate: request.endDate,
    requestUrl,
    requestParameters: parameters,
  } as const;

  let lastFailure: RetrievalResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let status: number | null = null;
    let body: string | null = null;
    let cacheControl: string | null = null;

    try {
      const response = await fetchImpl(requestUrl, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: controller.signal,
      });
      status = response.status;
      cacheControl = response.headers?.get?.("cache-control") ?? null;
      body = await response.text();
    } catch (error) {
      // A transport failure carries no status, so its message is the only evidence. The key
      // is never part of it: it is not in the URL and not in any message this code builds.
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      lastFailure = {
        ...base,
        outcome: "transport_error",
        outcomeDetail: detail,
        httpStatus: null,
        responseHash: null,
        responseByteLength: null,
        actualStartDate: null,
        actualEndDate: null,
        sourceAsOf: null,
        datasetVersion: null,
        rowCount: null,
        retrievedAt: now().toISOString(),
        response: null,
      };
      if (attempt < maxAttempts) {
        await sleep(retryDelayMs * attempt);
        continue;
      }
      return lastFailure;
    } finally {
      clearTimeout(timer);
    }

    const retrievedAt = now().toISOString();
    const responseHash = hashResponseBody(body);
    const responseByteLength = Buffer.byteLength(body, "utf8");

    if (status >= 400) {
      const failure: RetrievalResult = {
        ...base,
        outcome: "http_error",
        // The source's own error text, which is where the undocumented limits announce
        // themselves. Worth keeping verbatim.
        outcomeDetail: `HTTP ${status}: ${summarizeErrorBody(body)}`,
        httpStatus: status,
        responseHash,
        responseByteLength,
        actualStartDate: null,
        actualEndDate: null,
        sourceAsOf: null,
        datasetVersion: null,
        rowCount: null,
        retrievedAt,
        response: null,
      };
      // An authentication or authorization failure is never retried: it is a statement about
      // the credential, and repeating the request only spends rate limit to hear it again.
      if (RETRYABLE_STATUSES.has(status) && attempt < maxAttempts) {
        lastFailure = failure;
        await sleep(retryDelayMs * attempt);
        continue;
      }
      return failure;
    }

    let parsed: SourceResponse;
    try {
      parsed = assertDailyContract(JSON.parse(body) as unknown);
    } catch (error) {
      // A contract violation is never retried. The same request would return the same shape.
      return {
        ...base,
        outcome: "malformed",
        outcomeDetail: error instanceof Error ? error.message : String(error),
        httpStatus: status,
        responseHash,
        responseByteLength,
        actualStartDate: null,
        actualEndDate: null,
        sourceAsOf: null,
        datasetVersion: null,
        rowCount: null,
        retrievedAt,
        response: null,
      };
    }

    return {
      ...base,
      outcome: "succeeded",
      outcomeDetail: cacheControl === null ? null : `cache-control: ${cacheControl}`,
      httpStatus: status,
      responseHash,
      responseByteLength,
      // From meta, and authoritative: a request ending on the current UTC day succeeds while
      // quietly returning a narrower window, and only this says so.
      actualStartDate: parsed.meta.start_date,
      actualEndDate: parsed.meta.end_date,
      sourceAsOf: parsed.meta.as_of,
      datasetVersion: parsed.meta.version,
      rowCount: parsed.data.length,
      retrievedAt,
      response: parsed,
    };
  }

  // Unreachable while maxAttempts >= 1; kept so the function is total rather than relying on
  // the loop's shape.
  return (
    lastFailure ?? {
      ...base,
      outcome: "transport_error",
      outcomeDetail: "no attempt was made",
      httpStatus: null,
      responseHash: null,
      responseByteLength: null,
      actualStartDate: null,
      actualEndDate: null,
      sourceAsOf: null,
      datasetVersion: null,
      rowCount: null,
      retrievedAt: now().toISOString(),
      response: null,
    }
  );
}

/** The source's error message, where it sent one. Truncated, never interpreted. */
function summarizeErrorBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    const message = parsed.error?.message;
    if (typeof message === "string" && message.trim()) return message.trim().slice(0, 300);
  } catch {
    // Not JSON. Fall through to the raw prefix.
  }
  return body.trim().slice(0, 300);
}

/**
 * Whether a retrieval's resolved window was narrower than requested.
 *
 * Not an error: it is the documented clamp, and a caller that asked for "through today" gets
 * "through yesterday" and should know which dates it actually holds.
 */
export function windowWasClamped(result: RetrievalResult): boolean {
  if (result.actualEndDate === null || result.actualStartDate === null) return false;
  return result.actualEndDate !== result.requestedEndDate || result.actualStartDate !== result.requestedStartDate;
}
