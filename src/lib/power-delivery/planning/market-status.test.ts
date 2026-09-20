import { describe, expect, it } from "vitest";

import { planningMarketStatuses, publishableCurrentPlanningMarkets } from "@/lib/power-delivery/planning/market-status";
import type { PlanningSqlExecutor } from "@/lib/power-delivery/planning/read";

const NOW = new Date("2026-09-22T12:00:00.000Z");
const DAY = 86_400_000;
const recent = new Date(NOW.valueOf() - DAY).toISOString();

type Row = Record<string, unknown>;

const monitorRow = (over: Row = {}): Row => ({
  source_slug: "ercot-long-term-load-forecast", market_slug: "ercot", market_name: "ERCOT",
  discovery_url: "https://www.ercot.com/", discovery_method: "html_listing",
  expected_cadence: "annual", monitoring_state: "active", blocked_kind: null, blocked_reason: null,
  check_interval_ms: 30 * DAY,
  latest_id: "c1", latest_checked_at: recent, latest_outcome: "succeeded", latest_checker_version: "t",
  latest_checked_url: "u", latest_response_status: 200, latest_discovered_vintage_key: "ltlf-2025-04-adjusted",
  latest_discovered_published_at: null, latest_discovered_artifact_url: null,
  latest_discovered_artifact_hash: null, latest_error: null,
  success_id: "c1", success_checked_at: recent, success_outcome: "succeeded", success_checker_version: "t",
  success_checked_url: "u", success_response_status: 200, success_discovered_vintage_key: "ltlf-2025-04-adjusted",
  success_discovered_published_at: null, success_discovered_artifact_url: null,
  success_discovered_artifact_hash: null, success_error: null,
  served_key: "ltlf-2025-04-adjusted", served_published_at: "2025-04-08T00:00:00.000Z",
  served_quality: "accepted", discovered_key: null, discovered_quality: null,
  ...over,
});

const vintageRow = (over: Row = {}): Row => ({
  id: "v1", native_vintage_key: "ltlf-2025-04-adjusted", native_report_id: null,
  report_title: "2025 LTLF", published_at: "2025-04-08T00:00:00.000Z", published_at_precision: "day",
  retrieved_at: "2026-09-21T00:00:00.000Z", source_methodology_name: "ERCOT LTLF methodology",
  source_methodology_version: "2025", rights_classification: "reusable_with_attribution_or_conditions",
  publication_state: "published", quality_status: "accepted",
  superseded_by_id: null, superseded_at: null, supersession_reason: null, supersession_kind: null,
  grid_area_id: "area", market_slug: "ercot", market_name: "ERCOT", eia_ba_code: "ERCO",
  source_slug: "ercot-long-term-load-forecast", source_name: "ERCOT LTLF",
  rights_in_force: "reusable_with_attribution_or_conditions", disposition: "permitted",
  attribution_required: true, attribution_text: "Source: ERCOT.", conditions: null,
  unresolved_issue: null, terms_document_url: null, reviewed_by: "Urdais research", reviewed_on: "2026-09-19",
  ...over,
});

function executor(monitors: Row[], vintages: Row[]): PlanningSqlExecutor {
  return {
    async query(text) {
      if (text.includes("from reference.planning_source_monitors")) return { rows: monitors };
      if (text.includes("from pipeline.planning_forecast_vintages v")) return { rows: vintages };
      throw new Error(`unexpected query: ${text.slice(0, 60)}`);
    },
  };
}

