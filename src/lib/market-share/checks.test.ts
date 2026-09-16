import { describe, expect, it } from "vitest";

import { checkDerivation } from "@/lib/market-share/checks";
import { deriveMarketShare } from "@/lib/market-share/derive";
import type { MarketShareDerivation, ShareObservation } from "@/lib/market-share/types";

const observation = (
  overrides: Partial<ShareObservation> & { permaslug: string; tokens: bigint },
): ShareObservation => ({
  namespace: null,
  isResidual: false,
  labSlug: null,
  labName: null,
  labAttributionState: "unmapped",
  qualityFlags: [],
  ...overrides,
});

function sound(): MarketShareDerivation {
  return deriveMarketShare("2026-09-15", "final", 10_000n, [
    observation({
      permaslug: "openai/gpt-5",
      tokens: 6_000n,
      labSlug: "openai",
      labName: "OpenAI",
      labAttributionState: "evidenced",
    }),
    observation({ permaslug: "stealth/ox-alpha", tokens: 3_000n, labAttributionState: "undisclosed" }),
    observation({
      permaslug: "other",
      tokens: 1_000n,
      isResidual: true,
      labAttributionState: "not_applicable",
    }),
  ]);
}

const codes = (derivation: MarketShareDerivation) => checkDerivation(derivation).map((failure) => failure.check);

describe("a sound date", () => {
  it("raises nothing", () => {
    expect(checkDerivation(sound())).toEqual([]);
  });
});

describe("reconciliation failures are reported, never normalised", () => {
  it("catches named models that do not account for the total with the residual", () => {
    const derivation = sound();
    // A model quietly dropped: the remaining shares still look entirely plausible.
    derivation.models = derivation.models.filter((row) => row.id !== "stealth/ox-alpha");

    const failures = checkDerivation(derivation);
    expect(failures.map((failure) => failure.check)).toContain("model_reconciliation");
    expect(failures.map((failure) => failure.check)).toContain("model_token_reconciliation");
    // The report says what was wrong, so a historical sweep can name the date and the amount.
    expect(failures[0]!.detail).toMatch(/sum to/);
    expect(failures[0]!.date).toBe("2026-09-15");
  });

  it("catches lab totals that drift from the models behind them", () => {
    const derivation = sound();
    derivation.labs[0] = { ...derivation.labs[0]!, tokens: "6500", sharePercent: 65 };
    expect(codes(derivation)).toContain("lab_reconciliation");
    expect(codes(derivation)).toContain("lab_token_reconciliation");
  });

  it("catches an unattributed breakdown that does not partition its own total", () => {
    const derivation = sound();
    derivation.unattributedBreakdown = { undisclosed: "2000", platform: "0", unmapped: "0" };
    expect(codes(derivation)).toContain("unattributed_breakdown");
  });
});

describe("per-row sanity", () => {
  it("catches a negative share", () => {
    const derivation = sound();
    derivation.labs[0] = { ...derivation.labs[0]!, sharePercent: -1 };
    expect(codes(derivation)).toContain("share_nonnegative");
  });

  it("catches a share above 100 %", () => {
    const derivation = sound();
    derivation.labs[0] = { ...derivation.labs[0]!, sharePercent: 140 };
    expect(codes(derivation)).toContain("share_at_most_100");
  });

  it("catches a non-positive denominator and stops there", () => {
    const derivation = sound();
    derivation.totalObservedTokens = "0";
    const failures = checkDerivation(derivation);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.check).toBe("denominator_positive");
  });

  it("catches a duplicated entity within one view", () => {
    const derivation = sound();
    derivation.labs = [...derivation.labs, derivation.labs[0]!];
    expect(codes(derivation)).toContain("duplicate_entity");
  });

  it("catches a lab reference that resolved to no name", () => {
    const derivation = sound();
    derivation.labs[0] = { ...derivation.labs[0]!, label: "   " };
    expect(codes(derivation)).toContain("orphan_lab_mapping");
  });
});

describe("tolerance", () => {
  it("accepts the last-place truncation a fifty-one row decomposition produces", () => {
    // Fifty-one rows, each truncated by up to one unit in the sixth decimal place of a percent.
    // The decomposition is exact on the tokens and short by at most 5.1e-5 points on the
    // percentages, which is what the tolerance exists for and well below anything visible.
    const rows: ShareObservation[] = Array.from({ length: 50 }, (_, index) =>
      observation({
        permaslug: `lab/model-${index}`,
        tokens: 333_333_333_333n + BigInt(index),
        labSlug: "openai",
        labName: "OpenAI",
        labAttributionState: "evidenced",
      }),
    );
    const named = rows.reduce((total, row) => total + row.tokens, 0n);
    rows.push(
      observation({
        permaslug: "other",
        tokens: 7n,
        isResidual: true,
        labAttributionState: "not_applicable",
      }),
    );

    expect(checkDerivation(deriveMarketShare("2026-09-15", "final", named + 7n, rows))).toEqual([]);
  });
});
