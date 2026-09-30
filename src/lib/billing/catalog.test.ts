/**
 * The Stripe Product and Price, and the reconciliation that stops the number a
 * reader sees from drifting away from the number Stripe charges.
 */

import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

import { PREMIUM_PRICE } from "@/lib/access/pricing";
import {
  APPLICATION_VALUE,
  METADATA_ACCOUNT_ID,
  PREMIUM_PRODUCT_KEY,
  PREMIUM_TAX_CODE,
  catalogMetadata,
  describePriceMismatch,
  ensurePremiumCatalog,
  priceMatchesPremium,
} from "@/lib/billing/catalog";

function price(overrides: Partial<Stripe.Price> = {}): Stripe.Price {
  return {
    id: "price_1",
    active: true,
    currency: "usd",
    unit_amount: 8000,
    type: "recurring",
    recurring: { interval: "week", interval_count: 1 },
    metadata: catalogMetadata("test"),
    ...overrides,
  } as unknown as Stripe.Price;
}

describe("reconciling the Price against the copy", () => {
  it("accepts exactly $80 weekly recurring in USD", () => {
    expect(priceMatchesPremium(price())).toBe(true);
    expect(describePriceMismatch(price())).toBeNull();
  });

  it("agrees with @/lib/access/pricing rather than restating it", () => {
    // If the copy changes, this test changes with it. A literal 8000 here would let
    // the two drift silently, which is the exact failure being guarded against.
    expect(priceMatchesPremium(price({ unit_amount: PREMIUM_PRICE.amountMinorUnits }))).toBe(true);
    expect(priceMatchesPremium(price({ unit_amount: PREMIUM_PRICE.amountMinorUnits + 1 }))).toBe(false);
  });

  it("refuses every way a Price can differ, and says which", () => {
    expect(describePriceMismatch(price({ unit_amount: 500 }))).toMatch(/minor units/);
    expect(describePriceMismatch(price({ currency: "eur" }))).toMatch(/EUR/);
    expect(describePriceMismatch(price({ active: false }))).toMatch(/archived/);
    expect(describePriceMismatch(price({ type: "one_time", recurring: null }))).toMatch(/not recurring/);
    expect(describePriceMismatch(price({ recurring: { interval: "month", interval_count: 1 } as Stripe.Price.Recurring }))).toMatch(/month/);
    expect(describePriceMismatch(price({ recurring: { interval: "week", interval_count: 4 } as Stripe.Price.Recurring }))).toMatch(/4 week/);
  });
});

describe("metadata", () => {
  it("identifies the object as Urdais', in this mode, for this product", () => {
    expect(catalogMetadata("test")).toEqual({
      urdais_application: APPLICATION_VALUE,
      urdais_environment: "test",
      urdais_product_key: PREMIUM_PRODUCT_KEY,
    });
  });

  it("carries no PII and no secret", () => {
    const values = Object.values(catalogMetadata("live")).join(" ");
    expect(values).not.toMatch(/@/);
    expect(values).not.toMatch(/sk_|pk_|whsec_/);
  });

  it("keeps the account key separate from catalogue metadata", () => {
    // The account id belongs on Sessions and Subscriptions, not on the shared
    // Product and Price, which are not per-customer objects.
    expect(Object.keys(catalogMetadata("test"))).not.toContain(METADATA_ACCOUNT_ID);
  });
});

describe("discovery before creation", () => {
  function stripeWith(products: unknown[], prices: unknown[]) {
    const create = { product: vi.fn(), price: vi.fn() };
    const update = vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch }));
    return {
      create,
      update,
      stripe: {
        products: {
          list: () => ({ async *[Symbol.asyncIterator]() { for (const p of products) yield p; } }),
          create: create.product.mockResolvedValue({ id: "prod_new", name: "Urdais Premium", tax_code: PREMIUM_TAX_CODE }),
          update,
        },
        prices: {
          list: () => ({ async *[Symbol.asyncIterator]() { for (const p of prices) yield p; } }),
          create: create.price.mockResolvedValue(price({ id: "price_new" })),
        },
      } as unknown as Stripe,
    };
  }

  it("reuses an existing Product and Price, creating neither", async () => {
    // Running setup twice must not leave a test account with two "Urdais Premium"
    // Products and no way to tell which one the application is configured against.
    const existingProduct = { id: "prod_existing", metadata: catalogMetadata("test"), tax_code: PREMIUM_TAX_CODE };
    const { stripe, create } = stripeWith([existingProduct], [price({ id: "price_existing" })]);

    const setup = await ensurePremiumCatalog(stripe, "test");

    expect(setup.product.id).toBe("prod_existing");
    expect(setup.price.id).toBe("price_existing");
    expect(setup.createdProduct).toBe(false);
    expect(setup.createdPrice).toBe(false);
    expect(create.product).not.toHaveBeenCalled();
    expect(create.price).not.toHaveBeenCalled();
  });

  it("creates both when the catalogue is empty, with the tax code Managed Payments requires", async () => {
    const { stripe, create } = stripeWith([], []);
    const setup = await ensurePremiumCatalog(stripe, "test");
    expect(setup.createdProduct).toBe(true);
    expect(setup.createdPrice).toBe(true);
    // Without it, checkout.sessions.create fails outright on this account.
    expect(create.product).toHaveBeenCalledWith(expect.objectContaining({ tax_code: PREMIUM_TAX_CODE }));
    expect(create.price).toHaveBeenCalledWith(
      expect.objectContaining({ unit_amount: 8000, currency: "usd", recurring: { interval: "week", interval_count: 1 } }),
    );
  });

  it("ignores another application's Product with a similar name", async () => {
    // Matching is on metadata, not the name: a Product name is display copy that
    // somebody will reasonably reword.
    const { stripe, create } = stripeWith([{ id: "prod_theirs", name: "Urdais Premium", metadata: {} }], []);
    await ensurePremiumCatalog(stripe, "test");
    expect(create.product).toHaveBeenCalled();
  });

  it("ignores the other mode's objects", async () => {
    // A live Product must not be adopted by a test run, or the modes are already crossed.
    const { stripe, create } = stripeWith([{ id: "prod_live", metadata: catalogMetadata("live") }], []);
    await ensurePremiumCatalog(stripe, "test");
    expect(create.product).toHaveBeenCalled();
  });

  it("corrects an existing Product that is missing the tax code, in place", async () => {
    // A Product created before the tax code was required would make every Checkout
    // fail with an error no reader could act on. Creating a second Product instead
    // would leave the account with two "Urdais Premium" entries.
    const { stripe, create, update } = stripeWith(
      [{ id: "prod_existing", metadata: catalogMetadata("test") }],
      [price({ id: "price_existing" })],
    );

    const setup = await ensurePremiumCatalog(stripe, "test");

    expect(update).toHaveBeenCalledWith("prod_existing", { tax_code: PREMIUM_TAX_CODE });
    expect(create.product).not.toHaveBeenCalled();
    expect(setup.createdProduct).toBe(false);
  });

  it("does not reuse a Price whose amount has drifted", async () => {
    // Metadata matching alone is not enough: an edited Price with the right labels
    // would otherwise be charged.
    const { stripe, create } = stripeWith(
      [{ id: "prod_existing", metadata: catalogMetadata("test"), tax_code: PREMIUM_TAX_CODE }],
      [price({ id: "price_wrong", unit_amount: 100 })],
    );
    await ensurePremiumCatalog(stripe, "test");
    expect(create.price).toHaveBeenCalled();
  });
});
