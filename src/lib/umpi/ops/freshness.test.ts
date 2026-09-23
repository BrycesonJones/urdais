import { describe, expect, it } from "vitest";

import {
  evaluateFreshness,
  isHealthy,
  summariseFreshness,
  type UmpiFreshnessEvidence,
} from "@/lib/umpi/ops/freshness";
import {
  addMonths,
  checkWindow,
  dueAt,
  expectedReferenceMonth,
  overdueAt,
  UMPI_RELEASE_POLICIES,
} from "@/lib/umpi/ops/policy";

const ppi = UMPI_RELEASE_POLICIES["UMPI-KR-DRAM-PPI"];
const uv = UMPI_RELEASE_POLICIES["UMPI-KR-DRAM-EXPORT-UV"];
const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** A healthy series checked an hour ago, holding through August. Tests vary one fact at a time. */
const healthy = (overrides: Partial<UmpiFreshnessEvidence> = {}): UmpiFreshnessEvidence => ({
  asOf: at("2026-09-23"),
  policy: ppi,
  publishedMonth: "2026-08",
  sourceMonth: "2026-08",
  observedMonth: "2026-08",
  lastCheckAt: new Date(Date.parse("2026-09-23T00:00:00.000Z") - 3_600_000),
  lastCheckReachable: true,
  ...overrides,
});

describe("month arithmetic survives the year boundary", () => {
  it("steps across December without inventing a month 13", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
    expect(addMonths("2026-01", -3)).toBe("2025-10");
  });

  it("publishes December's figure in January", () => {
    expect(dueAt("2026-12", ppi).toISOString().slice(0, 10)).toBe("2027-01-22");
    expect(overdueAt("2026-12", ppi).toISOString().slice(0, 10)).toBe("2027-01-29");
  });

  it("clamps a release day the following month does not have", () => {
    // A day-30 policy must not roll into March when the next month is February.
    const dayThirty = { ...ppi, releaseDayOfMonth: 30 };
    expect(dueAt("2027-01", dayThirty).toISOString().slice(0, 10)).toBe("2027-02-28");
    // And a leap February still ends on the 29th, not the 28th.
    expect(dueAt("2028-01", dayThirty).toISOString().slice(0, 10)).toBe("2028-02-29");
  });
});

describe("the expected month follows the release calendar", () => {
  it("expects last month only once its release day has passed", () => {
    // The Bank of Korea publishes August around 22 September.
    expect(expectedReferenceMonth(at("2026-09-21"), ppi)).toBe("2026-07");
    expect(expectedReferenceMonth(at("2026-09-22"), ppi)).toBe("2026-08");
    expect(expectedReferenceMonth(at("2026-09-30"), ppi)).toBe("2026-08");
    expect(expectedReferenceMonth(at("2026-10-22"), ppi)).toBe("2026-09");
  });

  it("reads a narrow recent window, never the whole history", () => {
    const window = checkWindow(at("2026-09-23"), ppi);
    expect(window).toEqual({ fromMonth: "2026-06", toMonth: "2026-08" });
    // Three months, not six years: the 2020 base is audited on its own cadence.
    expect(window.fromMonth > "2020-12").toBe(true);
  });
});

describe("freshness distinguishes waiting from being late", () => {
  it("is fresh when the published month satisfies the expected one", () => {
    const result = evaluateFreshness(healthy());
    expect(result.state).toBe("fresh");
    expect(result.expectedReferenceMonth).toBe("2026-08");
    expect(result.staleSince).toBeNull();
  });

  it("stays fresh before the next month is due at all", () => {
    // 20 October: September is not expected until the 22nd, so August is still the expected
    // month. Holding it is not merely tolerated, it is current.
    const result = evaluateFreshness(
      healthy({ asOf: at("2026-10-20"), lastCheckAt: at("2026-10-20") }),
    );
    expect(result.state).toBe("fresh");
    expect(result.expectedReferenceMonth).toBe("2026-08");
  });

  it("is awaiting_release once the release day passes but the grace window has not", () => {
    // 23 October: September was due yesterday and has not appeared. The agency is a day late,
    // which is a wait on it and not staleness in Urdais.
    const result = evaluateFreshness(
      healthy({ asOf: at("2026-10-23"), lastCheckAt: at("2026-10-23") }),
    );
    expect(result.state).toBe("awaiting_release");
    expect(result.expectedReferenceMonth).toBe("2026-09");
    expect(isHealthy(result.state)).toBe(true);
    expect(result.reason).toContain("not overdue until 2026-10-29");
  });

  it("stays awaiting_release through the grace window", () => {
    // Due 22 October, grace to the 29th. On the 25th a holiday slip is still a wait.
    const result = evaluateFreshness(
      healthy({ asOf: at("2026-10-25"), lastCheckAt: at("2026-10-25") }),
    );
    expect(result.state).toBe("awaiting_release");
  });

  it("becomes stale once the grace window has passed with nothing published", () => {
    const result = evaluateFreshness(
      healthy({ asOf: at("2026-10-30"), lastCheckAt: at("2026-10-30") }),
    );
    expect(result.state).toBe("stale");
    expect(isHealthy(result.state)).toBe(false);
    expect(result.staleSince).toBe("2026-10-29T00:00:00.000Z");
    expect(result.expectedReferenceMonth).toBe("2026-09");
  });

  it("does not let a recent successful check make an old month look current", () => {
    // The defect this exists to prevent: checked a minute ago, HTTP 200, August figure, December.
    const result = evaluateFreshness(
      healthy({ asOf: at("2026-12-15"), lastCheckAt: at("2026-12-15"), sourceMonth: "2026-08" }),
    );
    expect(result.state).toBe("stale");
    expect(result.latestReferenceMonth).toBe("2026-08");
    expect(result.expectedReferenceMonth).toBe("2026-10");
  });
});

