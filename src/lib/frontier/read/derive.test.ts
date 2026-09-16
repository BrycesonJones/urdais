import { describe, expect, it } from "vitest";

import { configurationLabel, deriveAll, deriveBenchmark, type JoinableRow } from "@/lib/frontier/read/derive";
import { UNDECLARED_CONFIGURATION } from "@/lib/frontier/types";

const row = (over: Partial<JoinableRow> & { sourceModelIdentifier: string }): JoinableRow => ({
  benchmarkSlug: "gpqa-diamond",
  sourceConfiguration: null,
  score: 0.8,
  scoreMin: 0,
  scoreMax: 1,
  capabilityAsOf: "2026-09-01",
  linkState: "evidenced",
  providerModelId: over.sourceModelIdentifier,
  providerSlug: "openai",
  providerName: "OpenAI",
  displayName: over.sourceModelIdentifier,
  inputPrice: 5,
  outputPrice: 25,
  priceAsOf: "2026-09-14",
  ...over,
});

describe("configuration rendering", () => {
  it("names an undeclared configuration rather than leaving it blank", () => {
    expect(configurationLabel(null)).toBe(UNDECLARED_CONFIGURATION);
    expect(configurationLabel("max")).toBe("max");
  });
});

describe("the join", () => {
  it("plots an evidenced, priced observation and blends under Token Price 1.2", () => {
    const view = deriveBenchmark("gpqa-diamond", [row({ sourceModelIdentifier: "a" })]);
    expect(view.points).toHaveLength(1);
    expect(view.points[0]!.blendedPrice).toBe(15);
    expect(view.points[0]!.onFrontier).toBe(true);
  });

  it("counts the three identity refusals separately, because they are different facts", () => {
    const view = deriveBenchmark("gpqa-diamond", [
      row({ sourceModelIdentifier: "u", linkState: "unmapped", providerModelId: null, providerSlug: null }),
      row({ sourceModelIdentifier: "a", linkState: "ambiguous", providerModelId: null, providerSlug: null }),
      row({ sourceModelIdentifier: "n", linkState: "not_applicable", providerModelId: null, providerSlug: null }),
    ]);
    expect(view.points).toHaveLength(0);
    expect(view.exclusions.unmapped).toBe(1);
    expect(view.exclusions.ambiguous).toBe(1);
    expect(view.exclusions.not_applicable).toBe(1);
  });

  it("never plots a model that arrived without an evidenced link", () => {
    // Even if a provider and model somehow came back on a non-evidenced row, it must not plot.
    const view = deriveBenchmark("gpqa-diamond", [row({ sourceModelIdentifier: "x", linkState: "unmapped" })]);
    expect(view.points).toHaveLength(0);
    expect(view.exclusions.unmapped).toBe(1);
  });

  it("counts an evidenced model with no eligible price as scored but unpriced", () => {
    const view = deriveBenchmark("gpqa-diamond", [
      row({ sourceModelIdentifier: "p", inputPrice: null, outputPrice: null, priceAsOf: null }),
    ]);
    expect(view.points).toHaveLength(0);
    expect(view.exclusions.no_eligible_price).toBe(1);
    expect(view.exclusions.scored_but_unpriced).toBe(1);
    // And it is not confused with an unknown identity, which has a different remedy.
    expect(view.exclusions.unmapped).toBe(0);
  });

  it("keeps configurations of one model as separate points at one price", () => {
    const view = deriveBenchmark("gpqa-diamond", [
      row({ sourceModelIdentifier: "m_low", providerModelId: "m", sourceConfiguration: "low", score: 0.6 }),
      row({ sourceModelIdentifier: "m_max", providerModelId: "m", sourceConfiguration: "max", score: 0.9 }),
    ]);
    expect(view.points).toHaveLength(2);
    expect(view.distinctModelCount).toBe(1);
    expect(new Set(view.points.map((p) => p.blendedPrice)).size).toBe(1);
    expect(view.points.filter((p) => p.onFrontier).map((p) => p.configuration)).toEqual(["max"]);
  });

  it("reports the capability date span and the price date separately", () => {
    const view = deriveBenchmark("gpqa-diamond", [
      row({ sourceModelIdentifier: "a", capabilityAsOf: "2025-10-16" }),
      row({ sourceModelIdentifier: "b", capabilityAsOf: "2026-09-02", inputPrice: 1, outputPrice: 1 }),
    ]);
    expect(view.capabilityAsOfRange).toEqual({ first: "2025-10-16", last: "2026-09-02" });
    expect(view.priceAsOf).toBe("2026-09-14");
  });

  it("does not mix benchmarks", () => {
    const rows = [
      row({ sourceModelIdentifier: "a" }),
      row({ sourceModelIdentifier: "b", benchmarkSlug: "frontiermath-tiers-1-3-v2" }),
    ];
    expect(deriveBenchmark("gpqa-diamond", rows).points).toHaveLength(1);
    expect(deriveBenchmark("frontiermath-tiers-1-3-v2", rows).points).toHaveLength(1);
  });

  it("returns every V1 benchmark, including one with nothing in it", () => {
    const views = deriveAll([row({ sourceModelIdentifier: "a" })]);
    expect(views.map((view) => view.slug)).toEqual(["gpqa-diamond", "frontiermath-tiers-1-3-v2"]);
    expect(views[1]!.points).toHaveLength(0);
    expect(views[1]!.capabilityAsOfRange).toBeNull();
  });
});
