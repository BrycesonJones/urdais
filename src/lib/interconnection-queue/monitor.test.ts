/**
 * Source freshness keeps three clocks apart: when the publisher was last reached, when the content
 * last changed, and when the publisher says it published. PJM is the case that forced it: a feed
 * checked successfully today, whose artifact is byte-identical to September's, was being reported
 * as an operationally stale source.
 */

import { describe, expect, it } from "vitest";

import { assessFreshness, type FreshnessInputs } from "@/lib/interconnection-queue/monitor";

const NOW = new Date("2026-10-07T10:30:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

const pjm = (overrides: Partial<FreshnessInputs> = {}): FreshnessInputs => ({
  sourceInterfaceSlug: "pjm-planning-queues", expectedCadence: "continuous", staleAfterHours: 168,
  latestObservedAt: hoursAgo(376), sourcePublishedAt: null,
  lastCheckedAt: hoursAgo(0.2), lastCheckReachable: true, lastSuccessfulCheckAt: hoursAgo(0.2),
  ...overrides,
});

const caiso = (overrides: Partial<FreshnessInputs> = {}): FreshnessInputs => ({
  sourceInterfaceSlug: "caiso-public-queue-report", expectedCadence: "daily", staleAfterHours: 72,
  latestObservedAt: hoursAgo(1), sourcePublishedAt: hoursAgo(10),
  lastCheckedAt: hoursAgo(0.2), lastCheckReachable: true, lastSuccessfulCheckAt: hoursAgo(0.2),
  ...overrides,
});

describe("a continuously refreshed source (PJM)", () => {
  it("is current, with a content-unchanged warning, when an identical artifact was fetched today", () => {
    expect(assessFreshness(pjm(), NOW)).toEqual({
      status: "current", condition: "content_unchanged", basis: "continuous",
      lastCheckedAt: hoursAgo(0.2), lastSuccessfulCheckAt: hoursAgo(0.2),
      latestContentObservedAt: hoursAgo(376), contentAgeHours: 376, contentUnchangedWarning: true,
      sourcePublishedAt: null, publicationAgeHours: null,
    });
  });

  it("clears the warning when a changed artifact produces a new snapshot", () => {
    const result = assessFreshness(pjm({ latestObservedAt: hoursAgo(0.2) }), NOW);
    expect(result).toMatchObject({ status: "current", condition: "current", contentUnchangedWarning: false });
  });

  it("fails closed when the latest check could not reach the publisher, however young the snapshot", () => {
    const result = assessFreshness(pjm({
      latestObservedAt: hoursAgo(1), lastCheckReachable: false, lastSuccessfulCheckAt: hoursAgo(24),
    }), NOW);
    expect(result).toMatchObject({ status: "unavailable", condition: "unreachable" });
  });

  it("is stale when no successful contact falls inside the threshold", () => {
    const result = assessFreshness(pjm({
      lastCheckedAt: hoursAgo(200), lastSuccessfulCheckAt: hoursAgo(200),
    }), NOW);
    expect(result).toMatchObject({ status: "stale", condition: "check_stale" });
  });

  it("does not count a check that reached the publisher but stored nothing as a success", () => {
    // A parse failure: reachable, but no snapshot matched, so no successful contact is recorded.
    const result = assessFreshness(pjm({ lastSuccessfulCheckAt: null }), NOW, {
      sourceInterfaceSlug: "pjm-planning-queues", checkedAt: NOW.toISOString(),
      reachable: true, successful: false,
    });
    expect(result).toMatchObject({ status: "stale", condition: "check_stale" });
  });

  it("is judged as before when no scheduled check has ever been recorded", () => {
    const old = assessFreshness(pjm({ lastCheckedAt: null, lastCheckReachable: null, lastSuccessfulCheckAt: null }), NOW);
    expect(old).toMatchObject({ status: "stale", condition: "check_stale" });
    const young = assessFreshness(pjm({ latestObservedAt: hoursAgo(5), lastCheckedAt: null,
      lastCheckReachable: null, lastSuccessfulCheckAt: null }), NOW);
    expect(young).toMatchObject({ status: "current", condition: "current" });
  });

  it("is unavailable when it has never been ingested", () => {
    expect(assessFreshness(pjm({ latestObservedAt: null }), NOW))
      .toMatchObject({ status: "unavailable", condition: "unavailable", contentUnchangedWarning: false });
  });
});

describe("a check made in this run", () => {
  it("counts before the row that records it exists", () => {
    const result = assessFreshness(pjm({ lastCheckedAt: hoursAgo(200), lastSuccessfulCheckAt: hoursAgo(200) }), NOW, {
      sourceInterfaceSlug: "pjm-planning-queues", checkedAt: NOW.toISOString(), reachable: true, successful: true,
    });
    expect(result).toMatchObject({ status: "current", condition: "content_unchanged", lastSuccessfulCheckAt: NOW.toISOString() });
  });

  it("overrides an earlier successful check when it could not reach the publisher", () => {
    const result = assessFreshness(pjm({ latestObservedAt: hoursAgo(1) }), NOW, {
      sourceInterfaceSlug: "pjm-planning-queues", checkedAt: NOW.toISOString(), reachable: false, successful: false,
    });
    expect(result).toMatchObject({ status: "unavailable", condition: "unreachable", lastSuccessfulCheckAt: hoursAgo(0.2) });
  });
});

describe("a release-based source", () => {
  it("is stale by the publisher's timestamp even when it was checked successfully today", () => {
    const result = assessFreshness(caiso({ sourcePublishedAt: hoursAgo(100) }), NOW);
    expect(result).toMatchObject({
      status: "stale", condition: "source_data_stale", basis: "source_published",
      publicationAgeHours: 100, contentUnchangedWarning: false,
    });
  });

  it("is current when the publisher's timestamp is inside the window", () => {
    expect(assessFreshness(caiso(), NOW)).toMatchObject({ status: "current", condition: "current", basis: "source_published" });
  });

  it("applies the same rule to a monthly archive", () => {
    const ercot = caiso({ sourceInterfaceSlug: "ercot-gis-report", expectedCadence: "monthly",
      staleAfterHours: 1128, latestObservedAt: hoursAgo(1200), sourcePublishedAt: hoursAgo(1200) });
    expect(assessFreshness(ercot, NOW)).toMatchObject({ status: "stale", condition: "source_data_stale" });
  });

  it("keeps the observed-release rule for a daily source with no timestamp, and never warns instead", () => {
    // ISO-NE: daily, no release key. A fresh check does not excuse three days without a change.
    const isone = caiso({ sourceInterfaceSlug: "iso-ne-interconnection-queue",
      latestObservedAt: hoursAgo(80), sourcePublishedAt: null });
    expect(assessFreshness(isone, NOW)).toMatchObject({
      status: "stale", condition: "source_data_stale", basis: "observed_release", contentUnchangedWarning: false,
    });
  });
});
