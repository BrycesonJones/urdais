/**
 * How long it has been since a person last verified each provider's published price.
 *
 * This exists because of what Token Price is, not in spite of it. The methodology records a
 * canonical observation only when a source price changes, so an unchanged price correctly
 * produces no new row -- and a provider nobody has looked at in a month produces exactly the
 * same thing. The two states are indistinguishable from the data alone, which is precisely
 * why production sat on a single 14 September row for two days without anything noticing.
 *
 * So this module does not ask "is the value stale?", which the data cannot answer. It asks
 * "how long since anyone checked?", which it can. That is a question about Urdais's own
 * operating discipline, and it is answered entirely from Urdais's own database: nothing here
 * contacts a provider, reads a pricing page, or touches a source's collection rights. Every
 * Wave-1 token source is `research_usable` / `under_review` and not machine-readable, and
 * docs/methodology/token-price.md states that whether Urdais may retrieve those pages on a
 * schedule "is still open" for every one of them. A watchdog is what may be automated here.
 * The reading itself is not.
 */

import { WAVE1_PROVIDERS, type Wave1Provider } from "@/lib/tokens/types";
import type { PersistedBenchmarkRow } from "@/lib/tokens/read/benchmark-store";

/**
 * How long a provider may go unverified before the run reports it as due.
 *
 * An operations interval, deliberately not a methodology rule: the methodology defines when
 * an observation is *recorded* (a price changed) and says nothing about how often someone
 * should look. Seven days is a review cadence, and changing it changes no published value.
 */
export const VERIFICATION_REVIEW_INTERVAL_DAYS = 7;

const DAY_MS = 86_400_000;

export type ProviderFreshnessState =
  /** Verified within the review interval. */
  | "current"
  /** Verified, but longer ago than the review interval: someone should look. */
  | "review_due"
  /** No production benchmark has ever been frozen for this provider. */
  | "never_verified";

export type ProviderFreshness = {
  provider: Wave1Provider;
  state: ProviderFreshnessState;
  /** The newest frozen calculation's instant, or null where none exists. */
  lastVerifiedAt: string | null;
  /** Whole days since that instant, or null where there is none. */
  ageDays: number | null;
  /** Frozen calculations on record for this provider. */
  frozenPoints: number;
  /**
   * Whether the newest frozen calculation carries a value or is a recorded withholding.
   * A withholding is a decision on the record, not an absence, so it counts as verified.
   */
  latestStatus: "value" | "withheld" | null;
  withheldReason: string | null;
};

export type VerificationFreshnessReport = {
  /** False when any provider is due for review or has never been verified. */
  ok: boolean;
  checkedAt: string;
  reviewIntervalDays: number;
  providers: ProviderFreshness[];
  /** Providers needing a person's attention, for the one-line summary a log can carry. */
  reviewDue: Wave1Provider[];
  neverVerified: Wave1Provider[];
};

function wholeDaysBetween(from: string, to: Date): number | null {
  const parsed = Date.parse(from);
  if (Number.isNaN(parsed)) return null;
  return Math.floor((to.getTime() - parsed) / DAY_MS);
}

/** The newest frozen row per provider, by calculation instant. */
function newestByProvider(rows: readonly PersistedBenchmarkRow[]): Map<string, PersistedBenchmarkRow> {
  const newest = new Map<string, PersistedBenchmarkRow>();
  for (const row of rows) {
    const held = newest.get(row.providerSlug);
    if (held === undefined || Date.parse(row.calculatedAt) > Date.parse(held.calculatedAt)) {
      newest.set(row.providerSlug, row);
    }
  }
  return newest;
}

/**
 * The freshness report for every Wave-1 provider.
 *
 * Every provider appears, including ones that have never been verified: a provider missing
 * from the frozen rows is the single most important thing this can report, and omitting it
 * would reproduce the silence this exists to break.
 */
export function verificationFreshness(
  rows: readonly PersistedBenchmarkRow[],
  now: Date,
  reviewIntervalDays: number = VERIFICATION_REVIEW_INTERVAL_DAYS,
): VerificationFreshnessReport {
  const newest = newestByProvider(rows);
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.providerSlug, (counts.get(row.providerSlug) ?? 0) + 1);

  const providers: ProviderFreshness[] = WAVE1_PROVIDERS.map((provider) => {
    const latest = newest.get(provider);
    if (latest === undefined) {
      return {
        provider,
        state: "never_verified",
        lastVerifiedAt: null,
        ageDays: null,
        frozenPoints: 0,
        latestStatus: null,
        withheldReason: null,
      };
    }
    const ageDays = wholeDaysBetween(latest.calculatedAt, now);
    return {
      provider,
      state: ageDays !== null && ageDays >= reviewIntervalDays ? "review_due" : "current",
      lastVerifiedAt: latest.calculatedAt,
      ageDays,
      frozenPoints: counts.get(provider) ?? 0,
      latestStatus: latest.calculationStatus,
      withheldReason: latest.withheldReason,
    };
  });

  const reviewDue = providers.filter((p) => p.state === "review_due").map((p) => p.provider);
  const neverVerified = providers.filter((p) => p.state === "never_verified").map((p) => p.provider);

  return {
    ok: reviewDue.length === 0 && neverVerified.length === 0,
    checkedAt: now.toISOString(),
    reviewIntervalDays,
    providers,
    reviewDue,
    neverVerified,
  };
}

/** One line a log or a cron history can carry without anyone opening the payload. */
export function freshnessSummary(report: VerificationFreshnessReport): string {
  const parts = report.providers.map((p) => `${p.provider}=${p.ageDays === null ? "never" : `${p.ageDays}d`}`);
  return `${report.ok ? "ok" : "review_due"} interval=${report.reviewIntervalDays}d ${parts.join(" ")}`;
}
