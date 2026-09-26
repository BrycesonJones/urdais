/**
 * How the surface renders a change that may not be a percentage.
 *
 * UEPI specification 1.0.0 §D is a product rule, not a UI convention, and these are the two
 * places it becomes visible: the headline move and the horizon buttons under the chart. Both
 * were percentage-only before this phase, and both had the same defect -- a withheld percentage
 * rendered as no movement at all, which on a negative-price day means a real fall reads as a
 * quiet market.
 *
 * Every assertion about an existing market here is an assertion that nothing changed for it.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarketHeader } from "@/components/market-detail/market-header";
import { PeriodPerformance } from "@/components/market-detail/period-performance";
import { defaultInstrument, findMarket } from "@/data/mock/market-detail";
import type { MarketInstrumentDetail, MarketSnapshot, PeriodPerformance as Performance } from "@/types/market";

const UEPI = findMarket("uepi")!;

function ercot(snapshot: Partial<MarketSnapshot>): MarketInstrumentDetail {
  return {
    id: "uepi-ercot",
    shortLabel: "ERCOT",
    symbol: "ERCOT",
    benchmarkCode: "ERCOT",
    name: "Urdais Energy & Power Index · ERCOT wholesale power benchmark",
    unit: "$/MWh",
    provenance: "production",
    snapshot: { value: 36.4, changePercent: null, asOf: Date.UTC(2026, 8, 23) / 1000, ...snapshot },
    series: { daily: [], intraday: [] },
    availableRanges: [],
    comparisons: [],
  };
}

describe("the headline move", () => {
  it("shows a percentage between two strictly positive days", () => {
    render(<MarketHeader market={UEPI} instrument={ercot({ changePercent: -4.21, absoluteChange: -1.6, changeBasis: "percent" })} />);
    expect(screen.getByText("−4.21%")).toBeInTheDocument();
  });

  it("shows the signed dollar amount, with its unit, where a percentage is withheld", () => {
    // §D.4 row 4: 30 -> -5 is a $35/MWh fall. "-116.67%" describes no rate of return.
    render(
      <MarketHeader
        market={UEPI}
        instrument={ercot({ value: -5, changePercent: null, absoluteChange: -35, changeBasis: "absolute", changeSuppressionReason: "new_not_positive" })}
      />,
    );
    expect(screen.getByText("−$35.00/MWh")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("calls a rise a rise when both days are negative", () => {
    // §D.4 row 8. An ordinary percentage on a negative base reports this as -50 %.
    render(
      <MarketHeader
        market={UEPI}
        instrument={ercot({ value: -5, changePercent: null, absoluteChange: 5, changeBasis: "absolute", changeSuppressionReason: "base_negative" })}
      />,
    );
    const move = screen.getByText("+$5.00/MWh");
    expect(move).toBeInTheDocument();
    expect(move.parentElement?.className).toContain("emerald");
  });

  it("names the day it measured from, rather than saying 'today' across a hole", () => {
    // ERCOT published nothing for 2026-03-07.
    render(
      <MarketHeader
        market={UEPI}
        instrument={ercot({ changePercent: 10, absoluteChange: 3, changeBasis: "percent", baseTime: Date.UTC(2026, 2, 6) / 1000 })}
      />,
    );
    expect(screen.getByText(/since Mar 6, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/^today$/)).toBeNull();
  });

  it("shows no movement at all where there is no comparison", () => {
    render(<MarketHeader market={UEPI} instrument={ercot({ changePercent: null, absoluteChange: null, changeBasis: "absolute" })} />);
    // The unit caption beside the value stays; what is absent is any signed amount.
    expect(screen.queryByText(/[+\u2212]\$/)).toBeNull();
    expect(screen.queryByText(/today|since/)).toBeNull();
  });

  it("leaves an existing percentage-only market rendering exactly as before", () => {
    const market = findMarket("uaci")!;
    const instrument = defaultInstrument(market);
    render(<MarketHeader market={market} instrument={instrument} />);
    // Still "today", still a percentage, no unit-bearing amount anywhere.
    expect(screen.getByText("today")).toBeInTheDocument();
    expect(screen.queryByText(/\/MWh/)).toBeNull();
  });
});

const HORIZONS: Performance[] = [
  { range: "1D", returnPercent: null, absoluteChange: 5, changeBasis: "absolute", changeSuppressionReason: "base_negative", baseTime: Date.UTC(2026, 3, 11) / 1000 },
  { range: "1W", returnPercent: 2.5, absoluteChange: 0.9, changeBasis: "percent", baseTime: Date.UTC(2026, 3, 5) / 1000 },
  { range: "1M", returnPercent: null, absoluteChange: null, changeSuppressionReason: "insufficient_history" },
  { range: "3M", returnPercent: null, absoluteChange: null, changeSuppressionReason: "insufficient_history" },
  { range: "6M", returnPercent: null, absoluteChange: null, changeSuppressionReason: "insufficient_history" },
  { range: "1Y", returnPercent: null, absoluteChange: null, changeSuppressionReason: "insufficient_history" },
];

describe("the horizon buttons", () => {
  const renderHorizons = (onSelect = vi.fn()) => {
    render(<PeriodPerformance performance={HORIZONS} selected="1W" onSelect={onSelect} unit="$/MWh" />);
    return onSelect;
  };

  it("keeps a horizon selectable when its endpoints forbid a percentage", () => {
    // The defect: reading a null return as "not enough history" disabled a button over a real
    // move. 1D here has a measured +$5.00/MWh.
    const onSelect = renderHorizons();
    const button = screen.getByRole("button", { name: /1 day/ });
    expect(button).not.toBeDisabled();
    expect(within(button).getByText("+$5.00/MWh")).toBeInTheDocument();
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith("1D");
  });

  it("still disables a horizon that genuinely has no comparison", () => {
    renderHorizons();
    const button = screen.getByRole("button", { name: /1 month/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Not enough history");
    expect(within(button).getByText("—")).toBeInTheDocument();
  });

  it("shows a percentage where one is publishable", () => {
    renderHorizons();
    expect(within(screen.getByRole("button", { name: /1 week/ })).getByText("+2.50%")).toBeInTheDocument();
  });

  it("states the date each horizon measured from (§E.3)", () => {
    renderHorizons();
    expect(screen.getByRole("button", { name: /1 week/ })).toHaveAttribute("title", "Since Apr 5, 2026");
  });

  it("leaves a percentage-only instrument's buttons behaving exactly as before", () => {
    // No `changeBasis` anywhere: a null return is an unavailable horizon, which is what every
    // strictly positive Urdais series relies on.
    render(
      <PeriodPerformance
        performance={[
          { range: "1D", returnPercent: 1.5 },
          { range: "1W", returnPercent: null },
          { range: "1M", returnPercent: null },
          { range: "3M", returnPercent: null },
          { range: "6M", returnPercent: null },
          { range: "1Y", returnPercent: null },
        ]}
        selected="1D"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /1 day/ })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /1 week/ })).toBeDisabled();
    expect(screen.getByText("+1.50%")).toBeInTheDocument();
  });
});
