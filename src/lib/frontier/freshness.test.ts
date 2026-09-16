import { describe, expect, it } from "vitest";

import {
  CAPABILITY_CHECK_INTERVAL_DAYS,
  PRICE_VERIFICATION_INTERVAL_DAYS,
  assessFreshness,
  freshnessLine,
} from "@/lib/frontier/freshness";
import { VERIFICATION_REVIEW_INTERVAL_DAYS } from "@/lib/tokens/verification-freshness";

const NOW = new Date("2026-09-20T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const input = (over: Partial<Parameters<typeof assessFreshness>[0]> = {}) => ({
  lastRetrievalAt: daysAgo(4),
  lastBundleHash: "a".repeat(64),
  schedulerLastRanAt: daysAgo(0),
  priceLastVerifiedAt: daysAgo(1),
  priceLatestObservationDate: "2026-09-14",
  priceReviewDue: [] as string[],
  priceNeverVerified: [] as string[],
  now: NOW,
  ...over,
});

describe("the price threshold is adopted, not invented", () => {
  it("is the Token Price watchdog's own review interval", () => {
    // Two products disagreeing about when a price is stale would be worse than either answer.
    expect(PRICE_VERIFICATION_INTERVAL_DAYS).toBe(VERIFICATION_REVIEW_INTERVAL_DAYS);
    expect(PRICE_VERIFICATION_INTERVAL_DAYS).toBe(7);
  });

  it("allows one missed capability run before calling the scheduler stale", () => {
    expect(CAPABILITY_CHECK_INTERVAL_DAYS).toBe(2);
  });
});

describe("healthy states", () => {
  it("reports capability-source-unchanged when both clocks are inside their windows", () => {
    const freshness = assessFreshness(input());
    expect(freshness.state).toBe("capability-source-unchanged");
    expect(freshness.ok).toBe(true);
    expect(freshness.capability.healthy).toBe(true);
    expect(freshness.price.healthy).toBe(true);
  });

  it("stays healthy across a long unchanged stretch, because that is Epoch's ordinary cadence", () => {
    // The source has not moved in three weeks and the scheduler ran today. Nothing is wrong.
    const freshness = assessFreshness(input({ lastRetrievalAt: daysAgo(21) }));
    expect(freshness.ok).toBe(true);
    expect(freshness.capability.retrievalAgeDays).toBe(21);
    expect(freshness.capability.healthy).toBe(true);
  });

  it("names the price acquisition mode, so nothing reads it as an ingestion clock", () => {
    expect(assessFreshness(input()).price.acquisitionMode).toBe("human_verified");
  });
});

describe("approaching the price threshold", () => {
  it("is visible before it is stale", () => {
    const freshness = assessFreshness(input({ priceLastVerifiedAt: daysAgo(5) }));
    expect(freshness.state).toBe("price-verification-due");
    expect(freshness.price.approachingThreshold).toBe(true);
    // Still healthy: due is a request for a person, not a failure.
    expect(freshness.price.healthy).toBe(true);
    expect(freshness.ok).toBe(true);
  });

  it("is not raised while the verification is comfortably recent", () => {
    expect(assessFreshness(input({ priceLastVerifiedAt: daysAgo(2) })).state).toBe("capability-source-unchanged");
  });
});

describe("stale states", () => {
  it("fails on a price verification past its threshold, even though the chart still renders", () => {
    const freshness = assessFreshness(input({ priceLastVerifiedAt: daysAgo(9) }));
    expect(freshness.state).toBe("stale");
    expect(freshness.ok).toBe(false);
    expect(freshness.price.detail).toMatch(/a person must check/);
    // The capability side is untouched by it: two clocks, reported separately.
    expect(freshness.capability.healthy).toBe(true);
  });

  it("fails exactly at the threshold rather than a day late", () => {
    expect(assessFreshness(input({ priceLastVerifiedAt: daysAgo(7) })).ok).toBe(false);
    expect(assessFreshness(input({ priceLastVerifiedAt: daysAgo(6) })).ok).toBe(true);
  });

  it("fails when a provider has never been verified, whatever the others say", () => {
    const freshness = assessFreshness(input({ priceNeverVerified: ["moonshot"] }));
    expect(freshness.ok).toBe(false);
    expect(freshness.price.detail).toMatch(/never verified: moonshot/);
  });

  it("fails when the capability scheduler has stopped", () => {
    const freshness = assessFreshness(input({ schedulerLastRanAt: daysAgo(5) }));
    expect(freshness.state).toBe("stale");
    expect(freshness.capability.healthy).toBe(false);
    expect(freshness.capability.detail).toMatch(/beyond the 2-day interval/);
  });

  it("does not assume the scheduler ran when nothing recorded a run", () => {
    // The silent-stop case. An absent record is unverified, never healthy by default.
    const freshness = assessFreshness(input({ schedulerLastRanAt: null }));
    expect(freshness.capability.healthy).toBe(false);
    expect(freshness.capability.detail).toMatch(/unverified/);
  });

  it("does not let a recent scheduler run excuse a stale price, or the reverse", () => {
    expect(assessFreshness(input({ schedulerLastRanAt: daysAgo(0), priceLastVerifiedAt: daysAgo(30) })).ok).toBe(false);
    expect(assessFreshness(input({ schedulerLastRanAt: daysAgo(30), priceLastVerifiedAt: daysAgo(0) })).ok).toBe(false);
  });
});

describe("the summary line", () => {
  it("carries both clocks and names the acquisition mode", () => {
    const line = freshnessLine(assessFreshness(input()));
    expect(line).toMatch(/capability scheduler 0d\/2d/);
    expect(line).toMatch(/price verified 1d\/7d \(human-verified\)/);
  });
});

describe("what freshness is not", () => {
  it("never fabricates a newer date to clear a stale state", () => {
    // The only inputs are the recorded instants. There is no branch that invents one, and the
    // reported dates are the ones passed in, unchanged.
    const stale = assessFreshness(input({ priceLastVerifiedAt: daysAgo(40), priceLatestObservationDate: "2026-09-14" }));
    expect(stale.price.latestObservationDate).toBe("2026-09-14");
    expect(stale.price.lastVerifiedAt).toBe(daysAgo(40));
    expect(stale.ok).toBe(false);
  });
});
