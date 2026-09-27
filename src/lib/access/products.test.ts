/**
 * The product registry's classifications, and the drift guards around them.
 *
 * Two kinds of test here. The first states the launch policy outright: these
 * five products are premium and nothing else is. The second is the more
 * valuable half — coverage invariants that fail when a *new* market or map
 * category is added without an access class, which is the realistic way this
 * registry goes wrong six months from now.
 */

import { describe, expect, it } from "vitest";

import {
  PREMIUM_MAP_CATEGORIES,
  PREMIUM_PRODUCT_IDS,
  URDAIS_PRODUCTS,
  findProduct,
  isPremiumMapCategory,
  isPremiumProduct,
  isPublicProduct,
  isRegisteredProduct,
  productForMapCategory,
  type UrdaisProductId,
} from "@/lib/access/products";
import { FACILITY_CATEGORIES } from "@/lib/facilities/domain";
import { MARKET_CATALOG, MARKET_PAGES } from "@/data/market-catalog";

/** The launch premium set, written out rather than derived: this is the policy. */
const EXPECTED_PREMIUM: readonly UrdaisProductId[] = [
  "compute_economics",
  "power_analytics",
  "map_gpu_compute",
  "map_power_infrastructure",
  "map_semiconductor_fabs",
];

describe("premium classification", () => {
  it("marks exactly the five launch products premium", () => {
    expect([...PREMIUM_PRODUCT_IDS].sort()).toEqual([...EXPECTED_PREMIUM].sort());
  });

  for (const id of EXPECTED_PREMIUM) {
    it(`classifies ${id} as premium`, () => {
      expect(findProduct(id)?.accessClass).toBe("premium");
      expect(isPremiumProduct(id)).toBe(true);
      expect(isPublicProduct(id)).toBe(false);
    });
  }

  it("leaves every other registered product public", () => {
    const publicIds = URDAIS_PRODUCTS.filter((p) => p.accessClass === "public").map((p) => p.id);
    expect(publicIds.length).toBe(URDAIS_PRODUCTS.length - EXPECTED_PREMIUM.length);
    for (const id of publicIds) {
      expect(EXPECTED_PREMIUM).not.toContain(id);
      expect(isPublicProduct(id)).toBe(true);
      expect(isPremiumProduct(id)).toBe(false);
    }
  });

  it("keeps the existing index markets and Model Economics public", () => {
    // These are shipping today and this phase must not convert them.
    for (const id of ["market_ucpi", "market_ubwi", "market_uepi", "market_umpi", "model_economics", "docs"] as const) {
      expect(isPublicProduct(id)).toBe(true);
    }
  });
});

describe("unknown identifiers", () => {
  const unknown = ["", "  ", "compute-economics", "computeEconomics", "COMPUTE_ECONOMICS", "market_nope", "__proto__", "toString"];

  for (const id of unknown) {
    it(`does not resolve ${JSON.stringify(id)}`, () => {
      expect(findProduct(id)).toBeNull();
      expect(isRegisteredProduct(id)).toBe(false);
    });
  }

  it("resolves neither null nor undefined nor a non-string", () => {
    expect(findProduct(null)).toBeNull();
    expect(findProduct(undefined)).toBeNull();
    // A caller handing this a parsed query value is the realistic case.
    expect(findProduct(42 as unknown as string)).toBeNull();
  });

  it("fails safe: an unknown id is not public, and is treated as premium", () => {
    // Both must be true. If `isPublicProduct` were the negation of
    // `isPremiumProduct`, one of these would have to be wrong.
    expect(isPublicProduct("market_nope")).toBe(false);
    expect(isPremiumProduct("market_nope")).toBe(true);
  });
});

describe("registry integrity", () => {
  it("has unique ids", () => {
    const ids = URDAIS_PRODUCTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every product a snake_case id and a destination", () => {
    for (const product of URDAIS_PRODUCTS) {
      expect(product.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(product.name.trim()).not.toBe("");
      expect(product.destination.startsWith("/")).toBe(true);
    }
  });

  it("registers every routed index market", () => {
    // A new index added to the catalog without an access class fails here rather
    // than reaching a gate as an unregistered — and therefore denied — product.
    for (const market of MARKET_CATALOG) {
      const id = `market_${market.symbol.toLowerCase()}`;
      expect(findProduct(id), `index ${market.symbol} is not in the access registry`).not.toBeNull();
    }
  });

  it("registers every analytical market page", () => {
    // MARKET_PAGES uses kebab-case route ids; the registry uses snake_case
    // product ids. The mapping is spelled out so a new analytical page cannot be
    // matched by an accident of naming.
    const byPageId: Record<string, UrdaisProductId> = {
      "model-economics": "model_economics",
      "compute-analytics": "compute_economics",
      "power-analytics": "power_analytics",
    };
    for (const page of MARKET_PAGES) {
      const productId = byPageId[page.id];
      expect(productId, `analytical market "${page.id}" has no access product`).toBeDefined();
      expect(findProduct(productId)).not.toBeNull();
    }
    expect(Object.keys(byPageId).length).toBe(MARKET_PAGES.length);
  });

  it("points each product at the route it actually lives on", () => {
    expect(findProduct("compute_economics")?.destination).toBe("/markets/compute-analytics");
    expect(findProduct("power_analytics")?.destination).toBe("/markets/power-analytics");
    expect(findProduct("market_ucpi")?.destination).toBe("/markets/ucpi");
    // A layer has no route of its own, so its destination is the map.
    for (const category of FACILITY_CATEGORIES) {
      expect(productForMapCategory(category).destination).toBe("/map");
    }
  });
});

describe("map layer classification", () => {
  it("keeps the map workspace itself public", () => {
    expect(isPublicProduct("map")).toBe(true);
    expect(isPremiumProduct("map")).toBe(false);
  });

  it("keeps the data centre layer public", () => {
    expect(isPremiumMapCategory("data_center")).toBe(false);
    expect(productForMapCategory("data_center").id).toBe("map_data_centers");
  });

  it("classifies GPU compute clusters as premium", () => {
    expect(productForMapCategory("gpu_compute_cluster").id).toBe("map_gpu_compute");
    expect(isPremiumMapCategory("gpu_compute_cluster")).toBe(true);
  });

  it("classifies power infrastructure as premium", () => {
    expect(productForMapCategory("power_infrastructure").id).toBe("map_power_infrastructure");
    expect(isPremiumMapCategory("power_infrastructure")).toBe(true);
  });

  it("classifies semiconductor fabs as premium", () => {
    expect(productForMapCategory("semiconductor_fab").id).toBe("map_semiconductor_fabs");
    expect(isPremiumMapCategory("semiconductor_fab")).toBe(true);
  });

  it("classifies exactly three of the four categories premium", () => {
    expect([...PREMIUM_MAP_CATEGORIES]).toEqual(["gpu_compute_cluster", "power_infrastructure", "semiconductor_fab"]);
  });

  it("covers every facility category, so a fifth cannot arrive unclassified", () => {
    for (const category of FACILITY_CATEGORIES) {
      expect(() => productForMapCategory(category)).not.toThrow();
      expect(productForMapCategory(category).mapCategory).toBe(category);
    }
    const classified = URDAIS_PRODUCTS.filter((p) => p.mapCategory).length;
    expect(classified).toBe(FACILITY_CATEGORIES.length);
  });
});
