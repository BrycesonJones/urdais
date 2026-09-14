import { describe, expect, it } from "vitest";

import { CollectingSink } from "@/lib/ucpi/runtime/events";
import { Credential } from "@/lib/ucpi/runtime/config";
import { executeWithPolicy, HttpAuthError, HttpDeadlineError, HttpRetryExhaustedError, HttpStatusError, MalformedResponseError, parseJsonBody, parseRetryAfterMs, SchemaDriftError } from "@/lib/ucpi/runtime/http";
import { validateLambdaInstanceTypes, validateRunpodCatalog } from "@/lib/ucpi/runtime/schema-validation";
import { jsonResponse, scriptedClient, TestClock } from "@/lib/ucpi/runtime/test-support";

const request = { method: "GET" as const, url: "https://example.invalid/v2/catalog/gpus", parameters: { cloud: "SECURE", countryCodes: "US" }, requiredHeaders: ["Authorization"] };
const credential = new Credential("runpod", "not-a-real-key");

function harness(script: Parameters<typeof scriptedClient>[0], startIso = "2026-09-13T10:00:00Z", deadlineIso = "2026-09-14T00:00:00Z") {
  const clock = new TestClock(startIso);
  const slept: number[] = [];
  const events = new CollectingSink();
  const client = scriptedClient(script);
  const run = () =>
    executeWithPolicy({
      request,
      credential,
      client,
      deadline: new Date(deadlineIso),
      clock: clock.now,
      sleep: async (ms) => {
        slept.push(ms);
        clock.advance(ms);
      },
      random: () => 0,
      events,
      source: "runpod-gpu-types",
    });
  return { run, slept, events, client, clock };
}

describe("HTTP policy", () => {
  it("sends the credential only as the Authorization header and sorts query parameters deterministically", async () => {
    const h = harness([jsonResponse({ gpus: [] })]);
    const out = await h.run();
    expect(out.attempts).toBe(1);
    expect(h.client.calls[0]!.url).toBe("https://example.invalid/v2/catalog/gpus?cloud=SECURE&countryCodes=US");
    expect(h.client.calls[0]!.headers.Authorization).toBe("Bearer not-a-real-key");
    expect(JSON.stringify(h.events.events)).not.toContain("not-a-real-key");
  });

  it("retries a 500 with backoff and succeeds", async () => {
    const h = harness([jsonResponse({}, 500), jsonResponse({ gpus: [] })]);
    const out = await h.run();
    expect(out.attempts).toBe(2);
    expect(h.slept).toEqual([2000]);
    expect(h.events.ofType("provider_request_failed")[0]).toMatchObject({ status: 500, willRetry: true });
  });

  it("never retries 401 or 403", async () => {
    await expect(harness([jsonResponse({}, 401)]).run()).rejects.toBeInstanceOf(HttpAuthError);
    const h = harness([jsonResponse({}, 403)]);
    await expect(h.run()).rejects.toBeInstanceOf(HttpAuthError);
    expect(h.client.calls).toHaveLength(1);
  });

  it("honours Retry-After on 429 and records the rate limit", async () => {
    const h = harness([jsonResponse({}, 429, { "retry-after": "7" }), jsonResponse({ gpus: [] })]);
    await h.run();
    expect(h.slept).toEqual([7000]);
    expect(h.events.ofType("rate_limited")[0]).toMatchObject({ retryAfterMs: 7000 });
  });

  it("stops rather than waiting when Retry-After exceeds the policy maximum", async () => {
    const h = harness([jsonResponse({}, 429, { "retry-after": String(60 * 60) })]);
    await expect(h.run()).rejects.toBeInstanceOf(HttpDeadlineError);
  });

  it("does not retry a 4xx that is not transient", async () => {
    await expect(harness([jsonResponse({}, 404)]).run()).rejects.toBeInstanceOf(HttpStatusError);
  });

  it("retries timeouts up to the attempt limit and then gives up", async () => {
    const h = harness(["timeout", "timeout", "timeout", "timeout"]);
    await expect(h.run()).rejects.toBeInstanceOf(HttpRetryExhaustedError);
    expect(h.client.calls).toHaveLength(4);
    expect(h.slept).toEqual([2000, 4000, 8000]);
  });

  it("never retries past the calculation cutoff", async () => {
    // One second before the cutoff, a 503 whose two-second backoff would land after it.
    const h = harness([jsonResponse({}, 503), jsonResponse({ gpus: [] })], "2026-09-13T23:59:59Z");
    await expect(h.run()).rejects.toBeInstanceOf(HttpDeadlineError);
    expect(h.client.calls).toHaveLength(1);
  });

  it("refuses to start at or after the deadline", async () => {
    await expect(harness([jsonResponse({ gpus: [] })], "2026-09-14T00:00:00Z").run()).rejects.toBeInstanceOf(HttpDeadlineError);
  });

  it("parses Retry-After as seconds or an HTTP date", () => {
    const now = new Date("2026-09-13T10:00:00Z");
    expect(parseRetryAfterMs("30", now)).toBe(30_000);
    expect(parseRetryAfterMs("Sun, 13 Sep 2026 10:01:00 GMT", now)).toBe(60_000);
    expect(parseRetryAfterMs("garbage", now)).toBeNull();
    expect(parseRetryAfterMs(undefined, now)).toBeNull();
  });
});

describe("response parsing and schema drift", () => {
  it("rejects malformed JSON", () => {
    expect(() => parseJsonBody({ status: 200, headers: {}, bodyText: "{not json", contentType: null })).toThrow(MalformedResponseError);
  });

  it("rejects a Runpod payload that drifted from the documented shape, naming the path", () => {
    expect(() => validateRunpodCatalog({ gpus: [{ id: "x", name: "x", memory: 80, price: { secure: "3.49" } }] })).toThrow(SchemaDriftError);
    try {
      validateRunpodCatalog({ gpus: [{ id: "x", name: "x", memory: 80, price: {}, dataCenters: [{ id: "US-KS-2", name: "x", availability: "SOMETIMES" }] }] });
    } catch (e) {
      expect(e).toBeInstanceOf(SchemaDriftError);
      expect((e as SchemaDriftError).path).toBe("$.gpus[0].dataCenters[0].availability");
    }
    expect(() => validateRunpodCatalog({ items: [] })).toThrow(/\$\.gpus/);
  });

  it("rejects a Lambda payload that drifted, and accepts an empty regions array", () => {
    expect(() => validateLambdaInstanceTypes({ data: { x: { instance_type: { name: "x" } } } })).toThrow(SchemaDriftError);
    expect(() =>
      validateLambdaInstanceTypes({ data: { x: { instance_type: { name: "x", description: "d", gpu_description: "g", price_cents_per_hour: 1, specs: { vcpus: 1, memory_gib: 1, storage_gib: 1, gpus: 1 } }, regions_with_capacity_available: [] } } }),
    ).not.toThrow();
  });
});
