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
      unlinked: "60000000000000",
      undetermined: "30000000000000",
      noncommercial: "20000000000000",
    },
    modelCounts: { open_weight: 9, proprietary: 5, unclassified: 0 },
  },
  benchmarks: [
    {
      slug: "gpqa-diamond",
      label: "GPQA Diamond",
      capabilityGap: {
        openWeight: { publicClass: "open_weight", score: 0.82, label: "GLM-5.3-Flash", configuration: null, capabilityAsOf: "2026-09-01", blendedUsdPer1m: 0.6, onFrontier: true },
        proprietary: { publicClass: "proprietary", score: 0.9, label: "Claude Opus 5", configuration: "high", capabilityAsOf: "2026-09-02", blendedUsdPer1m: 15, onFrontier: true },
        gap: 0.08,
      },
      priceGap: {
        openWeight: { publicClass: "open_weight", medianBlendedUsdPer1m: 0.6, configurationCount: 3 },
        proprietary: { publicClass: "proprietary", medianBlendedUsdPer1m: 9, configurationCount: 4 },
        ratio: 15,
        ratioPublishable: true,
      },
      configurations: { open_weight: 6, proprietary: 7, unclassified: 2 },
      frontierConfigurations: { open_weight: 3, proprietary: 4, unclassified: 1 },
      priceAsOf: "2026-09-14",
    },
    {
      slug: "frontiermath-tiers-1-3-v2",
      label: "FrontierMath",
      capabilityGap: { openWeight: null, proprietary: null, gap: null },
      priceGap: { openWeight: null, proprietary: null, ratio: null, ratioPublishable: false },
      configurations: { open_weight: 0, proprietary: 0, unclassified: 0 },
      frontierConfigurations: { open_weight: 0, proprietary: 0, unclassified: 0 },
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
    const note = screen.getByText(/in the source’s own\s+residual row/);
    expect(note).toHaveTextContent("90.0T");
    expect(note).toHaveTextContent("60.0T");
    expect(note).toHaveTextContent("30.0T");
    expect(note).toHaveTextContent("20.0T");
    expect(note).toHaveTextContent("reported rather than redistributed");
  });

  it("renders the capability gap as percentage points, matching the Frontier's units", () => {
    render(<OpenWeightAnalysis view={view()} />);
    expect(screen.getByText("90.0%")).toBeInTheDocument();
    expect(screen.getByText("82.0%")).toBeInTheDocument();
    expect(screen.getByText(/proprietary leads/)).toBeInTheDocument();
  });

  it("names the Pareto population and prints no capability threshold", () => {
    render(<OpenWeightAnalysis view={view()} />);
    expect(screen.getByText(/Median blended list price among Pareto-efficient configurations/)).toBeInTheDocument();
    expect(screen.queryByText(/scoring ≥/)).not.toBeInTheDocument();
    expect(screen.getByText("$9.00")).toBeInTheDocument();
    expect(screen.getByText("$0.60")).toBeInTheDocument();
    expect(screen.getByText(/15.0×/)).toBeInTheDocument();
  });

  it("reports each class's sample as a configuration count", () => {
    render(<OpenWeightAnalysis view={view()} />);
    expect(screen.getByText("(3 configurations)")).toBeInTheDocument();
    expect(screen.getByText("(4 configurations)")).toBeInTheDocument();
  });

  it("labels the highest-scoring configuration as a companion, not the headline", () => {
    render(<OpenWeightAnalysis view={view()} />);
    const companion = screen.getByText(/Highest-scoring configuration in each class/);
    expect(companion).toHaveTextContent("Claude Opus 5 at $15.00");
    expect(companion).toHaveTextContent("GLM-5.3-Flash at $0.60");
  });

  it("names non-commercial weights among the unclassified causes", () => {
    render(<OpenWeightAnalysis view={view()} />);
    expect(screen.getByText(/published for non-commercial use only/)).toHaveTextContent("20.0T");
  });

  it("counts models in grammatical English, singular included", () => {
    const v = view();
    v.benchmarks[0]!.priceGap.openWeight = { publicClass: "open_weight", medianBlendedUsdPer1m: 0.6, configurationCount: 1 };
    render(<OpenWeightAnalysis view={v} />);
    expect(screen.getByText("(1 configuration)")).toBeInTheDocument();
    expect(screen.getByText("(4 configurations)")).toBeInTheDocument();
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

    // Both panels report the absence rather than one of them keeping GPQA's numbers. They
    // word it differently because they fail for different reasons: capability has no
    // classified model on a side, price has no efficient configuration on one.
    expect(screen.queryByText("90.0%")).not.toBeInTheDocument();
    expect(screen.getByText(/No comparison on this benchmark/)).toBeInTheDocument();
    expect(screen.getByText("Insufficient comparable frontier coverage.")).toBeInTheDocument();
    expect(screen.queryByText("$9.00")).not.toBeInTheDocument();
  });

  it("leaves volume share untouched, because it is not a benchmark measurement", () => {
    render(<OpenWeightAnalysis view={view()} />);
    fireEvent.click(screen.getByRole("button", { name: "FrontierMath" }));
    expect(screen.getByText("52.0%")).toBeInTheDocument();
  });
});

describe("the sample floor", () => {
  it("withholds the ratio below three efficient configurations in a class", () => {
    const v = view();
    v.benchmarks[0]!.priceGap = {
      openWeight: { publicClass: "open_weight", medianBlendedUsdPer1m: 0.6, configurationCount: 2 },
      proprietary: { publicClass: "proprietary", medianBlendedUsdPer1m: 9, configurationCount: 4 },
      ratio: null,
      ratioPublishable: false,
    };
    render(<OpenWeightAnalysis view={v} />);
    expect(screen.getByText("Insufficient comparable frontier coverage")).toBeInTheDocument();
    // The per-class medians and samples still publish: only the multiple is withheld.
    expect(screen.getByText("$0.60")).toBeInTheDocument();
    expect(screen.getByText("(2 configurations)")).toBeInTheDocument();
    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
  });

  it("says so plainly when a class has no efficient configuration at all", () => {
    const v = view();
    v.benchmarks[0]!.priceGap = { openWeight: null, proprietary: null, ratio: null, ratioPublishable: false };
    render(<OpenWeightAnalysis view={v} />);
    expect(screen.getByText("Insufficient comparable frontier coverage.")).toBeInTheDocument();
  });
});

describe("a missing side is stated, never zeroed", () => {
  it("reports no comparison rather than a gap against nothing", () => {
    const v = view();
    v.benchmarks[0]!.capabilityGap = {
      openWeight: { publicClass: "open_weight", score: 0.8, label: "Open", configuration: null, capabilityAsOf: "2026-09-01", blendedUsdPer1m: 2, onFrontier: true },
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
