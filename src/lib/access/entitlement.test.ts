/**
 * The access decision, over the full cross-product of reader state and product
 * class. Six of these cases are the specification of what Urdais sells; the rest
 * are the ways a reader could be let in without paying.
 */

import { describe, expect, it } from "vitest";

import {
  ANONYMOUS_VIEWER,
  authenticatedViewer,
  canAccess,
  hasPremiumEntitlement,
  isAccessAllowed,
  isAuthenticated,
  subscriberViewer,
  type Viewer,
} from "@/lib/access/entitlement";
import { PREMIUM_PRODUCT_IDS, URDAIS_PRODUCTS } from "@/lib/access/products";

const PUBLIC_IDS = URDAIS_PRODUCTS.filter((p) => p.accessClass === "public").map((p) => p.id);

describe("the six specified cases", () => {
  it("anonymous + public → allowed", () => {
    expect(canAccess(ANONYMOUS_VIEWER, "model_economics").allowed).toBe(true);
  });

  it("anonymous + premium → denied", () => {
    const decision = canAccess(ANONYMOUS_VIEWER, "compute_economics");
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toBe("authentication_required");
  });

  it("authenticated non-subscriber + public → allowed", () => {
    expect(canAccess(authenticatedViewer(), "model_economics").allowed).toBe(true);
  });

  it("authenticated non-subscriber + premium → denied", () => {
    const decision = canAccess(authenticatedViewer(), "power_analytics");
    expect(decision.allowed).toBe(false);
    // Distinct from the anonymous denial: signing in again would not help, so
    // Phase 2 must send this reader to subscribe rather than to sign-in.
    expect(decision.allowed === false && decision.reason).toBe("entitlement_required");
  });

  it("subscriber + public → allowed", () => {
    expect(canAccess(subscriberViewer(), "market_ucpi").allowed).toBe(true);
  });

  it("subscriber + premium → allowed", () => {
    expect(canAccess(subscriberViewer(), "compute_economics").allowed).toBe(true);
  });
});

describe("across the whole registry", () => {
  const viewers: readonly [string, Viewer][] = [
    ["anonymous", ANONYMOUS_VIEWER],
    ["authenticated", authenticatedViewer()],
    ["subscriber", subscriberViewer()],
  ];

  for (const [label, viewer] of viewers) {
    it(`allows every public product for a ${label} reader`, () => {
      for (const id of PUBLIC_IDS) expect(isAccessAllowed(viewer, id), id).toBe(true);
    });
  }

  it("denies every premium product to an anonymous reader", () => {
    for (const id of PREMIUM_PRODUCT_IDS) expect(isAccessAllowed(ANONYMOUS_VIEWER, id), id).toBe(false);
  });

  it("denies every premium product to a signed-in non-subscriber", () => {
    for (const id of PREMIUM_PRODUCT_IDS) expect(isAccessAllowed(authenticatedViewer(), id), id).toBe(false);
  });

  it("allows every premium product to one subscriber — a single entitlement, not five", () => {
    const viewer = subscriberViewer();
    for (const id of PREMIUM_PRODUCT_IDS) expect(isAccessAllowed(viewer, id), id).toBe(true);
  });

  it("returns the product on an allowed decision and on an entitlement denial", () => {
    const allowed = canAccess(subscriberViewer(), "compute_economics");
    expect(allowed.allowed === true && allowed.product.id).toBe("compute_economics");
    const denied = canAccess(ANONYMOUS_VIEWER, "compute_economics");
    // Phase 2's gate needs the product's name and destination to render copy.
    expect(denied.allowed === false && denied.product?.id).toBe("compute_economics");
  });
});

describe("unknown products", () => {
  it("denies an unknown product to everyone, including a subscriber", () => {
    for (const viewer of [ANONYMOUS_VIEWER, authenticatedViewer(), subscriberViewer()]) {
      const decision = canAccess(viewer, "market_nope");
      expect(decision.allowed).toBe(false);
      expect(decision.allowed === false && decision.reason).toBe("unknown_product");
      expect(decision.allowed === false && decision.product).toBeNull();
    }
  });

  it("denies a null or absent product id", () => {
    expect(isAccessAllowed(subscriberViewer(), null)).toBe(false);
    expect(isAccessAllowed(subscriberViewer(), undefined)).toBe(false);
  });
});

describe("authentication is a precondition of entitlement", () => {
  it("ignores an active entitlement attached to an anonymous viewer", () => {
    // The shape a forged or mis-assembled viewer would take. There is no such
    // thing as an anonymous subscriber, and this is the one place that could be
    // believed.
    const forged: Viewer = {
      authentication: { kind: "anonymous" },
      premiumEntitlement: { status: "active", source: "manual", externalReference: null, grantedAt: "2026-01-01T00:00:00.000Z", revokedAt: null },
    };
    expect(hasPremiumEntitlement(forged)).toBe(false);
    expect(isAccessAllowed(forged, "compute_economics")).toBe(false);
    expect(isAuthenticated(forged)).toBe(false);
  });

  it("denies a lapsed entitlement", () => {
    const lapsed = subscriberViewer("acct", { status: "inactive", revokedAt: "2026-06-01T00:00:00.000Z" });
    expect(hasPremiumEntitlement(lapsed)).toBe(false);
    expect(isAccessAllowed(lapsed, "power_analytics")).toBe(false);
  });

  it("denies a status this build does not recognise", () => {
    // A future migration adding a status, read by an older running build. Wrong
    // in the safe direction: a gate for a subscriber, never data for a
    // non-subscriber.
    const unknownStatus = subscriberViewer("acct", { status: "trialing" as never });
    expect(hasPremiumEntitlement(unknownStatus)).toBe(false);
    expect(isAccessAllowed(unknownStatus, "compute_economics")).toBe(false);
  });

  it("does not gate on email verification in this phase", () => {
    // Recorded, deliberately not enforced. If this ever changes it should be a
    // decision, and this test is what makes it one.
    const unverified = subscriberViewer();
    const viewer: Viewer = { ...unverified, authentication: { kind: "authenticated", accountId: "acct", emailVerified: false } };
    expect(isAccessAllowed(viewer, "compute_economics")).toBe(true);
  });

  it("grants nothing on entitlement source alone", () => {
    // `source` is provenance. Only `status` decides.
    const stripeButInactive = subscriberViewer("acct", { status: "inactive", source: "stripe", externalReference: "sub_123" });
    expect(hasPremiumEntitlement(stripeButInactive)).toBe(false);
  });
});
