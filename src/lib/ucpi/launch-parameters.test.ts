import { describe, expect, it } from "vitest";

import {
  HOST_MEMORY_FLOOR_GB_PER_ACCELERATOR,
  bundleEnvelope,
  freshnessOnCalculationDate,
  sellerMedian,
  sellerMinimum,
  sellerRepresentativePrice,
  type CellOffer,
} from "@/lib/ucpi/launch-parameters";

const offer = (acceleratorCount: number, pricePerAcceleratorHour: number, variant?: string): CellOffer => ({
  acceleratorCount,
  pricePerAcceleratorHour,
  variant,
});

describe("seller-level reduction: canonical quantity, then the minimum", () => {
  // A specialist cloud's public tiers on 13 September 2026: the same product at four quantities.
  const tiered = [offer(8, 3.99), offer(4, 4.09), offer(2, 4.19), offer(1, 4.29)];

  it("selects the price at the smallest quantity the seller offers, not the bulk tier", () => {
    const r = sellerRepresentativePrice(tiered);
    expect(r.canonicalQuantity).toBe(1);
    expect(r.representativePrice).toBe(4.29);
    expect(r.consideredCount).toBe(4);
    expect(r.canonicalCount).toBe(1);
  });

  it("differs materially from the bare minimum and from the median on tiered pricing", () => {
    expect(sellerMinimum(tiered)).toBe(3.99);
    expect(sellerMedian(tiered)).toBeCloseTo(4.14, 12);
    expect(sellerRepresentativePrice(tiered).representativePrice).toBe(4.29);
  });

  it("cannot be lowered by adding larger-quantity variants", () => {
    const before = sellerRepresentativePrice([offer(1, 4.29)]).representativePrice;
    const after = sellerRepresentativePrice([offer(1, 4.29), offer(8, 3.0), offer(64, 2.0)]).representativePrice;
    expect(after).toBe(before);
    // The bare minimum would have moved.
    expect(sellerMinimum([offer(1, 4.29), offer(8, 3.0), offer(64, 2.0)])).toBe(2.0);
  });

  it("applies the minimum across tiers, zones and machines at the canonical quantity", () => {
    const twoTiers = [offer(1, 3.49, "secure"), offer(1, 2.69, "community"), offer(8, 3.49, "secure")];
    const r = sellerRepresentativePrice(twoTiers);
    expect(r.representativePrice).toBe(2.69);
    expect(r.selected.variant).toBe("community");
    expect(r.canonicalCount).toBe(2);
  });

  it("is neutral where quantity variants are priced linearly, as marketplace partitions were", () => {
    const linear = [offer(1, 2.0022), offer(2, 2.0022), offer(4, 2.0022)];
    expect(sellerRepresentativePrice(linear).representativePrice).toBe(sellerMinimum(linear));
  });

  it("uses the seller's own smallest quantity when it does not sell singly", () => {
    const r = sellerRepresentativePrice([offer(2, 4.19), offer(4, 4.09)]);
    expect(r.canonicalQuantity).toBe(2);
    expect(r.representativePrice).toBe(4.19);
  });

  it("is order-independent and deterministic", () => {
    const a = sellerRepresentativePrice(tiered).representativePrice;
    const b = sellerRepresentativePrice([...tiered].reverse()).representativePrice;
    expect(a).toBe(b);
  });

  it("rejects an empty cell and malformed offers", () => {
    expect(() => sellerRepresentativePrice([])).toThrow(RangeError);
    expect(() => sellerRepresentativePrice([offer(0, 1)])).toThrow(RangeError);
    expect(() => sellerRepresentativePrice([offer(1, 0)])).toThrow(RangeError);
    expect(() => sellerRepresentativePrice([offer(1.5, 1)])).toThrow(RangeError);
  });
});

describe("bundle envelope: a host-memory floor equal to device memory", () => {
  it("is 80 GB per accelerator", () => {
    expect(HOST_MEMORY_FLOOR_GB_PER_ACCELERATOR).toBe(80);
  });

  it("admits every specialist-cloud bundle observed and the floor itself", () => {
    for (const gb of [125, 200, 225, 240, 256, 80]) expect(bundleEnvelope(gb)).toBe("within");
  });

  it("excludes marketplace bundles below device memory", () => {
    for (const gb of [13.8, 28, 55.4, 79.99]) expect(bundleEnvelope(gb)).toBe("outside");
  });

  it("reports unknown, never a verdict, when host memory is not disclosed", () => {
    expect(bundleEnvelope(null)).toBe("unknown");
    expect(bundleEnvelope(undefined)).toBe("unknown");
  });

  it("rejects nonsense", () => {
    expect(() => bundleEnvelope(-1)).toThrow(RangeError);
    expect(() => bundleEnvelope(Number.NaN)).toThrow(RangeError);
  });
});

describe("freshness: zero carry across calculation dates", () => {
  const day = "2026-09-13";
  const yesterday = "2026-09-12";

  it("is eligible only when both price and availability were observed on the calculation date", () => {
    expect(freshnessOnCalculationDate({ calculationDate: day, priceObservedOn: day, availabilityObservedOn: day })).toBe("eligible");
  });

  it("does not carry yesterday's price under fresh availability", () => {
    expect(freshnessOnCalculationDate({ calculationDate: day, priceObservedOn: yesterday, availabilityObservedOn: day })).toBe("PRICE_STALE");
  });

  it("does not carry yesterday's availability under a fresh price", () => {
    expect(freshnessOnCalculationDate({ calculationDate: day, priceObservedOn: day, availabilityObservedOn: yesterday })).toBe(
      "AVAILABILITY_STALE",
    );
  });

  it("treats both stale as stale, and nothing observed as source unavailable", () => {
    expect(freshnessOnCalculationDate({ calculationDate: day, priceObservedOn: yesterday, availabilityObservedOn: yesterday })).toBe(
      "PRICE_STALE",
    );
    expect(freshnessOnCalculationDate({ calculationDate: day, priceObservedOn: null, availabilityObservedOn: null })).toBe(
      "SOURCE_UNAVAILABLE",
    );
  });

  it("treats a weekend as an ordinary calculation date", () => {
    // 2026-09-13 is a Sunday.
    expect(new Date("2026-09-13T12:00:00Z").getUTCDay()).toBe(0);
    expect(freshnessOnCalculationDate({ calculationDate: day, priceObservedOn: day, availabilityObservedOn: day })).toBe("eligible");
  });
});
