/**
 * Test and live Stripe cannot be silently mixed.
 *
 * The two failures being prevented are asymmetric and both unacceptable:
 * production on test keys sells subscriptions that do not exist, and development
 * on live keys charges real cards during a browser test. Every case here is one
 * or the other.
 */

import { describe, expect, it } from "vitest";

import {
  billingAvailability,
  deploymentEnvironment,
  describeUnavailability,
  livemodeMatches,
  requiredStripeMode,
  stripeModeOfKey,
} from "@/lib/billing/mode";

const TEST_KEY = "sk_test_abcdefghijklmnop";
const LIVE_KEY = "sk_live_abcdefghijklmnop";
const PRICE = "price_abc123";

describe("reading the mode from the credential", () => {
  it("reads it from the key's own prefix", () => {
    expect(stripeModeOfKey(TEST_KEY)).toBe("test");
    expect(stripeModeOfKey(LIVE_KEY)).toBe("live");
    // Restricted keys carry the same marker.
    expect(stripeModeOfKey("rk_test_x")).toBe("test");
    expect(stripeModeOfKey("rk_live_x")).toBe("live");
  });

  it("refuses to guess for anything else", () => {
    // A credential whose mode cannot be read must not default to either. Defaulting
    // to test would make production silently unable to sell; defaulting to live
    // would point development at real money.
    for (const value of ["", "   ", "pk_test_x", "whsec_x", "sk_x", "nonsense", undefined]) {
      expect(stripeModeOfKey(value), String(value)).toBeNull();
    }
  });
});

describe("which environment demands which mode", () => {
  it("prefers the platform's own signal over NODE_ENV", () => {
    // A preview deployment is NODE_ENV=production while being emphatically not
    // production; treating it as such would demand live keys on every branch build.
    expect(deploymentEnvironment({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe("preview");
    expect(deploymentEnvironment({ VERCEL_ENV: "production" })).toBe("production");
    expect(deploymentEnvironment({ VERCEL_ENV: "development", NODE_ENV: "production" })).toBe("development");
  });

  it("falls back to NODE_ENV when the platform says nothing", () => {
    expect(deploymentEnvironment({ NODE_ENV: "production" })).toBe("production");
    expect(deploymentEnvironment({ NODE_ENV: "test" })).toBe("development");
    expect(deploymentEnvironment({})).toBe("development");
  });

  it("requires live in production and test everywhere else", () => {
    expect(requiredStripeMode("production")).toBe("live");
    expect(requiredStripeMode("preview")).toBe("test");
    expect(requiredStripeMode("development")).toBe("test");
  });
});

describe("availability", () => {
  it("is available when the mode matches the environment", () => {
    const availability = billingAvailability({
      NODE_ENV: "test",
      STRIPE_SECRET_KEY: TEST_KEY,
      STRIPE_PREMIUM_PRICE_ID: PRICE,
    });
    expect(availability).toMatchObject({ kind: "available", mode: "test", environment: "development", priceId: PRICE });
  });

  it("REFUSES a test key in production", () => {
    // The headline case. Production on test keys would let readers complete
    // Checkout, be charged nothing, and receive premium against a sandbox object.
    const availability = billingAvailability({
      VERCEL_ENV: "production",
      STRIPE_SECRET_KEY: TEST_KEY,
      STRIPE_PREMIUM_PRICE_ID: PRICE,
    });
    expect(availability).toMatchObject({ kind: "unavailable", reason: "mode_mismatch" });
  });

  it("REFUSES a live key outside production", () => {
    // The other direction: a browser test must not be able to charge a real card.
    for (const where of [{ VERCEL_ENV: "preview" }, { NODE_ENV: "test" }, {}]) {
      const availability = billingAvailability({ ...where, STRIPE_SECRET_KEY: LIVE_KEY, STRIPE_PREMIUM_PRICE_ID: PRICE });
      expect(availability, JSON.stringify(where)).toMatchObject({ kind: "unavailable", reason: "mode_mismatch" });
    }
  });

  it("is unavailable rather than throwing when nothing is configured", () => {
    // Production today has no Stripe credentials at all, and the subscription offer
    // has to render anyway. Throwing here would 500 a page a reader can reach.
    expect(billingAvailability({ NODE_ENV: "test" })).toMatchObject({ kind: "unavailable", reason: "not_configured" });
  });

  it("is unavailable when the key cannot be read", () => {
    expect(billingAvailability({ NODE_ENV: "test", STRIPE_SECRET_KEY: "garbage", STRIPE_PREMIUM_PRICE_ID: PRICE })).toMatchObject({
      kind: "unavailable",
      reason: "unreadable_key",
    });
  });

  it("is unavailable without a Price, because there would be nothing to sell", () => {
    expect(billingAvailability({ NODE_ENV: "test", STRIPE_SECRET_KEY: TEST_KEY })).toMatchObject({
      kind: "unavailable",
      reason: "price_not_configured",
    });
  });

  it("never returns the credential in the operator description", () => {
    const availability = billingAvailability({ VERCEL_ENV: "production", STRIPE_SECRET_KEY: TEST_KEY, STRIPE_PREMIUM_PRICE_ID: PRICE });
    const described = describeUnavailability(availability);
    expect(described).not.toContain(TEST_KEY);
    expect(described).not.toContain("sk_test");
    expect(described).toMatch(/requires a live-mode/);
  });
});

describe("an object's own livemode flag", () => {
  it("must agree with the deployment's mode", () => {
    expect(livemodeMatches(false, "test")).toBe(true);
    expect(livemodeMatches(true, "live")).toBe(true);
    // A live event reaching a test deployment means credentials are crossed
    // somewhere, and processing it would write state from the wrong Stripe account.
    expect(livemodeMatches(true, "test")).toBe(false);
    expect(livemodeMatches(false, "live")).toBe(false);
  });
});
