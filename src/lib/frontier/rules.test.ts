import { describe, expect, it } from "vitest";

import { benchmarkForFile, eligibleFile, observationsFromFile, parseCsv, rowHash } from "@/lib/frontier/source/bundle";
import { resolveIdentity, type PricedModel } from "@/lib/frontier/identity";
import { blendedPrice, selectPrice, type PriceRow } from "@/lib/frontier/price";
import { dominates, markFrontier } from "@/lib/frontier/pareto";
import { FrontierContractError, type FrontierPoint } from "@/lib/frontier/types";

/* ------------------------------------------------------------------ bundle */

describe("internal versus external files", () => {
  it("refuses every externally sourced file", () => {
    // The whole licence position rests on this one distinction: Epoch authors its internal
    // measurements and licenses them CC BY; external rows retain someone else's terms.
    expect(eligibleFile("aider_polyglot_external.csv")).toBe(false);
    expect(eligibleFile("terminalbench_external.csv")).toBe(false);
    expect(eligibleFile("live_bench_external.csv")).toBe(false);
    expect(benchmarkForFile("aider_polyglot_external.csv")).toBeNull();
  });

  it("accepts the two V1 benchmark files and no other internal file", () => {
    expect(benchmarkForFile("gpqa_diamond.csv")?.slug).toBe("gpqa-diamond");
    expect(benchmarkForFile("frontiermath_tiers_1_3_v2.csv")?.slug).toBe("frontiermath-tiers-1-3-v2");
    // Internal, licence-safe, and deliberately not ingested: coverage was too thin.
    expect(benchmarkForFile("swe_bench_verified.csv")).toBeNull();
    expect(benchmarkForFile("math_level_5.csv")).toBeNull();
  });

  it("will not parse a file it does not ingest", () => {
    expect(() => observationsFromFile("aider_polyglot_external.csv", "a,b\n1,2\n")).toThrow(
      /not an eligible V1 benchmark file/,
    );
  });
});

describe("csv parsing", () => {
  it("keeps a quoted comma inside its field", () => {
    const rows = parseCsv('a,b\n"x, y",2\n');
    expect(rows[0]).toEqual({ a: "x, y", b: "2" });
  });

  it("handles escaped quotes and CRLF", () => {
    const rows = parseCsv('a,b\r\n"say ""hi""",2\r\n');
    expect(rows[0]!.a).toBe('say "hi"');
  });
});

const HEADER = "Model version,mean_score,Best score (across scorers),Organization,Started at";

describe("observation parsing", () => {
  it("carries the source identifier through verbatim and leaves configuration to identity", () => {
    const [row] = observationsFromFile(
      "gpqa_diamond.csv",
      `${HEADER}\nqwen3.8-max-0902_xhigh,0.92,0.92,Alibaba,2026-09-02T10:00:00\n`,
    );
    expect(row!.sourceModelIdentifier).toBe("qwen3.8-max-0902_xhigh");
    expect(row!.sourceConfiguration).toBeNull();
    expect(row!.sourceOrganization).toBe("Alibaba");
    expect(row!.capabilityAsOf).toBe("2026-09-02");
    expect(row!.score).toBe(0.92);
  });

  it("prefers the best-score column and falls back to the mean", () => {
    const [best] = observationsFromFile("gpqa_diamond.csv", `${HEADER}\nm,0.1,0.9,OpenAI,2026-01-01\n`);
    expect(best!.score).toBe(0.9);
    const [mean] = observationsFromFile("gpqa_diamond.csv", `${HEADER}\nm,0.4,,OpenAI,2026-01-01\n`);
    expect(mean!.score).toBe(0.4);
  });

  it("refuses a score outside the benchmark's declared range rather than clamping it", () => {
    expect(() =>
      observationsFromFile("gpqa_diamond.csv", `${HEADER}\nm,1.4,1.4,OpenAI,2026-01-01\n`),
    ).toThrow(/outside the declared range/);
  });

  it("refuses a duplicated identifier in one file", () => {
    expect(() =>
      observationsFromFile("gpqa_diamond.csv", `${HEADER}\nm,0.5,0.5,OpenAI,2026-01-01\nm,0.6,0.6,OpenAI,2026-01-02\n`),
    ).toThrow(/appears twice/);
  });

  it("hashes on the fields that define a result, so a revised score is detectable", () => {
    const a = rowHash("gpqa-diamond", "m", "0.5", "2026-01-01");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(rowHash("gpqa-diamond", "m", "0.5", "2026-01-01"));
    expect(a).not.toBe(rowHash("gpqa-diamond", "m", "0.6", "2026-01-01"));
  });
});

