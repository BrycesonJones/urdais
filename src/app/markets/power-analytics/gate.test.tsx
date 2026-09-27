/**
 * Power Analytics: the gate runs before any of the five loaders.
 *
 * This page reads five independent models, so it has five chances to leak. The
 * assertion that covers all of them at once is that a denied reader never causes a
 * database connection to be opened — no connection means no query, no model, and
 * nothing to serialise into the RSC payload.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createTokenSqlExecutor = vi.hoisted(() => vi.fn());
const resolvePremiumGate = vi.hoisted(() => vi.fn());
const loadDeliveryGapReadModel = vi.hoisted(() => vi.fn());
const loadQueueAnalytics = vi.hoisted(() => vi.fn());
const loadTransmissionAnalytics = vi.hoisted(() => vi.fn());
const loadGridBuildoutReadModel = vi.hoisted(() => vi.fn());
const loadFlexibleCapacityReadModel = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
}));

const SENTINEL = "SENTINEL-PREMIUM-GRID-7b41cc";

vi.mock("@/lib/access/server", () => ({ resolvePremiumGate }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/tokens/read/database", () => ({ createTokenSqlExecutor }));
vi.mock("@/lib/power-delivery/gap/read", () => ({
  loadDeliveryGapReadModel,
  unconfiguredDeliveryGapReadModel: () => ({ status: "unconfigured" }),
}));
vi.mock("@/lib/interconnection-queue/analytics/read", () => ({
  loadQueueAnalytics,
  unavailableQueueAnalytics: () => ({ status: "unavailable" }),
}));
vi.mock("@/lib/transmission-headroom/analytics/read", () => ({
  loadTransmissionAnalytics,
  unavailableTransmissionModel: () => ({ status: "unavailable" }),
}));
vi.mock("@/lib/grid-buildout/analytics/read", () => ({
  loadGridBuildoutReadModel,
  unavailableGridBuildoutModel: () => ({ status: "unavailable" }),
}));
vi.mock("@/lib/flexible-capacity/analytics/read", () => ({
  loadFlexibleCapacityReadModel,
  unavailableFlexibleCapacityModel: () => ({ status: "unavailable" }),
}));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/components/power-analytics/power-analytics-page", () => ({
  PowerAnalyticsPage: (props: Record<string, unknown>) => <pre>{JSON.stringify(props)}</pre>,
}));

import PowerAnalyticsRoute from "@/app/markets/power-analytics/page";
import { findProduct } from "@/lib/access/products";

const product = findProduct("power_analytics")!;

const ALL_LOADERS = [
  loadDeliveryGapReadModel,
  loadQueueAnalytics,
  loadTransmissionAnalytics,
  loadGridBuildoutReadModel,
  loadFlexibleCapacityReadModel,
];

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture/urdais");
  createTokenSqlExecutor.mockReset().mockResolvedValue({ query: vi.fn(), end: vi.fn() });
  resolvePremiumGate.mockReset();
  notFound.mockClear();
  for (const loader of ALL_LOADERS) loader.mockReset().mockResolvedValue({ marker: SENTINEL });
});

afterEach(() => vi.unstubAllEnvs());

async function render() {
  return renderToStaticMarkup(await PowerAnalyticsRoute());
}

describe("enforcement active, reader denied", () => {
  for (const reason of ["authentication_required", "entitlement_required"] as const) {
    describe(reason, () => {
      beforeEach(() => {
        resolvePremiumGate.mockResolvedValue({ enforced: true, allowed: false, reason, product });
      });

      it("opens no database connection", async () => {
        await render();
        // Covers all five loaders at once, and is stronger than checking each: with
        // no connection there is nothing any of them could have read.
        expect(createTokenSqlExecutor).not.toHaveBeenCalled();
      });

      it("calls none of the five loaders", async () => {
        await render();
        for (const loader of ALL_LOADERS) expect(loader).not.toHaveBeenCalled();
      });

      it("leaks no premium value into the rendered output", async () => {
        expect(await render()).not.toContain(SENTINEL);
      });

      it("renders the access-required gate", async () => {
        const html = await render();
        expect(html).toContain("ACCESS REQUIRED");
        expect(html).toContain("This page requires an Urdais subscription.");
        expect(html).toContain("Get Full Access");
        expect(html).toContain("Power Analytics");
      });

      it("carries a returnTo pointing at this product", async () => {
        expect(await render()).toContain(`returnTo=${encodeURIComponent("/markets/power-analytics")}`);
      });
    });
  }
});

describe("enforcement active, reader allowed", () => {
  beforeEach(() => {
    resolvePremiumGate.mockResolvedValue({ enforced: true, allowed: true, product });
  });

  it("loads all five models and renders the product", async () => {
    const html = await render();
    expect(createTokenSqlExecutor).toHaveBeenCalledOnce();
    for (const loader of ALL_LOADERS) expect(loader).toHaveBeenCalledOnce();
    expect(html).toContain(SENTINEL);
    expect(html).not.toContain("ACCESS REQUIRED");
  });
});

describe("enforcement inactive — current production behaviour", () => {
  beforeEach(() => {
    resolvePremiumGate.mockResolvedValue({ enforced: false, allowed: true });
  });

  it("serves the real product, as it did before Phase 3", async () => {
    const html = await render();
    for (const loader of ALL_LOADERS) expect(loader).toHaveBeenCalledOnce();
    expect(html).toContain(SENTINEL);
    expect(html).not.toContain("ACCESS REQUIRED");
  });
});

describe("an unregistered product", () => {
  it("is a not-found condition and loads nothing", async () => {
    resolvePremiumGate.mockResolvedValue({ enforced: true, allowed: false, reason: "unknown_product", product: null });
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(createTokenSqlExecutor).not.toHaveBeenCalled();
  });
});
