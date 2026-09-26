/**
 * The freshness gate.
 *
 * The case this file exists for is the one at the bottom: a scheduler that runs perfectly every
 * morning while a market publishes nothing, and a product that ages anyway. Freshness has to
 * answer that correctly without ever consulting the scheduler's own verdict.
 */

import { describe, expect, it } from "vitest";

import {
  evaluateSeriesFreshness,
  evaluateUepiFreshness,
  isHealthyUepiFreshness,
  UEPI_FRESHNESS_THRESHOLDS,
} from "@/lib/uepi/ops/freshness";
import type { UepiSeriesId } from "@/lib/uepi/types";

/** The cron's own wall clock: 10:45 UTC is 05:45 CT / 06:45 ET / 03:45 PT on the same date. */
const RUN_INSTANT = new Date("2026-09-26T10:45:00Z");

function freshnessOf(seriesId: UepiSeriesId, latest: string | null, asOf = RUN_INSTANT) {
  return evaluateSeriesFreshness(seriesId, { asOf, latestOperatingDate: { [seriesId]: latest } });
}

describe("one market's freshness", () => {
  it("is current when the head is today's operating day", () => {
    const freshness = freshnessOf("uepi-ercot", "2026-09-26");
    expect(freshness.status).toBe("current");
    expect(freshness.expectedOperatingDate).toBe("2026-09-26");
    expect(freshness.lagDays).toBe(0);
  });

  it("is still current one day behind, because a market may publish after the run", () => {
    expect(freshnessOf("uepi-ercot", "2026-09-25").status).toBe("current");
    expect(freshnessOf("uepi-ercot", "2026-09-25").lagDays).toBe(1);
  });

  it("warns at two days, where one scheduled run produced no advance", () => {
    const freshness = freshnessOf("uepi-ercot", "2026-09-24");
    expect(freshness.status).toBe("warn");
    expect(freshness.lagDays).toBe(2);
    expect(freshness.reason).toContain("no advance");
  });

  it("fails at three days, which no documented source behaviour explains", () => {
    const freshness = freshnessOf("uepi-ercot", "2026-09-23");
    expect(freshness.status).toBe("fail");
    expect(freshness.lagDays).toBe(3);
  });

  it("keeps failing as the gap widens rather than saturating into silence", () => {
    expect(freshnessOf("uepi-ercot", "2026-08-01").status).toBe("fail");
    expect(freshnessOf("uepi-ercot", "2026-08-01").lagDays).toBe(56);
  });

  it("does not treat a head ahead of the expected day as a fault", () => {
    // A market that has published tomorrow's day-ahead prices is not broken.
    const freshness = freshnessOf("uepi-ercot", "2026-09-27");
    expect(freshness.status).toBe("current");
    expect(freshness.lagDays).toBe(-1);
  });

  it("says never_released rather than fail when a series has published nothing", () => {
    // Different facts, and an operator acts differently on each: one is a stalled feed, the
    // other is a market that was never switched on.
    const freshness = freshnessOf("uepi-caiso", null);
    expect(freshness.status).toBe("never_released");
    expect(freshness.latestOperatingDate).toBeNull();
    expect(freshness.lagDays).toBeNull();
  });

  it("says not_ingested for PJM, which has no adapter and therefore cannot go stale", () => {
    const freshness = freshnessOf("uepi-pjm", null);
    expect(freshness.status).toBe("not_ingested");
    expect(isHealthyUepiFreshness(freshness.status)).toBe(true);
  });

  it("evaluates internal-only markets, whose ingestion must stay operational", () => {
    for (const seriesId of ["uepi-miso", "uepi-spp", "uepi-iso-ne"] as const) {
      const freshness = freshnessOf(seriesId, "2026-09-20");
      expect(freshness.status, seriesId).toBe("fail");
      expect(freshness.publiclyServed, seriesId).toBe(false);
    }
  });

  it("marks the three published markets as publicly served", () => {
    for (const seriesId of ["uepi-ercot", "uepi-caiso", "uepi-nyiso"] as const) {
      expect(freshnessOf(seriesId, "2026-09-26").publiclyServed, seriesId).toBe(true);
    }
  });
});

describe("each market against its own clock", () => {
  it("uses the market's local calendar date, not one UTC date for all six", () => {
    // 06:00 UTC is 02:00 in New York and 23:00 the previous evening in California.
    const asOf = new Date("2026-09-26T06:00:00Z");
    expect(evaluateSeriesFreshness("uepi-nyiso", { asOf, latestOperatingDate: {} }).expectedOperatingDate)
      .toBe("2026-09-26");
    expect(evaluateSeriesFreshness("uepi-caiso", { asOf, latestOperatingDate: {} }).expectedOperatingDate)
      .toBe("2026-09-25");
  });

  it("does not report CAISO stale merely because UTC has rolled over", () => {
    // The defect a single UTC date would cause: for the seven hours after UTC midnight it is
    // still yesterday in California, and CAISO would look a day behind every single night.
    const asOf = new Date("2026-09-26T06:00:00Z");
    const caiso = evaluateSeriesFreshness("uepi-caiso", {
      asOf,
      latestOperatingDate: { "uepi-caiso": "2026-09-25" },
    });
    expect(caiso.status).toBe("current");
    expect(caiso.lagDays).toBe(0);
  });

  it("holds MISO to its fixed-offset zone, which never shifts", () => {
    // MISO publishes Eastern Standard Time all year and does not observe the transitions.
    const asOf = new Date("2026-09-26T04:30:00Z");
    expect(evaluateSeriesFreshness("uepi-miso", { asOf, latestOperatingDate: {} }).expectedOperatingDate)
      .toBe("2026-09-25");
  });
});

