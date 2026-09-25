import { describe, expect, it, vi } from "vitest";

import {
  UepiCredentialError, hasErcotCredentials, hasIsoneCredentials, readErcotCredentials,
  readIsoneCredentials, redactHeaders, redactSecrets, redactUrl,
} from "@/lib/uepi/source/auth/credentials";
import { ERCOT_TOKEN_ENDPOINT, ErcotTokenCache } from "@/lib/uepi/source/auth/ercot-token";
import { isoneAuthorizationHeaders } from "@/lib/uepi/source/auth/isone-basic";

/**
 * Invented credentials, distinctive enough that a leak is unmistakable in an assertion.
 *
 * The point of this file is the negative space: every error path, every message and every header
 * map is checked for these strings, because a credential escapes through the ordinary machinery of
 * a program rather than through anything dramatic.
 */
const ENV = {
  ERCOT_API_USERNAME: "user-SENTINEL-ercot@example.invalid",
  ERCOT_API_PASSWORD: "password-SENTINEL-ercot",
  ERCOT_API_SUBSCRIPTION_KEY: "subscriptionkey-SENTINEL-ercot",
  ISONE_USERNAME: "user-SENTINEL-isone",
  ISONE_PASSWORD: "password-SENTINEL-isone",
};
const SENTINELS = Object.values(ENV);

function tokenResponse(token: string, expiresIn = 3_600): Response {
  return new Response(JSON.stringify({ id_token: token, expires_in: expiresIn, token_type: "Bearer" }),
    { status: 200, headers: { "content-type": "application/json" } }) as unknown as Response;
}

describe("1. ERCOT acquires a token and reuses it", () => {
  it("posts the ROPC form to ERCOT's endpoint and returns a bearer header", async () => {
    const calls: { url: string; body: string }[] = [];
    const cache = new ErcotTokenCache({
      env: ENV,
      fetcher: async (url, init) => { calls.push({ url, body: init.body }); return tokenResponse("token-1"); },
    });
    const headers = await cache.authorizationHeaders();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(ERCOT_TOKEN_ENDPOINT);
    expect(calls[0]!.body).toContain("grant_type=password");
    expect(calls[0]!.body).toContain("response_type=id_token");
    expect(headers.authorization).toBe("Bearer token-1");
    expect(headers["ocp-apim-subscription-key"]).toBe(ENV.ERCOT_API_SUBSCRIPTION_KEY);
  });

  it("reuses one token across many requests rather than one per day", async () => {
    const cache = new ErcotTokenCache({ env: ENV, fetcher: async () => tokenResponse("token-1") });
    for (let request = 0; request < 50; request += 1) await cache.authorizationHeaders();
    expect(cache.acquisitionCount).toBe(1);
  });

  it("re-acquires when the token is close to expiring", async () => {
    let now = 1_000_000;
    let issued = 0;
    const cache = new ErcotTokenCache({
      env: ENV, now: () => now,
      fetcher: async () => { issued += 1; return tokenResponse(`token-${issued}`, 3_600); },
    });
    expect((await cache.authorizationHeaders()).authorization).toBe("Bearer token-1");
    now += 54 * 60_000;                       // 54 minutes: still more than five minutes of life.
    expect((await cache.authorizationHeaders()).authorization).toBe("Bearer token-1");
    now += 2 * 60_000;                        // 56 minutes: inside the renewal margin.
    expect((await cache.authorizationHeaders()).authorization).toBe("Bearer token-2");
    expect(cache.acquisitionCount).toBe(2);
  });

  it("re-acquires after the API refuses a token the issuer still considers live", async () => {
    let issued = 0;
    const cache = new ErcotTokenCache({
      env: ENV, fetcher: async () => { issued += 1; return tokenResponse(`token-${issued}`); } });
    expect((await cache.authorizationHeaders()).authorization).toBe("Bearer token-1");
    cache.invalidate();
    expect((await cache.authorizationHeaders()).authorization).toBe("Bearer token-2");
  });

  it("retries a throttled token endpoint and gives up on a rejected credential", async () => {
    const sleep = vi.fn(async () => {});
    let attempt = 0;
    const throttled = new ErcotTokenCache({
      env: ENV, sleep,
      fetcher: async () => {
        attempt += 1;
        return attempt < 3
          ? (new Response("", { status: 429 }) as unknown as Response)
          : tokenResponse("token-after-backoff");
      },
    });
    expect((await throttled.authorizationHeaders()).authorization).toBe("Bearer token-after-backoff");
    expect(sleep).toHaveBeenCalledTimes(2);

    let rejectedAttempts = 0;
    const rejected = new ErcotTokenCache({
      env: ENV, sleep,
      fetcher: async () => { rejectedAttempts += 1; return new Response("bad credential", { status: 400 }) as unknown as Response; },
    });
    await expect(rejected.authorizationHeaders()).rejects.toThrow(UepiCredentialError);
    // A wrong password will be wrong again; hammering the endpoint is how an account gets locked.
    expect(rejectedAttempts).toBe(1);
  });
});

