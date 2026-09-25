/**
 * Bounded, polite retrieval of a source artifact.
 *
 * These are public market-operator services with no commercial SLA, and several of them say so in
 * their own documentation: CAISO answers a repeated query with HTTP 429, ERCOT caps requests at
 * thirty a minute. So the behaviour here is restraint by construction -- a small fixed number of
 * attempts, exponential backoff, retries only for statuses that could plausibly succeed on a
 * second try, one request at a time, and an explicit timeout on every call.
 *
 * Bytes rather than text, because two of the four implemented sources ship a ZIP.
 */

import { artifactDigest } from "@/lib/uepi/source/artifact";
import { UepiSourceError, type ArtifactRequest, type RetrievedArtifact } from "@/lib/uepi/source/types";

/** Identifies Urdais to the publisher. A market operator should be able to see who is calling. */
export const UEPI_USER_AGENT = "Urdais/1.0 (market data research; +https://urdais.com)";

export type RetrieveOptions = {
  timeoutMs?: number;
  attempts?: number;
  /** Injected in tests; defaults to global fetch. */
  fetcher?: (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;
  /** Injected in tests so backoff does not actually wait. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 408, 429 and 5xx may succeed on a retry. A 401 or a 404 will not. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

/**
 * Fetch one artifact.
 *
 * Returns null only for an optional artifact that answered 404, which is an ordinary outcome:
 * NYISO serves recent days at a daily URL and older ones only inside a monthly archive, so a 404
 * on the daily path is information rather than an error.
 */
export async function retrieveArtifact(
  seriesId: string, request: ArtifactRequest, options: RetrieveOptions = {},
): Promise<RetrievedArtifact | null> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const attempts = options.attempts ?? 3;
  const fetcher = options.fetcher ?? ((url, init) => fetch(url, init as RequestInit));
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? (() => new Date());

  let lastDetail = "no attempt was made";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(request.url, {
        signal: controller.signal,
        headers: { "user-agent": UEPI_USER_AGENT, accept: "*/*" },
      });
      if (response.status === 404 && request.optional === true) return null;
      if (response.status === 401 || response.status === 403) {
        throw new UepiSourceError(seriesId, "AUTHENTICATION_REQUIRED",
          `${request.url} returned HTTP ${response.status}; this source needs a credential Urdais does not hold`);
      }
      if (!response.ok) {
        lastDetail = `${request.url} returned HTTP ${response.status}`;
        if (!isRetryableStatus(response.status)) {
          throw new UepiSourceError(seriesId, "SOURCE_UNAVAILABLE", lastDetail);
        }
      } else {
        const body = Buffer.from(await response.arrayBuffer());
        if (body.byteLength === 0) {
          throw new UepiSourceError(seriesId, "EMPTY_SOURCE", `${request.url} returned no bytes`);
        }
        return {
          label: request.label,
          url: request.url,
          retrievedAt: now().toISOString(),
          status: response.status,
          contentType: response.headers.get("content-type"),
          byteLength: body.byteLength,
          sha256: artifactDigest(body),
          body,
        };
      }
    } catch (error) {
      if (error instanceof UepiSourceError) throw error;
      const aborted = error instanceof Error && error.name === "AbortError";
      lastDetail = aborted
        ? `${request.url} timed out after ${timeoutMs}ms`
        : `${request.url} could not be reached`;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < attempts) await sleep(1_000 * 2 ** (attempt - 1));
  }
  throw new UepiSourceError(seriesId, "SOURCE_UNAVAILABLE", lastDetail);
}

/** Fetch every artifact one operating day needs, sequentially. No concurrency, by design. */
export async function retrieveArtifacts(
  seriesId: string, requests: readonly ArtifactRequest[], options: RetrieveOptions = {},
): Promise<Map<string, RetrievedArtifact>> {
  const artifacts = new Map<string, RetrievedArtifact>();
  for (const request of requests) {
    const artifact = await retrieveArtifact(seriesId, request, options);
    if (artifact !== null) artifacts.set(request.label, artifact);
  }
  return artifacts;
}
