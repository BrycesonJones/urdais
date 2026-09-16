import { describe, expect, it } from "vitest";

import {
  freshnessSummary,
  verificationFreshness,
  VERIFICATION_REVIEW_INTERVAL_DAYS,
} from "@/lib/tokens/verification-freshness";
import { WAVE1_PROVIDERS } from "@/lib/tokens/types";
import type { PersistedBenchmarkRow } from "@/lib/tokens/read/benchmark-store";

/** The production shape: one manually verified frozen row per provider, all on 14 September. */
function row(provider: string, calculatedAt: string, over: Partial<PersistedBenchmarkRow> = {}): PersistedBenchmarkRow {
  return {
    id: `${provider}-${calculatedAt}`,
    providerSlug: provider,
    methodologyVersion: "1.2",
    benchmarkModelId: "model",
    benchmarkModelName: "Model",
    calculationStatus: "value",
    withheldReason: null,
    priceUsdPer1m: 30,
    inputObservationId: "in",
    outputObservationId: "out",
    inputPriceUsdPer1m: 10,
    outputPriceUsdPer1m: 50,
    inputObservedAt: calculatedAt,
    outputObservedAt: calculatedAt,
    calculatedAt,
    ...over,
  };
}

/** Production as it actually stood: every Wave-1 provider verified once on 14 September. */
const SEP_14 = WAVE1_PROVIDERS.map((p) => row(p, "2026-09-14T12:03:02.002Z"));

describe("an unchanged price and an unwatched provider look identical, so age is what is reported", () => {
  it("calls a provider current inside the review interval", () => {
    const report = verificationFreshness(SEP_14, new Date("2026-09-16T07:00:00Z"));
    expect(report.ok).toBe(true);
    expect(report.reviewDue).toEqual([]);
    for (const provider of report.providers) {
      expect(provider.state).toBe("current");
      expect(provider.ageDays).toBe(1);
    }
  });

  it("does not treat a single frozen point as a problem, because the methodology records only changes", () => {
    // One row per provider is what an unchanged price is supposed to look like. Nothing here
    // asks for daily history, and nothing reports its absence as a fault.
    const report = verificationFreshness(SEP_14, new Date("2026-09-16T07:00:00Z"));
    for (const provider of report.providers) expect(provider.frozenPoints).toBe(1);
    expect(report.ok).toBe(true);
  });

  it("reports every provider as due once the interval passes with nobody looking", () => {
    // The incident, run forward: same data, more days. This is the line nothing was saying.
    const report = verificationFreshness(SEP_14, new Date("2026-09-24T07:00:00Z"));
    expect(report.ok).toBe(false);
    expect(report.reviewDue).toEqual([...WAVE1_PROVIDERS]);
    for (const provider of report.providers) expect(provider.ageDays).toBe(9);
  });

  it("turns due exactly at the interval boundary and not before", () => {
    const base = Date.parse("2026-09-14T12:03:02.002Z");
    const dayBefore = new Date(base + (VERIFICATION_REVIEW_INTERVAL_DAYS - 1) * 86_400_000);
    const onInterval = new Date(base + VERIFICATION_REVIEW_INTERVAL_DAYS * 86_400_000);
    expect(verificationFreshness(SEP_14, dayBefore).ok).toBe(true);
    expect(verificationFreshness(SEP_14, onInterval).ok).toBe(false);
  });
});

describe("a provider nobody has ever verified is the loudest thing this can say", () => {
  it("lists a missing provider rather than omitting it", () => {
    const partial = SEP_14.filter((r) => r.providerSlug !== "moonshot");
    const report = verificationFreshness(partial, new Date("2026-09-16T07:00:00Z"));
    expect(report.neverVerified).toEqual(["moonshot"]);
    expect(report.ok).toBe(false);
    const moonshot = report.providers.find((p) => p.provider === "moonshot")!;
    expect(moonshot.state).toBe("never_verified");
    expect(moonshot.lastVerifiedAt).toBeNull();
    expect(moonshot.ageDays).toBeNull();
    expect(moonshot.frozenPoints).toBe(0);
  });

  it("covers every Wave-1 provider on an empty database", () => {
    const report = verificationFreshness([], new Date("2026-09-16T07:00:00Z"));
    expect(report.providers.map((p) => p.provider)).toEqual([...WAVE1_PROVIDERS]);
    expect(report.neverVerified).toEqual([...WAVE1_PROVIDERS]);
    expect(report.ok).toBe(false);
  });
});

describe("a recorded withholding is a verification, not an absence", () => {
  it("counts DeepSeek's withholding as verified and carries its reason", () => {
    // DeepSeek publishes no standard rate, so its headline is withheld by design. Someone
    // still looked, and the report must not demand a re-check as though nobody had.
    const rows = SEP_14.map((r) =>
      r.providerSlug === "deepseek"
        ? row("deepseek", r.calculatedAt, {
            calculationStatus: "withheld",
            withheldReason: "no designated standard legs",
            priceUsdPer1m: null,
          })
        : r,
    );
    const report = verificationFreshness(rows, new Date("2026-09-16T07:00:00Z"));
    const deepseek = report.providers.find((p) => p.provider === "deepseek")!;
    expect(deepseek.state).toBe("current");
    expect(deepseek.latestStatus).toBe("withheld");
    expect(deepseek.withheldReason).toBe("no designated standard legs");
    expect(report.ok).toBe(true);
  });
});

describe("age follows the newest verification", () => {
  it("measures from the latest frozen row when a provider has several", () => {
    const rows = [
      ...SEP_14,
      row("anthropic", "2026-09-20T09:00:00Z", { priceUsdPer1m: 33 }),
    ];
    const report = verificationFreshness(rows, new Date("2026-09-22T07:00:00Z"));
    const anthropic = report.providers.find((p) => p.provider === "anthropic")!;
    expect(anthropic.lastVerifiedAt).toBe("2026-09-20T09:00:00Z");
    expect(anthropic.ageDays).toBe(1);
    expect(anthropic.frozenPoints).toBe(2);
    // The others are untouched and now overdue, so one fresh provider cannot mask the rest.
    expect(report.reviewDue).not.toContain("anthropic");
    expect(report.reviewDue).toContain("openai");
    expect(report.ok).toBe(false);
  });
});

describe("the summary line", () => {
  it("names every provider and its age without needing the payload opened", () => {
    const summary = freshnessSummary(verificationFreshness(SEP_14, new Date("2026-09-24T07:00:00Z")));
    expect(summary).toContain("review_due");
    expect(summary).toContain("interval=7d");
    for (const provider of WAVE1_PROVIDERS) expect(summary).toContain(`${provider}=9d`);
  });

  it("says ok when nothing needs a person", () => {
    expect(freshnessSummary(verificationFreshness(SEP_14, new Date("2026-09-16T07:00:00Z")))).toMatch(/^ok /);
  });
});

describe("the watchdog reads only what Urdais already holds", () => {
  it("is a pure function of the rows and the clock", () => {
    const now = new Date("2026-09-16T07:00:00Z");
    const before = JSON.stringify(SEP_14);
    expect(verificationFreshness(SEP_14, now)).toEqual(verificationFreshness(SEP_14, now));
    // No row is mutated and no provider contacted; the inputs are the whole world it sees.
    expect(JSON.stringify(SEP_14)).toBe(before);
  });
});
