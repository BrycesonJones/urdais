import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PowerDeliveryGapChart } from "@/components/power-analytics/power-delivery-gap-chart";
import { EXCLUDED_GAP_MARKETS } from "@/lib/power-delivery/gap/eligibility";
import { unconfiguredDeliveryGapReadModel, type DeliveryGapPoint, type DeliveryGapReadModel } from "@/lib/power-delivery/gap/read";

const point = (year: number, season: string, demand: number, capacity: number): DeliveryGapPoint => ({
  targetYear: year, season, demandMw: demand, capacityMw: capacity, gapMw: demand - capacity,
  unit: "MW", capacityBasis: "accredited",
  demandScenarioLabel: "ERCOT Adjusted", capacityScenarioLabel: "Peak load hour",
  calculatedAt: "2026-09-21T04:00:00.000Z", publicationState: "publication_candidate",
});

/** The ten approved points, with the real first and last values. */
const SERIES: DeliveryGapPoint[] = [
  point(2026, "summer", 94_650.257, 104_849.985), point(2026, "winter", 90_192, 95_388.422),
  point(2027, "summer", 104_294.638, 109_349.848), point(2027, "winter", 111_711, 97_611.465),
  point(2028, "summer", 121_543.449, 113_693.197), point(2028, "winter", 134_192, 99_491.529),
  point(2029, "summer", 128_850.719, 115_079.594), point(2029, "winter", 152_109, 99_292.415),
  point(2030, "summer", 138_944.358, 115_501.325), point(2030, "winter", 161_916, 99_707.415),
];

function model(over: Partial<DeliveryGapReadModel> = {}): DeliveryGapReadModel {
  return {
    ...unconfiguredDeliveryGapReadModel(),
    lifecycle: "live",
    reason: "Calculated from the current ERCOT forecast and capacity report under methodology 1.0.0.",
    calculatedAt: "2026-09-21T04:00:00.000Z",
    demandSource: {
      sourceInterfaceSlug: "ercot-long-term-load-forecast",
      sourceName: "ERCOT Long-Term Demand and Energy Forecast",
      vintageKey: "ltlf-2025-04-adjusted", publishedAt: "2025-04-08T00:00:00.000Z",
      attribution: "Demand: ERCOT Long-Term Load Forecast. Gap calculated by Urdais.",
    },
    capacitySource: {
      sourceInterfaceSlug: "ercot-capacity-demand-reserves",
      sourceName: "ERCOT Capacity, Demand and Reserves Report",
      vintageKey: "cdr-2025-12", publishedAt: "2025-12-19T00:00:00.000Z",
      attribution: "Capacity: ERCOT CDR. Gap calculated by Urdais.",
    },
    series: SERIES,
    ...over,
  };
}

