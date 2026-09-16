import { describe, expect, it } from "vitest";

import { deriveMarketShare, foldForDisplay, percentOf } from "@/lib/market-share/derive";
import { checkDerivation } from "@/lib/market-share/checks";
import type { ShareObservation } from "@/lib/market-share/types";

/**
 * The fixtures use round token counts so the expected shares can be written down rather than
 * computed by the same code under test. A total of 10,000 makes every share a plain percentage.
 */
function observation(overrides: Partial<ShareObservation> & { permaslug: string; tokens: bigint }): ShareObservation {
  return {
    namespace: overrides.permaslug.includes("/") ? overrides.permaslug.split("/")[0]! : null,
    isResidual: false,
    labSlug: null,
    labName: null,
    labAttributionState: "unmapped",
    qualityFlags: [],
    ...overrides,
  };
}

const evidenced = (permaslug: string, tokens: bigint, labSlug: string, labName: string) =>
  observation({ permaslug, tokens, labSlug, labName, labAttributionState: "evidenced" });

const residual = (tokens: bigint) =>
  observation({ permaslug: "other", tokens, isResidual: true, labAttributionState: "not_applicable" });

describe("percentOf", () => {
  it("computes an exact share on integers rather than on doubles", () => {
    // The brief's worked example: 1.25 T of 10 T is 12.5 %.
    expect(percentOf(1_250_000_000_000n, 10_000_000_000_000n)).toBe(12.5);
  });

  it("stays exact at token magnitudes a double could not hold", () => {
    // Both operands exceed Number.MAX_SAFE_INTEGER; the division never narrows them.
    expect(percentOf(4_409_689_762_208n, 17_750_424_011_492n)).toBeCloseTo(24.843, 3);
  });

  it("refuses a non-positive denominator instead of returning Infinity or NaN", () => {
    expect(() => percentOf(5n, 0n)).toThrow(/denominator must be positive/);
    expect(() => percentOf(5n, -1n)).toThrow(/denominator must be positive/);
  });

  it("refuses a negative token count", () => {
    expect(() => percentOf(-1n, 100n)).toThrow(/may not be negative/);
  });
});

describe("model share", () => {
  it("divides one model's tokens by the total observed tokens", () => {
    const derivation = deriveMarketShare("2026-09-15", "final", 10_000n, [
      evidenced("openai/gpt-5", 1_250n, "openai", "OpenAI"),
      evidenced("deepseek/deepseek-v4", 7_750n, "deepseek", "DeepSeek"),
      residual(1_000n),
    ]);

    const gpt = derivation.models.find((row) => row.id === "openai/gpt-5");
    expect(gpt?.sharePercent).toBe(12.5);
    expect(gpt?.tokens).toBe("1250");
    // The denominator is the published total, not the named-model subtotal of 9,000.
    expect(derivation.totalObservedTokens).toBe("10000");
  });

  it("ranks models by tokens and names them with the source permaslug verbatim", () => {
    const derivation = deriveMarketShare("2026-09-15", "final", 10_000n, [
      evidenced("meta-llama/llama-4", 1_000n, "meta", "Meta"),
      evidenced("qwen/qwen3-max", 8_000n, "alibaba", "Alibaba Cloud"),
      residual(1_000n),
    ]);

    expect(derivation.models.map((row) => row.label)).toEqual(["qwen/qwen3-max", "meta-llama/llama-4"]);
    // The lab is secondary metadata on the row, never a rewrite of the model's identity.
    expect(derivation.models[0]!.detail).toBe("Alibaba Cloud");
  });
});

