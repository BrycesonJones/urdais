import { describe, expect, it } from "vitest";

import { resolvePlanningCurrentness } from "@/lib/power-delivery/planning/freshness/status";
import type {
  PlanningCurrentnessInput, PlanningSourceCheck, PlanningSourceMonitor,
} from "@/lib/power-delivery/planning/freshness/types";
import type { QualityStatus } from "@/lib/power-delivery/planning/types";

const NOW = new Date("2026-09-22T12:00:00.000Z");
const DAY = 86_400_000;

const monitor = (over: Partial<PlanningSourceMonitor> = {}): PlanningSourceMonitor => ({
  sourceInterfaceSlug: "ercot-long-term-load-forecast",
  marketSlug: "ercot",
  discoveryUrl: "https://www.ercot.com/gridinfo/load/forecast",
  discoveryMethod: "html_listing",
  expectedCadence: "annual",
  checkIntervalMs: 30 * DAY,
  monitoringState: "active",
  blockedKind: null,
  blockedReason: null,
  ...over,
});

const check = (over: Partial<PlanningSourceCheck> = {}): PlanningSourceCheck => ({
  id: "check-1",
  sourceInterfaceSlug: "ercot-long-term-load-forecast",
  checkedAt: new Date(NOW.valueOf() - DAY).toISOString(),
  outcome: "succeeded",
  checkerVersion: "test/1",
  checkedUrl: "https://www.ercot.com/gridinfo/load/forecast",
  responseStatus: 200,
  discoveredVintageKey: "ltlf-2025-04-adjusted",
  discoveredPublishedAt: "2025-04-08T00:00:00.000Z",
  discoveredArtifactUrl: null,
  discoveredArtifactHash: null,
  error: null,
  ...over,
});

const served = (key: string, quality: QualityStatus = "accepted") => ({
  nativeVintageKey: key, publishedAt: "2025-04-08T00:00:00.000Z", qualityStatus: quality,
});

const resolve = (over: Partial<PlanningCurrentnessInput> = {}) => {
  const successful = over.latestSuccessfulCheck === undefined ? check() : over.latestSuccessfulCheck;
  return resolvePlanningCurrentness({
    monitor: monitor(),
    latestCheck: successful,
    latestSuccessfulCheck: successful,
    servedVintage: served("ltlf-2025-04-adjusted"),
    discoveredVintage: null,
    now: NOW,
    ...over,
  });
};

