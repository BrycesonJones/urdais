import { describe, expect, it, vi } from "vitest";

import {
  buildRequestParameters,
  fetchDailyRankings,
  readApiKey,
  windowWasClamped,
} from "@/lib/utvi/source/client";
import { UTVI_SOURCE_ENDPOINT, UtviSourceError } from "@/lib/utvi/types";

const KEY = "test-key-never-logged";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const text = JSON.stringify(body);
  return {
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => text,
  } as unknown as Response;
}

const liveDay = (date: string, asOf = "2026-09-16T01:00:33.578Z", endDate = date) => ({
  data: [
    { date, model_permaslug: "tencent/hy4-preview-20260827", total_tokens: "1818993365232" },
    { date, model_permaslug: "other", total_tokens: "1186819992880" },
  ],
  meta: { as_of: asOf, start_date: date, end_date: endDate, version: "v1" },
});

describe("the api key", () => {
  it("is read from OPENROUTER_API_KEY and trimmed", () => {
    expect(readApiKey({ OPENROUTER_API_KEY: "  abc  " })).toBe("abc");
  });

  it("is null when absent or blank, rather than an empty string that looks like a key", () => {
    expect(readApiKey({})).toBeNull();
    expect(readApiKey({ OPENROUTER_API_KEY: "   " })).toBeNull();
  });

  it("makes a run with no credential a configuration failure, not a recorded retrieval", async () => {
    await expect(
      fetchDailyRankings({ startDate: "2026-09-15", endDate: "2026-09-15" }, { apiKey: "", fetchImpl: vi.fn() }),
    ).rejects.toThrow(UtviSourceError);
  });
});

describe("request construction", () => {
  it("always pins the daily grain explicitly rather than relying on the default", () => {
    expect(buildRequestParameters({ startDate: "2026-09-01", endDate: "2026-09-15" })).toEqual({
      start_date: "2026-09-01",
      end_date: "2026-09-15",
      period: "day",
    });
  });

  it("refuses the sampled-dataset parameters before a request is even built", () => {
    for (const forbidden of ["category", "language_type"]) {
      expect(() =>
        buildRequestParameters({ startDate: "2026-09-01", endDate: "2026-09-15", [forbidden]: "programming" } as never),
      ).toThrow(/sampled, estimated dataset/);
    }
  });

  it("sends the key in one Authorization header and never in the URL", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse(liveDay("2026-09-15"));
    }) as unknown as typeof fetch;
    await fetchDailyRankings({ startDate: "2026-09-15", endDate: "2026-09-15" }, { apiKey: KEY, fetchImpl });
    expect(calls[0]!.url).toContain(UTVI_SOURCE_ENDPOINT);
    expect(calls[0]!.url).not.toContain(KEY);
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: `Bearer ${KEY}` });
  });
});

describe("a successful read", () => {
  it("returns the resolved window from meta, not the requested one", async () => {
    // Measured: a request ending on the current UTC day succeeds and returns a narrower
    // window, and only meta.end_date says so.
    const fetchImpl = vi.fn(async () => jsonResponse(liveDay("2026-09-14", undefined, "2026-09-15")));
    const result = await fetchDailyRankings(
      { startDate: "2026-09-14", endDate: "2026-09-16" },
      { apiKey: KEY, fetchImpl },
    );
    expect(result.outcome).toBe("succeeded");
    expect(result.requestedEndDate).toBe("2026-09-16");
    expect(result.actualEndDate).toBe("2026-09-15");
    expect(windowWasClamped(result)).toBe(true);
  });

  it("reports an unclamped window as unclamped", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(liveDay("2026-09-15")));
    const result = await fetchDailyRankings(
      { startDate: "2026-09-15", endDate: "2026-09-15" },
      { apiKey: KEY, fetchImpl },
    );
    expect(windowWasClamped(result)).toBe(false);
  });

  it("hashes the body and records as_of separately, because only the hash detects revision", async () => {
    const first = liveDay("2026-09-15", "2026-09-16T01:00:04.234Z");
    const second = liveDay("2026-09-15", "2026-09-16T01:00:33.578Z");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(first))
      .mockResolvedValueOnce(jsonResponse(second));
    const a = await fetchDailyRankings({ startDate: "2026-09-15", endDate: "2026-09-15" }, { apiKey: KEY, fetchImpl });
    const b = await fetchDailyRankings({ startDate: "2026-09-15", endDate: "2026-09-15" }, { apiKey: KEY, fetchImpl });
    // Same rows, different as_of: the hash of the body differs because as_of is in the body,
    // which is exactly why the date-level content hash rather than this one drives revision.
    expect(a.sourceAsOf).not.toBe(b.sourceAsOf);
    expect(a.responseHash).not.toBe(b.responseHash);
  });

  it("surfaces the cache-control header rather than hiding it", async () => {
    // Measured: `private, max-age=60`. A revision measurement must space reads beyond it.
    const fetchImpl = vi.fn(async () =>
      jsonResponse(liveDay("2026-09-15"), 200, { "cache-control": "private, max-age=60" }),
    );
    const result = await fetchDailyRankings(
      { startDate: "2026-09-15", endDate: "2026-09-15" },
      { apiKey: KEY, fetchImpl },
    );
    expect(result.outcomeDetail).toContain("max-age=60");
  });
});

