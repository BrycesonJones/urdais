/**
 * The Phase 5 handoff, and the three readers it must refuse.
 *
 * This is the boundary Stripe will be attached to, so its refusals matter more than
 * its successes. A checkout session created for an anonymous reader belongs to
 * nobody; one created for an existing subscriber is a duplicate charge and a refund
 * conversation. Both are cheap to prevent here and expensive to discover later.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveViewer = vi.hoisted(() => vi.fn());
vi.mock("@/lib/access/server", () => ({ resolveViewer }));

import { ANONYMOUS_VIEWER, authenticatedViewer, subscriberViewer } from "@/lib/access/entitlement";
import { resolveCheckoutHandoff } from "@/lib/onboarding/checkout-handoff";

beforeEach(() => resolveViewer.mockReset());

describe("a verified reader without an entitlement", () => {
  beforeEach(() => resolveViewer.mockResolvedValue(authenticatedViewer("acct-42", true)));

  it("is ready, and carries the account id the server resolved", async () => {
    const handoff = await resolveCheckoutHandoff("/markets/compute-analytics");
    expect(handoff).toEqual({ kind: "ready", accountId: "acct-42", returnTo: "/markets/compute-analytics" });
  });

  it("carries null when they arrived without a destination", async () => {
    expect(await resolveCheckoutHandoff(null)).toMatchObject({ returnTo: null });
    expect(await resolveCheckoutHandoff(undefined)).toMatchObject({ returnTo: null });
  });

  it("sanitises the destination rather than passing it through", async () => {
    // Phase 5 will put this in a redirect after payment; an unsanitised value there
    // is an open redirect on the highest-intent page in the product.
    const handoff = await resolveCheckoutHandoff("https://evil.test/phish");
    expect(handoff).toMatchObject({ kind: "ready", returnTo: null });
  });
});

describe("the readers it refuses", () => {
  it("refuses an anonymous reader", async () => {
    resolveViewer.mockResolvedValue(ANONYMOUS_VIEWER);
    expect(await resolveCheckoutHandoff(null)).toEqual({ kind: "refused", reason: "anonymous" });
  });

  it("refuses an unverified account", async () => {
    resolveViewer.mockResolvedValue(authenticatedViewer("acct-1", false));
    expect(await resolveCheckoutHandoff(null)).toEqual({ kind: "refused", reason: "unverified" });
  });

  it("refuses an existing subscriber, so a second subscription cannot be started", async () => {
    resolveViewer.mockResolvedValue(subscriberViewer("acct-1"));
    expect(await resolveCheckoutHandoff(null)).toEqual({ kind: "refused", reason: "already_entitled" });
  });

  it("checks entitlement before verification", async () => {
    // An entitled reader on an unconfirmed address has nothing to buy; reporting
    // "unverified" would invite Phase 5 to walk them toward a duplicate purchase.
    resolveViewer.mockResolvedValue({
      authentication: { kind: "authenticated", accountId: "acct-1", emailVerified: false },
      premiumEntitlement: { status: "active", source: "manual", externalReference: null, grantedAt: "2026-01-01T00:00:00.000Z", revokedAt: null },
    });
    expect(await resolveCheckoutHandoff(null)).toEqual({ kind: "refused", reason: "already_entitled" });
  });

  it("treats a lapsed entitlement as a reader who may subscribe again", async () => {
    resolveViewer.mockResolvedValue(subscriberViewer("acct-7", { status: "inactive", revokedAt: "2026-06-01T00:00:00.000Z" }));
    expect(await resolveCheckoutHandoff(null)).toMatchObject({ kind: "ready", accountId: "acct-7" });
  });
});

describe("what it never accepts", () => {
  it("takes no account id from its caller", async () => {
    // The signature is the guarantee: there is no parameter through which a browser
    // could name the account a checkout session is created against.
    expect(resolveCheckoutHandoff.length).toBeLessThanOrEqual(1);
  });

  it("derives the account only from the resolved viewer", async () => {
    resolveViewer.mockResolvedValue(authenticatedViewer("acct-from-session", true));
    const handoff = await resolveCheckoutHandoff("/markets/power-analytics");
    expect(handoff.kind === "ready" && handoff.accountId).toBe("acct-from-session");
    expect(resolveViewer).toHaveBeenCalledOnce();
  });
});
