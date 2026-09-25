import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { backfill } from "@/lib/uepi/backfill";
import { retrieveArtifact } from "@/lib/uepi/source/retrieve";
import { fixtureArtifact } from "@/lib/uepi/source/fixtures/load";
import { UepiSourceError, type SourceAuthorization } from "@/lib/uepi/source/types";

const NEVER_SLEEP = async () => {};

function authorization(token: string): SourceAuthorization & { invalidations: number } {
  let current = token;
  const state = {
    invalidations: 0,
    headers: async () => ({ authorization: `Bearer ${current}` }),
    invalidate: () => { state.invalidations += 1; current = `${token}-renewed`; },
  };
  return state;
}

describe("1. credentials reach the request", () => {
  it("sends the authorization headers the caller supplied", async () => {
    const seen: Record<string, string>[] = [];
    await retrieveArtifact("uepi-ercot", { label: "day", url: "https://api.ercot.com/x" }, {
      authorization: authorization("token-1"),
      fetcher: async (_url, init) => { seen.push(init.headers); return new Response("{}", { status: 200 }) as unknown as Response; },
      attempts: 1, sleep: NEVER_SLEEP,
    });
    expect(seen[0]!.authorization).toBe("Bearer token-1");
  });

  it("re-authenticates once when the API refuses a token, and not twice", async () => {
    const auth = authorization("stale");
    const tokens: string[] = [];
    const artifact = await retrieveArtifact("uepi-ercot", { label: "day", url: "https://api.ercot.com/x" }, {
      authorization: auth,
      fetcher: async (_url, init) => {
        tokens.push(init.headers.authorization ?? "");
        return tokens.length === 1
          ? (new Response("", { status: 401 }) as unknown as Response)
          : (new Response("{}", { status: 200 }) as unknown as Response);
      },
      attempts: 3, sleep: NEVER_SLEEP,
    });
    expect(artifact?.status).toBe(200);
    expect(auth.invalidations).toBe(1);
    expect(tokens).toEqual(["Bearer stale", "Bearer stale-renewed"]);
  });

  it("gives up after one re-authentication rather than hammering the endpoint", async () => {
    const auth = authorization("wrong");
    let calls = 0;
    await expect(retrieveArtifact("uepi-ercot", { label: "day", url: "https://api.ercot.com/x" }, {
      authorization: auth,
      fetcher: async () => { calls += 1; return new Response("", { status: 401 }) as unknown as Response; },
      attempts: 5, sleep: NEVER_SLEEP,
    })).rejects.toThrow(/authentication failed/);
    expect(calls).toBe(2);
    expect(auth.invalidations).toBe(1);
  });

  it("refuses an unauthenticated 401 immediately, with no credential to retry", async () => {
    await expect(retrieveArtifact("uepi-pjm", { label: "day", url: "https://api.pjm.com/x" }, {
      fetcher: async () => new Response("", { status: 401 }) as unknown as Response,
      attempts: 3, sleep: NEVER_SLEEP,
    })).rejects.toThrow(UepiSourceError);
  });
});

describe("2. a URL in an error carries no credential", () => {
  it("redacts secret-bearing query parameters in every failure message", async () => {
    const url = "https://example.invalid/data?password=hunter2&apikey=abc123&day=2026-09-23";
    const thrown = await retrieveArtifact("uepi-ercot", { label: "day", url }, {
      fetcher: async () => new Response("", { status: 500 }) as unknown as Response,
      attempts: 1, sleep: NEVER_SLEEP,
    }).then(() => null, (caught: unknown) => caught as Error);
    const message = thrown?.message ?? "";
    expect(message).not.toContain("hunter2");
    expect(message).not.toContain("abc123");
    expect(message).toContain("password=REDACTED");
    expect(message).toContain("day=2026-09-23");
  });
});

describe("3. the backfill hands an authenticated adapter its own credentials", () => {
  // Invented credentials. ISO-NE's adapter reads them from the environment, which is itself part
  // of what this section checks: an adapter with no credential configured must fail the day rather
  // than quietly fetch without one.
  beforeEach(() => {
    vi.stubEnv("ISONE_USERNAME", "user-SENTINEL");
    vi.stubEnv("ISONE_PASSWORD", "password-SENTINEL");
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("fails the day when an authenticated adapter has no credential configured", async () => {
    vi.unstubAllEnvs();
    const result = await backfill({
      seriesId: "uepi-iso-ne", from: "2026-09-23", to: "2026-09-23", dryRun: true,
      retrieve: { attempts: 1, fetcher: async () => new Response("{}", { status: 200 }) as unknown as Response },
      sleep: NEVER_SLEEP, pauseMs: 0,
    });
    expect(result.released).toBe(0);
    expect(result.days[0]!.detail).toContain("ISONE_USERNAME is not configured");
    expect(result.days[0]!.detail).not.toContain("SENTINEL");
  });

  /**
   * The regression this exists for: the retrieval layer grew credential support and the backfill
   * kept passing only the caller's options, so every authenticated request went out bare and the
   * source answered 401 all day. Nothing about that failure looks like a wiring bug from the
   * outside -- it looks exactly like a rejected credential.
   */
  it("uses the adapter's authorization when the caller supplies none", async () => {
    const headers: (string | undefined)[] = [];
    const result = await backfill({
      seriesId: "uepi-iso-ne", from: "2026-09-23", to: "2026-09-23", dryRun: true,
      retrieve: {
        attempts: 1,
        fetcher: async (_url, init) => {
          headers.push((init.headers as Record<string, string>).authorization);
          const artifact = fixtureArtifact("isone-2026-09-23.json", "day");
          return new Response(new Uint8Array(artifact.body), { status: 200 }) as unknown as Response;
        },
      },
      sleep: NEVER_SLEEP, pauseMs: 0,
    });
    expect(result.released).toBe(1);
    expect(headers).toHaveLength(1);
    expect(headers[0]).toMatch(/^Basic /);
  });

  it("lets a caller override the adapter's authorization, for a test or a probe", async () => {
    const headers: (string | undefined)[] = [];
    const override = authorization("explicit");
    await backfill({
      seriesId: "uepi-iso-ne", from: "2026-09-23", to: "2026-09-23", dryRun: true,
      retrieve: {
        attempts: 1,
        authorization: override,
        fetcher: async (_url, init) => {
          headers.push((init.headers as Record<string, string>).authorization);
          const artifact = fixtureArtifact("isone-2026-09-23.json", "day");
          return new Response(new Uint8Array(artifact.body), { status: 200 }) as unknown as Response;
        },
      },
      sleep: NEVER_SLEEP, pauseMs: 0,
    });
    expect(headers[0]).toBe("Bearer explicit");
  });

  it("dry-runs an authenticated market end to end and writes nothing", async () => {
    const onDay = vi.fn();
    const result = await backfill({
      seriesId: "uepi-ercot", from: "2026-09-23", to: "2026-09-23", dryRun: true,
      retrieve: {
        attempts: 1,
        authorization: authorization("token"),
        fetcher: async () => {
          const artifact = fixtureArtifact("ercot-2026-09-23.json", "day");
          return new Response(new Uint8Array(artifact.body), { status: 200 }) as unknown as Response;
        },
      },
      sleep: NEVER_SLEEP, pauseMs: 0, onDay,
    });
    expect(result.released).toBe(1);
    expect(result.days[0]!.valueUsdPerMwh).toBe("44.251250");
    expect(result.days[0]!.wrote).toBeNull();
    expect(onDay).toHaveBeenCalledTimes(1);
  });
});
