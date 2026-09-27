/**
 * Compute Economics: the gate runs before the loader.
 *
 * This is the phase's central security test, and it is deliberately not a test of
 * what the page *looks* like. The wrong implementation renders identically:
 *
 *     const model = await loadComputeEconomicsReadModel();
 *     return denied ? <Locked/> : <Product model={model}/>;
 *
 * That page shows the same lock to the same reader — and ships every price to them
 * in the RSC payload, behind a blur they can delete in developer tools. A visual
 * assertion cannot tell the two apart. Two things can: whether the loader was
 * invoked at all, and whether a sentinel value from it survives into the rendered
 * output.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadComputeEconomicsReadModel = vi.hoisted(() => vi.fn());
const resolvePremiumGate = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
}));

vi.mock("@/lib/compute-economics/load", () => ({ loadComputeEconomicsReadModel }));
vi.mock("@/lib/access/server", () => ({ resolvePremiumGate }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => null }));
// Renders the model it is given, so anything that reaches it is findable in the HTML.
vi.mock("@/components/compute-analytics/compute-analytics-page", () => ({
  ComputeAnalyticsPage: ({ model }: { model: unknown }) => <pre>{JSON.stringify(model)}</pre>,
}));

import ComputeAnalyticsRoute from "@/app/markets/compute-analytics/page";
import { findProduct } from "@/lib/access/products";

/** A value that exists nowhere else, so finding it in the output proves a leak. */
const SENTINEL = "SENTINEL-PREMIUM-PRICE-3f9a21";

const PREMIUM_MODEL = {
  generatedAt: "2026-09-27T00:00:00.000Z",
  instruments: [{ symbol: SENTINEL, listedPriceUsdPerHour: 3.628 }],
  unavailableReason: null,
};

const product = findProduct("compute_economics")!;

beforeEach(() => {
  loadComputeEconomicsReadModel.mockReset().mockResolvedValue(PREMIUM_MODEL);
  resolvePremiumGate.mockReset();
  notFound.mockClear();
});

afterEach(() => vi.unstubAllEnvs());

async function render() {
  return renderToStaticMarkup(await ComputeAnalyticsRoute());
}

describe("enforcement active, reader denied", () => {
  for (const reason of ["authentication_required", "entitlement_required"] as const) {
    describe(reason, () => {
      beforeEach(() => {
        resolvePremiumGate.mockResolvedValue({ enforced: true, allowed: false, reason, product });
      });

      it("never calls the premium loader", async () => {
        await render();
        // The assertion. No loader call means no query ran and there is no model in
        // existence to serialise.
        expect(loadComputeEconomicsReadModel).not.toHaveBeenCalled();
      });

      it("leaks no premium value into the rendered output", async () => {
        const html = await render();
        expect(html).not.toContain(SENTINEL);
        expect(html).not.toContain("3.628");
      });

      it("renders the access-required gate", async () => {
        const html = await render();
        expect(html).toContain("ACCESS REQUIRED");
        expect(html).toContain("This page requires an Urdais subscription.");
        expect(html).toContain("Get Full Access");
      });

      it("keeps the product identifiable behind the gate", async () => {
        // A locked page that will not say what it is cannot be evaluated by the
        // person deciding whether to pay for it.
        const html = await render();
        expect(html).toContain("Compute Economics");
        expect(html).toContain("Premium product");
      });

      it("carries a returnTo pointing at this product", async () => {
        const html = await render();
        expect(html).toContain(`returnTo=${encodeURIComponent("/markets/compute-analytics")}`);
      });
    });
  }

  it("offers sign-in only to a reader who is not signed in", async () => {
    resolvePremiumGate.mockResolvedValue({ enforced: true, allowed: false, reason: "authentication_required", product });
    expect(await render()).toContain("Sign in");

    resolvePremiumGate.mockResolvedValue({ enforced: true, allowed: false, reason: "entitlement_required", product });
    // Already signed in: offering sign-in again would be nonsense.
    expect(await render()).not.toContain("Sign in");
  });
});

describe("enforcement active, reader allowed", () => {
  beforeEach(() => {
    resolvePremiumGate.mockResolvedValue({ enforced: true, allowed: true, product });
  });

  it("calls the loader and renders the real product", async () => {
    const html = await render();
    expect(loadComputeEconomicsReadModel).toHaveBeenCalledOnce();
    expect(html).toContain(SENTINEL);
  });

  it("renders no gate", async () => {
    expect(await render()).not.toContain("ACCESS REQUIRED");
  });
});

describe("enforcement inactive — current production behaviour", () => {
  beforeEach(() => {
    resolvePremiumGate.mockResolvedValue({ enforced: false, allowed: true });
  });

  it("serves the real product, as it did before Phase 3", async () => {
    const html = await render();
    expect(loadComputeEconomicsReadModel).toHaveBeenCalledOnce();
    expect(html).toContain(SENTINEL);
    expect(html).not.toContain("ACCESS REQUIRED");
  });
});

describe("an unregistered product", () => {
  it("is a not-found condition, not an upsell", async () => {
    resolvePremiumGate.mockResolvedValue({ enforced: true, allowed: false, reason: "unknown_product", product: null });

    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
    // And it still must not have loaded anything.
    expect(loadComputeEconomicsReadModel).not.toHaveBeenCalled();
  });
});
