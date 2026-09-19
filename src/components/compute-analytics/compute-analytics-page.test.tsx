import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/compute-analytics/payback-period-chart", () => ({
  PaybackPeriodChart: ({ instrumentId }: { instrumentId: string }) => (
    <section>
      <h2>Payback Period</h2>
      <output data-testid="payback-instrument">{instrumentId}</output>
    </section>
  ),
}));

import { ComputeAnalyticsPage } from "@/components/compute-analytics/compute-analytics-page";

describe("ComputeAnalyticsPage", () => {
  it("renders Payback as the only public analytic", () => {
    render(<ComputeAnalyticsPage />);

    expect(screen.getByRole("heading", { name: "Payback Period" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Compute Forward Curve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Available Compute Capacity" })).not.toBeInTheDocument();
    expect(screen.queryByText("Fleet Utilization")).not.toBeInTheDocument();
    expect(screen.queryByText("Forwards & payback: demo data")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Sections" })).not.toBeInTheDocument();
  });

  it("applies accelerator selection to Payback", () => {
    render(<ComputeAnalyticsPage />);

    expect(screen.getByTestId("payback-instrument")).toHaveTextContent("ucpi-h100-sxm");
    fireEvent.click(screen.getByRole("button", { name: "Accelerator: H100 SXM" }));
    fireEvent.click(within(screen.getByRole("listbox", { name: "Accelerator" })).getByRole("option", { name: "H200" }));

    expect(screen.getByTestId("payback-instrument")).toHaveTextContent("ucpi-h200");
    expect(screen.getByRole("button", { name: "Accelerator: H200" })).toBeInTheDocument();
  });
});
