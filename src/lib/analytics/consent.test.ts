import { describe, expect, it } from "vitest";

import { consentDefaultFor, consentFromStripeMetadata, parseConsentChoice, serverAnalyticsConsent } from "@/lib/analytics/consent";

describe("consentDefaultFor", () => {
  it("asks first in the EEA, the UK and Switzerland", () => {
    for (const country of ["DE", "FR", "IE", "NO", "IS", "LI", "GB", "CH", "de"]) expect(consentDefaultFor(country), country).toBe("pending");
  });

  it("defaults on elsewhere", () => {
    for (const country of ["US", "CA", "JP", "SG", "AU"]) expect(consentDefaultFor(country), country).toBe("granted");
  });

  it("treats an unknown country as one that asks first", () => {
    for (const country of [null, undefined, "", "XX1", "unknown", "T1", "A1"]) expect(consentDefaultFor(country)).toBe("pending");
  });

  it("treats two-letter non-country placeholders as unknown, including Europe-level EU", () => {
    for (const country of ["XX", "ZZ", "EU", "AP", "eu"]) expect(consentDefaultFor(country), country).toBe("pending");
  });

  it("covers all 27 EU members, the 3 other EEA states, the UK and Switzerland", async () => {
    const { PRIOR_CONSENT_COUNTRIES } = await import("@/lib/analytics/consent");
    const eu27 = ["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"];
    expect(eu27).toHaveLength(27);
    expect([...PRIOR_CONSENT_COUNTRIES].sort()).toEqual([...eu27, "IS", "LI", "NO", "GB", "CH"].sort());
  });
});

describe("serverAnalyticsConsent", () => {
  it("lets Do Not Track / GPC override even an explicit grant", () => {
    expect(serverAnalyticsConsent({ cookie: "granted", country: "US", doNotTrack: true })).toBe("not_granted");
  });

  it("prefers the explicit choice to the region", () => {
    expect(serverAnalyticsConsent({ cookie: "denied", country: "US", doNotTrack: false })).toBe("not_granted");
    expect(serverAnalyticsConsent({ cookie: "granted", country: "DE", doNotTrack: false })).toBe("granted");
  });

  it("falls back to the regional default, and to not_granted for anything unclear", () => {
    expect(serverAnalyticsConsent({ cookie: null, country: "US", doNotTrack: false })).toBe("granted");
    expect(serverAnalyticsConsent({ cookie: null, country: "FR", doNotTrack: false })).toBe("not_granted");
    expect(serverAnalyticsConsent({ cookie: "yes", country: null, doNotTrack: false })).toBe("not_granted");
  });
});

describe("parsing", () => {
  it("accepts only the two stored values", () => {
    expect(parseConsentChoice("granted")).toBe("granted");
    expect(parseConsentChoice("denied")).toBe("denied");
    expect(parseConsentChoice("1")).toBeNull();
  });

  it("reads Stripe metadata conservatively", () => {
    expect(consentFromStripeMetadata({ urdais_analytics_consent: "granted" })).toBe("granted");
    expect(consentFromStripeMetadata({ urdais_analytics_consent: "not_granted" })).toBe("not_granted");
    expect(consentFromStripeMetadata({})).toBe("not_granted");
    expect(consentFromStripeMetadata(null)).toBe("not_granted");
  });
});
