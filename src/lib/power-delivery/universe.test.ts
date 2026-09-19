import { describe, expect, it } from "vitest";

import { PD2_V1_AREAS, POWER_DELIVERY_UNIVERSE_SLUG } from "@/lib/power-delivery/universe";

describe("PD-2 physical grid universe", () => {
  it("has exactly the locked seven EIA balancing authorities", () => {
    expect(POWER_DELIVERY_UNIVERSE_SLUG).toBe("seven_organized_us_wholesale_markets");
    expect(PD2_V1_AREAS).toHaveLength(7);
    expect(PD2_V1_AREAS.map((area) => area.eiaBaCode)).toEqual(["ERCO", "PJM", "MISO", "SWPP", "CISO", "NYIS", "ISNE"]);
  });

  it("uses physical IDs rather than UEPI instrument IDs", () => {
    expect(PD2_V1_AREAS.every((area) => area.id.startsWith("93000000-") && !area.id.startsWith("power-"))).toBe(true);
  });
});
