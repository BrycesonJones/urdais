import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/charts/snapshot-chart", () => ({
  SnapshotChart: ({ label }: { label: string }) => <div aria-label={label} />,
}));

import { UcpiSummary } from "@/components/market/ucpi-summary";
import type { IndexSeries, MarketIndex, MarketSnapshot } from "@/types/market";

const index: MarketIndex = {
  symbol: "UCPI",
  name: "Urdais Compute Price Index",
  unit: "$/GPU-hour",
};

const snapshot: MarketSnapshot = {
  value: 150,
  changePercent: 999,
  asOf: Date.UTC(2026, 8, 21, 12, 0, 0) / 1000,
};

const series: IndexSeries = {
  "1D": [
    { time: 1, value: 149 },
    { time: 2, value: 150 },
  ],
  "1W": [
    { time: 1, value: 140 },
    { time: 2, value: 150 },
  ],
  "1M": [
    { time: 1, value: 100 },
    { time: 2, value: 150 },
  ],
  "3M": [
    { time: 1, value: 120 },
    { time: 2, value: 150 },
  ],
  "1Y": [
    { time: 1, value: 75 },
    { time: 2, value: 150 },
  ],
  ALL: [
    { time: 1, value: 50 },
    { time: 2, value: 150 },
  ],
};

describe("UcpiSummary range synchronization", () => {
  it("uses the chart's default range for the headline label and return", () => {
    render(<UcpiSummary index={index} snapshot={snapshot} series={series} provenance="production" />);

    expect(screen.getByText(/1M · as of/)).toBeInTheDocument();
    expect(screen.getByText("+50.00%")).toBeInTheDocument();
    expect(screen.getByLabelText("UCPI historical chart, 1M range")).toBeInTheDocument();
  });

  it("updates the headline period, return, and chart from the same selection", () => {
    render(<UcpiSummary index={index} snapshot={snapshot} series={series} provenance="production" />);

    fireEvent.click(screen.getByRole("button", { name: "3M" }));

    expect(screen.getByText(/3M · as of/)).toBeInTheDocument();
    expect(screen.getByText("+25.00%")).toBeInTheDocument();
    expect(screen.getByLabelText("UCPI historical chart, 3M range")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3M" })).toHaveAttribute("aria-pressed", "true");
  });

  it("withholds a period return when the selected range has fewer than two observations", () => {
    const sparse = { ...series, "1W": [{ time: 2, value: 150 }] };

    render(<UcpiSummary index={index} snapshot={snapshot} series={sparse} provenance="production" />);
    fireEvent.click(screen.getByRole("button", { name: "1W" }));

    expect(screen.getByText(/1W · as of/)).toBeInTheDocument();
    expect(screen.queryByText("+999.00%")).toBeNull();
  });
});
