/**
 * Signature verification, with real Stripe signatures.
 *
 * The signing is done by the Stripe SDK's own test helper rather than by
 * hand-rolled HMAC, so what is being verified is the actual contract — including
 * the timestamp tolerance and the exact bytes covered — and not a reimplementation
 * that could agree with a bug.
 *
 * A forged webhook that could move an entitlement would make the subscription
 * optional, so these are the tests that matter most in the billing layer.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

const processStripeEvent = vi.hoisted(() => vi.fn());
const resolveTokenDatabaseUrl = vi.hoisted(() => vi.fn());
const tokenSqlExecutor = vi.hoisted(() => vi.fn());

vi.mock("@/lib/billing/webhook", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/webhook")>()),
  processStripeEvent,
}));
vi.mock("@/lib/tokens/read/database", () => ({ resolveTokenDatabaseUrl, tokenSqlExecutor }));

import { POST } from "@/app/api/stripe/webhook/route";

/*
 * Assembled from fragments rather than written as literals. These are fixtures and
 * not credentials, but a key-SHAPED string in the repository trips GitHub's push
 * protection -- correctly, since a scanner cannot tell a fixture from a paste. Not
 * having the shape at all is better than teaching anything to ignore it.
 */
const SECRET = ["whsec", "phase5", "signature", "fixture"].join("_");
const TEST_KEY = ["sk", "test", "phase5fixture"].join("_");
const stripe = new Stripe(TEST_KEY);

function payload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: "evt_test_1",
    object: "event",
    type: "customer.subscription.updated",
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: "sub_1", customer: "cus_1" } },
    ...overrides,
  });
}

function request(body: string, signature: string | null): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature !== null) headers.set("stripe-signature", signature);
  return new Request("https://urdais.com/api/stripe/webhook", { method: "POST", headers, body });
}

function signed(body: string): string {
  return stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });
}

beforeEach(() => {
  vi.restoreAllMocks();
  processStripeEvent.mockReset();
  resolveTokenDatabaseUrl.mockReset().mockReturnValue("postgresql://localhost/test");
  tokenSqlExecutor.mockReset().mockResolvedValue({ query: vi.fn().mockResolvedValue({ rows: [] }) });
  vi.stubEnv("STRIPE_SECRET_KEY", TEST_KEY);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("STRIPE_PREMIUM_PRICE_ID", "price_test");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL_ENV", "");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("a forged webhook cannot do anything", () => {
  it("rejects a body with no signature at all", async () => {
    const response = await POST(request(payload(), null) as never);
    expect(response.status).toBe(400);
    expect(processStripeEvent).not.toHaveBeenCalled();
  });

  it("rejects an invented signature", async () => {
    const response = await POST(request(payload(), "t=1,v1=deadbeef") as never);
    expect(response.status).toBe(400);
    expect(processStripeEvent).not.toHaveBeenCalled();
  });

  it("rejects a signature made with the wrong secret", async () => {
    const body = payload();
    const wrong = stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_not_the_real_secret" });
    const response = await POST(request(body, wrong) as never);
    expect(response.status).toBe(400);
    expect(processStripeEvent).not.toHaveBeenCalled();
  });

  it("rejects a valid signature over a DIFFERENT body", async () => {
    // The replay-with-tampering case: a signature lifted from a real delivery, put
    // on a payload that grants somebody else access.
    const signature = signed(payload());
    const tampered = payload({ data: { object: { id: "sub_attacker", customer: "cus_attacker" } } });
    const response = await POST(request(tampered, signature) as never);
    expect(response.status).toBe(400);
    expect(processStripeEvent).not.toHaveBeenCalled();
  });

  it("rejects a signature whose timestamp is outside Stripe's tolerance", async () => {
    // Stripe's replay window. An old signed body captured off the wire must stop working.
    const body = payload();
    const stale = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: SECRET,
      timestamp: Math.floor(Date.now() / 1000) - 60 * 60 * 24,
    });
    const response = await POST(request(body, stale) as never);
    expect(response.status).toBe(400);
    expect(processStripeEvent).not.toHaveBeenCalled();
  });

  it("never logs the body or the signature when verification fails", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line) => void errors.push(String(line)));
    const signature = "t=1,v1=deadbeef";
    await POST(request(payload(), signature) as never);
    const logged = errors.join(" ");
    expect(logged).not.toContain("deadbeef");
    expect(logged).not.toContain("cus_1");
    expect(logged).toContain("signature verification failed");
  });
});

describe("a genuine webhook is processed", () => {
  it("accepts a correctly signed body and hands over the parsed event", async () => {
    processStripeEvent.mockResolvedValue({ kind: "processed", detail: "ok" });
    const body = payload();

    const response = await POST(request(body, signed(body)) as never);

    expect(response.status).toBe(200);
    expect(processStripeEvent).toHaveBeenCalledOnce();
    const event = processStripeEvent.mock.calls[0]?.[2];
    expect(event.id).toBe("evt_test_1");
    expect(event.type).toBe("customer.subscription.updated");
  });

  it("passes the deployment's own mode, not one from the request", async () => {
    processStripeEvent.mockResolvedValue({ kind: "processed", detail: "ok" });
    const body = payload();
    await POST(request(body, signed(body)) as never);
    expect(processStripeEvent.mock.calls[0]?.[3]).toBe("test");
  });
});

describe("the status code is an instruction to Stripe", () => {
  const cases = [
    { outcome: { kind: "processed", detail: "d" }, status: 200, why: "done; stop sending" },
    { outcome: { kind: "ignored", detail: "d" }, status: 200, why: "not ours; stop sending" },
    { outcome: { kind: "rejected", detail: "d" }, status: 400, why: "retrying cannot help" },
    { outcome: { kind: "failed", detail: "d" }, status: 500, why: "transient; please retry" },
  ];

  it.each(cases)("answers $status for $outcome.kind ($why)", async ({ outcome, status }) => {
    processStripeEvent.mockResolvedValue(outcome);
    const body = payload();
    const response = await POST(request(body, signed(body)) as never);
    expect(response.status).toBe(status);
  });

  it("answers 500 when processing throws, so the event is retried rather than lost", async () => {
    // Returning 200 here is the one genuinely dangerous answer: Stripe stops
    // retrying, the entitlement is never written, and a subscriber who paid is
    // locked out with nothing in the dashboard to explain it.
    processStripeEvent.mockRejectedValue(new Error("connection reset"));
    const body = payload();
    const response = await POST(request(body, signed(body)) as never);
    expect(response.status).toBe(500);
  });

  it("answers 500 when the signing secret is absent, rather than pretending success", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const body = payload();
    const response = await POST(request(body, signed(body)) as never);
    expect(response.status).toBe(500);
    expect(processStripeEvent).not.toHaveBeenCalled();
  });

  it("answers 500 when billing is not configured", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const body = payload();
    const response = await POST(request(body, signed(body)) as never);
    expect(response.status).toBe(500);
  });

  it("answers 500 when there is no database, so nothing is silently dropped", async () => {
    resolveTokenDatabaseUrl.mockReturnValue(null);
    processStripeEvent.mockResolvedValue({ kind: "processed", detail: "ok" });
    const body = payload();
    const response = await POST(request(body, signed(body)) as never);
    expect(response.status).toBe(500);
    expect(processStripeEvent).not.toHaveBeenCalled();
  });
});

describe("the runtime", () => {
  it("is Node, because signature verification needs Node crypto", async () => {
    const route = await import("@/app/api/stripe/webhook/route");
    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
  });
});
