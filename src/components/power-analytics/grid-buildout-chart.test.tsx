/**
 * The Grid Buildout surface renders the read model and nothing else.
 *
 * The tests that matter are the ones that would catch a regression back toward the retired mock:
 * a capacity figure appearing, a reported zero shown as missing, or M4's 140 published projects
 * presented as though they were the whole 214-project universe.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GridBuildoutChart } from "@/components/power-analytics/grid-buildout-chart";
import { unavailableGridBuildoutModel, type GridBuildoutReadModel }
  from "@/lib/grid-buildout/analytics/read";

function model(): GridBuildoutReadModel {
  const base = unavailableGridBuildoutModel();
  return {
    ...base,
    methodology: { ...base.methodology, approved: true },
    calculatedAt: "2026-09-23T00:00:00.000Z",
    inputDigest: "a".repeat(64),
    markets: {
      ercot: {
        marketSlug: "ercot", marketName: "ERCOT", role: "Completion throughput and backlog",
        sourceName: "ERCOT TPIT", attribution: "Source: Electric Reliability Council of Texas, Inc.",
        sourceSlug: "ercot-tpit-transmission-projects", snapshotKey: "tpit-071326",
        retrievedAt: "2026-09-22T01:00:00.000Z", analyticalProjects: 2025, canonicalOccurrences: 2127,
      },
      caiso: {
        marketSlug: "caiso", marketName: "CAISO", role: "Schedule slip",
        sourceName: "CAISO TDF", attribution: "Source: California Independent System Operator Corporation.",
        sourceSlug: "caiso-tdf-approved-tpp-projects", snapshotKey: "tpp-jul-2026",
        retrievedAt: "2026-09-22T02:00:00.000Z", analyticalProjects: 214, canonicalOccurrences: 233,
      },
    },
    metrics: {
      m1: {
        metric: "m1_projects_entering_service", market: "ercot", unit: "projects",
        periods: [{ period: 2025, count: 177 }, { period: 2026, count: 50 }],
        total: 227, excludedSentinelDate: 5, caveat: "The Completed sheet is a rolling window.",
      },
      m2: {
        metric: "m2_active_backlog", market: "ercot", unit: "projects",
        asOf: "2026-09-22T01:00:00.000Z",
        byLifecycle: [
          { lifecycle: "under_construction", count: 31 }, { lifecycle: "planned", count: 1350 },
          { lifecycle: "proposed", count: 292 }, { lifecycle: "unknown", count: 47 },
        ],
        total: 1720,
      },
      m3: {
        metric: "m3_completions_decomposition", market: "ercot", unit: "projects", population: 227,
        byServiceLevelKv: [{ kv: 69, count: 23 }, { kv: 138, count: 139 }, { kv: 345, count: 65 }],
        suppressedKvClasses: 0, suppressedKvProjects: 0,
        byWorksCharacter: [
          { character: "new", count: 24, share: 24 / 227 },
          { character: "rebuilt_or_reconductored", count: 60, share: 60 / 227 },
          { character: "both", count: 3, share: 3 / 227 },
          { character: "none_reported_zero", count: 139, share: 139 / 227 },
          { character: "unknown_unclassified", count: 1, share: 1 / 227 },
        ],
      },
      m4: {
        metric: "m4_schedule_slip", market: "caiso", unit: "days", published: true,
        distribution: { count: 140, median: 38.5, q1: 0, q3: 2169.5, min: -1829, max: 8279 },
        excludedMissingEndpoint: 13, excludedYearPrecision: 56, excludedCancelled: 5,
        floor: 12, withheldReason: null,
      },
      m5: {
        metric: "m5_cancellations", market: "caiso", unit: "projects", cancelled: 5,
        reasons: [{ nativeId: "2223-P-18", reason: "July 2026: Project cancelled to be removed in future TDF." }],
        unmappedStatusCount: 209, onHoldReported: false, onHoldNote: "uncontrolled status text",
      },
    },
    coverage: {
      ercotUnknownDriver: 2025, caisoUnknownDriver: 233,
      caisoDuplicateGroups: 16, caisoOccurrencesResolvedAway: 19, excluded: [],
    },
  };
}

describe("live values", () => {
  it("renders M1's total and each reported year", () => {
    render(<GridBuildoutChart analytics={model()} />);
    expect(screen.getByText("227")).toBeInTheDocument();
    expect(screen.getByText("177")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("renders M2's backlog total and composition", () => {
    render(<GridBuildoutChart analytics={model()} />);
    expect(screen.getByText(/Active backlog — 1,720 projects/)).toBeInTheDocument();
    expect(screen.getByText("Under construction")).toBeInTheDocument();
    expect(screen.getByText("1,350")).toBeInTheDocument();
  });

  it("renders M3's two decompositions", () => {
    render(<GridBuildoutChart analytics={model()} />);
    expect(screen.getByText("138 kV")).toBeInTheDocument();
    expect(screen.getByText("New line mileage")).toBeInTheDocument();
    expect(screen.getByText("Rebuilt or reconductored")).toBeInTheDocument();
  });

  it("renders M5's verbatim cancellation reason", () => {
    render(<GridBuildoutChart analytics={model()} />);
    expect(screen.getByText("July 2026: Project cancelled to be removed in future TDF."))
      .toBeInTheDocument();
    expect(screen.getByText("2223-P-18")).toBeInTheDocument();
  });
});

describe("faithfulness to methodology 1.0.0", () => {
  it("shows a reported zero as a value, never as missing", () => {
    render(<GridBuildoutChart analytics={model()} />);
    // M4's lower quartile is genuinely 0 days.
    expect(screen.getByText("0 d")).toBeInTheDocument();
    // And the reported-zero works class is labelled as reported, not as unknown.
    const reported = screen.getByText("No line mileage reported");
    expect(reported).toBeInTheDocument();
    expect(reported.textContent).not.toMatch(/unknown|missing|not reported$/i);
  });

  it("distinguishes a reported zero from an unreported value", () => {
    render(<GridBuildoutChart analytics={model()} />);
    expect(screen.getByText("No line mileage reported")).toBeInTheDocument();
    expect(screen.getByText("Mileage not reported")).toBeInTheDocument();
  });

  it("renders a negative slip without clamping it", () => {
    render(<GridBuildoutChart analytics={model()} />);
    expect(screen.getByText("-1,829 d")).toBeInTheDocument();
  });

  it("discloses that M4 covers 140 of 214, not the whole universe", () => {
    render(<GridBuildoutChart analytics={model()} />);
    const disclosure = screen.getByText(/Measured over 140 of 214 CAISO projects/);
    expect(disclosure).toBeInTheDocument();
    expect(disclosure.textContent).toMatch(/56 are excluded because the publisher gave an endpoint only to the year/);
    expect(disclosure.textContent).toMatch(/13 are missing an endpoint/);
    expect(disclosure.textContent).toMatch(/5 are cancelled/);
  });

  it("does not present the unmapped population as active projects or an on-hold count", () => {
    render(<GridBuildoutChart analytics={model()} />);
    const note = screen.getByText(/209 projects carry a status this/);
    expect(note.textContent).toMatch(/not a count of active projects/);
    expect(note.textContent).toMatch(/no on-hold figure is published/);
  });

  it("carries attribution, vintage and a methodology link for each market", () => {
    render(<GridBuildoutChart analytics={model()} />);
    expect(screen.getByText(/Electric Reliability Council of Texas/)).toBeInTheDocument();
    expect(screen.getByText(/California Independent System Operator/)).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: /Methodology 1\.0\.0/ });
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links[0]).toHaveAttribute("href", "/docs/methodology/grid-buildout-velocity");
  });

  it("discloses the CAISO duplicate resolution", () => {
    render(<GridBuildoutChart analytics={model()} />);
    expect(screen.getByText(/16 CAISO project identifiers/)).toBeInTheDocument();
    expect(screen.getByText(/resolving 19 duplicate occurrences/)).toBeInTheDocument();
  });
});

describe("no mock remains", () => {
  it("renders none of the retired capacity vocabulary", () => {
    const { container } = render(<GridBuildoutChart analytics={model()} />);
    const text = container.textContent ?? "";
    for (const term of ["Transfer capacity", "GW added", "GVA", "Transformer lead time", "lower is better"]) {
      expect(text).not.toContain(term);
    }
  });

  it("shows nothing rather than a placeholder when no calculation is published", () => {
    render(<GridBuildoutChart analytics={unavailableGridBuildoutModel()} />);
    expect(screen.getByText(/No Grid Buildout calculation has been published yet/)).toBeInTheDocument();
    // Not a single figure from the old mock, and no invented zero.
    expect(screen.queryByText("227")).not.toBeInTheDocument();
    expect(screen.queryByText(/Median slip/)).not.toBeInTheDocument();
  });

  it("withholds the distribution below the floor rather than showing a partial one", () => {
    const withheld = model();
    withheld.metrics.m4 = {
      ...withheld.metrics.m4!, published: false, distribution: null,
      withheldReason: "3 project(s) carry two day-precision endpoints; the floor is 12",
    };
    render(<GridBuildoutChart analytics={withheld} />);
    expect(screen.getByText(/No slip distribution is published/)).toBeInTheDocument();
    expect(screen.queryByText("Median slip")).not.toBeInTheDocument();
  });
});

describe("accessibility", () => {
  it("gives every count a textual value rather than only a bar", () => {
    render(<GridBuildoutChart analytics={model()} />);
    const planned = screen.getByText("Planned").closest("li");
    expect(planned).not.toBeNull();
    expect(within(planned!).getByText("1,350")).toBeInTheDocument();
  });

  it("labels the section for navigation", () => {
    render(<GridBuildoutChart analytics={model()} />);
    expect(screen.getByRole("region", { name: /Grid Buildout Velocity/ })).toBeInTheDocument();
  });
});
