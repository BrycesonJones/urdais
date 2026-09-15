import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/charts/detailed-market-chart", () => ({ DetailedMarketChart: () => null }));

import { MarketDetailPage } from "@/components/market-detail/market-detail-page";
import { findMarket } from "@/data/mock/market-detail";
import { tokenInstrumentsFromSeries, withTokenInstruments } from "@/lib/tokens/read/instruments";
import { listPublicTokenSeries } from "@/lib/tokens/read/series";
import { seedTokenReadCatalog } from "@/lib/tokens/read/test-support";

describe("MarketDetailPage Tokens family", () => {
  it("fails closed on Tokens when no publicable series exist", () => {
    render(<MarketDetailPage market={findMarket("ucpi")!} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("UCPI-H100");
    fireEvent.click(screen.getByRole("button", { name: "Tokens" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tokens");
    expect(screen.queryByText("$9.00")).toBeNull();
    expect(screen.queryByText("Demo data")).toBeNull();
    expect(screen.queryByText("research_usable")).toBeNull();
    expect(screen.queryByText("under_review")).toBeNull();
  });

  it("shows a canonical token series when the family is hydrated", () => {
    const instruments = tokenInstrumentsFromSeries(
      listPublicTokenSeries(
        seedTokenReadCatalog([
          { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z" },
        ]),
      ),
    );
    const market = withTokenInstruments(findMarket("ucpi")!, instruments);
    render(<MarketDetailPage market={market} />);
    fireEvent.click(screen.getByRole("button", { name: "Tokens" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Claude Sonnet 5 · Input");
    expect(screen.getByText("$2.00")).toBeInTheDocument();
    expect(screen.getByText("per 1M input tokens")).toBeInTheDocument();
    expect(screen.queryByText("Demo data")).toBeNull();
  });
});

/*
 * UACI is withheld from the public product. The comparison menu is built from the
 * published catalog, so it is offered nowhere — while the published indices stay
 * selectable and the withheld index's own page keeps working.
 */
describe("MarketDetailPage Compare with", () => {
  function openCompareOn(symbol: string) {
    render(<MarketDetailPage market={findMarket(symbol)!} />);
    fireEvent.click(screen.getByRole("button", { name: "Compare with" }));
    return screen.getAllByRole("option").map((option) => option.textContent);
  }

  it("offers the published indices, and never UACI, on a published index page", () => {
    expect(openCompareOn("ugai")).toEqual(["UCPI", "UAVI", "UMPI", "UPPI", "UEPI"]);
  });

  it("offers no UACI option on any published index page", () => {
    for (const symbol of ["ugai", "uavi", "umpi", "uppi", "uepi"]) {
      const { unmount } = render(<MarketDetailPage market={findMarket(symbol)!} />);
      fireEvent.click(screen.getByRole("button", { name: "Compare with" }));
      expect(screen.queryAllByRole("option").map((option) => option.textContent)).not.toContain("UACI");
      unmount();
    }
  });

  it("keeps the withheld index's own page working, comparing against the published family", () => {
    expect(openCompareOn("uaci")).toEqual(["UCPI", "UGAI", "UAVI", "UMPI", "UPPI", "UEPI"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("UACI");
  });
});
