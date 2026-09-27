/**
 * The activation boundary.
 *
 * Two properties carry this phase. The default must be inactive, because the
 * failure mode of getting that wrong is a live product paywalled with no way to
 * buy it. And the decision must come from the server's environment alone, because
 * anything a browser can influence is a public bypass into every premium product.
 */

import { describe, expect, it } from "vitest";

import {
  PREMIUM_ENFORCEMENT_ACTIVE_VALUE,
  PREMIUM_ENFORCEMENT_VAR,
  UNENFORCED_GATE,
  gateFor,
  isEnforcedPremiumProduct,
  isPremiumEnforcementActive,
  premiumEnforcement,
} from "@/lib/access/activation";
import { ANONYMOUS_VIEWER, authenticatedViewer, subscriberViewer } from "@/lib/access/entitlement";
import { PREMIUM_PRODUCT_IDS } from "@/lib/access/products";

const ON = { [PREMIUM_ENFORCEMENT_VAR]: PREMIUM_ENFORCEMENT_ACTIVE_VALUE };

describe("the default", () => {
  it("is inactive when the variable is absent", () => {
    expect(premiumEnforcement({})).toBe("inactive");
    expect(isPremiumEnforcementActive({})).toBe(false);
  });

  it("is inactive for every value that is not exactly 'active'", () => {
    // Each of these is a plausible thing an operator might type. None of them
    // paywalls the site: turning this on is a commercial decision and should
    // require the word, not a guess at the spelling.
    for (const value of ["", " ", "true", "1", "on", "yes", "enabled", "ACTIVE!", "inactive", "activate", "false", "0"]) {
      expect(premiumEnforcement({ [PREMIUM_ENFORCEMENT_VAR]: value }), JSON.stringify(value)).toBe("inactive");
    }
  });

  it("accepts 'active' with surrounding space and any casing", () => {
    for (const value of ["active", "ACTIVE", " Active ", "\tactive\n"]) {
      expect(premiumEnforcement({ [PREMIUM_ENFORCEMENT_VAR]: value }), JSON.stringify(value)).toBe("active");
    }
  });

  it("is not a NEXT_PUBLIC_ variable, so it never reaches the browser bundle", () => {
    expect(PREMIUM_ENFORCEMENT_VAR.startsWith("NEXT_PUBLIC_")).toBe(false);
  });
});

describe("the gate, with enforcement inactive", () => {
  it("allows every premium product to every reader", () => {
    for (const viewer of [ANONYMOUS_VIEWER, authenticatedViewer(), subscriberViewer()]) {
      for (const id of PREMIUM_PRODUCT_IDS) {
        expect(gateFor(id, viewer, {}), id).toEqual(UNENFORCED_GATE);
      }
    }
  });

  it("reports itself as unenforced rather than as an entitlement", () => {
    // A caller must be able to tell "nobody is checking" from "this reader is
    // entitled". Conflating them is how a later phase ends up filtering the map
    // for a subscriber.
    const gate = gateFor("compute_economics", subscriberViewer(), {});
    expect(gate.enforced).toBe(false);
  });

  it("reports no product as enforced-premium", () => {
    for (const id of PREMIUM_PRODUCT_IDS) expect(isEnforcedPremiumProduct(id, {}), id).toBe(false);
  });
});

describe("the gate, with enforcement active", () => {
  it("denies an anonymous reader every premium product", () => {
    for (const id of PREMIUM_PRODUCT_IDS) {
      const gate = gateFor(id, ANONYMOUS_VIEWER, ON);
      expect(gate.enforced, id).toBe(true);
      expect(gate.allowed, id).toBe(false);
      expect(gate.allowed === false && gate.reason, id).toBe("authentication_required");
    }
  });

  it("denies a signed-in non-subscriber, with the reason that sends them to subscribe", () => {
    for (const id of PREMIUM_PRODUCT_IDS) {
      const gate = gateFor(id, authenticatedViewer(), ON);
      expect(gate.allowed, id).toBe(false);
      expect(gate.allowed === false && gate.reason, id).toBe("entitlement_required");
    }
  });

  it("allows a subscriber every premium product from one entitlement", () => {
    const viewer = subscriberViewer();
    for (const id of PREMIUM_PRODUCT_IDS) {
      const gate = gateFor(id, viewer, ON);
      expect(gate.allowed, id).toBe(true);
      expect(gate.enforced, id).toBe(true);
    }
  });

  it("still allows every public product", () => {
    for (const id of ["map", "map_data_centers", "model_economics", "market_ucpi", "docs"] as const) {
      expect(gateFor(id, ANONYMOUS_VIEWER, ON).allowed, id).toBe(true);
    }
  });

  it("denies an unregistered product to everyone, including a subscriber", () => {
    const gate = gateFor("market_nope", subscriberViewer(), ON);
    expect(gate.allowed).toBe(false);
    expect(gate.allowed === false && gate.reason).toBe("unknown_product");
    expect(gate.allowed === false && gate.product).toBeNull();
  });

  it("reports premium products as enforced and public ones as not", () => {
    for (const id of PREMIUM_PRODUCT_IDS) expect(isEnforcedPremiumProduct(id, ON), id).toBe(true);
    expect(isEnforcedPremiumProduct("map", ON)).toBe(false);
    // An unregistered id is not "enforced premium" — it has no product to enforce.
    expect(isEnforcedPremiumProduct("market_nope", ON)).toBe(false);
  });
});

describe("one switch for everything", () => {
  it("is the same decision for a page product, an API product and the map", () => {
    // The failure the brief names: activating the visual gate while forgetting the
    // API. There is one function and one variable, so the three cannot disagree.
    const viewer = authenticatedViewer();
    const page = gateFor("compute_economics", viewer, ON);
    const api = gateFor("power_analytics", viewer, ON);
    const layer = gateFor("map_gpu_compute", viewer, ON);

    for (const gate of [page, api, layer]) {
      expect(gate.enforced).toBe(true);
      expect(gate.allowed).toBe(false);
    }
  });

  it("turns all three off together", () => {
    for (const id of ["compute_economics", "power_analytics", "map_gpu_compute"] as const) {
      expect(gateFor(id, ANONYMOUS_VIEWER, {}).enforced, id).toBe(false);
    }
  });
});
