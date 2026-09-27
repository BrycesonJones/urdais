/**
 * Price presentation.
 *
 * Small but worth pinning: the amount is stored the way Stripe counts it, so Phase 5
 * reconciles a number against a number rather than parsing "$80/week" out of prose.
 */

import { describe, expect, it } from "vitest";

import {
  PREMIUM_PRICE,
  PREMIUM_PRODUCT_NAME,
  PREMIUM_TRIAL_NOTE,
  formatPremiumAmount,
  formatPremiumPrice,
  premiumPriceHeadline,
} from "@/lib/access/pricing";

describe("the current price", () => {
  it("is $80 per week with no trial", () => {
    expect(PREMIUM_PRICE.amountMinorUnits).toBe(8000);
    expect(PREMIUM_PRICE.currency).toBe("USD");
    expect(PREMIUM_PRICE.interval).toBe("week");
    expect(PREMIUM_PRICE.trial).toBe(false);
  });

  it("is stored in minor units, as Stripe counts them", () => {
    // So Phase 5 compares 8000 to a Stripe Price's unit_amount rather than reading a
    // formatted string back out of the UI.
    expect(Number.isInteger(PREMIUM_PRICE.amountMinorUnits)).toBe(true);
  });
});

describe("formatting", () => {
  it("renders whole dollars without decimals", () => {
    expect(formatPremiumAmount()).toBe("$80");
    expect(formatPremiumPrice()).toBe("$80/week");
    expect(premiumPriceHeadline()).toBe("Urdais Premium — $80/week");
  });

  it("renders cents when there are cents", () => {
    expect(formatPremiumAmount({ ...PREMIUM_PRICE, amountMinorUnits: 7950 })).toBe("$79.50");
  });

  it("names the product consistently", () => {
    expect(premiumPriceHeadline()).toContain(PREMIUM_PRODUCT_NAME);
    expect(PREMIUM_PRODUCT_NAME).toBe("Urdais Premium");
  });
});

describe("what the copy does not claim", () => {
  it("says there is no trial, plainly", () => {
    expect(PREMIUM_TRIAL_NOTE).toBe("No free trial.");
  });

  it("implies no billing terms that have not been established", () => {
    // No tax, proration, renewal or cancellation language: none of it is settled, and
    // a sentence implying terms that do not exist is worse than no sentence.
    const copy = `${premiumPriceHeadline()} ${PREMIUM_TRIAL_NOTE}`.toLowerCase();
    for (const forbidden of ["tax", "vat", "prorat", "renew", "cancel", "refund", "plus", "billed annually"]) {
      expect(copy, forbidden).not.toContain(forbidden);
    }
  });
});