describe("2. no secret reaches an error, a message or a header record", () => {
  function assertClean(text: string): void {
    for (const secret of SENTINELS) expect(text).not.toContain(secret);
  }

  it("keeps credentials out of a failed authentication", async () => {
    const cache = new ErcotTokenCache({
      env: ENV,
      // A publisher that echoes the request back is the realistic leak: the body it quotes holds
      // the password.
      fetcher: async (_url, init) => new Response(`rejected: ${init.body}`, { status: 401 }) as unknown as Response,
    });
    const error = await cache.authorizationHeaders().catch((caught: unknown) => caught as Error);
    expect(error).toBeInstanceOf(UepiCredentialError);
    assertClean(error.message);
    assertClean(JSON.stringify(error));
    expect(error.message).toContain("authentication failed");
    expect(error.message).toContain("HTTP 401");
  });

  it("keeps credentials out of a missing-configuration error", () => {
    const error = (() => { try { readErcotCredentials({}); } catch (caught) { return caught as Error; } })()!;
    expect(error.message).toContain("ERCOT_API_USERNAME is not configured");
    assertClean(error.message);
    expect(() => readIsoneCredentials({})).toThrow(/ISONE_USERNAME is not configured/);
  });

  it("redacts secret-bearing query parameters while keeping the request's shape", () => {
    const url = `https://example.invalid/token?username=${encodeURIComponent(ENV.ERCOT_API_USERNAME)}`
      + `&password=${encodeURIComponent(ENV.ERCOT_API_PASSWORD)}&deliveryDateFrom=2026-09-23`;
    const redacted = redactUrl(url);
    assertClean(redacted);
    expect(redacted).toContain("username=REDACTED");
    expect(redacted).toContain("password=REDACTED");
    expect(redacted).toContain("deliveryDateFrom=2026-09-23");
  });

  it("strips credentials embedded in a URL's authority", () => {
    assertClean(redactUrl(`https://${ENV.ISONE_USERNAME}:${ENV.ISONE_PASSWORD}@webservices.iso-ne.com/api/v1.1/x`));
    expect(redactUrl("https://u:p@example.invalid/x")).toBe("https://example.invalid/x");
  });

  it("redacts the header values that carry a credential, and only those", () => {
    const headers = redactHeaders({
      authorization: `Bearer ${ENV.ERCOT_API_PASSWORD}`,
      "ocp-apim-subscription-key": ENV.ERCOT_API_SUBSCRIPTION_KEY,
      "user-agent": "Urdais/1.0",
    });
    assertClean(JSON.stringify(headers));
    expect(headers.authorization).toBe("REDACTED");
    expect(headers["ocp-apim-subscription-key"]).toBe("REDACTED");
    expect(headers["user-agent"]).toBe("Urdais/1.0");
  });

  it("removes a secret from text Urdais did not compose", () => {
    const echoed = `the service replied: password=${ENV.ERCOT_API_PASSWORD} was rejected`;
    assertClean(redactSecrets(echoed, SENTINELS));
    assertClean(redactSecrets(`encoded ${encodeURIComponent(ENV.ERCOT_API_USERNAME)}`, SENTINELS));
  });

  it("never persists a token: the cache is memory and the module exposes no writer", async () => {
    const source = await import("node:fs/promises")
      .then((fs) => fs.readFile("src/lib/uepi/source/auth/ercot-token.ts", "utf8"));
    expect(source).not.toMatch(/writeFile|appendFile|createWriteStream|localStorage|process\.env\[/);
  });
});

describe("3. ISO-NE presents Basic authentication and nothing else", () => {
  it("builds the header from the configured credential", () => {
    const headers = isoneAuthorizationHeaders(ENV);
    expect(headers.authorization).toBe(
      `Basic ${Buffer.from(`${ENV.ISONE_USERNAME}:${ENV.ISONE_PASSWORD}`, "utf8").toString("base64")}`);
    expect(headers.accept).toBe("application/json");
  });

  it("is encoding rather than encryption, which is why it is redacted like a password", () => {
    const headers = isoneAuthorizationHeaders(ENV);
    const decoded = Buffer.from((headers.authorization ?? "").replace("Basic ", ""), "base64").toString("utf8");
    expect(decoded).toContain(ENV.ISONE_PASSWORD);
    expect(redactHeaders(headers).authorization).toBe("REDACTED");
  });

  it("refuses to build a header without a credential", () => {
    expect(() => isoneAuthorizationHeaders({})).toThrow(UepiCredentialError);
  });
});

describe("4. presence checks do not read values", () => {
  it("reports configuration without returning anything secret", () => {
    expect(hasErcotCredentials(ENV)).toBe(true);
    expect(hasErcotCredentials({ ERCOT_API_USERNAME: "x" })).toBe(false);
    expect(hasIsoneCredentials(ENV)).toBe(true);
    expect(hasIsoneCredentials({})).toBe(false);
  });
});
