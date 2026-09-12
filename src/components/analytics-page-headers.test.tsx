import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The analytics sections render charts that need real layout; the header
// hierarchy is what these tests cover, so the sections are stubbed out.
vi.mock("@/components/model-economics/token-price-section", () => ({ TokenPriceSection: () => null }));
vi.mock("@/components/model-economics/utvi-section", () => ({ UtviSection: () => null }));
vi.mock("@/components/model-economics/market-share-chart", () => ({ MarketShareChart: () => null }));
vi.mock("@/components/model-economics/model-frontier-chart", () => ({ ModelFrontierChart: () => null }));
vi.mock("@/components/model-economics/open-weight-analysis", () => ({ OpenWeightAnalysis: () => null }));
vi.mock("@/components/compute-analytics/compute-forward-curve", () => ({ ComputeForwardCurve: () => null }));
vi.mock("@/components/compute-analytics/fleet-utilization-chart", () => ({ FleetUtilizationChart: () => null }));
vi.mock("@/components/compute-analytics/payback-period-chart", () => ({ PaybackPeriodChart: () => null }));
vi.mock("@/components/power-analytics/flexible-capacity-chart", () => ({ FlexibleCapacityChart: () => null }));
vi.mock("@/components/power-analytics/grid-buildout-chart", () => ({ GridBuildoutChart: () => null }));
vi.mock("@/components/power-analytics/interconnection-queue", () => ({ InterconnectionQueue: () => null }));
vi.mock("@/components/power-analytics/power-delivery-gap-chart", () => ({ PowerDeliveryGapChart: () => null }));
vi.mock("@/components/power-analytics/transmission-headroom", () => ({ TransmissionHeadroom: () => null }));

import { ComputeAnalyticsPage } from "@/components/compute-analytics/compute-analytics-page";
import { MeasurementTaxonomySection } from "@/components/home/measurement-taxonomy-section";
import { ModelEconomicsPage } from "@/components/model-economics/model-economics-page";
import { PowerAnalyticsPage } from "@/components/power-analytics/power-analytics-page";

const PAGES = [
  {
    Page: ModelEconomicsPage,
    title: "Model Economics",
    subtitle: "The economics of machine intelligence.",
    description: "Price, consumption, market share, and capability across the model economy.",
    tabs: ["Price", "Volume", "Share", "Frontier", "Open-weight"],
  },
  {
    Page: ComputeAnalyticsPage,
    title: "Compute Analytics",
    subtitle: "The economics of computational infrastructure.",
    description: "Forward pricing, fleet utilization, and hardware payback across the compute market.",
    tabs: ["Forwards", "Utilization", "Payback"],
  },
  {
    Page: PowerAnalyticsPage,
    title: "Power Analytics",
    subtitle: "The infrastructure delivering power to the Information Age.",
    description: "Load, interconnection, transmission capacity, grid buildout, and flexibility.",
    tabs: ["Delivery", "Queues", "Headroom", "Buildout", "Flexibility"],
  },
];

describe.each(PAGES)("$title header", ({ Page, title, subtitle, description, tabs }) => {
  it("renders the H1 without a duplicate eyebrow above it", () => {
    render(<Page />);
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    // The page title appears exactly once in the header: the H1 itself.
    expect(within(header).getAllByText(title)).toHaveLength(1);
    // The H1 row is the first thing in the header, with no leftover top margin.
    const h1Row = within(header).getByRole("heading", { level: 1 }).parentElement;
    expect(header.firstElementChild).toBe(h1Row);
    expect(h1Row).not.toHaveClass("mt-3");
  });

  it("keeps the subtitle, supporting copy, and section tabs", () => {
    render(<Page />);
    const header = screen.getByRole("banner");
    expect(within(header).getByText(subtitle)).toBeInTheDocument();
    expect(within(header).getByText(description)).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Sections" });
    for (const tab of tabs) {
      expect(within(nav).getByRole("link", { name: tab })).toBeInTheDocument();
    }
  });
});

describe("non-analytics eyebrows", () => {
  it("keeps the home measurement index eyebrow, which labels a section rather than repeating it", () => {
    render(<MeasurementTaxonomySection />);
    expect(screen.getByText("Measurement index")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "What Urdais Measures" })).toBeInTheDocument();
  });
});
