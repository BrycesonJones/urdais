/**
 * Creating a Checkout Session: what the server decides, and what it refuses.
 *
 * Every value that determines who is charged and how much is derived server-side.
 * These tests exist to make that structural rather than intended — a future change
 * that started reading an account or a Price from the request has to break one of
 * them.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveCheckoutHandoff = vi.hoisted(() => vi.fn());
const resolveSupabaseIdentity = vi.hoisted(() => vi.fn());
const resolveViewer = vi.hoisted(() => vi.fn());
const resolveTokenDatabaseUrl = vi.hoisted(() => vi.fn());
const tokenSqlExecutor = vi.hoisted(() => vi.fn());
const resolveStripeCustomerId = vi.hoisted(() => vi.fn());
const readCustomerMapping = vi.hoisted(() => vi.fn());
const resolveUrdaisAccount = vi.hoisted(() => vi.fn());
const sessionsCreate = vi.hoisted(() => vi.fn());
const pricesRetrieve = vi.hoisted(() => vi.fn());
const portalCreate = vi.hoisted(() => vi.fn());
const stripeContext = vi.hoisted(() => vi.fn());

vi.mock("@/lib/onboarding/checkout-handoff", () => ({ resolveCheckoutHandoff }));
vi.mock("@/lib/auth/identity", () => ({ resolveSupabaseIdentity }));
vi.mock("@/lib/access/server", () => ({ resolveViewer }));
vi.mock("@/lib/tokens/read/database", () => ({ resolveTokenDatabaseUrl, tokenSqlExecutor }));
vi.mock("@/lib/billing/customers", () => ({ resolveStripeCustomerId }));
vi.mock("@/lib/billing/store", () => ({ readCustomerMapping }));
vi.mock("@/lib/auth/accounts", () => ({ resolveUrdaisAccount }));
vi.mock("@/lib/billing/stripe", () => ({ stripeContext }));

import { checkoutCancelUrl, checkoutSuccessUrl, portalReturnUrl, startBillingPortal, startCheckout } from "@/lib/billing/checkout";

const PRICE_ID = "price_canonical";

function goodPrice() {
  return {
    id: PRICE_ID,
    active: true,
    currency: "usd",
    unit_amount: 8000,
    type: "recurring",
    recurring: { interval: "week", interval_count: 1 },
  };
}

beforeEach(() => {
  for (const m of [resolveCheckoutHandoff, resolveSupabaseIdentity, resolveViewer, resolveTokenDatabaseUrl, tokenSqlExecutor, resolveStripeCustomerId, readCustomerMapping, resolveUrdaisAccount, sessionsCreate, pricesRetrieve, portalCreate, stripeContext]) {
    m.mockReset();
  }
  resolveCheckoutHandoff.mockResolvedValue({ kind: "ready", accountId: "acct_1", returnTo: "/markets/power-analytics" });
  resolveSupabaseIdentity.mockResolvedValue({ kind: "authenticated", identity: { subject: "u1", email: "reader@example.invalid", emailVerified: true } });
  resolveTokenDatabaseUrl.mockReturnValue("postgresql://localhost/test");
  tokenSqlExecutor.mockResolvedValue({ query: vi.fn().mockResolvedValue({ rows: [] }) });
  resolveStripeCustomerId.mockResolvedValue("cus_mapped");
  pricesRetrieve.mockResolvedValue(goodPrice());
  sessionsCreate.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" });
  stripeContext.mockReturnValue({
    kind: "ready",
    availability: { kind: "available", mode: "test", environment: "development", secretKey: "sk_test_x", priceId: PRICE_ID },
    stripe: {
      prices: { retrieve: pricesRetrieve },
      checkout: { sessions: { create: sessionsCreate } },
      billingPortal: { sessions: { create: portalCreate } },
    },
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("what the server decides", () => {
  it("redirects to Stripe's own session URL", async () => {
    const outcome = await startCheckout("/markets/power-analytics");
    // The account is the server-resolved one, for the `checkout_started` analytics event.
    expect(outcome).toEqual({ kind: "redirect", url: "https://checkout.stripe.com/c/pay/cs_1", accountId: "acct_1" });
  });

  it("chooses the Price from configuration, never from the caller", async () => {
    await startCheckout("/markets/power-analytics");
    const args = sessionsCreate.mock.calls[0]?.[0];
    expect(args.line_items).toEqual([{ price: PRICE_ID, quantity: 1 }]);
    expect(args.mode).toBe("subscription");
  });

  it("uses the account's mapped Customer, not a new one each time", async () => {
    await startCheckout(null);
    expect(sessionsCreate.mock.calls[0]?.[0]?.customer).toBe("cus_mapped");
    expect(resolveStripeCustomerId).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      accountId: "acct_1",
      email: "reader@example.invalid",
      mode: "test",
    });
  });

  it("carries the account id to Stripe in metadata the server wrote", async () => {
    // This is what lets the webhook find the account without trusting browser state.
    await startCheckout(null);
    const args = sessionsCreate.mock.calls[0]?.[0];
    expect(args.client_reference_id).toBe("acct_1");
    expect(args.metadata.urdais_account_id).toBe("acct_1");
    expect(args.subscription_data.metadata.urdais_account_id).toBe("acct_1");
  });

  it("asks for no trial", async () => {
    const args = sessionsCreate.mock.calls.length ? sessionsCreate.mock.calls[0]?.[0] : (await startCheckout(null), sessionsCreate.mock.calls[0]?.[0]);
    expect(args.subscription_data.trial_period_days).toBeUndefined();
  });
});

describe("what it refuses", () => {
  it("refuses an entitled reader, which is the duplicate-subscription guard", async () => {
    // The ordinary way somebody pays twice: a stale CTA, or pressing back after paying.
    resolveCheckoutHandoff.mockResolvedValue({ kind: "refused", reason: "already_entitled" });
    expect(await startCheckout(null)).toEqual({ kind: "refused", reason: "already_entitled" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("refuses an anonymous or unverified reader", async () => {
    for (const reason of ["anonymous", "unverified"] as const) {
      resolveCheckoutHandoff.mockResolvedValue({ kind: "refused", reason });
      expect(await startCheckout(null)).toEqual({ kind: "refused", reason });
    }
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("refuses when the configured Price has drifted from the copy", async () => {
    // A Price that no longer says $80/week means one of the two is wrong, and the
    // wrong one is always the one the reader was shown. Refusing beats charging.
    pricesRetrieve.mockResolvedValue({ ...goodPrice(), unit_amount: 500 });
    const outcome = await startCheckout(null);
    expect(outcome).toMatchObject({ kind: "unavailable" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("refuses when billing is unavailable, without touching Stripe", async () => {
    stripeContext.mockReturnValue({
      kind: "unavailable",
      availability: { kind: "unavailable", environment: "production", reason: "mode_mismatch" },
    });
    const outcome = await startCheckout(null);
    expect(outcome).toMatchObject({ kind: "unavailable" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("refuses when Stripe returns a session with no URL", async () => {
    sessionsCreate.mockResolvedValue({ id: "cs_1", url: null });
    expect((await startCheckout(null)).kind).toBe("unavailable");
  });
});

describe("the return destinations", () => {
  it("sends success to a route that grants nothing, with Stripe's own placeholder", async () => {
    const url = checkoutSuccessUrl("/markets/power-analytics");
    expect(url).toContain("/access/complete");
    expect(url).toContain("session_id=%7BCHECKOUT_SESSION_ID%7D");
    expect(url).toContain(encodeURIComponent("/markets/power-analytics"));
  });

  it("sends a cancelled checkout back to the offer, keeping the destination", async () => {
    const url = checkoutCancelUrl("/markets/power-analytics");
    expect(url).toContain("/access/ready");
    expect(url).toContain(encodeURIComponent("/markets/power-analytics"));
  });

  it("carries both destinations into the Stripe session", async () => {
    await startCheckout("/markets/power-analytics");
    const args = sessionsCreate.mock.calls[0]?.[0];
    expect(args.success_url).toContain("/access/complete");
    expect(args.cancel_url).toContain("/access/ready");
  });
});

describe("the customer portal", () => {
  // The session belongs to account acct_1, which owns cus_mapped (test mode).
  function signedInWithCustomer(mapping: { stripeCustomerId: string; livemode: boolean } | null = { stripeCustomerId: "cus_mapped", livemode: false }) {
    resolveSupabaseIdentity.mockResolvedValue({ kind: "authenticated", identity: { subject: "u1", email: "reader@example.invalid", emailVerified: true } });
    resolveUrdaisAccount.mockResolvedValue({ id: "acct_1", email: "reader@example.invalid" });
    readCustomerMapping.mockResolvedValue(mapping);
    portalCreate.mockResolvedValue({ url: "https://billing.stripe.com/p/session/x" });
  }

  it("opens against the account's own mapped Customer, returning to /account", async () => {
    signedInWithCustomer();
    const outcome = await startBillingPortal();

    expect(outcome).toEqual({ kind: "redirect", url: "https://billing.stripe.com/p/session/x" });
    expect(portalCreate).toHaveBeenCalledOnce();
    expect(portalCreate.mock.calls[0]?.[0]).toEqual({ customer: "cus_mapped", return_url: portalReturnUrl() });
    expect(new URL(portalReturnUrl()).pathname).toBe("/account");
  });

  it("resolves the Customer from the session's account, never from anything else", async () => {
    signedInWithCustomer();
    await startBillingPortal();
    expect(resolveUrdaisAccount.mock.calls[0]?.[1]).toEqual({ subject: "u1", email: "reader@example.invalid", emailVerified: true });
    expect(readCustomerMapping.mock.calls[0]?.[1]).toBe("acct_1");
    // It takes no arguments: there is no parameter through which a Customer, an
    // account or a return target could arrive.
    expect(startBillingPortal.length).toBe(0);
  });

  it("returns to the account on the deployment's own origin, whatever the request", () => {
    const url = new URL(portalReturnUrl());
    expect(url.pathname).toBe("/account");
    expect(url.search).toBe("");
  });

  it("refuses an anonymous reader and reads nothing", async () => {
    resolveSupabaseIdentity.mockResolvedValue({ kind: "anonymous", reason: "no_session" });
    expect(await startBillingPortal()).toEqual({ kind: "refused", reason: "anonymous" });
    expect(readCustomerMapping).not.toHaveBeenCalled();
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("refuses an account with no Stripe Customer, and never creates one", async () => {
    // A never-subscribed account, or an operator comp: there is no Customer, and
    // "managing billing" is not a reason to make one.
    signedInWithCustomer(null);
    expect(await startBillingPortal()).toEqual({ kind: "refused", reason: "no_customer" });
    expect(resolveStripeCustomerId).not.toHaveBeenCalled();
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("refuses a Customer from the other Stripe mode", async () => {
    signedInWithCustomer({ stripeCustomerId: "cus_live", livemode: true });
    expect(await startBillingPortal()).toEqual({ kind: "refused", reason: "mode_mismatch" });
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("reports billing being unconfigured without reading the account", async () => {
    signedInWithCustomer();
    stripeContext.mockReturnValue({ kind: "unavailable", availability: { kind: "unavailable", environment: "development", reason: "not_configured" } });
    expect((await startBillingPortal()).kind).toBe("unavailable");
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("reports a database failure as unavailable, not as anonymous or no-customer", async () => {
    signedInWithCustomer();
    resolveUrdaisAccount.mockRejectedValue(new Error("connection reset"));
    expect((await startBillingPortal()).kind).toBe("unavailable");
    resolveTokenDatabaseUrl.mockReturnValue(null);
    expect((await startBillingPortal()).kind).toBe("unavailable");
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("reports Stripe refusing the session, and does not retry with another Customer", async () => {
    signedInWithCustomer();
    portalCreate.mockRejectedValue(Object.assign(new Error("No configuration provided"), { code: "resource_missing" }));
    const outcome = await startBillingPortal();
    expect(outcome.kind).toBe("unavailable");
    expect(outcome.kind === "unavailable" && outcome.detail).toContain("resource_missing");
    expect(portalCreate).toHaveBeenCalledOnce();
    expect(resolveStripeCustomerId).not.toHaveBeenCalled();
  });

  it("reports a session with no URL as unavailable", async () => {
    signedInWithCustomer();
    portalCreate.mockResolvedValue({ url: null });
    expect((await startBillingPortal()).kind).toBe("unavailable");
  });

  it("opens one session per press and writes nothing", async () => {
    // Repeated opens: one Portal session each, and nothing else -- no Customer, no
    // Checkout, no SQL beyond the account read the mocks stand in for.
    signedInWithCustomer();
    const query = vi.fn().mockResolvedValue({ rows: [] });
    tokenSqlExecutor.mockResolvedValue({ query });
    await startBillingPortal();
    await startBillingPortal();
    expect(portalCreate).toHaveBeenCalledTimes(2);
    expect(resolveStripeCustomerId).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
