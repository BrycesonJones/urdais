import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarketHeader } from "@/components/market-detail/market-header";
import { MARKETS, defaultInstrument, findMarket } from "@/data/mock/market-detail";

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
});
