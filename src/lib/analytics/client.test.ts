import { beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
  __loaded: false,
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  get_distinct_id: vi.fn(() => "anon-1"),
  get_property: vi.fn((): unknown => "anonymous"),
}));
vi.mock("posthog-js", () => ({ default: posthog }));

import { identifyAccount, resetIdentity, track } from "@/lib/analytics/client";

beforeEach(() => {
  posthog.__loaded = true;
  for (const fn of [posthog.capture, posthog.identify, posthog.reset]) fn.mockReset();
  posthog.get_distinct_id.mockReturnValue("anon-1");
  posthog.get_property.mockReturnValue("anonymous");
});

describe("when PostHog never loaded (no key, dev, tests, an ad blocker)", () => {
  it("every call is a no-op", () => {
    posthog.__loaded = false;
    track("product_viewed");
    identifyAccount("acct_1");
    resetIdentity();
    expect(posthog.capture).not.toHaveBeenCalled();
    expect(posthog.identify).not.toHaveBeenCalled();
    expect(posthog.reset).not.toHaveBeenCalled();
  });
});

describe("track", () => {
  it("captures, and swallows anything PostHog throws", () => {
    track("map_viewed", { product_id: "map" });
    expect(posthog.capture).toHaveBeenCalledWith("map_viewed", { product_id: "map" });
    posthog.capture.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => track("map_viewed")).not.toThrow();
  });
});

describe("identity", () => {
  it("identifies with the account id, once", () => {
    identifyAccount("acct_1");
    expect(posthog.identify).toHaveBeenCalledExactlyOnceWith("acct_1");
    posthog.get_distinct_id.mockReturnValue("acct_1");
    identifyAccount("acct_1");
    expect(posthog.identify).toHaveBeenCalledOnce();
  });

  it("resets an identified browser and leaves an anonymous one, and its attribution, alone", () => {
    resetIdentity();
    expect(posthog.reset).not.toHaveBeenCalled();
    posthog.get_property.mockReturnValue("identified");
    resetIdentity();
    expect(posthog.reset).toHaveBeenCalledOnce();
  });
});
