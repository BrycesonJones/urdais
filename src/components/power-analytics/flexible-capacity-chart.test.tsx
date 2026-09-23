import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FlexibleCapacityChart } from "@/components/power-analytics/flexible-capacity-chart";
import {
  unavailableFlexibleCapacityModel,
  type FlexibleCapacityReadModel, type MarketYearView, type ScenarioView,
} from "@/lib/flexible-capacity/analytics/read";

function scenario(alpha: number, headroomGw: number, overrides: Partial<ScenarioView> = {}): ScenarioView {
  return {
    alpha,
    equivalentFullLoadHours: alpha * 8760,
    curtailmentEnabledHeadroomMw: headroomGw * 1000,
    curtailmentEnabledHeadroomGw: headroomGw,
    curtailedEnergyMwh: 1000,
    allowedCurtailmentEnergyMwh: 1001,
    clockHours: 118,
    eventCount: 25,
    meanEventDurationHours: 4.7,
    maxEventDurationHours: 7,
    ...overrides,
  };
}

function eligibleYear(year: number, headroomGw = 3.591): MarketYearView {
  return {
    year,
    eligibility: { state: "eligible", reason: null, detail: null },
    observed: {
      peakMw: 83597, peakAtUtc: "2025-08-18T23:00:00.000Z", peakAtLocal: "2025-08-18, 18:00",
      observationCount: 8760, expectedObservationCount: 8760, coverageRatio: 1,
      missingHours: 0, maximumContiguousGapHours: 0,
      periodStartUtc: "2025-01-01T06:00:00.000Z", periodEndUtc: "2026-01-01T06:00:00.000Z",
    },
    scenarios: [scenario(0.0025, headroomGw * 0.7), scenario(0.005, headroomGw), scenario(0.01, headroomGw * 1.57)],
  };
}

const refusedYear = (year: number, reason: MarketYearView["eligibility"]["reason"], detail: string): MarketYearView => ({
  year, eligibility: { state: "ineligible", reason, detail }, observed: null, scenarios: [],
});

function model(markets: FlexibleCapacityReadModel["markets"]): FlexibleCapacityReadModel {
  return {
    ...unavailableFlexibleCapacityModel("no_validated_analytics"),
    methodology: {
      slug: "flexible-capacity", version: "1.1.0", digest: "a".repeat(64),
      documentPath: "/docs/methodology/flexible-capacity", title: "Flexible Capacity", approved: true,
    },
    availability: { state: "available", reason: null },
    calculatedAt: "2026-09-23T10:00:00.000Z",
    markets,
  };
}

const ercot = {
  slug: "ercot" as const, name: "ERCOT", timezone: "America/Chicago",
  years: [eligibleYear(2025), eligibleYear(2024, 5.209), eligibleYear(2023, 2.953)],
  latestEligibleYear: 2025, latestModelledYear: 2025,
};

const pjm = {
  slug: "pjm" as const, name: "PJM", timezone: "America/New_York",
  years: [
    refusedYear(2024, "contiguous_gap_too_long", "the longest absent run is 22 hours"),
    eligibleYear(2023, 19.175),
  ],
  latestEligibleYear: 2023, latestModelledYear: 2024,
};

describe("1. the headline", () => {
  it("shows curtailment-enabled headroom in GW for the default selection", () => {
    render(<FlexibleCapacityChart analytics={model([ercot])} />);
    expect(screen.getByText("3.59")).toBeInTheDocument();
    expect(screen.getByText("Curtailment-enabled headroom")).toBeInTheDocument();
    expect(screen.getByText(/ERCOT · 2025 · 0.50% annual curtailment allowance/)).toBeInTheDocument();
  });

  it("carries none of the retired mock's framings", () => {
    const { container } = render(<FlexibleCapacityChart analytics={model([ercot])} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Interruptible load/i);
    expect(text).not.toMatch(/Battery shifting/i);
    expect(text).not.toMatch(/Total unlocked/i);
    expect(text).not.toMatch(/\+36 GW/);
    expect(text).not.toMatch(/flexible hours ?\/ ?year/i);
    expect(text).not.toMatch(/additional compute capacity/i);
  });
});