describe("what freshness must not depend on", () => {
  it("ignores historical gaps entirely, because it measures the head", () => {
    // ERCOT has no 2026-03-07 and MISO no 2026-05-19. Both are documented exceptions, and
    // neither is a statement about whether the series is advancing today.
    expect(freshnessOf("uepi-ercot", "2026-09-26").status).toBe("current");
    expect(freshnessOf("uepi-miso", "2026-09-26").status).toBe("current");
  });

  it("counts a negative released day exactly like a positive one", () => {
    // Freshness reads the date and never the value. SPP's North Hub daily mean was -$0.11/MWh
    // on 12 April 2026; a market clearing negative is working, not broken.
    const asOf = new Date("2026-04-12T10:45:00Z");
    const spp = evaluateSeriesFreshness("uepi-spp", {
      asOf,
      latestOperatingDate: { "uepi-spp": "2026-04-12" },
    });
    expect(spp.status).toBe("current");
  });

  it("takes no input a job could touch: only the head date and the clock", () => {
    // The signature is the guarantee. There is no run record, no `updated_at` and no
    // "last checked" in the evidence, so a job that writes nothing cannot move this verdict.
    const input = { asOf: RUN_INSTANT, latestOperatingDate: { "uepi-ercot": "2026-09-20" } } as const;
    expect(Object.keys(input).sort()).toEqual(["asOf", "latestOperatingDate"]);
    expect(evaluateSeriesFreshness("uepi-ercot", input).status).toBe("fail");
  });
});

describe("the whole family", () => {
  const MIXED = {
    asOf: RUN_INSTANT,
    latestOperatingDate: {
      "uepi-ercot": "2026-09-26",
      "uepi-caiso": "2026-09-26",
      "uepi-nyiso": "2026-09-24",
      "uepi-iso-ne": "2026-09-26",
      "uepi-miso": "2026-09-25",
      "uepi-spp": "2026-09-10",
    },
  } as const;

  it("reports each market independently rather than as one binary state", () => {
    const byId = new Map(evaluateUepiFreshness(MIXED).series.map((s) => [s.seriesId, s.status]));
    expect(byId.get("uepi-ercot")).toBe("current");
    expect(byId.get("uepi-caiso")).toBe("current");
    expect(byId.get("uepi-nyiso")).toBe("warn");
    expect(byId.get("uepi-iso-ne")).toBe("current");
    expect(byId.get("uepi-miso")).toBe("current");
    expect(byId.get("uepi-spp")).toBe("fail");
  });

  it("summarises as the worst market, so a frozen series cannot hide behind five healthy ones", () => {
    expect(evaluateUepiFreshness(MIXED).worstStatus).toBe("fail");
  });

  it("covers every series, including the one with no adapter", () => {
    const report = evaluateUepiFreshness(MIXED);
    expect(report.series).toHaveLength(7);
    expect(report.series.find((s) => s.seriesId === "uepi-pjm")!.status).toBe("not_ingested");
  });

  it("publishes the thresholds it applied, so a verdict can be argued with", () => {
    expect(evaluateUepiFreshness(MIXED).thresholds).toEqual(UEPI_FRESHNESS_THRESHOLDS);
  });
});

describe("the acceptance case: a successful run and an ageing product", () => {
  /*
   * The scheduler executes, the source has nothing new, no write happens, the run reports
   * success -- and the market must still transition CURRENT -> WARN -> FAIL as days pass.
   * Only the clock moves in this test. The released head never does, exactly as it would not
   * if ERCOT stopped publishing while the cron kept returning 200 every morning.
   */
  const FROZEN_HEAD = "2026-09-26";
  const observe = (day: string) =>
    evaluateSeriesFreshness("uepi-ercot", {
      asOf: new Date(`${day}T10:45:00Z`),
      latestOperatingDate: { "uepi-ercot": FROZEN_HEAD },
    }).status;

  it("transitions current -> warn -> fail on the clock alone", () => {
    expect(observe("2026-09-26")).toBe("current");
    expect(observe("2026-09-27")).toBe("current");
    expect(observe("2026-09-28")).toBe("warn");
    expect(observe("2026-09-29")).toBe("fail");
    expect(observe("2026-10-05")).toBe("fail");
  });

  it("returns to current the moment a new operating day is released", () => {
    // The inverse direction: recovery must not require anything but the head moving.
    const asOf = new Date("2026-09-29T10:45:00Z");
    const stale = evaluateSeriesFreshness("uepi-ercot", {
      asOf,
      latestOperatingDate: { "uepi-ercot": "2026-09-26" },
    });
    const recovered = evaluateSeriesFreshness("uepi-ercot", {
      asOf,
      latestOperatingDate: { "uepi-ercot": "2026-09-29" },
    });
    expect(stale.status).toBe("fail");
    expect(recovered.status).toBe("current");
  });
});
