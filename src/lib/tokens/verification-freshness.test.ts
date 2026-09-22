import { describe, expect, it } from "vitest";

import {
  freshnessSummary,
  verificationFreshness,
  VERIFICATION_REVIEW_INTERVAL_DAYS,
} from "@/lib/tokens/verification-freshness";
import { WAVE1_PROVIDERS } from "@/lib/tokens/types";
import type { PersistedBenchmarkRow } from "@/lib/tokens/read/benchmark-store";
import type { TokenVerificationEvent } from "@/lib/tokens/read/verification-events";

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

/** One attestation: a person read the page at an instant and said what they checked. */
function event(provider: string, verifiedAt: string, over: Partial<TokenVerificationEvent> = {}): TokenVerificationEvent {
  return {
    id: `${provider}-verified-${verifiedAt}`,
    providerSlug: provider,
    verifiedBy: "Bryceson",
    verifiedAt,
    evidence: `read the first-party pricing surface for ${provider}`,
    observedState: "value",
    benchmarkId: `${provider}-2026-09-14T12:03:02.002Z`,
    verificationPurpose: "production",
    ...over,
  };
}

/** Production as it actually stood: every Wave-1 provider frozen and attested on 14 September. */
const SEP_14 = WAVE1_PROVIDERS.map((p) => row(p, "2026-09-14T12:03:02.002Z"));
const SEP_14_EVENTS = WAVE1_PROVIDERS.map((p) => event(p, "2026-09-14T12:03:02.002Z"));

describe("an unchanged price and an unwatched provider look identical, so the age of the attestation is what is reported", () => {
  it("calls a provider current inside the review interval", () => {
    const report = verificationFreshness(SEP_14, SEP_14_EVENTS, new Date("2026-09-16T07:00:00Z"));
    expect(report.ok).toBe(true);
    expect(report.reviewDue).toEqual([]);
    for (const provider of report.providers) {
      expect(provider.state).toBe("current");
      expect(provider.ageDays).toBe(1);
      expect(provider.lastVerifiedBy).toBe("Bryceson");
    }
  });

  it("does not treat a single frozen point as a problem, because the methodology records only changes", () => {
    // One row per provider is what an unchanged price is supposed to look like. Nothing here
    // asks for daily history, and nothing reports its absence as a fault.
    const report = verificationFreshness(SEP_14, SEP_14_EVENTS, new Date("2026-09-16T07:00:00Z"));
    for (const provider of report.providers) expect(provider.frozenPoints).toBe(1);
    expect(report.ok).toBe(true);
  });

  it("reports every provider as due once the interval passes with nobody looking", () => {
    // The incident, run forward: same data, more days. This is the line nothing was saying.
    const report = verificationFreshness(SEP_14, SEP_14_EVENTS, new Date("2026-09-24T07:00:00Z"));
    expect(report.ok).toBe(false);
    expect(report.reviewDue).toEqual([...WAVE1_PROVIDERS]);
    for (const provider of report.providers) expect(provider.ageDays).toBe(9);
  });

  it("turns due exactly at the interval boundary and not before", () => {
    const base = Date.parse("2026-09-14T12:03:02.002Z");
    const dayBefore = new Date(base + (VERIFICATION_REVIEW_INTERVAL_DAYS - 1) * 86_400_000);
    const onInterval = new Date(base + VERIFICATION_REVIEW_INTERVAL_DAYS * 86_400_000);
    expect(verificationFreshness(SEP_14, SEP_14_EVENTS, dayBefore).ok).toBe(true);
    expect(verificationFreshness(SEP_14, SEP_14_EVENTS, onInterval).ok).toBe(false);
  });
});