describe("2. scenario disclosure is not buried", () => {
  it("states the scenario nature above the figures", () => {
    render(<FlexibleCapacityChart analytics={model([ercot])} />);
    expect(screen.getByText(/Scenario model, not observed available capacity/)).toBeInTheDocument();
    // The disclaimer says it and the limitations list says it again; both are wanted.
    expect(screen.getAllByText(/not compute capacity/).length).toBeGreaterThanOrEqual(1);
    // And a chip beside the title, before any number is read.
    expect(screen.getByText("Scenario model")).toBeInTheDocument();
  });

  it("offers the limitations without drowning the chart", () => {
    render(<FlexibleCapacityChart analytics={model([ercot])} />);
    const details = screen.getByText("What this figure is not");
    expect(details).toBeInTheDocument();
    expect(screen.getByText(/Generation adequacy only/)).toBeInTheDocument();
    expect(screen.getByText(/Markets are not summed/)).toBeInTheDocument();
  });
});

describe("3. observed basis and diagnostics", () => {
  it("shows the observed peak with its local time", () => {
    render(<FlexibleCapacityChart analytics={model([ercot])} />);
    expect(screen.getByText("83,597 MW")).toBeInTheDocument();
    expect(screen.getByText(/2025-08-18, 18:00 local/)).toBeInTheDocument();
  });

  it("shows coverage and the longest gap against the methodology limit", () => {
    render(<FlexibleCapacityChart analytics={model([ercot])} />);
    expect(screen.getByText("Annual coverage")).toBeInTheDocument();
    expect(screen.getByText(/8,760 of 8,760 hours/)).toBeInTheDocument();
    expect(screen.getByText("Longest data gap")).toBeInTheDocument();
  });

  it("keeps equivalent full-load hours distinct from clock hours", () => {
    render(<FlexibleCapacityChart analytics={model([ercot])} />);
    const equivalent = screen.getByText("Equivalent full-load hours").closest("div")!;
    expect(within(equivalent).getByText("43.8")).toBeInTheDocument();
    expect(within(equivalent).getByText(/not hours of interruption/i)).toBeInTheDocument();
    const clock = screen.getByText("Hours with curtailment").closest("div")!;
    expect(within(clock).getByText("118")).toBeInTheDocument();
  });

  it("shows the event diagnostics", () => {
    render(<FlexibleCapacityChart analytics={model([ercot])} />);
    expect(screen.getByText("Events")).toBeInTheDocument();
    expect(screen.getByText("Mean event")).toBeInTheDocument();
    expect(screen.getByText("Longest event")).toBeInTheDocument();
  });
});

