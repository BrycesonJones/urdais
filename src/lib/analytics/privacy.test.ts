import { describe, expect, it } from "vitest";
import type { CaptureResult } from "posthog-js";

import { redactSensitiveUrls, sanitizeUrl } from "@/lib/analytics/privacy";

describe("sanitizeUrl", () => {
  it("redacts an email verification token and an OAuth code", () => {
    expect(sanitizeUrl("https://urdais.com/auth/confirm?token_hash=abc123&type=email")).toBe(
      "https://urdais.com/auth/confirm?token_hash=%5Bredacted%5D&type=email",
    );
    expect(sanitizeUrl("https://urdais.com/auth/callback?code=xyz&returnTo=%2Fmap")).toBe(
      "https://urdais.com/auth/callback?code=%5Bredacted%5D&returnTo=%2Fmap",
    );
  });

  it("redacts a Stripe Checkout Session id", () => {
    expect(sanitizeUrl("https://urdais.com/access/complete?session_id=cs_live_1")).not.toContain("cs_live_1");
  });

  it("drops the fragment, where implicit-flow tokens and Stripe's checkout state live", () => {
    expect(sanitizeUrl("https://urdais.com/#access_token=secret&refresh_token=r")).toBe("https://urdais.com/");
    expect(sanitizeUrl("https://checkout.stripe.com/c/pay/cs_live_1#fidkdWxOYHwn")).toBe("https://checkout.stripe.com/c/pay/cs_live_1");
  });

  it("keeps UTM parameters and ordinary navigation, which attribution needs", () => {
    const url = "https://urdais.com/markets/ucpi?utm_source=newsletter&utm_campaign=launch&range=1y";
    expect(sanitizeUrl(url)).toBe(url);
  });

  it("matches parameter names case-insensitively", () => {
    expect(sanitizeUrl("https://urdais.com/?Token=a")).not.toContain("=a");
  });

  it("never throws on a value that is not a URL", () => {
    expect(sanitizeUrl("$direct")).toBe("$direct");
    expect(sanitizeUrl("not a url#frag")).toBe("not a url");
  });
});

describe("redactSensitiveUrls", () => {
  it("sanitises event and person URL properties and leaves everything else alone", () => {
    const event = {
      uuid: "u",
      event: "$pageview",
      properties: {
        $current_url: "https://urdais.com/auth/confirm?token_hash=t",
        $referrer: "https://checkout.stripe.com/c/pay/cs_1#state",
        $pathname: "/auth/confirm",
        $session_entry_url: "https://urdais.com/auth/confirm?token_hash=t",
        $session_entry_referrer: "https://accounts.example/#access_token=a",
        utm_source: "x",
      },
      $set_once: { $initial_current_url: "https://urdais.com/?code=c" },
    } as unknown as CaptureResult;

    const result = redactSensitiveUrls(event)!;
    expect(result.properties.$current_url).not.toContain("=t");
    expect(result.properties.$referrer).toBe("https://checkout.stripe.com/c/pay/cs_1");
    expect(result.properties.$pathname).toBe("/auth/confirm");
    // Not in any fixed list: caught by the key pattern.
    expect(result.properties.$session_entry_url).not.toContain("=t");
    expect(result.properties.$session_entry_referrer).toBe("https://accounts.example/");
    expect(result.properties.utm_source).toBe("x");
    expect(result.$set_once?.$initial_current_url).not.toContain("=c");
  });

  it("passes a dropped event through", () => {
    expect(redactSensitiveUrls(null)).toBeNull();
  });
});
