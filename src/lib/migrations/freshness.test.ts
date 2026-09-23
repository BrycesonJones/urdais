import { describe, expect, it } from "vitest";

import {
  DEFAULT_FRESHNESS_THRESHOLDS,
  evaluateMigrationFreshness,
  type PendingMigration,
} from "@/lib/migrations/freshness";

const NOW = new Date("2026-09-25T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

const pending = (filename: string, ageHours: number | null): PendingMigration => ({
  filename,
  landedAt: ageHours === null ? null : hoursAgo(ageHours),
});

const evaluate = (list: PendingMigration[]) =>
  evaluateMigrationFreshness({ pending: list, asOf: NOW });

describe("nothing pending", () => {
  it("is current, and says so without a remedy", () => {
    const report = evaluate([]);
    expect(report.verdict).toBe("current");
    expect(report.healthy).toBe(true);
    expect(report.oldestAgeHours).toBeNull();
    expect(report.remedy).toBeNull();
  });
});

describe("the deployment window", () => {
  it("tolerates a migration merged moments ago", () => {
    const report = evaluate([pending("20261019100000_a.sql", 0.5)]);
    expect(report.verdict).toBe("informational");
    expect(report.healthy).toBe(true);
    // The normal case must not nag: a merge followed by a push minutes later is the intended flow.
    expect(report.remedy).toBeNull();
  });

  it("still tolerates it at 23 hours", () => {
    expect(evaluate([pending("20261019100000_a.sql", 23)]).verdict).toBe("informational");
  });

  it("annotates at exactly 24 hours, and stays healthy", () => {
    const report = evaluate([pending("20261019100000_a.sql", 24)]);
    expect(report.verdict).toBe("warning");
    expect(report.healthy).toBe(true);
    expect(report.remedy).toContain("supabase db push");
  });

  it("fails at exactly 48 hours", () => {
    const report = evaluate([pending("20261019100000_a.sql", 48)]);
    expect(report.verdict).toBe("overdue");
    expect(report.healthy).toBe(false);
  });

  it("names the risk rather than only the number", () => {
    const report = evaluate([pending("20261019100000_a.sql", 60)]);
    // The reason this matters is the September incident: a deployed application reading a schema
    // that does not carry what it expects.
    expect(report.summary).toContain("running against a schema");
    expect(report.summary).toContain("48h");
  });
});

describe("the oldest pending migration decides", () => {
  it("measures from the earliest arrival, not the latest", () => {
    const report = evaluate([
      pending("20261019100000_new.sql", 2),
      pending("20261011100000_old.sql", 72),
      pending("20261014100000_middle.sql", 30),
    ]);
    expect(report.verdict).toBe("overdue");
    expect(report.oldest!.filename).toBe("20261011100000_old.sql");
    expect(report.oldestAgeHours).toBeCloseTo(72, 6);
    expect(report.pendingCount).toBe(3);
  });

  it("does not let a fresh merge reset an old backlog", () => {
    // The shape of the incident: migrations accumulate, and each new merge is recent. If the
    // newest decided, the guard would report health forever while the backlog grew.
    const report = evaluate([pending("20261011100000_old.sql", 200), pending("20261019100000_new.sql", 1)]);
    expect(report.verdict).toBe("overdue");
  });

  it("counts every pending migration, not just the oldest", () => {
    const report = evaluate([pending("a.sql", 5), pending("b.sql", 6), pending("c.sql", 7)]);
    expect(report.pendingCount).toBe(3);
    expect(report.summary).toContain("3 migrations pending");
  });
});

describe("an age nobody can establish", () => {
  it("is annotated rather than passed silently", () => {
    const report = evaluate([pending("20261019100000_a.sql", null)]);
    expect(report.verdict).toBe("warning");
    expect(report.oldestAgeHours).toBeNull();
    expect(report.undated).toHaveLength(1);
    // Never "fine": an unverified age is not evidence of health.
    expect(report.summary).toContain("unverified rather than fine");
    expect(report.remedy).toContain("fetch-depth: 0");
  });

  it("does not fail the build for what is almost always a checkout problem", () => {
    expect(evaluate([pending("a.sql", null)]).healthy).toBe(true);
  });

  it("still fails when a dated migration is overdue alongside an undated one", () => {
    const report = evaluate([pending("undated.sql", null), pending("old.sql", 100)]);
    expect(report.verdict).toBe("overdue");
    expect(report.oldest!.filename).toBe("old.sql");
    expect(report.undated).toHaveLength(1);
  });
});

describe("the incident this guard exists for", () => {
  it("would have failed on the eight-migration gap", () => {
    // 20261011100000 landed on main on 22 September 2026; the 500 was found on the 23rd. By the
    // time anyone looked, the oldest pending migration was well past two days.
    const report = evaluateMigrationFreshness({
      pending: [
        { filename: "20261011100000_umpi_unauthenticated_transports.sql", landedAt: new Date("2026-09-22T00:00:00Z") },
        { filename: "20261017100000_umpi_operations.sql", landedAt: new Date("2026-09-23T02:06:00Z") },
      ],
      asOf: new Date("2026-09-24T12:00:00Z"),
    });
    expect(report.verdict).toBe("overdue");
    expect(report.healthy).toBe(false);
    expect(report.oldest!.filename).toContain("umpi_unauthenticated_transports");
  });

  it("would not have fired on the merge that created the gap", () => {
    // Immediately after the merge, the same state is the ordinary one and must stay quiet.
    const report = evaluateMigrationFreshness({
      pending: [
        { filename: "20261017100000_umpi_operations.sql", landedAt: new Date("2026-09-23T02:06:00Z") },
      ],
      asOf: new Date("2026-09-23T03:00:00Z"),
    });
    expect(report.verdict).toBe("informational");
    expect(report.healthy).toBe(true);
  });
});

describe("the thresholds are the documented policy", () => {
  it("warns at a day and fails at two", () => {
    expect(DEFAULT_FRESHNESS_THRESHOLDS).toEqual({ warnAfterHours: 24, failAfterHours: 48 });
  });

  it("honours a caller's own window", () => {
    const strict = { warnAfterHours: 1, failAfterHours: 2 };
    const report = evaluateMigrationFreshness({
      pending: [pending("a.sql", 3)],
      asOf: NOW,
      thresholds: strict,
    });
    expect(report.verdict).toBe("overdue");
  });
});
