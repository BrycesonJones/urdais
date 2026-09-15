import { describe, expect, it } from "vitest";

import { cronRequestAuthorized } from "@/app/api/cron/ucpi/route";

describe("UCPI cron authorization", () => {
  it("refuses every request when no secret is configured", () => {
    // The important half: an unconfigured deployment has no trigger rather than an open one.
    expect(cronRequestAuthorized("Bearer anything", undefined)).toBe(false);
    expect(cronRequestAuthorized("Bearer anything", "")).toBe(false);
    expect(cronRequestAuthorized("Bearer anything", "   ")).toBe(false);
    expect(cronRequestAuthorized(null, undefined)).toBe(false);
  });

  it("accepts only the exact bearer secret", () => {
    expect(cronRequestAuthorized("Bearer s3cret-value-long", "s3cret-value-long")).toBe(true);
    expect(cronRequestAuthorized("Bearer s3cret-value-lonG", "s3cret-value-long")).toBe(false);
    // A prefix must not pass, which is what a length check before timingSafeEqual is for.
    expect(cronRequestAuthorized("Bearer s3cret", "s3cret-value-long")).toBe(false);
    expect(cronRequestAuthorized("Bearer s3cret-value-long-extra", "s3cret-value-long")).toBe(false);
  });

  it("requires the Bearer scheme and does not accept a bare secret", () => {
    expect(cronRequestAuthorized("s3cret-value-long", "s3cret-value-long")).toBe(false);
    expect(cronRequestAuthorized("Basic s3cret-value-long", "s3cret-value-long")).toBe(false);
    expect(cronRequestAuthorized(null, "s3cret-value-long")).toBe(false);
    expect(cronRequestAuthorized("", "s3cret-value-long")).toBe(false);
  });

  it("uses the shared cron secret, so the UBWI and UCPI routes agree on one value", async () => {
    const ubwi = await import("@/app/api/cron/ubwi/route");
    const secret = "shared-cron-secret-x";
    expect(ubwi.cronRequestAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(cronRequestAuthorized(`Bearer ${secret}`, secret)).toBe(true);
  });
});