describe("lab aggregation", () => {
  it("sums multiple models from one lab", () => {
    const derivation = deriveMarketShare("2026-09-15", "final", 10_000n, [
      evidenced("deepseek/deepseek-v4", 3_000n, "deepseek", "DeepSeek"),
      evidenced("deepseek/deepseek-v4-flash", 2_000n, "deepseek", "DeepSeek"),
      evidenced("openai/gpt-5", 4_000n, "openai", "OpenAI"),
      residual(1_000n),
    ]);

    const deepseek = derivation.labs.find((row) => row.id === "deepseek");
    expect(deepseek?.tokens).toBe("5000");
    expect(deepseek?.sharePercent).toBe(50);
    expect(derivation.labCount).toBe(2);
  });

  it("folds two namespaces of one lab into a single row", () => {
    // `meta` and `meta-llama` are one lab. The mapping, not the namespace, decides that.
    const derivation = deriveMarketShare("2026-09-15", "final", 10_000n, [
      evidenced("meta/muse-spark", 2_000n, "meta", "Meta"),
      evidenced("meta-llama/llama-4", 3_000n, "meta", "Meta"),
      evidenced("openai/gpt-5", 4_000n, "openai", "OpenAI"),
      residual(1_000n),
    ]);

    expect(derivation.labs.filter((row) => row.id === "meta")).toHaveLength(1);
    expect(derivation.labs.find((row) => row.id === "meta")?.tokens).toBe("5000");
  });

  it("divides lab share by total observed volume, not by attributed volume", () => {
    const derivation = deriveMarketShare("2026-09-15", "final", 10_000n, [
      evidenced("openai/gpt-5", 5_000n, "openai", "OpenAI"),
      observation({ permaslug: "stealth/ox-alpha", tokens: 3_000n, labAttributionState: "undisclosed" }),
      residual(2_000n),
    ]);

    // 5,000 / 10,000 = 50 %. Against attributed-only volume (8,000) it would read 62.5 %, and
    // against evidenced-lab volume (5,000) it would read 100 %. Both would be a different claim.
    expect(derivation.labs[0]!.sharePercent).toBe(50);
    expect(derivation.labs[0]!.sharePercent).not.toBe(62.5);
  });
});

describe("residual semantics", () => {
  it("keeps the source residual out of every lab", () => {
    const derivation = deriveMarketShare("2026-09-15", "final", 10_000n, [
      evidenced("openai/gpt-5", 9_000n, "openai", "OpenAI"),
      residual(1_000n),
    ]);

    expect(derivation.sourceResidual?.kind).toBe("source_residual");
    expect(derivation.sourceResidual?.sharePercent).toBe(10);
    // No lab row absorbed it, and it is not part of the unattributed named-model volume either.
    expect(derivation.labs.every((row) => BigInt(row.tokens) === 9_000n || row.id !== "openai")).toBe(true);
    expect(derivation.unattributed.tokens).toBe("0");
  });

  it("is absent, not zero, on a date whose tail was empty", () => {
    const derivation = deriveMarketShare("2026-09-15", "final", 10_000n, [
      evidenced("openai/gpt-5", 10_000n, "openai", "OpenAI"),
    ]);
    expect(derivation.sourceResidual).toBeNull();
    expect(checkDerivation(derivation)).toEqual([]);
  });

  it("sends a named model with no canonical mapping to the lab-attribution residual", () => {
    const derivation = deriveMarketShare("2026-09-15", "final", 10_000n, [
      evidenced("openai/gpt-5", 6_000n, "openai", "OpenAI"),
      observation({ permaslug: "arcee-ai/trinity", tokens: 3_000n, labAttributionState: "unmapped" }),
      residual(1_000n),
    ]);

    expect(derivation.unattributed.tokens).toBe("3000");
    expect(derivation.unattributed.sharePercent).toBe(30);
    // It is still a model, and still ranked in the Models view.
    expect(derivation.models.map((row) => row.id)).toContain("arcee-ai/trinity");
    // But it reached no lab.
    expect(derivation.labs.map((row) => row.id)).not.toContain("arcee-ai");
  });

  it("keeps undisclosed, platform and unmapped volume distinguishable", () => {
    const derivation = deriveMarketShare("2026-09-15", "final", 10_000n, [
      evidenced("openai/gpt-5", 4_000n, "openai", "OpenAI"),
      observation({ permaslug: "stealth/ox-alpha", tokens: 3_000n, labAttributionState: "undisclosed" }),
      observation({
        permaslug: "openrouter/owl-alpha",
        tokens: 2_000n,
        labAttributionState: "unmapped",
        qualityFlags: ["SERVING_PLATFORM_AS_AUTHOR"],
      }),
      observation({ permaslug: "arcee-ai/trinity", tokens: 1_000n, labAttributionState: "unmapped" }),
    ]);

    expect(derivation.unattributedBreakdown).toEqual({
      undisclosed: "3000",
      platform: "2000",
      unmapped: "1000",
    });
    // The platform is never a lab, least of all in a table of labs.
    expect(derivation.labs.map((row) => row.id)).not.toContain("openrouter");
  });
});