describe("the ERCOT delivery gap section", () => {
  it("names the market rather than implying an aggregate", () => {
    render(<PowerDeliveryGapChart model={model()} />);
    expect(screen.getByRole("heading", { name: "ERCOT Power Delivery Gap" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/seven U\.S\. markets|seven markets combined/i);
  });

  it("renders all ten approved points, both seasons, five years", () => {
    render(<PowerDeliveryGapChart model={model()} />);
    const description = screen.getByTestId("gap-series-summary").textContent ?? "";
    for (const year of [2026, 2027, 2028, 2029, 2030]) {
      expect(description).toContain(`Summer ${year}`);
      expect(description).toContain(`Winter ${year}`);
    }
    expect(description.match(/Summer|Winter/g)).toHaveLength(10);
  });

  it("preserves negative and positive values with their signs", () => {
    render(<PowerDeliveryGapChart model={model()} />);
    const description = screen.getByTestId("gap-series-summary").textContent ?? "";
    // Capacity ahead of demand in 2026; demand ahead of capacity by 2030.
    expect(description).toMatch(/Summer 2026: [\u2212-]10,200 MW/);
    expect(description).toContain("Winter 2030: +62,209 MW");
  });

  it("keeps both signs, so nothing is clipped at zero", () => {
    render(<PowerDeliveryGapChart model={model()} />);
    const description = screen.getByTestId("gap-series-summary").textContent ?? "";
    // formatSigned uses a typographic minus, which is the sign a reader actually sees.
    expect(description).toMatch(/[\u2212-]\d/);
    expect(description).toMatch(/\+\d/);
    // Every one of the ten signs survives into what a reader is given.
    const signs = (description.match(/[+\u2212-]\d[\d,]*\sMW/g) ?? []).length;
    expect(signs).toBe(10);
  });

  it("states the sign convention in words", () => {
    render(<PowerDeliveryGapChart model={model()} />);
    expect(document.body.textContent).toMatch(/Positive means forecast demand exceeds approved planning capacity/);
    expect(document.body.textContent).toMatch(/negative means approved\s+planning capacity exceeds forecast demand/);
  });

  it("carries the mandatory ERCOT disclosure and links the methodology", () => {
    render(<PowerDeliveryGapChart model={model()} />);
    expect(document.body.textContent).toMatch(/Not ERCOT.s reserve margin/);
    expect(document.body.textContent).toMatch(/firm peak load/);
    const link = screen.getByRole("link", { name: /Methodology 1\.0\.0/ });
    expect(link).toHaveAttribute("href", "/docs/methodology/power-delivery-gap");
  });

  it("attributes both ERCOT sources and says Urdais calculated the gap", () => {
    render(<PowerDeliveryGapChart model={model()} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("ERCOT Long-Term Demand and Energy Forecast");
    expect(text).toContain("ERCOT Capacity, Demand and Reserves Report");
    expect(text).toContain("Gap calculated by Urdais.");
  });

  it("shows a calculation date rather than a deploy time", () => {
    render(<PowerDeliveryGapChart model={model()} />);
    expect(document.body.textContent).toMatch(/Last calculated Sep 21, 2026/);
  });

  it("lists the six markets that produce nothing, with their reasons", () => {
    render(<PowerDeliveryGapChart model={model()} />);
    const coverage = screen.getByText(/Why only ERCOT\?/).closest("details")!;
    for (const market of EXCLUDED_GAP_MARKETS) {
      expect(within(coverage).getByText(market.marketSlug)).toBeInTheDocument();
      expect(within(coverage).getByText(market.publicBlocker)).toBeInTheDocument();
    }
  });

  it("shows no zero line for an unavailable market", () => {
    render(<PowerDeliveryGapChart model={model()} />);
    const coverage = screen.getByText(/Why only ERCOT\?/).closest("details")!;
    // Each ineligible market is a sentence, never a number.
    expect(within(coverage).queryByText(/0 MW/)).toBeNull();
  });

  it("has no demo badge or mock series left", () => {
    render(<PowerDeliveryGapChart model={model()} />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/Demo|mock|Today/);
    expect(text).not.toMatch(/deliverable capacity is what transmission/i);
  });
});

describe("lifecycles on the surface", () => {
  it("says so when nothing has been calculated, and plots nothing", () => {
    render(<PowerDeliveryGapChart model={unconfiguredDeliveryGapReadModel()} />);
    expect(screen.getByText("Not initialized")).toBeInTheDocument();
    expect(screen.getByText(/No delivery gap is published for ERCOT right now/)).toBeInTheDocument();
    expect(document.querySelector("svg")).toBeNull();
  });

  it("says so when publication is withheld", () => {
    render(<PowerDeliveryGapChart model={model({ lifecycle: "blocked", reason: "Rights withhold public display.", series: [] })} />);
    expect(screen.getByText("Not published")).toBeInTheDocument();
    expect(screen.getByText("Rights withhold public display.")).toBeInTheDocument();
  });

  it("marks a stale series stale while still showing it", () => {
    render(<PowerDeliveryGapChart model={model({ lifecycle: "stale", reason: "A newer source release has been ingested." })} />);
    expect(screen.getByText("Stale")).toBeInTheDocument();
    // The values are history, not nothing: they stay on screen.
    expect(screen.getByTestId("gap-series-summary")).toBeInTheDocument();
  });

  it("marks a current series live", () => {
    render(<PowerDeliveryGapChart model={model()} />);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });
});
