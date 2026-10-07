/**
 * Source freshness on the public read model.
 *
 * `calculatedAt` says when the arithmetic last ran, which is daily. What a reader needs is how old
 * the data under it is, per market, and that SPP — blocked from publication — never reaches the
 * response through this door either.
 */

import { describe, expect, it } from "vitest";

import { METHODOLOGY_VERSION } from "@/lib/interconnection-queue/analytics/methodology";
import {
  loadQueueAnalytics, unavailableQueueAnalytics, validatePublicQueueAnalytics,
  type QueueAnalyticsReadModel,
} from "@/lib/interconnection-queue/analytics/read";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

const NOW = new Date("2026-10-06T12:00:00.000Z");

const result = (market: string, name: string) => ({
  market_slug: market, market_name: name, source_name: `${name} source`,
  metric: "active_request_count", label: "Active projects", family: "stock", comparability: "A",
  dimension_kind: null, dimension_value: null, status: "live", value: "100",
  unit: "requests", native_field: null, basis: null, sample_size: 100, population_size: 200,
  coverage: {}, attribution: null,
});

function executor(freshness: Record<string, unknown>[], lastChecked: string | null = null) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const sql: CapacitySqlExecutor = {
    async query(text, params = []) {
      calls.push({ sql: text, params: [...params] });
      if (text.includes("from pipeline.interconnection_analytics_runs r")) {
        return { rows: [{ id: "run", calculated_at: "2026-10-06T09:30:00Z", input_digest: "d",
          snapshots: 7, version: METHODOLOGY_VERSION, slug: "interconnection-queue-analytics",
          name: "Urdais Interconnection Queue Analytics", document_path: "x" }] };
      }
      if (text.includes("publication_state = 'publishable'")) {
        return { rows: [result("caiso", "CAISO"), result("ercot", "ERCOT"), result("pjm", "PJM")] };
      }
      if (text.includes("interconnection_queue_snapshots")) return { rows: freshness };
      if (text.includes("interconnection_source_checks")) return { rows: [{ checked_at: lastChecked }] };
      if (text.includes("interconnection_metric_definitions")) {
        return { rows: [{ code: "mw_completion_rate", label: "Capacity completion rate", deferred_reason: "x" }] };
      }
      return { rows: [] };
    },
  };
  return { sql, calls };
}

