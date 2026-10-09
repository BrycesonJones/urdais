/**
 * The Portal Server Action: what each outcome does to the reader.
 *
 * The rule under test is that no failure ever turns into a purchase: a reader who
 * cannot open billing management stays on the account page with a true message,
 * and is never redirected to Checkout or given a new Customer.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const startBillingPortal = vi.hoisted(() => vi.fn());
const startCheckout = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
);

vi.mock("@/lib/billing/checkout", () => ({ startBillingPortal, startCheckout }));
const recordCheckoutStarted = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/analytics/server", () => ({ recordCheckoutStarted }));

import { openBillingPortalAction, startCheckoutAction } from "@/app/access/billing-actions";
import { IDLE_AUTH_STATE } from "@/app/auth/form-state";

const press = (form = new FormData()) => openBillingPortalAction(IDLE_AUTH_STATE, form);

beforeEach(() => {
  startBillingPortal.mockReset();
  startCheckout.mockReset();
  redirect.mockClear();
  recordCheckoutStarted.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("openBillingPortalAction", () => {
  it("redirects to Stripe's Portal URL", async () => {
    startBillingPortal.mockResolvedValue({ kind: "redirect", url: "https://billing.stripe.com/p/session/x" });
    await expect(press()).rejects.toThrow("NEXT_REDIRECT:https://billing.stripe.com/p/session/x");
  });

  it("reads nothing from the submission: a forged Customer, account or return is ignored", async () => {
    startBillingPortal.mockResolvedValue({ kind: "redirect", url: "https://billing.stripe.com/p/session/x" });
    const forged = new FormData();
    forged.set("customer", "cus_someone_else");
    forged.set("accountId", "acct_someone_else");
    forged.set("subscription", "sub_someone_else");
    forged.set("returnTo", "https://evil.test");
    await expect(press(forged)).rejects.toThrow("NEXT_REDIRECT:https://billing.stripe.com/p/session/x");
    expect(startBillingPortal).toHaveBeenCalledWith();
  });

  it("sends a reader whose session ended to sign in, back to the account", async () => {
    startBillingPortal.mockResolvedValue({ kind: "refused", reason: "anonymous" });
    await expect(press()).rejects.toThrow(`NEXT_REDIRECT:/access/login?returnTo=${encodeURIComponent("/account")}`);
  });

  it("tells an account with no Customer so, and offers no purchase", async () => {
    startBillingPortal.mockResolvedValue({ kind: "refused", reason: "no_customer" });
    const state = await press();
    expect(state).toEqual({ status: "error", message: "There is no billing account to manage yet. Nothing has been changed." });
    expect(redirect).not.toHaveBeenCalled();
    expect(startCheckout).not.toHaveBeenCalled();
  });

  for (const outcome of [
    { kind: "refused", reason: "mode_mismatch" },
    { kind: "unavailable", detail: "portal session refused by Stripe: resource_missing" },
  ]) {
    it(`reports ${outcome.kind} truthfully, without internal detail, and never falls back to Checkout`, async () => {
      startBillingPortal.mockResolvedValue(outcome);
      const state = await press();
      expect(state.status).toBe("error");
      expect(state.status === "error" && state.message).toContain("Nothing has been changed.");
      expect(state.status === "error" && state.message).not.toMatch(/resource_missing|mode|STRIPE|cus_/);
      expect(redirect).not.toHaveBeenCalled();
      expect(startCheckout).not.toHaveBeenCalled();
    });
  }
});

describe("startCheckoutAction and checkout_started", () => {
  const start = (returnTo = "/markets/power-analytics") => {
    const form = new FormData();
    form.set("returnTo", returnTo);
    return startCheckoutAction(IDLE_AUTH_STATE, form);
  };

  it("records checkout_started once Stripe has created a Session, for the server-resolved account", async () => {
    startCheckout.mockResolvedValue({ kind: "redirect", url: "https://checkout.stripe.com/c/pay/cs_1", accountId: "acct_1" });
    await expect(start()).rejects.toThrow("NEXT_REDIRECT:https://checkout.stripe.com/c/pay/cs_1");
    expect(recordCheckoutStarted).toHaveBeenCalledExactlyOnceWith("acct_1", "/markets/power-analytics");
  });

  it("records nothing when checkout was refused or unavailable", async () => {
    startCheckout.mockResolvedValue({ kind: "refused", reason: "already_entitled" });
    await expect(start()).rejects.toThrow("NEXT_REDIRECT");
    startCheckout.mockResolvedValue({ kind: "unavailable", detail: "no key" });
    await start();
    expect(recordCheckoutStarted).not.toHaveBeenCalled();
  });
});
