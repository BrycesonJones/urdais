/**
 * The Account Hub read model.
 *
 * What these pin: the hub reads the account the *session* names and no other; it
 * reads billing from the local reconciled table and never from Stripe; it writes
 * nothing to billing; and a failure to read is reported as a failure, never as
 * "never subscribed".
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveSupabaseIdentity = vi.hoisted(() => vi.fn());
const resolveUrdaisAccount = vi.hoisted(() => vi.fn());
const loadPremiumEntitlement = vi.hoisted(() => vi.fn());
const resolveTokenDatabaseUrl = vi.hoisted(() => vi.fn());
const tokenSqlExecutor = vi.hoisted(() => vi.fn());
const billingAvailability = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/identity", () => ({ resolveSupabaseIdentity }));
vi.mock("@/lib/auth/accounts", () => ({ resolveUrdaisAccount }));
vi.mock("@/lib/access/entitlement-store", () => ({ loadPremiumEntitlement }));
vi.mock("@/lib/tokens/read/database", () => ({ resolveTokenDatabaseUrl, tokenSqlExecutor }));
vi.mock("@/lib/billing/mode", () => ({ billingAvailability }));
// Any Stripe client construction during a hub read is a failure.
vi.mock("@/lib/billing/stripe", () => ({
  stripeContext: () => {
    throw new Error("the account hub must not reach Stripe");
  },
}));

import { ACCOUNT_SUBSCRIPTIONS_QUERY, resolveAccountHub } from "@/lib/account/hub";

type Query = { text: string; params: unknown[] };
let queries: Query[];
let subscriptionRows: Record<string, unknown>[] | Error;

const sql = {
  query: vi.fn(async (text: string, params: unknown[]) => {
    queries.push({ text, params });
    if (subscriptionRows instanceof Error) throw subscriptionRows;
    return { rows: subscriptionRows };
  }),
};

const signedIn = (email = "reader@example.invalid") =>
  resolveSupabaseIdentity.mockResolvedValue({ kind: "authenticated", identity: { subject: "sub-1", email, emailVerified: true } });

const entitlement = (status: "active" | "inactive", source: "stripe" | "manual" = "stripe") =>
  loadPremiumEntitlement.mockResolvedValue({ status, source, externalReference: "sub_x", grantedAt: "2026-09-01T00:00:00Z", revokedAt: null });

beforeEach(() => {
  for (const m of [resolveSupabaseIdentity, resolveUrdaisAccount, loadPremiumEntitlement, resolveTokenDatabaseUrl, tokenSqlExecutor, billingAvailability]) {
    m.mockReset();
  }
  queries = [];
  subscriptionRows = [];
  resolveTokenDatabaseUrl.mockReturnValue("postgresql://local/test");
  tokenSqlExecutor.mockResolvedValue(sql);
  resolveUrdaisAccount.mockResolvedValue({ id: "acct-session", email: "reader@example.invalid" });
  loadPremiumEntitlement.mockResolvedValue(null);
  billingAvailability.mockReturnValue({ kind: "available", priceId: "price_canonical", mode: "test" });
});

describe("who is asked about", () => {
  it("is anonymous without a session, and reads nothing", async () => {
    resolveSupabaseIdentity.mockResolvedValue({ kind: "anonymous", reason: "no_session" });
    expect(await resolveAccountHub()).toEqual({ kind: "anonymous" });
    expect(resolveUrdaisAccount).not.toHaveBeenCalled();
    expect(queries).toHaveLength(0);
  });

  it("treats an unreachable Auth server as anonymous, exposing nothing", async () => {
    resolveSupabaseIdentity.mockResolvedValue({ kind: "anonymous", reason: "provider_error" });
    expect((await resolveAccountHub()).kind).toBe("anonymous");
  });

  it("reads the account the session names, and only that account", async () => {
    signedIn();
    await resolveAccountHub();
    expect(resolveUrdaisAccount).toHaveBeenCalledWith(sql, { subject: "sub-1", email: "reader@example.invalid", emailVerified: true });
    expect(loadPremiumEntitlement).toHaveBeenCalledWith(sql, "acct-session");
    expect(queries).toEqual([{ text: ACCOUNT_SUBSCRIPTIONS_QUERY, params: ["acct-session"] }]);
  });

  it("takes no arguments, so there is nothing to point it elsewhere", () => {
    expect(resolveAccountHub.length).toBe(0);
  });
});

describe("states", () => {
  it("never subscribed", async () => {
    signedIn();
    const hub = await resolveAccountHub();
    expect(hub).toEqual({
      kind: "ready",
      profile: { email: "reader@example.invalid", emailVerified: true },
      subscription: { kind: "none" },
      action: { kind: "subscribe", label: "Subscribe" },
    });
  });

  it("active", async () => {
    signedIn();
    entitlement("active");
    subscriptionRows = [{ status: "active", stripe_price_id: "price_canonical", cancel_at_period_end: false, current_period_end: new Date("2026-10-08T00:00:00Z") }];
    const hub = await resolveAccountHub();
    expect(hub.kind === "ready" && hub.subscription).toEqual({ kind: "active", priceLabel: "$80/week", cancellationScheduled: false, endsAt: null });
  });

  it("canceled, with a revoked entitlement", async () => {
    signedIn();
    entitlement("inactive");
    subscriptionRows = [{ status: "canceled", stripe_price_id: "price_validation", cancel_at_period_end: false, current_period_end: null }];
    const hub = await resolveAccountHub();
    expect(hub.kind === "ready" && hub.subscription).toEqual({ kind: "canceled" });
    expect(hub.kind === "ready" && hub.action).toEqual({ kind: "subscribe", label: "Subscribe again" });
  });

  it("past_due", async () => {
    signedIn();
    entitlement("inactive");
    subscriptionRows = [{ status: "past_due", stripe_price_id: "price_canonical", cancel_at_period_end: false, current_period_end: null }];
    const hub = await resolveAccountHub();
    expect(hub.kind === "ready" && hub.subscription).toEqual({ kind: "payment_issue", status: "past_due" });
    expect(hub.kind === "ready" && hub.action).toEqual({ kind: "manage", label: "Manage billing" });
  });
});

describe("failure is not absence", () => {
  it("no database: the account is unavailable, and no subscription state is claimed", async () => {
    signedIn();
    resolveTokenDatabaseUrl.mockReturnValue(null);
    expect(await resolveAccountHub()).toEqual({ kind: "unavailable", profile: { email: "reader@example.invalid", emailVerified: true } });
  });

  it("account provisioning fails: unavailable, not 'none'", async () => {
    signedIn();
    resolveUrdaisAccount.mockRejectedValue(new Error("connection reset"));
    expect((await resolveAccountHub()).kind).toBe("unavailable");
  });

  it("entitlement read fails: unavailable, not 'none'", async () => {
    signedIn();
    loadPremiumEntitlement.mockRejectedValue(new Error("timeout"));
    expect((await resolveAccountHub()).kind).toBe("unavailable");
  });

  it("billing read fails: the account renders, the subscription says it could not be read", async () => {
    signedIn();
    subscriptionRows = new Error("relation does not exist");
    const hub = await resolveAccountHub();
    expect(hub.kind).toBe("ready");
    expect(hub.kind === "ready" && hub.subscription).toEqual({ kind: "unavailable", reason: "read_failed" });
    expect(hub.kind === "ready" && hub.action).toBeNull();
  });

  it("billing not configured: the hub still renders from local state", async () => {
    signedIn();
    billingAvailability.mockReturnValue({ kind: "unavailable", reason: "missing" });
    entitlement("active");
    subscriptionRows = [{ status: "active", stripe_price_id: "price_canonical", cancel_at_period_end: false, current_period_end: null }];
    const hub = await resolveAccountHub();
    // Active, from the reconciled table; only the price label, which needs the
    // configured Price to verify, is withheld.
    expect(hub.kind === "ready" && hub.subscription).toEqual({ kind: "active", priceLabel: null, cancellationScheduled: false, endsAt: null });
  });
});

describe("read-only", () => {
  it("issues only a SELECT against billing", async () => {
    signedIn();
    await resolveAccountHub();
    for (const { text } of queries) {
      expect(text.trim().toLowerCase().startsWith("select"), text).toBe(true);
      expect(text).not.toMatch(/\b(insert|update|delete|upsert)\b/i);
    }
  });

  it("imports no Stripe client and no write path", () => {
    const code = readFileSync(path.join(__dirname, "hub.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/from "stripe"|@\/lib\/billing\/stripe|@\/lib\/billing\/checkout|@\/lib\/billing\/customers|@\/lib\/billing\/store/);
    expect(code).not.toMatch(/stripe\.(customers|checkout|subscriptions|billingPortal)/);
    expect(code).not.toMatch(/\b(insert into|update identity|delete from)\b/i);
  });
});