describe("freshness is the age of the attestation, not the age of the calculation", () => {
  it("goes current on an unchanged review that moved no price and froze no point", () => {
    // The bug this replaces, stated as a test. On 22 September a person re-read all seven
    // pages and every price was unchanged, so the methodology correctly wrote no observation
    // and froze no benchmark: the newest calculation is still 14 September and always will
    // be until a price moves. Reading freshness from that instant reported a completed review
    // as though it had never happened.
    const reviewed = WAVE1_PROVIDERS.map((p) => event(p, "2026-09-22T09:00:00Z"));
    const report = verificationFreshness(SEP_14, [...SEP_14_EVENTS, ...reviewed], new Date("2026-09-22T09:00:00Z"));

    expect(report.ok).toBe(true);
    for (const provider of report.providers) {
      expect(provider.state).toBe("current");
      expect(provider.ageDays).toBe(0);
      expect(provider.lastVerifiedAt).toBe("2026-09-22T09:00:00Z");
      // The calculation did not move, and did not need to.
      expect(provider.frozenPoints).toBe(1);
    }
  });

  it("measures from the newest attestation when a provider has several", () => {
    const events = [...SEP_14_EVENTS, event("anthropic", "2026-09-20T09:00:00Z")];
    const report = verificationFreshness(SEP_14, events, new Date("2026-09-22T07:00:00Z"));
    const anthropic = report.providers.find((p) => p.provider === "anthropic")!;
    expect(anthropic.lastVerifiedAt).toBe("2026-09-20T09:00:00Z");
    expect(anthropic.ageDays).toBe(1);
    expect(anthropic.verificationEvents).toBe(2);
    // The others are untouched and now overdue, so one fresh provider cannot mask the rest.
    expect(report.reviewDue).not.toContain("anthropic");
    expect(report.reviewDue).toContain("openai");
    expect(report.ok).toBe(false);
  });

  it("does not let an older attestation pull a provider backwards", () => {
    // Events arrive in whatever order the database returns them; the newest must win.
    const events = [event("anthropic", "2026-09-22T09:00:00Z"), event("anthropic", "2026-09-14T12:03:02.002Z")];
    const report = verificationFreshness([row("anthropic", "2026-09-14T12:03:02.002Z")], events, new Date("2026-09-22T09:00:00Z"));
    const anthropic = report.providers.find((p) => p.provider === "anthropic")!;
    expect(anthropic.lastVerifiedAt).toBe("2026-09-22T09:00:00Z");
    expect(anthropic.ageDays).toBe(0);
  });
});

describe("an attestation alone is not health: the watchdog fails closed", () => {
  it("refuses to call a provider current when nothing is frozen behind the attestation", () => {
    // Someone ran the command against a database with no benchmark at all. That is evidence
    // that a command ran, not evidence that a published value is sound, and reporting it as
    // current would leave the watchdog reporting on its own inputs.
    const report = verificationFreshness([], WAVE1_PROVIDERS.map((p) => event(p, "2026-09-22T09:00:00Z")), new Date("2026-09-22T09:00:00Z"));
    expect(report.ok).toBe(false);
    expect(report.neverVerified).toEqual([...WAVE1_PROVIDERS]);
    for (const provider of report.providers) {
      expect(provider.state).toBe("never_verified");
      expect(provider.lastVerifiedAt).toBeNull();
      expect(provider.ageDays).toBeNull();
    }
  });

  it("ignores an attestation that names no benchmark, however recent", () => {
    const stray = event("anthropic", "2026-09-22T09:00:00Z", { benchmarkId: null });
    const report = verificationFreshness(SEP_14, [...SEP_14_EVENTS, stray], new Date("2026-09-22T09:00:00Z"));
    const anthropic = report.providers.find((p) => p.provider === "anthropic")!;
    // Falls back to the real 14 September attestation, which is now overdue.
    expect(anthropic.lastVerifiedAt).toBe("2026-09-14T12:03:02.002Z");
    expect(anthropic.state).toBe("review_due");
  });

  it("reports a frozen provider that nobody is on record as having checked", () => {
    const events = SEP_14_EVENTS.filter((e) => e.providerSlug !== "moonshot");
    const report = verificationFreshness(SEP_14, events, new Date("2026-09-16T07:00:00Z"));
    const moonshot = report.providers.find((p) => p.provider === "moonshot")!;
    expect(moonshot.state).toBe("never_verified");
    expect(moonshot.lastVerifiedAt).toBeNull();
    // The two causes stay distinguishable in the payload: this provider has a value, it just
    // has nobody's name against it.
    expect(moonshot.frozenPoints).toBe(1);
    expect(moonshot.verificationEvents).toBe(0);
    expect(report.ok).toBe(false);
  });
});