describe("freshness fails closed", () => {
  it("is unknown when no check has ever run", () => {
    expect(evaluateFreshness(healthy({ lastCheckAt: null })).state).toBe("unknown");
  });

  it("is unknown when the schedule has stopped, however good the data looks", () => {
    // Everything else is healthy; only the heartbeat is missing. Currentness is unverifiable.
    const result = evaluateFreshness(healthy({ lastCheckAt: at("2026-09-20") }));
    expect(result.state).toBe("unknown");
    expect(result.reason).toContain("beyond the 48h");
  });

  it("is source_unavailable when the last check could not reach the source", () => {
    expect(evaluateFreshness(healthy({ lastCheckReachable: false })).state).toBe("source_unavailable");
  });

  it("is derivation_failed when the source has a month Urdais did not publish", () => {
    // Retrieval succeeded and the month is upstream; the public series does not carry it.
    const result = evaluateFreshness(
      healthy({ asOf: at("2026-10-23"), lastCheckAt: at("2026-10-23"), sourceMonth: "2026-09", observedMonth: "2026-09" }),
    );
    expect(result.state).toBe("derivation_failed");
    expect(result.reason).toContain("derivation did not complete");
  });

  it("names ingestion rather than derivation when nothing was stored either", () => {
    const result = evaluateFreshness(
      healthy({ asOf: at("2026-10-23"), lastCheckAt: at("2026-10-23"), sourceMonth: "2026-09", observedMonth: "2026-08" }),
    );
    expect(result.state).toBe("derivation_failed");
    expect(result.reason).toContain("ingestion did not complete");
  });

  it("never reports fresh when the source is ahead, even inside the grace window", () => {
    // The month is not yet due, but it exists upstream and is not published. Waiting would be a
    // lie: there is nothing left to wait for.
    const result = evaluateFreshness(
      healthy({ asOf: at("2026-10-20"), lastCheckAt: at("2026-10-20"), sourceMonth: "2026-09", observedMonth: "2026-09" }),
    );
    expect(result.state).toBe("derivation_failed");
  });

  it("is derivation_failed, not fresh, when nothing has ever been published", () => {
    const result = evaluateFreshness(healthy({ publishedMonth: null }));
    expect(result.state).toBe("derivation_failed");
  });
});

describe("the two series are evaluated independently", () => {
  it("uses each series' own release policy", () => {
    // Customs is due on the 20th with ten days' grace; the Bank of Korea on the 22nd with seven.
    expect(expectedReferenceMonth(at("2026-09-21"), uv)).toBe("2026-08");
    expect(expectedReferenceMonth(at("2026-09-21"), ppi)).toBe("2026-07");
    expect(overdueAt("2026-09", uv).toISOString().slice(0, 10)).toBe("2026-10-30");
    expect(overdueAt("2026-09", ppi).toISOString().slice(0, 10)).toBe("2026-10-29");
  });

  it("lets one series be stale while the other is fresh", () => {
    expect(summariseFreshness(["fresh", "stale"])).toBe("stale");
    expect(summariseFreshness(["fresh", "fresh"])).toBe("fresh");
    expect(summariseFreshness(["fresh", "awaiting_release"])).toBe("awaiting_release");
  });

  it("summarises pessimistically, so one series cannot mask another", () => {
    expect(summariseFreshness(["fresh", "source_unavailable"])).toBe("source_unavailable");
    expect(summariseFreshness(["awaiting_release", "derivation_failed"])).toBe("derivation_failed");
    // Stale outranks the rest: it is the state that means a reader is looking at an old figure.
    expect(summariseFreshness(["stale", "source_unavailable"])).toBe("stale");
    expect(summariseFreshness([])).toBe("unknown");
  });

  it("treats only fresh and awaiting_release as healthy", () => {
    expect(isHealthy("fresh")).toBe(true);
    expect(isHealthy("awaiting_release")).toBe(true);
    for (const state of ["stale", "source_unavailable", "derivation_failed", "unknown"] as const) {
      expect(isHealthy(state), state).toBe(false);
    }
  });
});

describe("the policies carry their evidence", () => {
  it("records why each series' due date is where it is", () => {
    for (const [code, policy] of Object.entries(UMPI_RELEASE_POLICIES)) {
      expect(policy.rationale.length, code).toBeGreaterThan(80);
      expect(policy.graceDays, code).toBeGreaterThan(0);
      expect(policy.revisionLookbackMonths, code).toBeGreaterThan(1);
    }
    // The observed release dates the Bank of Korea policy is derived from.
    expect(ppi.rationale).toContain("2026-06→22 Jul");
  });
});
