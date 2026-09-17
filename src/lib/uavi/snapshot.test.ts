import { describe, expect, it } from "vitest";

import { resolveSnapshotInstant } from "@/lib/uavi/snapshot";

/**
 * The snapshot instant is 15:45:00.000 America/New_York, expressed in a named zone and never as a
 * fixed UTC offset. These tests are the record of why: the same local time is two different
 * absolute instants depending on the date, and an implementation that froze either would move the
 * snapshot an hour away from the options market for roughly half of every year.
 */
describe("the official snapshot instant", () => {
  it("resolves to 19:45Z under Eastern Daylight Time", () => {
    expect(resolveSnapshotInstant("2026-09-17")).toBe("2026-09-17T19:45:00.000Z");
  });

  it("resolves to 20:45Z under Eastern Standard Time", () => {
    // The same wall-clock time, an hour later in UTC. A hard-coded offset gets one of these two
    // cases wrong, always, and silently.
    expect(resolveSnapshotInstant("2026-01-15")).toBe("2026-01-15T20:45:00.000Z");
  });

  it("tracks the transition rather than a date heuristic", () => {
    // US daylight time ends on the first Sunday of November. The Friday before and the Monday
    // after sit on opposite sides of it.
    expect(resolveSnapshotInstant("2026-10-30")).toBe("2026-10-30T19:45:00.000Z");
    expect(resolveSnapshotInstant("2026-11-02")).toBe("2026-11-02T20:45:00.000Z");
  });

  it("round-trips: the resolved instant reads back as 15:45 in New York", () => {
    for (const date of ["2026-01-15", "2026-03-10", "2026-06-30", "2026-09-17", "2026-12-31"]) {
      const instant = resolveSnapshotInstant(date)!;
      const local = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hourCycle: "h23",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(instant));
      expect(local).toBe("15:45");
    }
  });

  it("refuses a malformed session date rather than guessing", () => {
    expect(resolveSnapshotInstant("18/09/2026")).toBeNull();
    expect(resolveSnapshotInstant("2026-09")).toBeNull();
    expect(resolveSnapshotInstant("")).toBeNull();
  });

  it("refuses a local time that does not exist on a spring-forward date", () => {
    // 02:30 does not occur on the morning the clocks go forward. Picking 01:30 or 03:30 would be
    // a methodology decision nobody made, so the date is simply not calculated.
    expect(
      resolveSnapshotInstant("2026-03-08", "America/New_York", { hour: 2, minute: 30, second: 0 }),
    ).toBeNull();
  });

  it("refuses a local time that occurs twice on a fall-back date", () => {
    // 01:30 happens twice on the morning the clocks go back. Resolving to the first occurrence
    // silently would make the instant depend on an unstated convention.
    expect(
      resolveSnapshotInstant("2026-11-01", "America/New_York", { hour: 1, minute: 30, second: 0 }),
    ).toBeNull();
  });

  it("resolves 15:45 normally on both transition dates, since the ambiguity is at 01:00-03:00", () => {
    // The transitions fall on Sundays when no options session is held, and 15:45 is well clear of
    // the ambiguous hour in any case. Both are recorded so the refusals above are understood as
    // narrow rather than as a general fragility. By 15:45 each date is already on its new offset:
    // 8 March is daylight time and 1 November is standard time.
    expect(resolveSnapshotInstant("2026-03-08")).toBe("2026-03-08T19:45:00.000Z");
    expect(resolveSnapshotInstant("2026-11-01")).toBe("2026-11-01T20:45:00.000Z");
  });
});
