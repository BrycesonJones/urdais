import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ComputeEconomicsReadModel } from "@/lib/compute-economics/domain";

vi.mock("@/components/compute-analytics/compute-economics-analysis", () => ({
  ComputeEconomicsAnalysis: ({ instrument }: { instrument: { symbol: string } }) => (
    <section><h2>Payback</h2><output data-testid="payback-instrument">{instrument.symbol}</output></section>
  ),
}));

import { ComputeAnalyticsPage } from "@/components/compute-analytics/compute-analytics-page";

function model(): ComputeEconomicsReadModel {
  const assumption = (value: number) => ({ value, unit: "fraction" as const, description: "Explicit test assumption.", status: "assumption" as const });
  const instrument = (symbol: string, label: string) => ({
    symbol,
    label,
    gpu: { vendor: "NVIDIA", model: label, formFactor: "SXM", memoryGb: 80 },
    observedPrice: {
      priceUsdPerGpuHour: 3.5,
      currency: "USD" as const,
      unit: "accelerator_hour" as const,
      calculationDate: "2026-09-17",
      observationWindowStart: "2026-09-17T00:00:00.000Z",
      observationWindowEnd: "2026-09-18T00:00:00.000Z",
      publishedAt: "2026-09-18T01:00:00.000Z",
      publicationStatus: "published" as const,
      participantCount: 4,
      contributingSourceCount: 2,
      marketBreadth: "normal" as const,
      attributions: ["Data: licensed source"],
      methodologyVersion: "1.0.0",
      instrumentSpecVersion: "1.0.0",
      freshness: { state: "fresh" as const, usableForPayback: true, staleAfter: "2026-09-19T00:00:00.000Z" },
    },
    defaultAssumptions: {
      acquisitionCostUsd: { ...assumption(30_000), unit: "USD/accelerator" as const },
      utilization: assumption(0.8),
      electricityCostPerKwh: { ...assumption(0.08), unit: "USD/kWh" as const },
      powerDrawKw: { ...assumption(0.7), unit: "kW" as const },
      hostingCostPerGpuHour: { ...assumption(0.35), unit: "USD/GPU-hour available" as const },
      otherOperatingCostPerGpuHour: { ...assumption(0.1), unit: "USD/GPU-hour utilized" as const },
    },
  });
  return { generatedAt: "2026-09-18T12:00:00.000Z", instruments: [instrument("UCPI-H100-SXM-LISTED", "H100 SXM"), instrument("UCPI-H200-SXM-LISTED", "H200 SXM")], unavailableReason: null };
}

describe("ComputeAnalyticsPage", () => {
  it("renders Payback as the only public analytic with production framing", () => {
    render(<ComputeAnalyticsPage model={model()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Compute Economics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payback" })).toBeInTheDocument();
    expect(screen.getByText(/modeled scenario, not an observed operator return/i)).toBeInTheDocument();
    expect(screen.queryByText(/forward curve|fleet utilization|demo data/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Sections" })).not.toBeInTheDocument();
  });

  it("applies the canonical production accelerator selection to Payback", () => {
    render(<ComputeAnalyticsPage model={model()} />);
    expect(screen.getByTestId("payback-instrument")).toHaveTextContent("UCPI-H100-SXM-LISTED");
    fireEvent.click(screen.getByRole("button", { name: "Accelerator: H100 SXM" }));
    fireEvent.click(within(screen.getByRole("listbox", { name: "Accelerator" })).getByRole("option", { name: "H200 SXM" }));
    expect(screen.getByTestId("payback-instrument")).toHaveTextContent("UCPI-H200-SXM-LISTED");
  });

  it("shows an honest unavailable state instead of substituting demo data", () => {
    render(<ComputeAnalyticsPage model={{ generatedAt: "2026-09-18T12:00:00.000Z", instruments: [], unavailableReason: "database_unavailable" }} />);
    expect(screen.getByRole("heading", { name: "Compute Economics unavailable" })).toBeInTheDocument();
    expect(screen.getByText(/no demo price is substituted/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Payback" })).not.toBeInTheDocument();
  });
});
