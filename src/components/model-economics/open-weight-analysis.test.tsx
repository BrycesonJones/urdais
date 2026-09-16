import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OpenWeightAnalysis } from "@/components/model-economics/open-weight-analysis";
import type { OpenWeightView } from "@/lib/open-weight/surface";

const view = (over: Partial<OpenWeightView> = {}): OpenWeightView => ({
  claim: "Whether each model's publisher released downloadable weights.",
  boundary: "Open-weight means the publisher offers the weights for download; it does not mean open source.",
  methodologyVersion: "1.0.0",
  volume: {
    windowDays: 30,
    firstDate: "2026-08-18",
    lastDate: "2026-09-16",
    totalObservedTokens: "1000000000000000",
    slices: [
      { publicClass: "open_weight", tokens: "520000000000000", sharePercent: 52 },
      { publicClass: "proprietary", tokens: "280000000000000", sharePercent: 28 },
      { publicClass: "unclassified", tokens: "200000000000000", sharePercent: 20 },
    ],
    unclassifiedBreakdown: {
      sourceAggregated: "90000000000000",
      unlinked: "80000000000000",
      undetermined: "30000000000000",
    },
    modelCounts: { open_weight: 9, proprietary: 5, unclassified: 0 },
  },
  benchmarks: [
    {
      slug: "gpqa-diamond",
      label: "GPQA Diamond",
      capabilityGap: {
        openWeight: { publicClass: "open_weight", score: 0.82, label: "GLM-5.3-Flash", configuration: null, capabilityAsOf: "2026-09-01" },
        proprietary: { publicClass: "proprietary", score: 0.9, label: "Claude Opus 5", configuration: "high", capabilityAsOf: "2026-09-02" },
        gap: 0.08,
      },
      priceGap: {
        capabilityThreshold: 0.82,
        openWeight: { publicClass: "open_weight", medianBlendedUsdPer1m: 0.6, modelCount: 3 },
        proprietary: { publicClass: "proprietary", medianBlendedUsdPer1m: 9, modelCount: 4 },
        ratio: 15,
      },
      priceAsOf: "2026-09-14",
    },
    {
      slug: "frontiermath-tiers-1-3-v2",
      label: "FrontierMath",
      capabilityGap: { openWeight: null, proprietary: null, gap: null },
      priceGap: { capabilityThreshold: 0, openWeight: null, proprietary: null, ratio: null },
      priceAsOf: null,
    },
  ],
  ...over,
});

describe("with a published comparison", () => {
  it("shows all three volume classes, Unclassified included", () => {
    render(<OpenWeightAnalysis view={view()} />);
    expect(screen.getByText("52.0%")).toBeInTheDocument();
    expect(screen.getByText("28.0%")).toBeInTheDocument();
    // The number this product is most tempted to hide.
    expect(screen.getByText("20.0%")).toBeInTheDocument();
    expect(screen.getByText("Unclassified")).toBeInTheDocument();
  });

  it("says why volume is unclassified, in the three separable causes", () => {
    render(<OpenWeightAnalysis view={view()} />);
    const note = screen.getByText(/the source aggregates without naming a model/);
    expect(note).toHaveTextContent("90.0T");
    expect(note).toHaveTextContent("80.0T");
    expect(note).toHaveTextContent("30.0T");
    expect(note).toHaveTextContent("reported rather than redistributed");
  });

  it("renders the capability gap as percentage points, matching the Frontier's units", () => {
    render(<OpenWeightAnalysis view={view()} />);
    expect(screen.getByText("90.0%")).toBeInTheDocument();
    expect(screen.getByText("82.0%")).toBeInTheDocument();
    expect(screen.getByText(/proprietary leads/)).toBeInTheDocument();
  });

  it("prints the derived price band, so a reader can check it is capability-matched", () => {
    render(<OpenWeightAnalysis view={view()} />);
    expect(screen.getByText(/Median blended list price, models scoring ≥ 82.0%/)).toBeInTheDocument();
    expect(screen.getByText("$9.00")).toBeInTheDocument();
    expect(screen.getByText("$0.60")).toBeInTheDocument();
    expect(screen.getByText(/15.0×/)).toBeInTheDocument();
  });

  it("counts models in grammatical English, singular included", () => {
    const v = view();
    v.benchmarks[0]!.priceGap.openWeight = { publicClass: "open_weight", medianBlendedUsdPer1m: 0.6, modelCount: 1 };
    render(<OpenWeightAnalysis view={v} />);
    expect(screen.getByText("(1 model)")).toBeInTheDocument();
    expect(screen.getByText("(4 models)")).toBeInTheDocument();
  });

  it("carries the semantic boundary verbatim rather than a paraphrase", () => {
    const v = view();
    render(<OpenWeightAnalysis view={v} />);
    expect(screen.getByText(v.boundary)).toBeInTheDocument();
  });
});

describe("switching benchmark", () => {
  it("moves the capability and price panels together", () => {
    render(<OpenWeightAnalysis view={view()} />);
    expect(screen.getByText("90.0%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "FrontierMath" }));

    // Both panels report the absence rather than one of them keeping GPQA's numbers.
    expect(screen.queryByText("90.0%")).not.toBeInTheDocument();
    expect(screen.getAllByText(/No comparison on this benchmark/)).toHaveLength(2);
  });

  it("leaves volume share untouched, because it is not a benchmark measurement", () => {
    render(<OpenWeightAnalysis view={view()} />);
    fireEvent.click(screen.getByRole("button", { name: "FrontierMath" }));
    expect(screen.getByText("52.0%")).toBeInTheDocument();
  });
});

describe("a missing side is stated, never zeroed", () => {
  it("reports no comparison rather than a gap against nothing", () => {
    const v = view();
    v.benchmarks[0]!.capabilityGap = {
      openWeight: { publicClass: "open_weight", score: 0.8, label: "Open", configuration: null, capabilityAsOf: "2026-09-01" },
      proprietary: null,
      gap: null,
    };
    render(<OpenWeightAnalysis view={v} />);
    expect(screen.getByText(/no proprietary model carries both a classification and a score/)).toBeInTheDocument();
    // A zero would read as a measurement, so no gap figure is printed at all.
    expect(screen.queryByText(/leads/)).not.toBeInTheDocument();
  });
});

describe("with nothing published", () => {
  it("says so, and offers no substitute", () => {
    render(<OpenWeightAnalysis view={null} />);
    const section = screen.getByRole("region", { name: /Open-weight vs Proprietary/ });
    expect(within(section).getByText(/No comparison is published/)).toBeInTheDocument();
    expect(within(section).getByText(/no substitute is shown/)).toBeInTheDocument();
    expect(within(section).queryByRole("button")).not.toBeInTheDocument();
  });
});
