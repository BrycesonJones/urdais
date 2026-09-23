import { act, fireEvent, render, screen } from "@testing-library/react";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/components/charts/detailed-market-chart", () => ({ DetailedMarketChart: () => null }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/lib/tokens/read/load", () => ({
  hydrateMarketWithTokenPrices: vi.fn(async (market: unknown) => market),
  tokenResearchPreviewActive: vi.fn(async () => false),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import MarketIndexPage, { generateMetadata } from "@/app/markets/[symbol]/page";
import { SearchModal } from "@/components/layout/search-modal";
import { MARKET_CATALOG, catalogEntry, isPubliclyListed } from "@/data/market-catalog";
import { MARKETS, findMarket } from "@/data/mock/market-detail";

/**
 * UGAI, UAVI and UACI are not productized. This file is the public-surface half of that
 * decision: they are absent from the catalog the frontend presents, unreachable by route, and
 * unfindable by search or by any cross-index menu.
 *
 * The other half is that nothing about them was deleted, which the last block asserts. A future
 * change that "cleans up" the backend for these three should fail here rather than pass quietly.
 */

// jsdom implements <dialog> markup but none of its methods, and the search modal is built on
// them. The stubs are the minimum the component touches.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

// UPPI is withheld too, for a different reason -- production deferred pending data rights, per
// the Photonics close-out -- through the same single mechanism. Its own preservation is asserted
// in src/data/photonics-closeout.test.ts; it appears here because the mechanism is one mechanism.
const WITHHELD = ["UGAI", "UAVI", "UACI", "UPPI"] as const;
const PRESENTED = ["UCPI", "UMPI", "UEPI", "UBWI"] as const;

const params = (symbol: string) => ({ params: Promise.resolve({ symbol }) });

describe("the public routes of the withheld indices", () => {
  it.each(WITHHELD)("serves %s as a 404, in both the uppercase and the routed form", async (symbol) => {
    await expect(MarketIndexPage(params(symbol))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(MarketIndexPage(params(symbol.toLowerCase()))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each(WITHHELD)("gives %s the not-found title, so the tab and link preview name no product", async (symbol) => {
    expect(await generateMetadata(params(symbol.toLowerCase()))).toEqual({ title: "Not found" });
  });

  it("404s them for the product decision, not because their data is missing", () => {
    // UAVI, UACI and UPPI still have market definitions in the dataset: the route refuses them
    // anyway. If these ever read `undefined`, the route tests above have started passing for
    // another reason.
    for (const symbol of ["uavi", "uaci", "uppi"]) expect(findMarket(symbol), symbol).toBeDefined();
    for (const symbol of WITHHELD) expect(isPubliclyListed(symbol), symbol).toBe(false);
  });

  it("leaves an unknown symbol a 404 as before", async () => {
    await expect(MarketIndexPage(params("nonsense"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await generateMetadata(params("nonsense"))).toEqual({ title: "Not found" });
  });

  it("keeps the presented indices routable and titled", async () => {
    for (const symbol of PRESENTED) {
      expect(isPubliclyListed(symbol)).toBe(true);
      const entry = catalogEntry(symbol);
      expect(await generateMetadata(params(symbol.toLowerCase()))).toEqual({
        title: `${entry.symbol} · ${entry.name}`,
      });
    }
  });
});

describe("search as a discovery surface", () => {
  function results(query: string) {
    render(<SearchModal open onClose={() => {}} />);
    const box = screen.getByRole("searchbox");
    act(() => {
      fireEvent.change(box, { target: { value: query } });
    });
    const nav = screen.queryByRole("navigation", { name: "Search results" });
    return nav ? Array.from(nav.querySelectorAll("a")).map((link) => link.textContent ?? "") : [];
  }

  it.each(["UGAI", "UAVI", "UACI", "UPPI", "Global AI", "Volatility", "Chip", "Photonics"])(
    "returns nothing for %s",
    (query) => {
      expect(results(query)).toEqual([]);
    },
  );

  it("still finds a presented index", () => {
    expect(results("UCPI").join(" ")).toContain("UCPI");
  });

  it("names none of them when the search is opened with an empty query", () => {
    render(<SearchModal open onClose={() => {}} />);
    const text = screen.getByRole("dialog").textContent ?? "";
    for (const term of [
      "UGAI",
      "UAVI",
      "UACI",
      "Urdais Global AI Index",
      "Urdais AI Volatility Index",
      "Urdais Chip & Accelerator Index",
      "Urdais Photonics Price Index",
    ]) {
      expect(text, term).not.toContain(term);
    }
  });
});

describe("cross-index comparison menus", () => {
  const labelsOf = (symbol: string) =>
    findMarket(symbol)!
      .families.flatMap((family) => family.instruments)
      .flatMap((instrument) => instrument.comparisons.map((option) => option.label));

  it("offers none of the withheld indices as a comparison on any market", () => {
    for (const market of MARKETS) {
      const labels = market.families
        .flatMap((family) => family.instruments)
        .flatMap((instrument) => instrument.comparisons.map((option) => option.label));
      for (const symbol of WITHHELD) expect(labels, `${market.symbol} → ${symbol}`).not.toContain(symbol);
    }
  });

  it("still offers the presented indices, so the cross-index menu was narrowed and not emptied", () => {
    // UACI is the one market whose instrument compares across indices. Its own page is a 404
    // now, but its definition is preserved, and what it offers is what the builder produces:
    // the presented indices that carry a series, and no withheld one.
    expect(labelsOf("UACI")).toEqual(["UCPI", "UEPI"]);
  });
});

/**
 * One publication mechanism, not two.
 *
 * Two branches independently built this concept -- a per-entry flag and a set of deferred
 * symbols -- and they were converged onto the flag. These assert that nothing of the second
 * mechanism survives, because a second list of withheld markets is a list that drifts.
 */
describe("there is exactly one market-publication source of truth", () => {
  const root = path.join(__dirname, "..", "..", "..");

  it("derives every public view from the catalog entry's own flag", () => {
    for (const market of MARKET_CATALOG) {
      expect(isPubliclyListed(market.symbol), market.symbol).toBe(market.publiclyPresented);
    }
    expect(MARKET_CATALOG.filter((market) => !market.publiclyPresented).map((market) => market.symbol)).toEqual([
      "UGAI",
      "UAVI",
      "UPPI",
      "UACI",
    ]);
  });

  it("keeps no second list of withheld symbols anywhere in the source", () => {
    // Assembled rather than written out, so this file does not match its own search.
    const superseded = ["DEFERRED", "MARKET", "SYMBOLS"].join("_");
    const sources = execSync("git ls-files src", { cwd: root, encoding: "utf8" }).trim().split("\n");
    for (const file of sources) {
      const contents = readFileSync(path.join(root, file), "utf8");
      expect(contents, `${file} names the superseded deferred-symbol set`).not.toContain(superseded);
    }
  });
});

/**
 * Hiding a product must not become losing it. These assert the work behind the three indices is
 * still here: their catalog identity, their server routes, their read models, their methodology
 * documents and their database migrations.
 */
describe("the backend of the withheld indices is intact", () => {
  const root = path.join(__dirname, "..", "..", "..");

  it("keeps their identity and route in the canonical catalog", () => {
    for (const symbol of WITHHELD) {
      expect(MARKET_CATALOG.some((market) => market.symbol === symbol)).toBe(true);
      expect(catalogEntry(symbol).href).toBe(`/markets/${symbol.toLowerCase()}`);
    }
  });

  it("keeps the UGAI and UAVI API routes", () => {
    for (const route of ["ugai/route.ts", "ugai/series/route.ts", "uavi/route.ts", "uavi/series/route.ts"]) {
      expect(existsSync(path.join(root, "src", "app", "api", route)), route).toBe(true);
    }
  });

  it("keeps the UGAI and UAVI read models loadable and honest about publishing nothing", async () => {
    const ugai = await import("@/lib/ugai/read/read-model");
    const uavi = await import("@/lib/uavi/read/read-model");
    expect(ugai.unconfiguredUgaiReadModel().level).toBeNull();
    expect(uavi.unconfiguredUaviReadModel().level).toBeNull();
  });

  it("keeps their calculation and ingestion libraries", () => {
    for (const dir of ["ugai", "uavi"]) {
      expect(existsSync(path.join(root, "src", "lib", dir)), dir).toBe(true);
      expect(readdirSync(path.join(root, "src", "lib", dir)).length).toBeGreaterThan(0);
    }
  });

  it("keeps their methodology documents", () => {
    for (const doc of ["ugai.md", "uavi.md", "ai-equity-universe.md"]) {
      expect(existsSync(path.join(root, "docs", "methodology", doc)), doc).toBe(true);
    }
  });

  it("keeps every UGAI and UAVI migration, and adds none", () => {
    const migrations = readdirSync(path.join(root, "supabase", "migrations"));
    for (const migration of [
      "20260917240000_ugai_calculation_engine.sql",
      "20260917240100_ugai_calculation_diagnostic.sql",
      "20260917250000_uavi_options_foundation.sql",
      "20260917250100_uavi_calculation_engine.sql",
      "20260917250200_uavi_diagnostic.sql",
    ]) {
      expect(migrations, migration).toContain(migration);
    }
    // Withholding a product from the frontend is a presentation change. Nothing about it needs
    // a schema change, and a migration named for one of these would be the first sign that a
    // "cleanup" reached the database.
    expect(migrations.filter((name) => /hide|withdraw|drop_ugai|drop_uavi|drop_uaci/i.test(name))).toEqual([]);
  });
});