/* ------------------------------------------------------------------ identity */

const CATALOGUE: PricedModel[] = [
  { providerSlug: "openai", providerModelId: "gpt-6-astra" },
  { providerSlug: "openai", providerModelId: "gpt-5.6-luna" },
  { providerSlug: "anthropic", providerModelId: "claude-opus-5" },
  { providerSlug: "google", providerModelId: "gemini-3.1-pro-preview" },
  { providerSlug: "xai", providerModelId: "grok-4.20-0309-reasoning" },
  { providerSlug: "xai", providerModelId: "grok-4.20-0309-non-reasoning" },
  { providerSlug: "alibaba", providerModelId: "qwen3.8-max-0902" },
];

describe("exact identity", () => {
  it("evidences an exact SKU with no configuration", () => {
    const link = resolveIdentity("claude-opus-5", "Anthropic", CATALOGUE);
    expect(link.state).toBe("evidenced");
    expect(link.providerModelId).toBe("claude-opus-5");
    expect(link.sourceConfiguration).toBeNull();
    expect(link.evidence).toMatch(/nothing normalised/);
  });

  it("evidences a configuration suffix and preserves it", () => {
    const link = resolveIdentity("gpt-6-astra_max", "OpenAI", CATALOGUE);
    expect(link).toMatchObject({ state: "evidenced", providerModelId: "gpt-6-astra", sourceConfiguration: "max" });
    // And the raw identifier survives for audit.
    expect(link.sourceModelIdentifier).toBe("gpt-6-astra_max");
  });

  it("maps Epoch's organization names, which are not the Urdais slugs", () => {
    expect(resolveIdentity("gemini-3.1-pro-preview", "Google DeepMind", CATALOGUE).state).toBe("evidenced");
  });

  it("does not case-fold", () => {
    expect(resolveIdentity("GPT-6-Astra", "OpenAI", CATALOGUE).state).toBe("unmapped");
  });

  it("does not strip a suffix to reach a SKU it does not have", () => {
    // `gpt-6-astra-turbo` is not `gpt-6-astra`, and no amount of resemblance makes it so.
    expect(resolveIdentity("gpt-6-astra-turbo", "OpenAI", CATALOGUE).state).toBe("unmapped");
  });

  it("does not infer preview to GA, or GA to preview", () => {
    expect(resolveIdentity("gemini-3.1-pro", "Google DeepMind", CATALOGUE).state).toBe("unmapped");
  });

  it("keeps reasoning and non-reasoning apart", () => {
    const reasoning = resolveIdentity("grok-4.20-0309-reasoning", "xAI", CATALOGUE);
    const non = resolveIdentity("grok-4.20-0309-non-reasoning", "xAI", CATALOGUE);
    expect(reasoning.providerModelId).toBe("grok-4.20-0309-reasoning");
    expect(non.providerModelId).toBe("grok-4.20-0309-non-reasoning");
    expect(reasoning.providerModelId).not.toBe(non.providerModelId);
  });

  it("refuses when the source's organization disagrees with the priced provider", () => {
    // The corroborating field is what stops a coincidental prefix becoming a link.
    const link = resolveIdentity("gpt-6-astra_max", "Anthropic", CATALOGUE);
    expect(link.state).toBe("ambiguous");
    expect(link.evidence).toMatch(/disagree/);
  });

  it("refuses when the source declared no organization, because a prefix is not evidence", () => {
    expect(resolveIdentity("gpt-6-astra_max", null, CATALOGUE).state).toBe("unmapped");
  });

  it("reports ambiguity when an identifier decomposes against two SKUs", () => {
    const overlapping: PricedModel[] = [
      { providerSlug: "openai", providerModelId: "gpt-6" },
      { providerSlug: "openai", providerModelId: "gpt-6_astra" },
    ];
    const link = resolveIdentity("gpt-6_astra_max", "OpenAI", overlapping);
    expect(link.state).toBe("ambiguous");
    expect(link.providerModelId).toBeNull();
  });

  it("does not treat a trailing underscore as a configuration", () => {
    expect(resolveIdentity("gpt-6-astra_", "OpenAI", CATALOGUE).state).toBe("unmapped");
  });

  it("never names a model on a non-evidenced link", () => {
    for (const identifier of ["unknown-model", "GPT-6-Astra", "gpt-6-astra_"]) {
      const link = resolveIdentity(identifier, "OpenAI", CATALOGUE);
      expect(link.state).not.toBe("evidenced");
      expect(link.providerModelId).toBeNull();
      expect(link.evidence.length).toBeGreaterThan(20);
    }
  });
});

