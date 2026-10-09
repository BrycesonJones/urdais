import { describe, expect, it } from "vitest";

import { URDAIS_PRODUCTS } from "@/lib/access/products";
import { categoryViewEvent, productProperties } from "@/lib/analytics/events";

describe("productProperties", () => {
  it("takes name and tier from the access registry, so analytics cannot drift from the gate", () => {
    for (const product of URDAIS_PRODUCTS) {
      const properties = productProperties(product.id)!;
      expect(properties.product_name).toBe(product.name);
      expect(properties.access_tier).toBe(product.accessClass);
    }
  });

  it("categorises indexes, analytical products and the map", () => {
    expect(productProperties("market_ucpi")?.product_category).toBe("index");
    expect(productProperties("compute_economics")?.product_category).toBe("analytics");
    expect(productProperties("power_analytics")?.product_category).toBe("analytics");
    expect(productProperties("model_economics")?.product_category).toBe("analytics");
    expect(productProperties("map")?.product_category).toBe("map");
    expect(productProperties("map_gpu_compute")?.product_category).toBe("map");
  });

  it("maps each category to its view event", () => {
    expect(categoryViewEvent("index")).toBe("index_viewed");
    expect(categoryViewEvent("analytics")).toBe("analytics_viewed");
    expect(categoryViewEvent("map")).toBe("map_viewed");
    expect(categoryViewEvent("docs")).toBeNull();
  });
});
