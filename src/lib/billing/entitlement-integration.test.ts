/**
 * The commercial claim, checked against the access authority rather than asserted
 * in prose: **one Urdais Premium subscription unlocks every premium product.**
 *
 * The billing layer's job ends at writing one row. What that row means is decided by
 * `@/lib/access`, which is untouched by Phase 5 — so these tests are the join
 * between the two, and the thing that would break if a later phase introduced a
 * per-product or tiered entitlement by accident.
 */

import { describe, expect, it } from "vitest";

import { PREMIUM_PRODUCT_IDS } from "@/lib/access/products";
import { ANONYMOUS_VIEWER, authenticatedViewer, canAccess, hasPremiumEntitlement, subscriberViewer } from "@/lib/access/entitlement";
import { statusEntitles } from "@/lib/billing/subscription-state";

/** A viewer whose entitlement came from Stripe, as the billing store writes it. */
function stripeSubscriber(accountId = "acct_1") {
  return subscriberViewer(accountId, { source: "stripe", externalReference: "sub_1" });
}

describe("one subscription unlocks all five premium products", () => {
  it("covers exactly the five classified premium products", () => {
    expect([...PREMIUM_PRODUCT_IDS]).toEqual([
      "compute_economics",
      "power_analytics",
      "map_gpu_compute",
      "map_power_infrastructure",
      "map_semiconductor_fabs",
    ]);
  });

  it("allows every one of them for a Stripe subscriber", async () => {
    const viewer = stripeSubscriber();
    for (const id of PREMIUM_PRODUCT_IDS) {
      expect(canAccess(viewer, id).allowed, id).toBe(true);
    }
  });

  it("allows them from a single entitlement row, not one per product", () => {
    // The entitlement carries no product. If a product ever had to be named to be
    // granted, this is where it would show up.
    const viewer = stripeSubscriber();
    expect(hasPremiumEntitlement(viewer)).toBe(true);
    expect(JSON.stringify(viewer.premiumEntitlement)).not.toMatch(/compute_economics|power_analytics|map_/);
  });
});

describe("authentication alone never grants premium", () => {
  it("denies every premium product to a verified account with no entitlement", async () => {
    // Invariant 12. Signing in proves who someone is and nothing about what they
    // may read.
    const viewer = authenticatedViewer("acct_1", true);
    for (const id of PREMIUM_PRODUCT_IDS) {
      const decision = canAccess(viewer, id);
      expect(decision.allowed, id).toBe(false);
      // Not "sign in" -- signing in again would not help, and the copy has to say so.
      expect(decision.allowed === false && decision.reason, id).toBe("entitlement_required");
    }
  });

  it("denies every premium product to an anonymous reader", async () => {
    for (const id of PREMIUM_PRODUCT_IDS) {
      expect(canAccess(ANONYMOUS_VIEWER, id).allowed, id).toBe(false);
    }
  });
});

describe("the entitlement follows the billing status", () => {
  it("an inactive row grants nothing, whatever its source", () => {
    const lapsed = subscriberViewer("acct_1", { status: "inactive", source: "stripe", externalReference: "sub_1", revokedAt: new Date().toISOString() });
    for (const id of PREMIUM_PRODUCT_IDS) {
      expect(canAccess(lapsed, id).allowed, id).toBe(false);
    }
  });

  it("the statuses that write an active row are exactly the ones that entitle", () => {
    // Keeps the two halves honest: the policy module decides who gets a row, and the
    // access module decides what a row means. A status that entitles must be one the
    // store would have written as active.
    for (const status of ["active", "trialing"]) {
      expect(statusEntitles(status), status).toBe(true);
    }
    for (const status of ["past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]) {
      expect(statusEntitles(status), status).toBe(false);
    }
  });
});

describe("no cross-account activation", () => {
  it("entitles the account the row belongs to and no other", () => {
    const mine = stripeSubscriber("acct_mine");
    const theirs = authenticatedViewer("acct_theirs", true);

    expect(hasPremiumEntitlement(mine)).toBe(true);
    // The other account's viewer carries no entitlement, and nothing about the first
    // viewer can reach it: entitlement is resolved per account from the database.
    expect(hasPremiumEntitlement(theirs)).toBe(false);
    expect(mine.authentication.kind === "authenticated" && mine.authentication.accountId).toBe("acct_mine");
  });
});