/* ------------------------------------------------------------------ price */

const row = (over: Partial<PriceRow> & { dimension: string; usdPer1m: number }): PriceRow => ({
  serviceTier: "standard",
  contextTier: null,
  region: null,
  observedAt: "2026-09-14",
  ...over,
});

describe("price selection", () => {
  it("blends under Token Price 1.2", () => {
    expect(blendedPrice(5, 25)).toBe(15);
    expect(blendedPrice(2, 10)).toBe(6);
  });

  it("selects the standard tier even though batch is cheaper", () => {
    const out = selectPrice("anthropic", "claude-opus-5", [
      row({ dimension: "input", usdPer1m: 5 }),
      row({ dimension: "output", usdPer1m: 25 }),
      row({ dimension: "input", usdPer1m: 2.5, serviceTier: "batch" }),
      row({ dimension: "output", usdPer1m: 12.5, serviceTier: "batch" }),
    ]);
    expect(out.kind).toBe("selected");
    if (out.kind !== "selected") return;
    expect(out.blended).toBe(15);
    expect(out.input.usdPer1m).toBe(5);
  });

  it("selects Anthropic's global list price, not the us data-residency variant", () => {
    const out = selectPrice("anthropic", "claude-opus-5", [
      row({ dimension: "input", usdPer1m: 5 }),
      row({ dimension: "output", usdPer1m: 25 }),
      row({ dimension: "input", usdPer1m: 5.5, region: "us" }),
      row({ dimension: "output", usdPer1m: 27.5, region: "us" }),
    ]);
    if (out.kind !== "selected") throw new Error(out.reason);
    expect(out.selection.region).toBeNull();
    expect(out.blended).toBe(15);
  });

  it("selects the provider's declared base context tier", () => {
    const out = selectPrice("openai", "gpt-6-astra", [
      row({ dimension: "input", usdPer1m: 5, contextTier: "short_context" }),
      row({ dimension: "output", usdPer1m: 40, contextTier: "short_context" }),
      row({ dimension: "input", usdPer1m: 40, contextTier: "long_context" }),
      row({ dimension: "output", usdPer1m: 80, contextTier: "long_context" }),
    ]);
    if (out.kind !== "selected") throw new Error(out.reason);
    expect(out.selection.contextTier).toBe("short_context");
    expect(out.blended).toBe(22.5);
  });

  it("excludes a provider with no standard tier rather than pricing it from another", () => {
    const out = selectPrice("deepseek", "deepseek-v4-pro", [
      row({ dimension: "input", usdPer1m: 0.5, serviceTier: "off_peak" }),
      row({ dimension: "output", usdPer1m: 1.5, serviceTier: "peak" }),
    ]);
    expect(out.kind).toBe("excluded");
    if (out.kind !== "excluded") return;
    expect(out.reason).toMatch(/publishes no 'standard' service tier/);
  });

  it("excludes rather than tie-breaks when two rows match", () => {
    const out = selectPrice("openai", "gpt-5.6-luna", [
      row({ dimension: "input", usdPer1m: 1 }),
      row({ dimension: "input", usdPer1m: 2 }),
      row({ dimension: "output", usdPer1m: 8 }),
    ]);
    expect(out.kind).toBe("excluded");
    if (out.kind !== "excluded") return;
    expect(out.reason).toMatch(/ambiguous/);
    // The point that matters: it did not quietly take the cheaper one.
    expect(out.reason).not.toMatch(/selected/);
  });

  it("excludes a model missing a leg", () => {
    const out = selectPrice("openai", "gpt-5.3-codex", [row({ dimension: "input", usdPer1m: 1 })]);
    expect(out.kind).toBe("excluded");
    if (out.kind !== "excluded") return;
    expect(out.reason).toMatch(/both legs are required/);
  });
});

