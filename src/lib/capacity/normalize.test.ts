import { describe, expect, it } from "vitest";

import {
  availabilityOnly,
  exactQuantity,
  mapAvailabilityWord,
  quantityRange,
  toAccelerators,
  unknownCapacity,
} from "@/lib/capacity/normalize";

describe("exact quantity observations", () => {
  it("records a stated count", () => {
    const result = exactQuantity(128, "accelerator");
    expect(result.ok).toBe(true);
    expect(result.ok && result.measurement).toEqual({
      kind: "exact_quantity",
      quantity: 128,
      unit: "accelerator",
      state: null,
    });
  });

  it("treats zero available as an observation, not as missing data", () => {
    // A source that was asked and said none has told us something real.
    const result = exactQuantity(0, "accelerator");
    expect(result.ok).toBe(true);
    expect(result.ok && result.measurement).toMatchObject({ kind: "exact_quantity", quantity: 0 });
  });

  it("refuses a fractional count rather than rounding it", () => {
    expect(exactQuantity(12.5, "accelerator")).toEqual({
      ok: false,
      reason: "quantity is not an integer",
    });
  });

  it("refuses a negative count", () => {
    expect(exactQuantity(-1, "accelerator").ok).toBe(false);
  });

  it("refuses NaN rather than storing it as a number", () => {
    expect(exactQuantity(Number.NaN, "accelerator").ok).toBe(false);
  });
});

describe("range observations", () => {
  it("records stated bounds", () => {
    const result = quantityRange(50, 100, "accelerator");
    expect(result.ok && result.measurement).toEqual({
      kind: "quantity_range",
      min: 50,
      max: 100,
      unit: "accelerator",
      state: null,
    });
  });

  it("promotes a degenerate range to an exact quantity", () => {
    // The source stated one number; storing it as a range would understate precision.
    const result = quantityRange(64, 64, "accelerator");
    expect(result.ok && result.measurement.kind).toBe("exact_quantity");
  });

  it("refuses an inverted range", () => {
    expect(quantityRange(100, 50, "accelerator").ok).toBe(false);
  });
});

describe("availability-only observations", () => {
  it("records a state and carries no quantity of any kind", () => {
    const result = availabilityOnly("available");
    expect(result.ok).toBe(true);
    const measurement = result.ok ? result.measurement : null;
    expect(measurement).toEqual({ kind: "availability_state", state: "available" });
    // The property that matters: there is no number here to be mistaken for one.
    expect(measurement).not.toHaveProperty("quantity");
    expect(measurement).not.toHaveProperty("min");
    expect(measurement).not.toHaveProperty("max");
  });

  it("refuses to record 'unknown' as an availability state", () => {
    // Tier 4 is not Tier 3. Admitting it here would put a source that said
    // nothing into the count of sources reporting availability.
    const result = availabilityOnly("unknown");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/Tier 4/);
  });
});

describe("unknown observations", () => {
  it("is not zero", () => {
    const measurement = unknownCapacity();
    expect(measurement).toEqual({ kind: "unknown" });
    expect(measurement).not.toHaveProperty("quantity");
  });
});

describe("availability wording", () => {
  it.each([
    ["available", "available"],
    ["High", "available"],
    ["low", "limited"],
    ["Sold Out", "sold_out"],
    ["out_of_stock", "sold_out"],
    ["contact sales", "quote_required"],
  ])("maps %s to %s", (word, expected) => {
    expect(mapAvailabilityWord(word)).toBe(expected);
  });

  it("returns null for wording it does not recognize rather than guessing", () => {
    // "low" and "sold out" are one word apart and opposite; a nearest-match
    // would be wrong in the most expensive direction.
    expect(mapAvailabilityWord("some availability, enquire")).toBeNull();
    expect(mapAvailabilityWord("")).toBeNull();
    expect(mapAvailabilityWord(null)).toBeNull();
  });
});

describe("unit conversion", () => {
  it("converts nodes to accelerators where the ratio is evidenced", () => {
    const nodes = exactQuantity(4, "node");
    const converted = toAccelerators(nodes.ok ? nodes.measurement : unknownCapacity(), 8);
    expect(converted).toMatchObject({ kind: "exact_quantity", quantity: 32, unit: "accelerator" });
  });

  it("refuses to convert without an evidenced ratio", () => {
    const nodes = exactQuantity(4, "node");
    expect(toAccelerators(nodes.ok ? nodes.measurement : unknownCapacity(), null)).toBeNull();
  });

  it("never converts an availability state into a count", () => {
    const state = availabilityOnly("available");
    expect(toAccelerators(state.ok ? state.measurement : unknownCapacity(), 8)).toBeNull();
  });

  it("never converts an unknown into a count", () => {
    expect(toAccelerators(unknownCapacity(), 8)).toBeNull();
  });
});