describe("a provider nobody has ever verified is the loudest thing this can say", () => {
  it("lists a missing provider rather than omitting it", () => {
    const partial = SEP_14.filter((r) => r.providerSlug !== "moonshot");
    const events = SEP_14_EVENTS.filter((e) => e.providerSlug !== "moonshot");
    const report = verificationFreshness(partial, events, new Date("2026-09-16T07:00:00Z"));
    expect(report.neverVerified).toEqual(["moonshot"]);
    expect(report.ok).toBe(false);
    const moonshot = report.providers.find((p) => p.provider === "moonshot")!;
    expect(moonshot.state).toBe("never_verified");
    expect(moonshot.lastVerifiedAt).toBeNull();
    expect(moonshot.ageDays).toBeNull();
    expect(moonshot.frozenPoints).toBe(0);
  });

  it("covers every Wave-1 provider on an empty database", () => {
    const report = verificationFreshness([], [], new Date("2026-09-16T07:00:00Z"));
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
            withheldReason: "NO_STANDARD_SERVICE_TIER",
            priceUsdPer1m: null,
            benchmarkModelId: null,
          })
        : r,
    );
    const events = SEP_14_EVENTS.map((e) =>
      e.providerSlug === "deepseek" ? event("deepseek", e.verifiedAt, { observedState: "withheld" }) : e,
    );
    const report = verificationFreshness(rows, events, new Date("2026-09-16T07:00:00Z"));
    const deepseek = report.providers.find((p) => p.provider === "deepseek")!;
    expect(deepseek.state).toBe("current");
    expect(deepseek.latestStatus).toBe("withheld");
    expect(deepseek.withheldReason).toBe("NO_STANDARD_SERVICE_TIER");
    expect(report.ok).toBe(true);
  });

  it("refreshes a withholding on a later review without producing any value", () => {
    const rows = [
      row("deepseek", "2026-09-14T17:43:35.197Z", {
        calculationStatus: "withheld",
        withheldReason: "NO_STANDARD_SERVICE_TIER",
        priceUsdPer1m: null,
        benchmarkModelId: null,
      }),
    ];
    const events = [
      event("deepseek", "2026-09-14T17:43:35.197Z", { observedState: "withheld" }),
      event("deepseek", "2026-09-22T09:00:00Z", { observedState: "withheld" }),
    ];
    const report = verificationFreshness(rows, events, new Date("2026-09-22T09:00:00Z"));
    const deepseek = report.providers.find((p) => p.provider === "deepseek")!;
    expect(deepseek.state).toBe("current");
    expect(deepseek.ageDays).toBe(0);
    expect(deepseek.latestStatus).toBe("withheld");
    // Still exactly one frozen row, and still no price: freshness moved, the decision did not.
    expect(deepseek.frozenPoints).toBe(1);
    expect(rows[0]!.priceUsdPer1m).toBeNull();
  });
});

describe("the summary line", () => {
  it("names every provider and its age without needing the payload opened", () => {
    const summary = freshnessSummary(verificationFreshness(SEP_14, SEP_14_EVENTS, new Date("2026-09-24T07:00:00Z")));
    expect(summary).toContain("review_due");
    expect(summary).toContain("interval=7d");
    for (const provider of WAVE1_PROVIDERS) expect(summary).toContain(`${provider}=9d`);
  });

  it("says ok when nothing needs a person", () => {
    expect(freshnessSummary(verificationFreshness(SEP_14, SEP_14_EVENTS, new Date("2026-09-16T07:00:00Z")))).toMatch(/^ok /);
  });
});

describe("the watchdog reads only what Urdais already holds", () => {
  it("is a pure function of the rows, the events and the clock", () => {
    const now = new Date("2026-09-16T07:00:00Z");
    const before = JSON.stringify([SEP_14, SEP_14_EVENTS]);
    expect(verificationFreshness(SEP_14, SEP_14_EVENTS, now)).toEqual(verificationFreshness(SEP_14, SEP_14_EVENTS, now));
    // Nothing is mutated and no provider contacted; the inputs are the whole world it sees.
    expect(JSON.stringify([SEP_14, SEP_14_EVENTS])).toBe(before);
  });
});