describe("source freshness on the read model", () => {
  it("states each published market's source age against its own threshold", async () => {
    const { sql, calls } = executor([
      { market_slug: "caiso", stale_after_hours: 72, observed_at: "2026-10-06T09:00:00Z",
        source_published_at: "2026-10-06T06:00:00Z", report_period: null },
      // Fifteen days old against a 168-hour threshold.
      { market_slug: "pjm", stale_after_hours: 168, observed_at: "2026-09-21T12:00:00Z",
        source_published_at: null, report_period: null },
      { market_slug: "ercot", stale_after_hours: 1128, observed_at: "2026-09-02T00:00:00Z",
        source_published_at: "2026-09-02T00:00:00Z", report_period: "2026-08-01" },
    ], "2026-10-06T09:31:00Z");

    const model = await loadQueueAnalytics(sql, { now: NOW });

    const noChecks = { lastCheckedAt: null, lastSuccessfulCheckAt: null, contentUnchangedWarning: false };
    expect(model.sourceFreshness).toEqual([
      { marketSlug: "caiso", observedAt: "2026-10-06T09:00:00Z", sourcePublishedAt: "2026-10-06T06:00:00Z",
        reportPeriod: null, ageHours: 3, staleAfterHours: 72, status: "current",
        condition: "current", basis: "source_published", publicationAgeHours: 6, ...noChecks },
      { marketSlug: "ercot", observedAt: "2026-09-02T00:00:00Z", sourcePublishedAt: "2026-09-02T00:00:00Z",
        reportPeriod: "2026-08-01", ageHours: 828, staleAfterHours: 1128, status: "current",
        condition: "current", basis: "source_published", publicationAgeHours: 828, ...noChecks },
      // No scheduled check on record and no cadence given: judged exactly as before the checks.
      { marketSlug: "pjm", observedAt: "2026-09-21T12:00:00Z", sourcePublishedAt: null,
        reportPeriod: null, ageHours: 360, staleAfterHours: 168, status: "stale",
        condition: "check_stale", basis: "observed_release", publicationAgeHours: null, ...noChecks },
    ]);
    expect(model.lastCheckedAt).toBe("2026-10-06T09:31:00Z");
    // Only the published markets are asked about, so SPP's snapshot is never read for display.
    const asked = calls.find((call) => call.sql.includes("interconnection_queue_snapshots"))!;
    expect(asked.params[0]).toEqual(["caiso", "ercot", "pjm"]);
    expect(model.sourceFreshness.some((entry) => entry.marketSlug === "spp")).toBe(false);
    expect(validatePublicQueueAnalytics(model)).toEqual([]);
  });

  it("serves PJM as current with a content-unchanged warning when it was reached today", async () => {
    const { sql } = executor([
      { market_slug: "caiso", source_slug: "caiso-public-queue-report", expected_cadence: "daily",
        stale_after_hours: 72, observed_at: "2026-10-06T09:00:00Z", source_published_at: "2026-10-06T06:00:00Z",
        report_period: null, last_checked_at: "2026-10-06T10:16:58Z", last_check_reachable: true,
        last_successful_check_at: "2026-10-06T10:16:58Z" },
      { market_slug: "pjm", source_slug: "pjm-planning-queues", expected_cadence: "continuous",
        stale_after_hours: 168, observed_at: "2026-09-21T12:00:00Z", source_published_at: null,
        report_period: null, last_checked_at: "2026-10-06T10:16:50Z", last_check_reachable: true,
        last_successful_check_at: "2026-10-06T10:16:50Z" },
    ], "2026-10-06T10:17:08Z");

    const model = await loadQueueAnalytics(sql, { now: NOW });

    expect(model.sourceFreshness.find((entry) => entry.marketSlug === "pjm")).toEqual({
      marketSlug: "pjm", observedAt: "2026-09-21T12:00:00Z", sourcePublishedAt: null, reportPeriod: null,
      ageHours: 360, staleAfterHours: 168, status: "current", condition: "content_unchanged",
      basis: "continuous", lastCheckedAt: "2026-10-06T10:16:50Z",
      lastSuccessfulCheckAt: "2026-10-06T10:16:50Z", contentUnchangedWarning: true, publicationAgeHours: null,
    });
  });

  it("serves a market whose latest check failed as unreachable", async () => {
    const { sql } = executor([
      { market_slug: "pjm", source_slug: "pjm-planning-queues", expected_cadence: "continuous",
        stale_after_hours: 168, observed_at: "2026-10-06T08:00:00Z", source_published_at: null,
        report_period: null, last_checked_at: "2026-10-06T10:16:50Z", last_check_reachable: false,
        last_successful_check_at: "2026-10-05T10:16:50Z" },
    ]);
    const model = await loadQueueAnalytics(sql, { now: NOW });
    expect(model.sourceFreshness.find((entry) => entry.marketSlug === "pjm"))
      .toMatchObject({ status: "unavailable", condition: "unreachable" });
  });

  it("reports a published market with no snapshot as unavailable rather than dropping it", async () => {
    const { sql } = executor([]);
    const model = await loadQueueAnalytics(sql, { now: NOW });
    expect(model.sourceFreshness.map((entry) => [entry.marketSlug, entry.status, entry.observedAt]))
      .toEqual([["caiso", "unavailable", null], ["ercot", "unavailable", null], ["pjm", "unavailable", null]]);
    expect(model.lastCheckedAt).toBeNull();
  });

  it("serves no freshness on the unavailable model", () => {
    expect(unavailableQueueAnalytics().sourceFreshness).toEqual([]);
    expect(unavailableQueueAnalytics().lastCheckedAt).toBeNull();
  });
});

describe("the freshness contract", () => {
  const base = (): QueueAnalyticsReadModel => ({
    ...unavailableQueueAnalytics(),
    deferredMetrics: [{ metric: "mw_completion_rate", label: "x", reason: "y" }],
    markets: [{ marketSlug: "pjm", marketName: "PJM", sourceName: "s", attribution: null, metrics: [] }],
  });

  it("refuses a published market served without its source age", () => {
    expect(validatePublicQueueAnalytics(base()).join(" ")).toMatch(/pjm is published without the age of its source/);
  });

  it("refuses freshness for a market blocked from publication", () => {
    const model: QueueAnalyticsReadModel = {
      ...base(),
      sourceFreshness: [
        { marketSlug: "pjm", observedAt: null, sourcePublishedAt: null, reportPeriod: null,
          ageHours: null, staleAfterHours: null, status: "unavailable",
          condition: "unavailable", basis: null, lastCheckedAt: null, lastSuccessfulCheckAt: null, contentUnchangedWarning: false, publicationAgeHours: null },
        { marketSlug: "spp", observedAt: null, sourcePublishedAt: null, reportPeriod: null,
          ageHours: null, staleAfterHours: null, status: "unavailable",
          condition: "unavailable", basis: null, lastCheckedAt: null, lastSuccessfulCheckAt: null, contentUnchangedWarning: false, publicationAgeHours: null },
      ],
    };
    expect(validatePublicQueueAnalytics(model).join(" ")).toMatch(/spp is blocked from publication/);
  });
});
