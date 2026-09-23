import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { existsSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/components/charts/detailed-market-chart", () => ({ DetailedMarketChart: () => null }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/components/market-detail/market-detail-page", () => ({ MarketDetailPage: () => null }));
vi.mock("@/lib/tokens/read/load", () => ({
  hydrateMarketWithTokenPrices: vi.fn(async (market: unknown) => market),
  tokenResearchPreviewActive: vi.fn(async () => false),
}));
vi.mock("@/lib/ucpi/read/load", () => ({
  hydrateMarketWithListedCompute: vi.fn(async (market: unknown) => market),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import MarketIndexPage, { generateMetadata } from "@/app/markets/[symbol]/page";
import { InformationMarketsSection } from "@/components/home/information-markets-section";
import { SearchModal } from "@/components/layout/search-modal";
import { UtviSection } from "@/components/model-economics/utvi-section";
import {
  PUBLIC_MARKET_CATALOG,
  catalogEntry,
  isPubliclyListed,
  marketHref,
  searchMarketCatalog,
} from "@/data/market-catalog";
import { INDEX_SNAPSHOTS } from "@/data/mock/indices";
import { findMarket } from "@/data/mock/market-detail";
import { assembleIndexRail } from "@/lib/market/index-rail";
import { UTVI_HREF } from "@/lib/routes";
import { UMPI_WATCHLIST_ROW } from "@/lib/umpi/read/watchlist";
import { utviIndexSnapshot } from "@/lib/utvi/read/watchlist";
import { UTVI_DISPLAY_NAME, UTVI_SYMBOL, UTVI_UNIT } from "@/lib/utvi/types";
import type { UtviInstrumentView } from "@/lib/utvi/read/instrument";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

/**
 * UTVI is a first-class Urdais index that lives inside another page.
 *
 * These cover the two doors opened to it -- the indices rail and site search -- and the invariant
 * that neither door leads anywhere new: both resolve to the Volume section of Model Economics,
 * which is where UTVI already was. A `/markets/utvi` page would be a second room, and the last
 * test in each block is there to fail if one ever appears.
 */

/** A production-shaped view: a trillions-scale token count, as the real series carries. */
const VIEW = {
  instrument: {
    id: "utvi",
    shortLabel: UTVI_SYMBOL,
    symbol: UTVI_SYMBOL,
    name: UTVI_DISPLAY_NAME,
    unit: UTVI_UNIT,
    snapshot: { value: 1_512_400_000_000, changePercent: 2.34, asOf: 1_789_000_000 },
    series: { daily: [], intraday: [] },
    availableRanges: [],
    comparisons: [],
  },
} as unknown as UtviInstrumentView;

const rail = () => screen.getByRole("complementary", { name: "Urdais Indices" });

/** The homepage join, as `src/app/page.tsx` performs it, with production returning a UTVI view. */
function homepageRail() {
  return assembleIndexRail(
    [...INDEX_SNAPSHOTS, UMPI_WATCHLIST_ROW, utviIndexSnapshot(VIEW)].filter((row) => row !== null),
  );
}

describe("Journey A: the indices rail", () => {
  it("presents UTVI publicly, in catalog order ahead of the other rail rows", () => {
    expect(isPubliclyListed("UTVI")).toBe(true);
    expect(PUBLIC_MARKET_CATALOG.map((market) => market.symbol)).toEqual([
      "UCPI",
      "UTVI",
      "UMPI",
      "UEPI",
      "UBWI",
    ]);
    // UCPI owns the panel beside the rail rather than a row in it, so UTVI leads the rail.
    expect(homepageRail().map((row) => row.symbol)).toEqual(["UTVI", "UMPI", "UEPI"]);
  });

  it("shows the symbol and the display name on the row", () => {
    render(<InformationMarketsSection indices={homepageRail()} />);
    const row = within(rail()).getByRole("link", { name: /^UTVI\b/ });
    expect(row).toHaveTextContent("UTVI");
    expect(row).toHaveTextContent("Observed Token Volume Index");
  });

  it("quotes the production value compactly, in tokens/day, with its movement", () => {
    render(<InformationMarketsSection indices={homepageRail()} />);
    const row = within(rail()).getByRole("link", { name: /^UTVI\b/ });
    // 1.51T, not 1,512,400,000,000.00 in a column sized for four characters.
    expect(row).toHaveTextContent("1.51T");
    expect(row).toHaveTextContent("tokens/day");
    expect(row.textContent).not.toContain("1,512,400,000,000");
    expect(row).not.toHaveTextContent("Demo data");
    expect(row).not.toHaveTextContent("Not yet live");
  });

  it("links the row to the Volume section of Model Economics, never to /markets/utvi", () => {
    render(<InformationMarketsSection indices={homepageRail()} />);
    const row = within(rail()).getByRole("link", { name: /^UTVI\b/ });
    expect(row).toHaveAttribute("href", "/markets/model-economics#volume");
    expect(row.getAttribute("href")).not.toBe("/markets/utvi");
  });

  it("leaves every other row linking exactly where it did", () => {
    render(<InformationMarketsSection indices={homepageRail()} />);
    for (const [symbol, href] of [
      ["UMPI", "/markets/umpi"],
      ["UEPI", "/markets/uepi"],
    ] as const) {
      expect(within(rail()).getByRole("link", { name: new RegExp(`^${symbol}\\b`) }), symbol).toHaveAttribute(
        "href",
        href,
      );
    }
  });

  it("produces no row at all when production publishes nothing, rather than a placeholder", () => {
    expect(utviIndexSnapshot(null)).toBeNull();
    const withoutUtvi = assembleIndexRail([...INDEX_SNAPSHOTS, UMPI_WATCHLIST_ROW]);
    expect(withoutUtvi.map((row) => row.symbol)).not.toContain("UTVI");
  });
});

describe("Journey B: search", () => {
  function results(query: string) {
    render(<SearchModal open onClose={() => {}} />);
    act(() => {
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: query } });
    });
    const nav = screen.queryByRole("navigation", { name: "Search results" });
    return nav ? Array.from(nav.querySelectorAll("a")) : [];
  }

  it.each(["UTVI", "utvi", "Observed Token Volume Index", "observed token", "token volume"])(
    "finds UTVI for %s",
    (query) => {
      expect(searchMarketCatalog(query).map((market) => market.symbol)).toContain("UTVI");
    },
  );

  it("is the only result for its own ticker, so Enter selects it rather than the page around it", () => {
    const links = results("utvi");
    expect(links).toHaveLength(1);
    expect(links[0]!.textContent).toContain("UTVI");
    expect(links[0]!.textContent).toContain("Observed Token Volume Index");
  });

  it("sends the result to the Volume section of Model Economics, never to /markets/utvi", () => {
    const links = results("UTVI");
    expect(links[0]).toHaveAttribute("href", UTVI_HREF);
    expect(UTVI_HREF).toBe("/markets/model-economics#volume");
    for (const link of links) expect(link.getAttribute("href")).not.toBe("/markets/utvi");
  });

  // Moving the ticker to the index entry must not cost the page its own searches.
  it.each(["model economics", "token price", "market share"])(
    "still finds Model Economics for %s",
    (query) => {
      expect(results(query).length).toBeGreaterThan(0);
    },
  );

  it("keeps the withheld indices unfindable", () => {
    for (const query of ["UGAI", "UAVI", "UACI", "UPPI"]) {
      expect(searchMarketCatalog(query), query).toEqual([]);
    }
  });
});

