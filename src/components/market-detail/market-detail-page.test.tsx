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