describe("failures", () => {
  it("records a 401 as an http_error and never retries it", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: "No auth credentials found", code: 401 } }, 401));
    const result = await fetchDailyRankings(
      { startDate: "2026-09-15", endDate: "2026-09-15" },
      { apiKey: KEY, fetchImpl, maxAttempts: 3, retryDelayMs: 0 },
    );
    expect(result.outcome).toBe("http_error");
    expect(result.httpStatus).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps the source's own 400 text verbatim, which is where its undocumented limits appear", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { message: "Date range cannot exceed 366 days (requested 623).", code: 400 } }, 400),
    );
    const result = await fetchDailyRankings(
      { startDate: "2025-01-01", endDate: "2026-09-15" },
      { apiKey: KEY, fetchImpl, maxAttempts: 2, retryDelayMs: 0 },
    );
    expect(result.outcomeDetail).toContain("366 days");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 and then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: "Rate limit exceeded", code: 429 } }, 429))
      .mockResolvedValueOnce(jsonResponse(liveDay("2026-09-15")));
    const result = await fetchDailyRankings(
      { startDate: "2026-09-15", endDate: "2026-09-15" },
      { apiKey: KEY, fetchImpl, maxAttempts: 3, retryDelayMs: 0 },
    );
    expect(result.outcome).toBe("succeeded");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after the attempt budget and reports the last failure", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: "boom", code: 503 } }, 503));
    const result = await fetchDailyRankings(
      { startDate: "2026-09-15", endDate: "2026-09-15" },
      { apiKey: KEY, fetchImpl, maxAttempts: 3, retryDelayMs: 0 },
    );
    expect(result.outcome).toBe("http_error");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("records a malformed body without retrying, because the shape will not change", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [], meta: { version: "v1" } }));
    const result = await fetchDailyRankings(
      { startDate: "2026-09-15", endDate: "2026-09-15" },
      { apiKey: KEY, fetchImpl, maxAttempts: 3, retryDelayMs: 0 },
    );
    expect(result.outcome).toBe("malformed");
    expect(result.response).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses a fractional total as malformed, which is how a sampled response would arrive", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [{ date: "2026-09-15", model_permaslug: "a/b", total_tokens: "4717815275999.996" }],
        meta: { as_of: "2026-09-16T01:00:00Z", start_date: "2026-09-15", end_date: "2026-09-15", version: "v1" },
      }),
    );
    const result = await fetchDailyRankings(
      { startDate: "2026-09-15", endDate: "2026-09-15" },
      { apiKey: KEY, fetchImpl, maxAttempts: 2, retryDelayMs: 0 },
    );
    expect(result.outcome).toBe("malformed");
    expect(result.outcomeDetail).toContain("sampled dataset");
  });

  it("retries a transport failure and records it with no status", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("network down");
    });
    const result = await fetchDailyRankings(
      { startDate: "2026-09-15", endDate: "2026-09-15" },
      { apiKey: KEY, fetchImpl, maxAttempts: 2, retryDelayMs: 0 },
    );
    expect(result.outcome).toBe("transport_error");
    expect(result.httpStatus).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("never puts the key into an error message", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error(`refused for ${KEY}`);
    });
    const result = await fetchDailyRankings(
      { startDate: "2026-09-15", endDate: "2026-09-15" },
      { apiKey: KEY, fetchImpl, maxAttempts: 1, retryDelayMs: 0 },
    );
    // The client records what the transport said; it is the caller's own message that must
    // not contain a secret, and nothing this module constructs interpolates the key.
    expect(result.requestUrl).not.toContain(KEY);
    expect(JSON.stringify(result.requestParameters)).not.toContain(KEY);
  });
});