describe("planning currentness", () => {
  it("calls a served vintage current when it is the latest release, validated and recently checked", () => {
    expect(resolve()).toMatchObject({
      status: "current", isCurrent: true,
      servedVintageKey: "ltlf-2025-04-adjusted", latestKnownVintageKey: "ltlf-2025-04-adjusted",
    });
  });

  it("keeps a seventeen-month-old publication current while the publisher has released nothing newer", () => {
    // This is the whole reason currentness is a comparison and not an age threshold: ERCOT's
    // April 2025 forecast was still ERCOT's current forecast in September 2026.
    const result = resolve({
      servedVintage: { nativeVintageKey: "ltlf-2025-04-adjusted", publishedAt: "2025-04-08T00:00:00.000Z", qualityStatus: "accepted" },
    });
    expect(result.status).toBe("current");
    expect(result.isCurrent).toBe(true);
  });

  it("refuses to call a vintage current once a newer release is known but not ingested", () => {
    const result = resolve({
      latestCheck: check({ discoveredVintageKey: "ltlf-2026-04-adjusted" }),
      latestSuccessfulCheck: check({ discoveredVintageKey: "ltlf-2026-04-adjusted" }),
      discoveredVintage: null,
    });
    expect(result).toMatchObject({ status: "new_vintage_available", isCurrent: false });
    expect(result.latestKnownVintageKey).toBe("ltlf-2026-04-adjusted");
    expect(result.servedVintageKey).toBe("ltlf-2025-04-adjusted");
  });

  it("separates a newer vintage awaiting validation from one that failed it", () => {
    const newer = check({ discoveredVintageKey: "ltlf-2026-04-adjusted" });
    expect(resolve({
      latestCheck: newer, latestSuccessfulCheck: newer,
      discoveredVintage: { nativeVintageKey: "ltlf-2026-04-adjusted", qualityStatus: "provisional" },
    })).toMatchObject({ status: "ingestion_pending", isCurrent: false });
    expect(resolve({
      latestCheck: newer, latestSuccessfulCheck: newer,
      discoveredVintage: { nativeVintageKey: "ltlf-2026-04-adjusted", qualityStatus: "suspect" },
    })).toMatchObject({ status: "validation_failed", isCurrent: false });
  });

  it("will not call the latest release current while it is unvalidated", () => {
    expect(resolve({ servedVintage: served("ltlf-2025-04-adjusted", "provisional") }))
      .toMatchObject({ status: "ingestion_pending", isCurrent: false });
    expect(resolve({ servedVintage: served("ltlf-2025-04-adjusted", "suspect") }))
      .toMatchObject({ status: "validation_failed", isCurrent: false });
  });

  it("goes overdue once the last successful check is older than the monitor's interval", () => {
    const stale = check({ checkedAt: new Date(NOW.valueOf() - 31 * DAY).toISOString() });
    const result = resolve({ latestCheck: stale, latestSuccessfulCheck: stale });
    expect(result).toMatchObject({ status: "source_check_overdue", isCurrent: false });
    expect(result.detail).toMatch(/31 day\(s\) ago/);
    expect(result.checkExpiresAt).toBe(new Date(new Date(stale.checkedAt).valueOf() + 30 * DAY).toISOString());
  });

  it("stays current at exactly the interval boundary and tips over past it", () => {
    const boundary = check({ checkedAt: new Date(NOW.valueOf() - 30 * DAY).toISOString() });
    expect(resolve({ latestCheck: boundary, latestSuccessfulCheck: boundary }).status).toBe("current");
    const past = check({ checkedAt: new Date(NOW.valueOf() - 30 * DAY - 1).toISOString() });
    expect(resolve({ latestCheck: past, latestSuccessfulCheck: past }).status).toBe("source_check_overdue");
  });

  it("reports a failed check rather than falling back on older knowledge", () => {
    const failed = check({ id: "check-2", outcome: "failed", discoveredVintageKey: null, error: "HTTP 503" });
    const result = resolvePlanningCurrentness({
      monitor: monitor(), latestCheck: failed, latestSuccessfulCheck: check(),
      servedVintage: served("ltlf-2025-04-adjusted"), discoveredVintage: null, now: NOW,
    });
    expect(result).toMatchObject({ status: "source_check_failed", isCurrent: false });
    expect(result.detail).toBe("HTTP 503");
    // The earlier success is still reported, so an operator can see how stale the knowledge is.
    expect(result.lastSuccessfulCheckAt).toBe(check().checkedAt);
  });

  it("is blocked when the source is unwatchable, whatever its dates say", () => {
    for (const kind of ["rights", "format", "methodology"] as const) {
      const result = resolvePlanningCurrentness({
        monitor: monitor({ monitoringState: "blocked", blockedKind: kind, blockedReason: `${kind} blocker` }),
        latestCheck: check(), latestSuccessfulCheck: check(),
        servedVintage: served("ltlf-2025-04-adjusted"), discoveredVintage: null, now: NOW,
      });
      expect(result).toMatchObject({ status: "blocked", isCurrent: false, detail: `${kind} blocker` });
    }
  });

  it("is unknown without a monitor, without any check, and without a successful one", () => {
    expect(resolvePlanningCurrentness({
      monitor: null, latestCheck: null, latestSuccessfulCheck: null,
      servedVintage: served("x"), discoveredVintage: null, now: NOW,
    }).status).toBe("unknown");
    expect(resolve({ latestCheck: null, latestSuccessfulCheck: null }).status).toBe("unknown");
    expect(resolvePlanningCurrentness({
      monitor: monitor(), latestCheck: check(), latestSuccessfulCheck: null,
      servedVintage: served("x"), discoveredVintage: null, now: NOW,
    }).status).toBe("unknown");
  });

  it("reports a known release against an empty market as a new vintage, not as current", () => {
    expect(resolve({ servedVintage: null })).toMatchObject({ status: "new_vintage_available", isCurrent: false });
  });

  it("only ever sets isCurrent for the current status", () => {
    const results = [
      resolve(),
      resolve({ servedVintage: null }),
      resolve({ servedVintage: served("x", "suspect") }),
      resolve({ latestCheck: check({ outcome: "failed", discoveredVintageKey: null, error: "e" }) }),
    ];
    for (const result of results) expect(result.isCurrent).toBe(result.status === "current");
  });
});
