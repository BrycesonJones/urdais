import { describe, expect, it, vi } from "vitest";

import { UmpiTransportError } from "./errors";
import { fetchText, redactEcosUrl, redactUrl } from "./http";

const ok = (body: string, contentType = "application/json") =>
  new Response(body, { status: 200, headers: { "content-type": contentType } });

describe("credential redaction", () => {
  it("strips a query-parameter key but keeps the parameter name", () => {
    const redacted = redactUrl("https://apis.data.go.kr/x?serviceKey=SECRETVALUE&hsSgn=8542321010");
    expect(redacted).toContain("serviceKey=REDACTED");
    expect(redacted).toContain("hsSgn=8542321010");
    expect(redacted).not.toContain("SECRETVALUE");
  });

  it("strips a path-segment key, which is how ECOS carries it", () => {
    const url = "https://ecos.bok.or.kr/api/StatisticSearch/MYKEY123/json/kr/1/10/404Y016/M/202606/202606/30911201AA";
    const redacted = redactEcosUrl(url, "MYKEY123");
    expect(redacted).not.toContain("MYKEY123");
    expect(redacted).toContain("REDACTED");
    // The rest of the request stays legible, because that is what makes it useful in a log.
    expect(redacted).toContain("404Y016");
  });

  it("does not crash on an unparseable url", () => {
    expect(redactUrl("not a url")).toBe("[unparseable url]");
  });
});

describe("restrained retry behaviour", () => {
  it("returns the body on success without retrying", async () => {
    const fetcher = vi.fn(async () => ok("{}"));
    const response = await fetchText("https://example.test/a", { fetcher, sleep: async () => {} });
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not retry a rejected key or a malformed request", async () => {
    // A 4xx will not become a 2xx by asking again, and government APIs should not be asked.
    const fetcher = vi.fn(async () => new Response("no", { status: 403 }));
    await expect(fetchText("https://example.test/a", { fetcher, sleep: async () => {} })).rejects.toThrow(UmpiTransportError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries a 5xx a bounded number of times, then gives up", async () => {
    const fetcher = vi.fn(async () => new Response("down", { status: 503 }));
    const sleep = vi.fn(async () => {});
    await expect(fetchText("https://example.test/a", { fetcher, attempts: 3, sleep })).rejects.toThrow(/503/);
    expect(fetcher).toHaveBeenCalledTimes(3);
    // Backoff between attempts only: two gaps for three attempts.
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls.map((call) => (call as unknown as [number])[0])).toEqual([500, 1000]);
  });

  it("recovers when a transient failure clears", async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? new Response("down", { status: 500 }) : ok("{}");
    });
    const response = await fetchText("https://example.test/a", { fetcher, sleep: async () => {} });
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("times out and says so, without leaking the key into the message", async () => {
    const fetcher = vi.fn(async (_url: string, init: { signal: AbortSignal }) => {
      await new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
      return ok("{}");
    });
    const error = await fetchText("https://apis.data.go.kr/x?serviceKey=SECRETVALUE", {
      fetcher,
      timeoutMs: 5,
      attempts: 1,
      sleep: async () => {},
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UmpiTransportError);
    expect((error as Error).message).toMatch(/timed out/);
    expect((error as Error).message).not.toContain("SECRETVALUE");
  });
});
