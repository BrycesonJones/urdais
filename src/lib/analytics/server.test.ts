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
    recordCheckoutStarted("acct_1", "/map", "granted");
    expect(after).not.toHaveBeenCalled();
  });

  it("are queued after the response, keyed on the account, with no geo lookup", async () => {
    enable();
    recordCheckoutStarted("acct_1", "/markets/power-analytics", "granted");
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
    const input = { accountId: "acct_1", subscriptionId: "sub_1", livemode: true, via: "webhook" as const, consent: "granted" as const };
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
    recordCheckoutStarted("acct_1", null, "granted");
    await expect(flushAfter()).resolves.toBeUndefined();
  });

  it("never hold up the caller: a PostHog that never answers is waited on only after the response", async () => {
    enable();
    // The worst outage: the request hangs forever.
    captureImmediate.mockReturnValue(new Promise(() => {}));
    after.mockImplementation((task: () => Promise<void>) => void task());
    const started = Date.now();
    recordSubscriptionCompleted({ accountId: "acct_1", subscriptionId: "sub_1", livemode: true, via: "webhook", consent: "granted" });
    recordCheckoutStarted("acct_1", null, "granted");
    // Synchronous return: the webhook answers Stripe and the action redirects regardless.
    expect(Date.now() - started).toBeLessThan(50);
    expect(captureImmediate).toHaveBeenCalledTimes(2);
  });

  it("swallow a client that fails to construct", async () => {
    enable();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { PostHog } = await import("posthog-node");
    vi.mocked(PostHog).mockImplementationOnce(function () {
      throw new Error("bad config");
    } as never);
    recordCheckoutStarted("acct_1", null, "granted");
    await expect(flushAfter()).resolves.toBeUndefined();
  });

  it("swallow after() refusing to run outside a request", () => {
    enable();
    after.mockImplementation(() => {
      throw new Error("outside a request scope");
    });
    expect(() => recordCheckoutStarted("acct_1", null, "granted")).not.toThrow();
  });
});

describe("server events without analytics consent", () => {
  it("are not sent at all when consent is none", async () => {
    enable();
    recordCheckoutStarted("acct_1", "/map", "none");
    recordSubscriptionCompleted({ accountId: "acct_1", subscriptionId: "sub_1", livemode: true, via: "webhook", consent: "none" });
    expect(after).not.toHaveBeenCalled();
    expect(captureImmediate).not.toHaveBeenCalled();
  });

  it("name nobody when anonymous: a random distinct id, person processing off, no account-derived id", async () => {
    enable();
    recordCheckoutStarted("acct_1", "/map", "anonymous");
    recordSubscriptionCompleted({ accountId: "acct_1", subscriptionId: "sub_1", livemode: true, via: "webhook", consent: "anonymous" });
    await flushAfter();
    const messages = captureImmediate.mock.calls.map(([message]) => message);
    expect(messages.map((m) => m.event)).toEqual(["checkout_started", "subscription_completed"]);
    for (const message of messages) {
      expect(message.distinctId).not.toBe("acct_1");
      expect(message.distinctId).toMatch(/^[0-9a-f-]{36}$/);
      expect(message.properties.$process_person_profile).toBe(false);
      // A hash of the subscription is an identifier too, so it is not sent.
      expect(message.uuid).toBeUndefined();
      expect(JSON.stringify(message)).not.toContain("acct_1");
      expect(JSON.stringify(message)).not.toContain("sub_1");
    }
    expect(messages[0].distinctId).not.toBe(messages[1].distinctId);
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
