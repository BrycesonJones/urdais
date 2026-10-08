/**
 * The gate's words and the gate's links.
 *
 * Two things worth testing rather than reviewing by eye: that an unregistered
 * product can never be turned into an upsell, and that the map's layer list is
 * derived from the registry rather than written out — a sentence naming the wrong
 * layers is the kind of error that survives review for months.
 */

import { describe, expect, it } from "vitest";

import { GATE_CTA_LABEL, GATE_TITLE, gateCopy, gateProductName, premiumMapLayerNames } from "@/lib/access/gate-copy";
import { ACCESS_ENTRY_HREF, SIGN_IN_HREF, accessHref, signInHref } from "@/lib/access/gate-links";
import { PREMIUM_MAP_CATEGORIES, productForMapCategory } from "@/lib/access/products";

describe("the proposition", () => {
  it("is the same offer on a page and on a map layer", () => {
    const page = gateCopy("authentication_required", "page");
    const layer = gateCopy("authentication_required", "map_layer");

    expect(page.title).toBe(GATE_TITLE);
    expect(layer.title).toBe(GATE_TITLE);
    expect(page.ctaLabel).toBe(GATE_CTA_LABEL);
    expect(layer.ctaLabel).toBe(GATE_CTA_LABEL);
  });

  it("names the right surface", () => {
    expect(gateCopy("authentication_required", "page").lead).toBe("This page requires an Urdais subscription.");
    expect(gateCopy("authentication_required", "map_layer").lead).toBe("This map layer requires an Urdais subscription.");
  });

  it("says one subscription unlocks everything", () => {
    expect(gateCopy("entitlement_required", "page").body).toBe(
      "Full access unlocks this product and every premium product across Urdais.",
    );
  });

  it("spells Urdais correctly, not UrDais or URDAIS", () => {
    for (const surface of ["page", "map_layer"] as const) {
      const copy = gateCopy("authentication_required", surface);
      const text = `${copy.lead} ${copy.body}`;
      expect(text).toContain("Urdais");
      expect(text).not.toMatch(/UrDais|URDAIS/);
    }
  });
});

describe("the secondary action", () => {
  it("offers sign-in to a reader who is not signed in", () => {
    expect(gateCopy("authentication_required", "page").secondary).toEqual({ label: "Sign in" });
  });

  it("offers nothing to a reader who is already signed in", () => {
    // They have an account and no entitlement; signing in again achieves nothing.
    expect(gateCopy("entitlement_required", "page").secondary).toBeNull();
  });
});

describe("an unregistered product is never an upsell", () => {
  it("throws rather than inventing a proposition", () => {
    for (const surface of ["page", "map_layer"] as const) {
      expect(() => gateCopy("unknown_product", surface)).toThrow(/not an upsell/);
    }
  });

  it("has no product name to show", () => {
    expect(gateProductName("market_nope")).toBeNull();
    expect(gateProductName(null)).toBeNull();
  });
});

describe("the map layer list", () => {
  it("names exactly the premium layers, from the registry", () => {
    const names = premiumMapLayerNames();
    for (const category of PREMIUM_MAP_CATEGORIES) {
      expect(names).toContain(productForMapCategory(category).name);
    }
    // The public layer must not be advertised as something to buy.
    expect(names).not.toContain(productForMapCategory("data_center").name);
  });

  it("reads as a list, with an Oxford comma", () => {
    expect(premiumMapLayerNames()).toBe("GPU Compute Clusters, Power Infrastructure, and Semiconductor Fabs");
  });

  it("appears in the map gate's body copy", () => {
    expect(gateCopy("authentication_required", "map_layer").body).toContain(premiumMapLayerNames());
  });
});

describe("where the buttons go", () => {
  it("sends the reader to the access entry point, carrying where they were", () => {
    expect(accessHref("/markets/compute-analytics")).toBe(`${ACCESS_ENTRY_HREF}?returnTo=%2Fmarkets%2Fcompute-analytics`);
    expect(signInHref("/markets/power-analytics")).toBe(`${SIGN_IN_HREF}?returnTo=%2Fmarkets%2Fpower-analytics`);
  });

  it("omits an empty returnTo rather than sending them to the root explicitly", () => {
    expect(accessHref(null)).toBe(ACCESS_ENTRY_HREF);
    expect(accessHref("/")).toBe(ACCESS_ENTRY_HREF);
    expect(signInHref(undefined)).toBe(SIGN_IN_HREF);
  });

  it("sanitises the destination even though callers normally supply a trusted one", () => {
    // The map builds its returnTo at request time, and a sanitiser applied only to
    // input believed to be untrusted eventually misses a case.
    for (const hostile of ["https://evil.test/phish", "//evil.test", "/\\evil.test", "javascript:alert(1)"]) {
      expect(accessHref(hostile), hostile).toBe(ACCESS_ENTRY_HREF);
      expect(signInHref(hostile), hostile).toBe(SIGN_IN_HREF);
    }
  });

  it("preserves a map layer destination", () => {
    expect(accessHref("/map?layer=gpu_compute_cluster")).toBe(
      `${ACCESS_ENTRY_HREF}?returnTo=${encodeURIComponent("/map?layer=gpu_compute_cluster")}`,
    );
  });

  it("refuses an auth route as a destination, so the CTA cannot loop", () => {
    expect(accessHref("/auth/sign-in")).toBe(ACCESS_ENTRY_HREF);
    expect(signInHref("/access/login")).toBe(SIGN_IN_HREF);
  });

  it("sends 'Sign in' to the passwordless sign-in screen, not the old password form", () => {
    // Phase 7A. The gate's secondary link was how readers reached `/auth/sign-in`.
    expect(SIGN_IN_HREF).toBe("/access/login");
    expect(signInHref("/markets/power-analytics")).toBe(`/access/login?returnTo=${encodeURIComponent("/markets/power-analytics")}`);
    expect(signInHref("/map?layer=gpu_compute_cluster")).toBe(
      `/access/login?returnTo=${encodeURIComponent("/map?layer=gpu_compute_cluster")}`,
    );
  });

  it("sends the primary call to action to premium discovery", () => {
    expect(ACCESS_ENTRY_HREF).toBe("/access/discover");
  });
});
