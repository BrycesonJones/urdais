/**
 * `/access/complete` when the reconciliation is what grants access.
 *
 * Uses Next's REAL `redirect`, deliberately. A mocked redirect that merely records
 * its argument cannot tell whether the thrown `NEXT_REDIRECT` escaped the page or
 * was swallowed by a surrounding `try/catch`, and that difference is the bug these
 * tests pin: the redirect sat inside the reconciliation's `try`, its catch logged
 * "reconciliation failed (NEXT_REDIRECT)", and a reader whose payment had just been
 * reconciled was shown "We're confirming your subscription" instead of being sent on.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveViewer = vi.hoisted(() => vi.fn());
const reconcileAccount = vi.hoisted(() => vi.fn());
const stripeContext = vi.hoisted(() => vi.fn());

vi.mock("@/lib/access/server", () => ({ resolveViewer }));
vi.mock("@/lib/billing/reconcile", () => ({ reconcileAccount }));
vi.mock("@/lib/billing/stripe", () => ({ stripeContext }));
vi.mock("@/lib/tokens/read/database", () => ({
  resolveTokenDatabaseUrl: () => "postgresql://test",
  tokenSqlExecutor: async () => ({ query: vi.fn() }),
}));

import CheckoutCompleteRoute from "@/app/access/complete/page";

const SIGNED_IN_UNENTITLED = {
  authentication: { kind: "authenticated", accountId: "acct_1", emailVerified: true },
  premiumEntitlement: null,
};

function visit(params: Record<string, string> = {}) {
  return CheckoutCompleteRoute({ searchParams: Promise.resolve(params) });
}

/** The location a thrown Next redirect points at, or null if `error` is not one. */
function redirectTarget(error: unknown): string | null {
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT")) return null;
  return digest.split(";")[2] ?? null;
}

async function outcome(params: Record<string, string> = {}): Promise<{ redirect: string | null }> {
  try {
    await visit(params);
    return { redirect: null };
  } catch (error) {
    const target = redirectTarget(error);
    if (target === null) throw error;
    return { redirect: target };
  }
}

beforeEach(() => {
  resolveViewer.mockReset().mockResolvedValue(SIGNED_IN_UNENTITLED);
  reconcileAccount.mockReset();
  stripeContext.mockReset().mockReturnValue({ kind: "ready", stripe: {}, availability: { mode: "test" } });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("when this page's reconciliation grants access", () => {
  it("redirects to where the reader was going", async () => {
    reconcileAccount.mockResolvedValue({ kind: "entitled", subscriptionId: "sub_1" });
    expect(await outcome({ session_id: "cs_1", returnTo: "/markets/power-analytics" })).toEqual({ redirect: "/markets/power-analytics" });
  });

  it("redirects to the already-entitled screen when there is no destination", async () => {
    reconcileAccount.mockResolvedValue({ kind: "entitled", subscriptionId: "sub_1" });
    expect(await outcome({ session_id: "cs_1" })).toEqual({ redirect: "/access/subscribed" });
  });

  it("does not report the redirect as a reconciliation failure", async () => {
    reconcileAccount.mockResolvedValue({ kind: "entitled", subscriptionId: "sub_1" });
    await outcome({ session_id: "cs_1" });
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe("unchanged behaviour", () => {
  it("still renders the confirming page when Stripe has nothing entitling yet", async () => {
    reconcileAccount.mockResolvedValue({ kind: "nothing_found" });
    expect(await outcome({ session_id: "cs_1" })).toEqual({ redirect: null });
  });

  it("still swallows a genuine reconciliation failure and renders, logging it", async () => {
    reconcileAccount.mockRejectedValue(new Error("stripe down"));
    expect(await outcome({ session_id: "cs_1" })).toEqual({ redirect: null });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("stripe down"));
  });

  it("still redirects an already-entitled reader before any reconciliation", async () => {
    resolveViewer.mockResolvedValue({ ...SIGNED_IN_UNENTITLED, premiumEntitlement: { status: "active", source: "stripe" } });
    expect(await outcome({ returnTo: "/map" })).toEqual({ redirect: "/map" });
    expect(reconcileAccount).not.toHaveBeenCalled();
  });
});