describe("4. selection", () => {
  it("offers a market, year and allowance selector", () => {
    render(<FlexibleCapacityChart analytics={model([ercot, pjm])} />);
    expect(screen.getByLabelText("Market")).toBeInTheDocument();
    expect(screen.getByLabelText("Modelled year")).toBeInTheDocument();
    expect(screen.getByLabelText("Curtailment allowance")).toBeInTheDocument();
  });

  it("defaults to ERCOT, the latest eligible year and the 0.50% allowance", () => {
    render(<FlexibleCapacityChart analytics={model([pjm, ercot])} />);
    expect((screen.getByLabelText("Market") as HTMLSelectElement).value).toBe("ercot");
    expect((screen.getByLabelText("Modelled year") as HTMLSelectElement).value).toBe("2025");
    expect((screen.getByLabelText("Curtailment allowance") as HTMLSelectElement).value).toBe("0.005");
  });

  it("changes the figure when another year is chosen", () => {
    render(<FlexibleCapacityChart analytics={model([ercot])} />);
    expect(screen.getByText("3.59")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Modelled year"), { target: { value: "2024" } });
    expect(screen.getByText("5.21")).toBeInTheDocument();
    expect(screen.queryByText("3.59")).not.toBeInTheDocument();
  });

  it("changes the figure when another allowance is chosen", () => {
    render(<FlexibleCapacityChart analytics={model([ercot])} />);
    fireEvent.change(screen.getByLabelText("Curtailment allowance"), { target: { value: "0.01" } });
    expect(screen.getByText("5.64")).toBeInTheDocument();
  });

  it("switches market and resets the year to that market's latest eligible one", () => {
    render(<FlexibleCapacityChart analytics={model([ercot, pjm])} />);
    fireEvent.change(screen.getByLabelText("Market"), { target: { value: "pjm" } });
    expect((screen.getByLabelText("Modelled year") as HTMLSelectElement).value).toBe("2023");
    expect(screen.getByText(/PJM · 2023/)).toBeInTheDocument();
  });
});

describe("5. a refused market-year", () => {
  it("stays in the selector, labelled unavailable", () => {
    render(<FlexibleCapacityChart analytics={model([pjm])} />);
    const years = screen.getByLabelText("Modelled year");
    expect(within(years).getByRole("option", { name: "2024 — unavailable" })).toBeInTheDocument();
    expect(within(years).getByRole("option", { name: "2023" })).toBeInTheDocument();
  });

  it("discloses that the newest modelled year was refused", () => {
    render(<FlexibleCapacityChart analytics={model([pjm])} />);
    expect(screen.getByText(/newest modelled year for PJM \(2024\) was refused/)).toBeInTheDocument();
  });

  it("renders no GW figure when the refused year is selected", () => {
    render(<FlexibleCapacityChart analytics={model([pjm])} />);
    fireEvent.change(screen.getByLabelText("Modelled year"), { target: { value: "2024" } });
    expect(screen.getByText("Scenario unavailable for this market-year")).toBeInTheDocument();
    expect(screen.getByText("Data gap exceeds the methodology limit")).toBeInTheDocument();
    expect(screen.queryByText("Curtailment-enabled headroom")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Curtailment allowance")).not.toBeInTheDocument();
  });

  it("explains an implausible peak without showing the absurd figure", () => {
    const spp = {
      slug: "spp" as const, name: "SPP", timezone: "America/Chicago",
      years: [eligibleYear(2025, 4.491), refusedYear(2023, "peak_implausible", "66.17x the 99.9th percentile")],
      latestEligibleYear: 2025, latestModelledYear: 2025,
    };
    render(<FlexibleCapacityChart analytics={model([spp])} />);
    fireEvent.change(screen.getByLabelText("Modelled year"), { target: { value: "2023" } });
    expect(screen.getByText(/inconsistent with the surrounding distribution/)).toBeInTheDocument();
    expect(screen.getByText(/excluded rather than corrected/)).toBeInTheDocument();
    const { container } = render(<div />);
    expect(container.textContent).not.toContain("3597");
  });
});

describe("6. nothing published", () => {
  it("says so, and shows no selectors or figures", () => {
    render(<FlexibleCapacityChart analytics={unavailableFlexibleCapacityModel("no_validated_analytics")} />);
    expect(screen.getByText(/No Flexible Capacity scenario has been published yet/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Market")).not.toBeInTheDocument();
    expect(screen.queryByText("Curtailment-enabled headroom")).not.toBeInTheDocument();
  });

  it("explains a blocked publication distinctly from an empty database", () => {
    render(<FlexibleCapacityChart analytics={unavailableFlexibleCapacityModel("publication_not_authorized")} />);
    expect(screen.getByText(/a methodology parameter is unresolved/)).toBeInTheDocument();
  });
});

describe("7. methodology and accessibility", () => {
  it("links the methodology at its approved version", () => {
    render(<FlexibleCapacityChart analytics={model([ercot])} />);
    const link = screen.getByRole("link", { name: /Methodology 1.1.0/ });
    expect(link).toHaveAttribute("href", "/docs/methodology/flexible-capacity");
  });

  it("gives the chart a title and a description naming every plotted point", () => {
    render(<FlexibleCapacityChart analytics={model([ercot])} />);
    const chart = screen.getByRole("img", { name: /Curtailment-enabled headroom against annual curtailment/ });
    expect(chart).toBeInTheDocument();
    expect(chart.textContent).toMatch(/0.25% allowance/);
    expect(chart.textContent).toMatch(/gigawatts/);
  });

  it("labels every selector", () => {
    render(<FlexibleCapacityChart analytics={model([ercot])} />);
    for (const label of ["Market", "Modelled year", "Curtailment allowance"]) {
      const control = screen.getByLabelText(label);
      expect(control.tagName).toBe("SELECT");
      expect(control).toHaveAccessibleName(label);
    }
  });

  it("keeps the section landmark and heading", () => {
    render(<FlexibleCapacityChart analytics={model([ercot])} />);
    expect(screen.getByRole("heading", { level: 2, name: "Flexible Capacity" })).toBeInTheDocument();
  });
});

describe("8. the component computes nothing", () => {
  it("imports no mock, no solver and no database", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/components/power-analytics/flexible-capacity-chart.tsx", "utf8"));
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/data\/mock/);
    expect(code).not.toMatch(/FLEXIBILITY_CURVE|FLEXIBILITY_HEADLINE|FLEXIBILITY_SCENARIOS|flexibilityScenario/);
    expect(code).not.toMatch(/solveHeadroom|headroomGapsMw|curtailmentProfileMw|peakReference/);
    expect(code).not.toMatch(/createTokenSqlExecutor|fetch\(/);
  });
});
