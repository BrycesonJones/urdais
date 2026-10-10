import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ cookies: new Map<string, string>(), headers: new Map<string, string>(), fail: false }));
vi.mock("next/headers", () => ({
  cookies: async () => {
    if (jar.fail) throw new Error("outside a request");
    return { get: (name: string) => (jar.cookies.has(name) ? { value: jar.cookies.get(name) } : undefined) };
  },
  headers: async () => ({ get: (name: string) => jar.headers.get(name) ?? null }),
}));

import { requestAnalyticsConsent, requestConsentDefault } from "@/lib/analytics/request-consent";

beforeEach(() => {
  jar.cookies.clear();
  jar.headers.clear();
  jar.fail = false;
});

describe("requestAnalyticsConsent", () => {
  it("uses Vercel's country header for the default", async () => {
    jar.headers.set("x-vercel-ip-country", "US");
    expect(await requestAnalyticsConsent()).toBe("granted");
    jar.headers.set("x-vercel-ip-country", "DE");
    expect(await requestAnalyticsConsent()).toBe("none");
  });

  it("honours the explicit cookie, and DNT / Sec-GPC over everything", async () => {
    jar.headers.set("x-vercel-ip-country", "DE");
    jar.cookies.set("urdais_analytics_consent", "granted");
    expect(await requestAnalyticsConsent()).toBe("granted");
    jar.headers.set("sec-gpc", "1");
    expect(await requestAnalyticsConsent()).toBe("none");
  });

  it("is none with no country and no cookie, and when it cannot read the request", async () => {
    expect(await requestAnalyticsConsent()).toBe("none");
    jar.fail = true;
    expect(await requestAnalyticsConsent()).toBe("none");
  });
});

describe("a refusal", () => {
  it("is an anonymous count in a default-on region and nothing in a prior-consent one", async () => {
    jar.cookies.set("urdais_analytics_consent", "denied");
    jar.headers.set("x-vercel-ip-country", "US");
    expect(await requestAnalyticsConsent()).toBe("anonymous");
    jar.headers.set("x-vercel-ip-country", "IE");
    expect(await requestAnalyticsConsent()).toBe("none");
  });
});

describe("requestConsentDefault", () => {
  it("returns the regional default", async () => {
    jar.headers.set("x-vercel-ip-country", "CA");
    expect(await requestConsentDefault()).toBe("granted");
    jar.headers.set("x-vercel-ip-country", "GB");
    expect(await requestConsentDefault()).toBe("pending");
  });
});