describe("planning market status", () => {
  it("presents a rights-cleared, latest, validated vintage as publishable and current", async () => {
    const [status] = await planningMarketStatuses(executor([monitorRow()], [vintageRow()]), { now: NOW });
    expect(status).toMatchObject({ marketSlug: "ercot", publishableAsCurrent: true });
    expect(status!.freshness.status).toBe("current");
    expect(status!.publication!.allowed).toBe(true);
    // The metadata a frontend will need travels with it.
    expect(status!.vintage).toMatchObject({
      publishedAt: "2025-04-08T00:00:00.000Z", sourceMethodologyName: "ERCOT LTLF methodology",
    });
    expect(status!.freshness.lastSuccessfulCheckAt).toBe(recent);
  });

  it("will not call a vintage current once a newer release is known, even though rights still allow showing it", async () => {
    const monitors = [monitorRow({
      latest_discovered_vintage_key: "ltlf-2026-04-adjusted",
      success_discovered_vintage_key: "ltlf-2026-04-adjusted",
    })];
    const [status] = await planningMarketStatuses(executor(monitors, [vintageRow()]), { now: NOW });
    expect(status!.publication!.allowed).toBe(true);
    expect(status!.freshness.status).toBe("new_vintage_available");
    expect(status!.publishableAsCurrent).toBe(false);
    // And the market disappears from the list a public surface would present as current.
    expect(await publishableCurrentPlanningMarkets(executor(monitors, [vintageRow()]), { now: NOW })).toEqual([]);
  });

  it("drops a market whose last check went stale, rather than silently keeping it current", async () => {
    const stale = new Date(NOW.valueOf() - 45 * DAY).toISOString();
    const monitors = [monitorRow({ latest_checked_at: stale, success_checked_at: stale })];
    const [status] = await planningMarketStatuses(executor(monitors, [vintageRow()]), { now: NOW });
    expect(status!.freshness.status).toBe("source_check_overdue");
    expect(status!.publishableAsCurrent).toBe(false);
  });

  it("keeps a rights-blocked market blocked whatever its freshness says", async () => {
    const monitors = [monitorRow({
      source_slug: "spp-resource-adequacy-report", market_slug: "spp", market_name: "SPP",
      monitoring_state: "blocked", blocked_kind: "rights", blocked_reason: "SPP requires written authorization",
      served_key: null, served_published_at: null, served_quality: null,
    })];
    const [status] = await planningMarketStatuses(executor(monitors, []), { now: NOW });
    expect(status).toMatchObject({ marketSlug: "spp", publishableAsCurrent: false, publication: null, vintage: null });
    expect(status!.freshness).toMatchObject({ status: "blocked", blockedKind: "rights" });
  });

  it("keeps a methodology-blocked market blocked and says which blocker it is", async () => {
    const monitors = [monitorRow({
      source_slug: "miso-long-term-load-forecast", market_slug: "miso", market_name: "MISO",
      monitoring_state: "blocked", blocked_kind: "methodology", blocked_reason: "no vintaged MW series exists",
      served_key: null, served_published_at: null, served_quality: null,
    })];
    const [status] = await planningMarketStatuses(executor(monitors, []), { now: NOW });
    expect(status!.freshness).toMatchObject({ status: "blocked", blockedKind: "methodology" });
    expect(status!.publishableAsCurrent).toBe(false);
  });

  it("refuses to present a rights-blocked source even when it is perfectly fresh", async () => {
    const vintage = vintageRow({
      rights_classification: "unsuitable_without_permission",
      rights_in_force: "unsuitable_without_permission", disposition: "prohibited",
      attribution_required: false, attribution_text: null,
    });
    const [status] = await planningMarketStatuses(executor([monitorRow()], [vintage]), { now: NOW });
    expect(status!.freshness.status).toBe("current");
    expect(status!.publication!.allowed).toBe(false);
    expect(status!.publishableAsCurrent).toBe(false);
  });

  it("reports a market with no ingested vintage without inventing one", async () => {
    const monitors = [monitorRow({ served_key: null, served_published_at: null, served_quality: null })];
    const [status] = await planningMarketStatuses(executor(monitors, []), { now: NOW });
    expect(status).toMatchObject({ vintage: null, publication: null, publishableAsCurrent: false });
    expect(status!.freshness.status).toBe("new_vintage_available");
  });

  it("evaluates every market against one moment", async () => {
    const monitors = [
      monitorRow(),
      monitorRow({ source_slug: "pjm-load-forecast-report", market_slug: "pjm", market_name: "PJM" }),
    ];
    const statuses = await planningMarketStatuses(executor(monitors, [vintageRow()]), { now: NOW });
    expect(statuses.map((status) => status.marketSlug)).toEqual(["ercot", "pjm"]);
    expect(statuses[1]!.vintage).toBeNull();
  });
});