/* ------------------------------------------------------------------ pareto */

const point = (over: Partial<FrontierPoint> & { id: string; score: number; blendedPrice: number }): FrontierPoint => ({
  providerModelId: over.id,
  providerSlug: "openai",
  providerName: "OpenAI",
  displayName: over.id,
  configuration: null,
  sourceModelIdentifier: over.id,
  benchmarkSlug: "gpqa-diamond",
  scoreMin: 0,
  scoreMax: 1,
  capabilityAsOf: "2026-09-01",
  inputPrice: 1,
  outputPrice: 1,
  priceAsOf: "2026-09-14",
  onFrontier: false,
  ...over,
});

describe("pareto frontier", () => {
  it("domination needs at least one strict improvement", () => {
    expect(dominates({ score: 0.9, blendedPrice: 5 }, { score: 0.8, blendedPrice: 5 })).toBe(true);
    expect(dominates({ score: 0.9, blendedPrice: 4 }, { score: 0.9, blendedPrice: 5 })).toBe(true);
    // Identical on both axes: neither dominates.
    expect(dominates({ score: 0.9, blendedPrice: 5 }, { score: 0.9, blendedPrice: 5 })).toBe(false);
    // Better on one, worse on the other: neither dominates.
    expect(dominates({ score: 0.9, blendedPrice: 9 }, { score: 0.8, blendedPrice: 5 })).toBe(false);
  });

  it("keeps both members of an exact tie on the frontier", () => {
    const marked = markFrontier([
      point({ id: "a", score: 0.9, blendedPrice: 5 }),
      point({ id: "b", score: 0.9, blendedPrice: 5 }),
    ]);
    expect(marked.every((p) => p.onFrontier)).toBe(true);
  });

  it("stacks configurations of one model at the same price and dominates within the stack", () => {
    // The defining case. Same SKU, same x, three efforts -- price does not move with effort.
    const marked = markFrontier([
      point({ id: "astra-low", providerModelId: "gpt-6-astra", configuration: "low", score: 0.7, blendedPrice: 22.5 }),
      point({ id: "astra-high", providerModelId: "gpt-6-astra", configuration: "high", score: 0.8, blendedPrice: 22.5 }),
      point({ id: "astra-max", providerModelId: "gpt-6-astra", configuration: "max", score: 0.9, blendedPrice: 22.5 }),
    ]);
    const frontier = marked.filter((p) => p.onFrontier).map((p) => p.configuration);
    expect(frontier).toEqual(["max"]);
    // All three are still plotted. Only the frontier flag differs.
    expect(marked).toHaveLength(3);
  });

  it("lets one model be on the frontier under one configuration and not another", () => {
    const marked = markFrontier([
      point({ id: "a-max", providerModelId: "a", configuration: "max", score: 0.95, blendedPrice: 20 }),
      point({ id: "a-low", providerModelId: "a", configuration: "low", score: 0.5, blendedPrice: 20 }),
      point({ id: "b", providerModelId: "b", score: 0.6, blendedPrice: 2 }),
    ]);
    const on = marked.filter((p) => p.onFrontier).map((p) => p.id);
    expect(on).toContain("a-max");
    expect(on).toContain("b");
    expect(on).not.toContain("a-low");
  });

  it("refuses a duplicate SKU/configuration/benchmark point rather than picking one", () => {
    expect(() =>
      markFrontier([
        point({ id: "x1", providerModelId: "a", configuration: "max", score: 0.9, blendedPrice: 5 }),
        point({ id: "x2", providerModelId: "a", configuration: "max", score: 0.8, blendedPrice: 5 }),
      ]),
    ).toThrow(FrontierContractError);
  });

  it("orders deterministically, cheapest first", () => {
    const marked = markFrontier([
      point({ id: "c", score: 0.5, blendedPrice: 9 }),
      point({ id: "a", score: 0.9, blendedPrice: 1 }),
      point({ id: "b", score: 0.7, blendedPrice: 5 }),
    ]);
    expect(marked.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("treats a single point as its own frontier", () => {
    expect(markFrontier([point({ id: "only", score: 0.5, blendedPrice: 3 })])[0]!.onFrontier).toBe(true);
  });
});
