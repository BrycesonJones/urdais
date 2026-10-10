/**
 * `/access/complete`'s conversion event and the reader's analytics consent.
 *
 * When this page's reconciliation is what activates access, it records
 * `subscription_completed`. It may name the account only if BOTH the consent
 * recorded on the subscription at checkout and the reader's consent on this request
 * allow it: a reader who declined after starting checkout is not identified.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveViewer = vi.hoisted(() => vi.fn());
const reconcileAccount = vi.hoisted(() => vi.fn());
const requestAnalyticsConsent = vi.hoisted(() => vi.fn());
const recordSubscriptionCompleted = vi.hoisted(() => vi.fn());

vi.mock("@/lib/access/server", () => ({ resolveViewer }));
vi.mock("@/lib/billing/reconcile", () => ({ reconcileAccount }));
vi.mock("@/lib/billing/stripe", () => ({ stripeContext: () => ({ kind: "ready", stripe: {}, availability: { mode: "test" } }) }));
vi.mock("@/lib/tokens/read/database", () => ({
  resolveTokenDatabaseUrl: () => "postgresql://test",
  tokenSqlExecutor: async () => ({ query: vi.fn() }),
}));
vi.mock("@/lib/analytics/request-consent", () => ({ requestAnalyticsConsent }));
vi.mock("@/lib/analytics/server", () => ({ recordSubscriptionCompleted }));

import CheckoutCompleteRoute from "@/app/access/complete/page";

async function visit() {
  try {
    await CheckoutCompleteRoute({ searchParams: Promise.resolve({ session_id: "cs_1" }) });
  } catch {
    // A redirect; irrelevant here.
  }
}

beforeEach(() => {
  resolveViewer.mockResolvedValue({ authentication: { kind: "authenticated", accountId: "acct_1", emailVerified: true }, premiumEntitlement: null });
  reconcileAccount.mockReset();
  requestAnalyticsConsent.mockReset();
  recordSubscriptionCompleted.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const activated = (analyticsConsent: string) => ({ kind: "entitled", subscriptionId: "sub_1", livemode: false, activated: true, analyticsConsent });

describe("subscription_completed from reconciliation", () => {
  it.each([
    ["granted", "granted", "granted"],
    ["granted", "anonymous", "anonymous"], // declined since checkout, default-on region
    ["granted", "none", "none"], // declined since checkout, prior-consent region
    ["anonymous", "granted", "anonymous"], // declined at checkout
    ["none", "granted", "none"],
    ["none", "none", "none"],
  ])("checkout %s + request %s => %s", async (atCheckout, now, expected) => {
    reconcileAccount.mockResolvedValue(activated(atCheckout));
    requestAnalyticsConsent.mockResolvedValue(now);
    await visit();
    expect(recordSubscriptionCompleted).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ consent: expected, via: "reconciliation" }));
  });

  it("is not recorded when the webhook already activated access", async () => {
    reconcileAccount.mockResolvedValue({ ...activated("granted"), activated: false });
    await visit();
    expect(recordSubscriptionCompleted).not.toHaveBeenCalled();
  });
});
