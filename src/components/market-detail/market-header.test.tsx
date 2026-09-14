import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarketHeader } from "@/components/market-detail/market-header";
import { MARKETS, defaultInstrument, findMarket } from "@/data/mock/market-detail";
import { tokenInstrumentsFromSeries } from "@/lib/tokens/read/instruments";
import { listPublicTokenSeries } from "@/lib/tokens/read/series";
import { seedTokenReadCatalog } from "@/lib/tokens/read/test-support";

describe("MarketHeader", () => {
  it("shows the canonical name, description, and question for the Chip & Accelerator Index", () => {
    const market = findMarket("uaci")!;
    render(<MarketHeader market={market} instrument={defaultInstrument(market)} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("UACI");
    expect(screen.getByText("Urdais Chip & Accelerator Index")).toBeInTheDocument();
    expect(screen.getByText("Tracks normalized market pricing for leading AI accelerators, weighted by representative compute capability and market relevance.")).toBeInTheDocument();
    expect(screen.getByText("What does advanced compute hardware cost?")).toBeInTheDocument();
    expect(screen.queryByText(/AI Chip Index|^Urdais Accelerator Index$/)).toBeNull();
  });

  it("omits the description lines for indices without a settled definition, such as the Compute Price Index", () => {
    const market = MARKETS[0]!;
    render(<MarketHeader market={market} instrument={defaultInstrument(market)} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("UCPI-H100");
    expect(screen.queryByText(/Tracks normalized market pricing/)).toBeNull();
    expect(screen.queryByText(/What does advanced compute hardware cost/)).toBeNull();
  });

  it("shows the dollar sign on a canonical token price and withholds a lone observation's percent", () => {
    const [instrument] = tokenInstrumentsFromSeries(
      listPublicTokenSeries(
        seedTokenReadCatalog([
          { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z" },
        ]),
      ),
    );
    render(<MarketHeader market={findMarket("ucpi")!} instrument={instrument!} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Claude Sonnet 5 · Input");
    expect(screen.getByText("$2.00")).toBeInTheDocument();
    expect(screen.getByText("per 1M input tokens")).toBeInTheDocument();
    expect(screen.queryByText("Demo data")).toBeNull();
    expect(screen.queryByText("0.00%")).toBeNull();
    expect(screen.queryByText("+0.00%")).toBeNull();
    expect(screen.queryByText("today")).toBeNull();
    expect(screen.queryByText("2.00 $/1M")).toBeNull();
  });

  it("shows percentage change only when the same token series has history", () => {
    const [instrument] = tokenInstrumentsFromSeries(
      listPublicTokenSeries(
        seedTokenReadCatalog([
          { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z" },
          { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "input", price: 2.5, retrievedAt: "2026-09-15T03:10:00Z" },
        ]),
      ),
    );
    render(<MarketHeader market={findMarket("ucpi")!} instrument={instrument!} />);
    expect(screen.getByText("$2.50")).toBeInTheDocument();
    expect(screen.getByText("+25.00%")).toBeInTheDocument();
  });
});