describe("namespace ambiguity", () => {
  it("does not let a namespace decide the lab", () => {
    // Same namespace string, two different resolutions, because the mapping table decides and
    // the namespace is only a grouping key. `qwen` resolves to Alibaba; a literal `alibaba`
    // namespace Urdais has not mapped resolves to nothing at all.
    const derivation = deriveMarketShare("2026-09-15", "final", 10_000n, [
      evidenced("qwen/qwen3-max", 5_000n, "alibaba", "Alibaba Cloud"),
      observation({ permaslug: "alibaba/tongyi", tokens: 4_000n, labAttributionState: "unmapped" }),
      residual(1_000n),
    ]);

    expect(derivation.labs.map((row) => row.id)).toEqual(["alibaba"]);
    expect(derivation.labs[0]!.tokens).toBe("5000");
    // The literal `alibaba` namespace was not silently credited to Alibaba Cloud.
    expect(derivation.unattributed.tokens).toBe("4000");
  });
});

describe("reconciliation", () => {
  it("closes both decompositions on a mixed date", () => {
    const derivation = deriveMarketShare("2026-09-15", "final", 10_000n, [
      evidenced("openai/gpt-5", 4_000n, "openai", "OpenAI"),
      evidenced("deepseek/deepseek-v4", 2_500n, "deepseek", "DeepSeek"),
      observation({ permaslug: "stealth/ox-alpha", tokens: 2_000n, labAttributionState: "undisclosed" }),
      residual(1_500n),
    ]);

    expect(checkDerivation(derivation)).toEqual([]);

    const modelSum =
      derivation.models.reduce((total, row) => total + row.sharePercent, 0) +
      derivation.sourceResidual!.sharePercent;
    const labSum =
      derivation.labs.reduce((total, row) => total + row.sharePercent, 0) +
      derivation.unattributed.sharePercent +
      derivation.sourceResidual!.sharePercent;
    expect(modelSum).toBeCloseTo(100, 6);
    expect(labSum).toBeCloseTo(100, 6);
  });

  it("refuses a date with no denominator rather than dividing by it", () => {
    expect(() =>
      deriveMarketShare("2026-09-15", "final", 0n, [evidenced("openai/gpt-5", 1n, "openai", "OpenAI")]),
    ).toThrow(/non-positive denominator/);
  });

  it("refuses a date with no observations at all", () => {
    expect(() => deriveMarketShare("2025-06-15", "final", 10_000n, [])).toThrow(/no observations/);
  });
});

describe("display fold", () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      evidenced(`lab/model-${String(index).padStart(2, "0")}`, BigInt(1_000 - index), "openai", "OpenAI"),
    );

  it("folds the tail into a display remainder that is not the source residual", () => {
    const derivation = deriveMarketShare("2026-09-15", "final", 100_000n, [...many(20), residual(1_000n)]);
    const folded = foldForDisplay(derivation.models, 10);

    expect(folded).toHaveLength(11);
    const remainder = folded[10]!;
    expect(remainder.kind).toBe("display_remainder");
    expect(remainder.id).toBe("display-remainder");
    // The word the source uses for something else entirely never appears on this row.
    expect(remainder.label.toLowerCase()).not.toContain("other");
    expect(remainder.id).not.toBe(derivation.sourceResidual!.id);
  });

  it("preserves the exact token total across the fold", () => {
    const derivation = deriveMarketShare("2026-09-15", "final", 100_000n, [...many(20), residual(1_000n)]);
    const before = derivation.models.reduce((total, row) => total + BigInt(row.tokens), 0n);
    const after = foldForDisplay(derivation.models, 10).reduce((total, row) => total + BigInt(row.tokens), 0n);
    expect(after).toBe(before);
  });

  it("leaves a table that is already short enough alone", () => {
    const derivation = deriveMarketShare("2026-09-15", "final", 100_000n, [...many(11), residual(1_000n)]);
    expect(foldForDisplay(derivation.models, 10).every((row) => row.kind === "model")).toBe(true);
  });
});
