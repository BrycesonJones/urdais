import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const after = vi.hoisted(() => vi.fn());
const captureImmediate = vi.hoisted(() => vi.fn());
const shutdown = vi.hoisted(() => vi.fn());

vi.mock("next/server", () => ({ after }));
vi.mock("posthog-node", () => ({
  PostHog: vi.fn(function PostHog() {
    return { captureImmediate, shutdown };
  }),
}));

import { recordCheckoutStarted, recordSubscriptionCompleted, stableEventUuid } from "@/lib/analytics/server";

const KEY = ["phc", "fixtureprojectkey"].join("_");

function enable() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", KEY);
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
}

/** Runs whatever was queued with `after()`. */
async function flushAfter() {
  for (const [task] of after.mock.calls) await (task as () => Promise<void>)();
}

beforeEach(() => {
  after.mockReset();
  captureImmediate.mockReset().mockResolvedValue(undefined);
  shutdown.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe("server events", () => {
  it("do nothing at all when analytics is off", () => {
    recordCheckoutStarted("acct_1", "/map");
    expect(after).not.toHaveBeenCalled();
  });

  it("are queued after the response, keyed on the account, with no geo lookup", async () => {
    enable();
    recordCheckoutStarted("acct_1", "/markets/power-analytics");
    expect(captureImmediate).not.toHaveBeenCalled();
    await flushAfter();
    expect(captureImmediate).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "acct_1",
        event: "checkout_started",
        disableGeoip: true,
        properties: expect.objectContaining({ source_page: "/markets/power-analytics" }),
      }),
    );
    expect(shutdown).toHaveBeenCalled();
  });

  it("give one subscription the same conversion id however many times it is recorded", async () => {
    enable();
    const input = { accountId: "acct_1", subscriptionId: "sub_1", livemode: true, via: "webhook" as const };
    recordSubscriptionCompleted(input);
    recordSubscriptionCompleted({ ...input, via: "reconciliation" });
    await flushAfter();
    const [first, second] = captureImmediate.mock.calls.map(([message]) => message);
    expect(first.event).toBe("subscription_completed");
    expect(first.uuid).toBe(second.uuid);
    expect(first.uuid).toBe(stableEventUuid("subscription_completed:sub_1"));
  });

  it("swallow a PostHog failure", async () => {
    enable();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    captureImmediate.mockRejectedValue(new Error("down"));
    recordCheckoutStarted("acct_1", null);
    await expect(flushAfter()).resolves.toBeUndefined();
  });

  it("swallow after() refusing to run outside a request", () => {
    enable();
    after.mockImplementation(() => {
      throw new Error("outside a request scope");
    });
    expect(() => recordCheckoutStarted("acct_1", null)).not.toThrow();
  });
});

describe("stableEventUuid", () => {
  it("is a deterministic, well-formed UUID", () => {
    const id = stableEventUuid("x");
    expect(id).toBe(stableEventUuid("x"));
    expect(id).not.toBe(stableEventUuid("y"));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