describe("there is one UTVI, and it is not a market page", () => {
  const root = path.join(__dirname, "..", "..", "..");

  it("has no /markets/utvi route: the symbol resolves to no market", async () => {
    expect(findMarket("utvi")).toBeUndefined();
    expect(findMarket("UTVI")).toBeUndefined();
    await expect(MarketIndexPage({ params: Promise.resolve({ symbol: "utvi" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    // The same answer an unknown symbol gets, and the same metadata: nothing announces a page.
    expect(await generateMetadata({ params: Promise.resolve({ symbol: "utvi" }) })).toEqual(
      await generateMetadata({ params: Promise.resolve({ symbol: "not-a-market" }) }),
    );
  });

  it("is publicly presented without having a market page, which is the point", () => {
    // Being in the public catalog and having a `/markets/{symbol}` page are two different facts.
    expect(isPubliclyListed("UTVI")).toBe(true);
    expect(catalogEntry("UTVI").href).toBe(UTVI_HREF);
    expect(marketHref("UTVI")).toBe(UTVI_HREF);
  });

  it("adds no second UTVI implementation", () => {
    expect(existsSync(path.join(root, "src", "app", "markets", "utvi"))).toBe(false);
    // One section component, and it is the one that was already there.
    expect(existsSync(path.join(root, "src", "components", "model-economics", "utvi-section.tsx"))).toBe(true);
    expect(existsSync(path.join(root, "src", "components", "utvi"))).toBe(false);
  });

  it("renders the canonical section at the id the rail and search link to", () => {
    const { container } = render(<UtviSection view={null} />);
    const section = container.querySelector("#volume");
    expect(section, "the #volume anchor the destination depends on").not.toBeNull();
    expect(section).toHaveTextContent("Observed Token Volume Index");
    expect(UTVI_HREF.endsWith("#volume")).toBe(true);
  });

  it("changes nothing about what UTVI measures", () => {
    // Identity, unit and display name still come from the product's own module.
    expect(UTVI_SYMBOL).toBe("UTVI");
    expect(UTVI_DISPLAY_NAME).toBe("Observed Token Volume Index");
    expect(UTVI_UNIT).toBe("tokens/day");
    expect(catalogEntry("UTVI").name).toBe(UTVI_DISPLAY_NAME);
    // The row is a translation of the production view and derives no value of its own.
    const row = utviIndexSnapshot(VIEW)!;
    expect(row.value).toBe(VIEW.instrument.snapshot.value);
    expect(row.changePercent).toBe(VIEW.instrument.snapshot.changePercent);
    expect(row.asOf).toBe(VIEW.instrument.snapshot.asOf);
    expect(row.unit).toBe(UTVI_UNIT);
    expect(row.provenance).toBe("production");
  });
});

describe("the withheld indices stay withheld", () => {
  it.each(["UGAI", "UAVI", "UACI", "UPPI"])("%s is still not publicly presented", (symbol) => {
    expect(isPubliclyListed(symbol)).toBe(false);
    expect(catalogEntry(symbol).publiclyPresented).toBe(false);
    expect(PUBLIC_MARKET_CATALOG.map((market) => market.symbol)).not.toContain(symbol);
  });

  it.each(["UCPI", "UTVI", "UMPI", "UEPI", "UBWI"])("%s is publicly presented", (symbol) => {
    expect(isPubliclyListed(symbol)).toBe(true);
    expect(catalogEntry(symbol).publiclyPresented).toBe(true);
  });
});
