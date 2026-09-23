import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/components/market-detail/market-detail-page", () => ({ MarketDetailPage: () => null }));

// notFound() throws in Next; the mock keeps that contract without pulling the router in.
const NOT_FOUND = new Error("NEXT_NOT_FOUND");
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));

vi.mock("@/lib/tokens/read/load", () => ({
  hydrateMarketWithTokenPrices: vi.fn(async (market: unknown) => market),
  tokenResearchPreviewActive: vi.fn(async () => false),
}));
vi.mock("@/lib/ucpi/read/load", () => ({
  hydrateMarketWithListedCompute: vi.fn(async (market: unknown) => market),
}));

import MarketIndexPage, { generateMetadata } from "@/app/markets/[symbol]/page";

/*
 * The public UPPI route after the Photonics close-out.
 *
 * PH-3 concluded DEFERRED_PENDING_DATA_RIGHTS. A deferred index is not presented as a current
 * Urdais product, so /markets/uppi answers the way this route already answers for a product a
 * reader cannot open -- a 404 -- rather than rendering a placeholder describing an index Urdais
 * does not publish. See docs/research/photonics/ph-3-closeout.md.
 */
describe("/markets/uppi after the Photonics close-out", () => {
  it("is a 404 for a reader, in every casing the route accepts", async () => {
    for (const symbol of ["uppi", "UPPI", "Uppi"]) {
      await expect(MarketIndexPage({ params: Promise.resolve({ symbol }) })).rejects.toBe(NOT_FOUND);
    }
  });

  it("answers the same way an unknown symbol does, so the deferral leaks nothing", async () => {
    await expect(
      MarketIndexPage({ params: Promise.resolve({ symbol: "not-a-market" }) }),
    ).rejects.toBe(NOT_FOUND);
    expect(await generateMetadata({ params: Promise.resolve({ symbol: "uppi" }) })).toEqual(
      await generateMetadata({ params: Promise.resolve({ symbol: "not-a-market" }) }),
    );
  });

  it("does not name the deferred index in page metadata", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ symbol: "uppi" }) });
    expect(metadata.title).toBe("Not found");
    expect(JSON.stringify(metadata)).not.toMatch(/photonics/i);
  });

  it("still serves the indices that do publish", async () => {
    // Not UACI: it is withheld too now, for its own reason rather than the Photonics one.
    // See src/app/markets/hidden-indices.test.tsx.
    for (const symbol of ["ucpi", "uepi"]) {
      await expect(
        MarketIndexPage({ params: Promise.resolve({ symbol }) }),
      ).resolves.toBeTruthy();
      const metadata = await generateMetadata({ params: Promise.resolve({ symbol }) });
      expect(metadata.title).not.toBe("Not found");
    }
  });
});
