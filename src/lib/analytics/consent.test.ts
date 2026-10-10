import { describe, expect, it } from "vitest";

import { consentDefaultFor, consentFromStripeMetadata, parseConsentChoice, serverAnalyticsConsent, stricterServerConsent } from "@/lib/analytics/consent";

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
  const consent = (cookie: string | null, country: string | null, doNotTrack = false) =>
    serverAnalyticsConsent({ cookie, country, doNotTrack });

  it("sends nothing for Do Not Track / GPC, even over an explicit grant", () => {
    expect(consent("granted", "US", true)).toBe("none");
    expect(consent(null, "US", true)).toBe("none");
  });

  it("keys on the account with an explicit grant, anywhere", () => {
    expect(consent("granted", "DE")).toBe("granted");
    expect(consent("granted", "US")).toBe("granted");
  });

  it("EEA, UK, Switzerland and unknown: a refusal or no decision sends nothing", () => {
    for (const country of ["DE", "FR", "GB", "CH", null, "XX", "EU"]) {
      expect(consent("denied", country), `denied ${country}`).toBe("none");
      expect(consent(null, country), `undecided ${country}`).toBe("none");
    }
  });

  it("default-on regions: no decision keys on the account; a refusal is an anonymous count", () => {
    expect(consent(null, "US")).toBe("granted");
    expect(consent("denied", "US")).toBe("anonymous");
  });

  it("treats an unreadable choice as no choice", () => {
    expect(consent("yes", null)).toBe("none");
    expect(consent("yes", "US")).toBe("granted");
  });
});

describe("stricterServerConsent", () => {
  it("takes the more restrictive", () => {
    expect(stricterServerConsent("granted", "anonymous")).toBe("anonymous");
    expect(stricterServerConsent("anonymous", "none")).toBe("none");
    expect(stricterServerConsent("granted", "granted")).toBe("granted");
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
    expect(consentFromStripeMetadata({ urdais_analytics_consent: "anonymous" })).toBe("anonymous");
    // Written before the three-way distinction: treated as the strictest.
    expect(consentFromStripeMetadata({ urdais_analytics_consent: "not_granted" })).toBe("none");
    expect(consentFromStripeMetadata({})).toBe("none");
    expect(consentFromStripeMetadata(null)).toBe("none");
  });
});
