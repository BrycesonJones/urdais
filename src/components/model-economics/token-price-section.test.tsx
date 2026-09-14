import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/charts/detailed-market-chart", () => ({ DetailedMarketChart: () => null }));

import { TokenPriceSection } from "@/components/model-economics/token-price-section";
import { MAX_COMPARISONS, useInstrumentChart } from "@/components/market-detail/use-instrument-chart";
import { tokenInstrumentsFromSeries } from "@/lib/tokens/read/instruments";
import { listPublicTokenSeries } from "@/lib/tokens/read/series";
import { seedTokenReadCatalog } from "@/lib/tokens/read/test-support";
import type { MarketInstrumentDetail } from "@/types/market";

function fiveSeries(): MarketInstrumentDetail[] {
  return tokenInstrumentsFromSeries(
    listPublicTokenSeries(
      seedTokenReadCatalog([
        { provider: "anthropic", providerModelId: "claude-fable-5-1", dimension: "input", price: 10, retrievedAt: "2026-09-14T03:10:00Z" },
        { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z" },
        { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "output", price: 10, retrievedAt: "2026-09-14T03:10:00Z" },
        { provider: "anthropic", providerModelId: "claude-opus-5", dimension: "input", price: 5, retrievedAt: "2026-09-14T03:10:00Z" },
        { provider: "xai", providerModelId: "grok-4.6", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z", contextTier: "prompt_lt_200k" },
      ]),
    ),
  );
}

function CompareHarness({ instruments }: { instruments: MarketInstrumentDetail[] }) {
  const primary = instruments[0]!;
  const chart = useInstrumentChart(primary, (id) => instruments.find((row) => row.id === id));
  return (
    <div>
      <span data-testid="count">{chart.comparisonIds.length}</span>
      {primary.comparisons.map((option) => (
        <button key={option.instrumentId} type="button" onClick={() => chart.toggleComparison(option.instrumentId)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

describe("TokenPriceSection", () => {
  it("renders nothing priced when the public catalog is empty", () => {
    render(<TokenPriceSection instruments={[]} />);
    expect(screen.getByRole("heading", { name: "Token Price" })).toBeInTheDocument();
    expect(screen.queryByText("$9.00")).toBeNull();
    expect(screen.queryByText("Anthropic")).toBeNull();
  });

  it("shows provider, model, and dimension selectors for canonical series", () => {
    render(<TokenPriceSection instruments={fiveSeries()} />);
    expect(screen.getByRole("button", { name: /Provider/ })).toHaveTextContent("Anthropic");
    expect(screen.getByRole("button", { name: /Model/ })).toHaveTextContent("Claude Fable 5.1");
    expect(screen.getByRole("button", { name: /Pricing dimension/ })).toHaveTextContent("Input");
    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText("per 1M input tokens")).toBeInTheDocument();
  });
});

describe("compare maximum", () => {
  it("accepts three comparisons and ignores a fourth", () => {
    expect(MAX_COMPARISONS).toBe(3);
    const instruments = fiveSeries();
    render(<CompareHarness instruments={instruments} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    fireEvent.click(buttons[0]!);
    fireEvent.click(buttons[1]!);
    fireEvent.click(buttons[2]!);
    fireEvent.click(buttons[3]!);
    expect(screen.getByTestId("count")).toHaveTextContent("3");
  });
});
