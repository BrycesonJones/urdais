/**
 * How long production is allowed to run behind the repository.
 *
 * The ledger check next door answers "does production agree with the repository about every
 * migration it has applied?" and treats a migration production has not applied yet as *pending*,
 * which passes. That is right for what it is: a pull request that adds a migration legitimately
 * has one pending, and a guard that failed on it would be switched off within a week.
 *
 * What it cannot answer is the question the 23 September 2026 incident actually posed. Production
 * sat eight migrations behind `main` while a deployed read model queried tables the database did
 * not have, and `/api/umpi` returned 500. The ledger check ran throughout. It printed
 * `116 applied, 7 pending`, itemised every missing migration, and passed — because pending is not
 * drift. The condition was visible and unenforced, and a number in a green log is a fact nobody
 * encounters.
 *
 * So this is a separate guard with a separate job. It does not ask whether a migration is pending;
 * it asks **how long it has been pending**, and it stops tolerating an answer that keeps growing.
 *
 * | Age of the oldest pending migration | Verdict         | Healthy |
 * | ----------------------------------- | --------------- | ------- |
 * | nothing pending                     | `current`       | yes     |
 * | under 24 h                          | `informational` | yes     |
 * | 24 h to 48 h                        | `warning`       | yes     |
 * | over 48 h                           | `overdue`       | **no**  |
 *
 * The tolerance exists because the window between merging a migration and running
 * `supabase db push` is a normal part of deploying, not a fault. The ceiling exists because that
 * window is supposed to close.
 *
 * Age is measured from when a migration landed on `main`, not from the version in its filename.
 * Those differ: the repository pre-allocates future version prefixes, so `20261017100000` was
 * merged on 23 September 2026 and a filename-derived age would have been negative.
 *
 * Nothing here reads a clock or a database. The clock is injected and the inputs are supplied, so
 * every boundary in the table above is testable without waiting two days.
 */

/** A repository migration production has not applied, and when it reached `main`. */
export type PendingMigration = {
  /** The migration's filename, as the repository carries it. */
  filename: string;
  /**
   * When this migration landed on `main`, or null where that could not be determined — a shallow
   * clone, typically. Null is reported rather than guessed: treating an unknown age as zero would
   * hide exactly the condition this guard exists to catch.
   */
  landedAt: Date | null;
};

export type FreshnessVerdict = "current" | "informational" | "warning" | "overdue";

export type FreshnessThresholds = {
  /** Hours after which a pending migration is worth annotating. */
  warnAfterHours: number;
  /** Hours after which it is a failure. */
  failAfterHours: number;
};

/** The deployment window Urdais allows itself, and the point at which it stops being a window. */
export const DEFAULT_FRESHNESS_THRESHOLDS: FreshnessThresholds = {
  warnAfterHours: 24,
  failAfterHours: 48,
};

export type FreshnessReport = {
  verdict: FreshnessVerdict;
  /** True for `current`, `informational` and `warning`; false for `overdue`. */
  healthy: boolean;
  pendingCount: number;
  /** Hours the oldest pending migration has been waiting, or null when nothing is pending. */
  oldestAgeHours: number | null;
  /** The oldest pending migration, or null when nothing is pending. */
  oldest: PendingMigration | null;
  /** Pending migrations whose landing time could not be determined. */
  undated: PendingMigration[];
  /** One line stating the position, suitable for a log or an annotation. */
  summary: string;
  /** What to do about it, where there is something to do. */
  remedy: string | null;
};

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 3_600_000;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function evaluateMigrationFreshness(input: {
  pending: readonly PendingMigration[];
  asOf: Date;
  thresholds?: FreshnessThresholds;
}): FreshnessReport {
  const { pending, asOf } = input;
  const thresholds = input.thresholds ?? DEFAULT_FRESHNESS_THRESHOLDS;
  const undated = pending.filter((migration) => migration.landedAt === null);
  const dated = pending.filter(
    (migration): migration is PendingMigration & { landedAt: Date } => migration.landedAt !== null,
  );

  if (pending.length === 0) {
    return {
      verdict: "current",
      healthy: true,
      pendingCount: 0,
      oldestAgeHours: null,
      oldest: null,
      undated: [],
      summary: "production has applied every migration in the repository",
      remedy: null,
    };
  }

  // The oldest is the one that decides: if the earliest arrival is still inside the window, so is
  // everything that came after it.
  const oldest = dated.length === 0
    ? (undated[0] ?? null)
    : dated.reduce((a, b) => (a.landedAt <= b.landedAt ? a : b));
  const oldestAgeHours = oldest?.landedAt ? hoursBetween(oldest.landedAt, asOf) : null;

  const remedy =
    "apply them with `supabase db push` against UrdaisProd, then confirm the ledger with "
    + "`npm run migrations:check -- --production --require-database`";

  // An age nobody can establish is not evidence of health. It is annotated rather than failed,
  // because it almost always means the checkout lacked history rather than that production is
  // behind -- but it never passes silently.
  if (oldestAgeHours === null) {
    return {
      verdict: "warning",
      healthy: true,
      pendingCount: pending.length,
      oldestAgeHours: null,
      oldest,
      undated,
      summary:
        `${plural(pending.length, "migration")} pending, and none carries a date this check could `
        + "read — the checkout probably lacks history, so the age is unverified rather than fine",
      remedy: "re-run with a full checkout (`fetch-depth: 0`), then read the age again",
    };
  }

  const rounded = Math.floor(oldestAgeHours);
  const context =
    `${plural(pending.length, "migration")} pending, the oldest for ${plural(rounded, "hour")} `
    + `(${oldest!.filename})`;

  if (oldestAgeHours >= thresholds.failAfterHours) {
    return {
      verdict: "overdue",
      healthy: false,
      pendingCount: pending.length,
      oldestAgeHours,
      oldest,
      undated,
      summary:
        `${context}. Production has been behind the repository for longer than the `
        + `${thresholds.failAfterHours}h deployment window allows, so a deployed application may be `
        + "running against a schema that does not have what it expects",
      remedy,
    };
  }

  if (oldestAgeHours >= thresholds.warnAfterHours) {
    return {
      verdict: "warning",
      healthy: true,
      pendingCount: pending.length,
      oldestAgeHours,
      oldest,
      undated,
      summary:
        `${context}. Still inside the ${thresholds.failAfterHours}h window, but past the point `
        + "where a deployment is normally finished",
      remedy,
    };
  }

  return {
    verdict: "informational",
    healthy: true,
    pendingCount: pending.length,
    oldestAgeHours,
    oldest,
    undated,
    summary: `${context}. Within the normal window between merging a migration and applying it`,
    remedy: null,
  };
}
