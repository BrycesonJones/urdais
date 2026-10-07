/**
 * The Interconnection Queue badge is a claim about the sources.
 *
 * It used to read "Live" unconditionally beside the date the analytics were last recalculated,
 * which is daily whatever the inputs. These tests hold it to the per-market source ages instead,
 * and require a stale state to keep the figures on screen.
 */

import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { InterconnectionQueue } from "@/components/power-analytics/interconnection-queue";
import type {
  MarketAnalytics, MarketSourceFreshness, QueueAnalyticsReadModel,
} from "@/lib/interconnection-queue/analytics/read";

const market = (slug: string, name: string, active: number): MarketAnalytics => ({
  marketSlug: slug, marketName: name, sourceName: `${name} source`, attribution: null,
  metrics: [{ metric: "active_request_count", label: "", family: "stock", comparability: "A",
    dimension: null, status: "live", value: active, unit: "requests", nativeField: null, basis: null,
    sampleSize: active, populationSize: active, coverage: {} }],
});

const fresh = (slug: string, observedAt: string | null,
  status: MarketSourceFreshness["status"],
  extra: Partial<MarketSourceFreshness> = {}): MarketSourceFreshness => ({
  marketSlug: slug, observedAt, sourcePublishedAt: null, reportPeriod: null,
  ageHours: null, staleAfterHours: 168, status,
  condition: status === "current" ? "current" : status === "stale" ? "source_data_stale" : "unavailable",
  basis: "continuous", lastCheckedAt: null, lastSuccessfulCheckAt: null,
  contentUnchangedWarning: false, publicationAgeHours: null, ...extra,
});

const model = (sourceFreshness: MarketSourceFreshness[]): QueueAnalyticsReadModel => ({
  methodology: {
    slug: "interconnection-queue-analytics", version: "1.0.0",
    documentPath: "/docs/methodology/interconnection-queue-analytics",
    title: "Urdais Interconnection Queue Analytics",
  },
  calculatedAt: "2026-10-06T09:30:00.000Z", inputDigest: "d", snapshotCount: 2,
  markets: [market("pjm", "PJM", 2781), market("caiso", "CAISO", 262)],
  sourceFreshness, lastCheckedAt: "2026-10-06T09:31:00.000Z",
  excludedMarkets: [], deferredMetrics: [], notes: [],
});

describe("the Interconnection Queue freshness badge", () => {
  it("reads Live only when every published market's source is current", () => {
    render(<InterconnectionQueue analytics={model([
      fresh("pjm", "2026-10-05T12:00:00.000Z", "current"),
      fresh("caiso", "2026-10-06T06:00:00.000Z", "current"),
    ])} />);
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.queryByText("Stale")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("source as of Oct 5, 2026")).toBeTruthy();
    expect(screen.getByText(/sources observed Oct 5, 2026 – Oct 6, 2026/)).toBeTruthy();
  });

  it("reads Stale, names the stale market and its date, and keeps the figures", () => {
    render(<InterconnectionQueue analytics={model([
      fresh("pjm", "2026-09-21T12:00:00.000Z", "stale"),
      fresh("caiso", "2026-10-06T06:00:00.000Z", "current"),
    ])} />);
    expect(screen.getByText("Stale")).toBeTruthy();
    expect(screen.queryByText("Live")).toBeNull();
    const banner = screen.getByRole("status");
    expect(banner.textContent).toMatch(/PJM \(as of Sep 21, 2026\)/);
    expect(banner.textContent).not.toMatch(/CAISO/);
    expect(screen.getByText("source as of Sep 21, 2026")).toBeTruthy();
    // The last validated figures stay on screen.
    expect(screen.getByText("2,781")).toBeTruthy();
  });

  it("does not read Live when a market has no source age at all", () => {
    render(<InterconnectionQueue analytics={model([
      fresh("pjm", "2026-10-05T12:00:00.000Z", "current"),
    ])} />);
    expect(screen.getByText("Stale")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/CAISO \(date unavailable\)/);
    expect(screen.getByText("source date unavailable")).toBeTruthy();
  });

  it("reads Live for a reachable PJM whose content is unchanged, and says so separately", () => {
    render(<InterconnectionQueue analytics={model([
      fresh("pjm", "2026-09-21T12:00:00.000Z", "current", {
        condition: "content_unchanged", contentUnchangedWarning: true,
        lastCheckedAt: "2026-10-07T10:16:50.000Z", lastSuccessfulCheckAt: "2026-10-07T10:16:50.000Z",
      }),
      fresh("caiso", "2026-10-07T06:00:00.000Z", "current"),
    ])} />);
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.queryByText("Stale")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("note").textContent).toMatch(/PJM: the publisher was reached at the last check/);
    expect(screen.getByText("checked Oct 7, 2026 · unchanged since Sep 21, 2026")).toBeTruthy();
  });

  it("names an unreachable market as unreachable, not as old data", () => {
    render(<InterconnectionQueue analytics={model([
      fresh("pjm", "2026-10-07T06:00:00.000Z", "unavailable", { condition: "unreachable" }),
      fresh("caiso", "2026-10-07T06:00:00.000Z", "current"),
    ])} />);
    expect(screen.getByText("Stale")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/PJM \(unreachable at the last check\)/);
  });

  it("names a market whose publisher data is old by its date", () => {
    render(<InterconnectionQueue analytics={model([
      fresh("pjm", "2026-10-07T06:00:00.000Z", "current"),
      fresh("caiso", "2026-10-02T00:00:00.000Z", "stale", { condition: "source_data_stale" }),
    ])} />);
    expect(screen.getByRole("status").textContent).toMatch(/CAISO \(as of Oct 2, 2026\)/);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("has no unconditional Live badge in its source", () => {
    const source = readFileSync("src/components/power-analytics/interconnection-queue.tsx", "utf8");
    expect(source).toMatch(/aside=\{live \?/);
  });
});
