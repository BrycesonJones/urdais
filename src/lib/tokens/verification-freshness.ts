/**
 * How long it has been since a person last verified each provider's published price.
 *
 * This exists because of what Token Price is, not in spite of it. The methodology records a
 * canonical observation only when a source price changes, so an unchanged price correctly
 * produces no new row -- and a provider nobody has looked at in a month produces exactly the
 * same thing. The two states are indistinguishable from the price data alone, which is
 * precisely why production sat on a single 14 September row for two days without anything
 * noticing.
 *
 * So this module does not ask "is the value stale?", which the price data cannot answer. It
 * asks "how long since anyone checked?", and it answers from the record of people checking:
 * `pipeline.token_price_verifications`, one row per attestation.
 *
 * It did not always. The first version read the newest frozen benchmark's `calculatedAt`,
 * which is a calculation instant, not a verification instant. Those coincide only on the day
 * a price moves. An unchanged review writes no observation (the price did not change), freezes
 * no point (nothing was recalculated) and -- because a manual retrieval is keyed by artifact
 * hash -- does not even record a second retrieval. Every one of those rules is right, and
 * together they meant a person could re-read all seven pages and leave the watchdog reporting
 * that nobody had. Freshness now reads the event that actually happened.
 *
 * Two things this deliberately refuses to do. It never treats an attestation alone as health:
 * a provider with no valid frozen value or recorded withholding behind it is reported as
 * unverified however many people ran the command, because a verification of nothing is
 * evidence of nothing. And it contacts no provider, reads no pricing page and touches no
 * source's collection rights. Every Wave-1 token source is `research_usable` / `under_review`
 * and not machine-readable, and docs/methodology/token-price.md states that whether Urdais may
 * retrieve those pages on a schedule "is still open" for every one of them. A watchdog is what
 * may be automated here. The reading itself is not.
 */

import { WAVE1_PROVIDERS, type Wave1Provider } from "@/lib/tokens/types";
import type { PersistedBenchmarkRow } from "@/lib/tokens/read/benchmark-store";
import { latestVerificationByProvider, type TokenVerificationEvent } from "@/lib/tokens/read/verification-events";

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
  /**
   * No verification stands for this provider. Two conditions reach it, and the
   * report distinguishes them by `frozenPoints` and `latestStatus` rather than
   * by adding a fourth state the watchdog contract would have to carry:
   *
   *   nothing is frozen at all       -- the provider has never been published
   *   frozen, but no attestation     -- a value exists that nobody is on record
   *                                     as having checked
   *
   * Both mean the same thing operationally: a person must look before this
   * provider can be called healthy, which is why both fail closed here.
   */
  | "never_verified";

export type ProviderFreshness = {
  provider: Wave1Provider;
  state: ProviderFreshnessState;
  /** The newest attestation's instant, or null where none stands. */
  lastVerifiedAt: string | null;
  /** Who made that attestation, or null where none stands. */
  lastVerifiedBy: string | null;
  /** Whole days since that instant, or null where there is none. */
  ageDays: number | null;
  /** Frozen calculations on record for this provider. */
  frozenPoints: number;
  /** Attestations on record for this provider. */
  verificationEvents: number;
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
 * Every provider appears, including ones with no verification standing: a provider missing
 * from the record is the single most important thing this can report, and omitting it would
 * reproduce the silence this exists to break.
 *
 * Both inputs are required, and neither substitutes for the other. The events say when a
 * person last looked; the frozen rows say whether there is anything valid for them to have
 * looked at. A provider is current only when both hold.
 */
export function verificationFreshness(
  rows: readonly PersistedBenchmarkRow[],
  events: readonly TokenVerificationEvent[],
  now: Date,
  reviewIntervalDays: number = VERIFICATION_REVIEW_INTERVAL_DAYS,
): VerificationFreshnessReport {
  const newest = newestByProvider(rows);
  const newestVerification = latestVerificationByProvider(events);
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.providerSlug, (counts.get(row.providerSlug) ?? 0) + 1);
  const eventCounts = new Map<string, number>();
  for (const event of events) eventCounts.set(event.providerSlug, (eventCounts.get(event.providerSlug) ?? 0) + 1);

  const providers: ProviderFreshness[] = WAVE1_PROVIDERS.map((provider) => {
    const latest = newest.get(provider);
    const verification = newestVerification.get(provider);
    const frozenPoints = counts.get(provider) ?? 0;
    const verificationEvents = eventCounts.get(provider) ?? 0;

    // Nothing frozen, or nothing attested. Either way no verification stands,
    // and the provider is reported as needing a person rather than as healthy.
    if (latest === undefined || verification === undefined) {
      return {
        provider,
        state: "never_verified",
        lastVerifiedAt: null,
        lastVerifiedBy: null,
        ageDays: null,
        frozenPoints,
        verificationEvents,
        latestStatus: latest?.calculationStatus ?? null,
        withheldReason: latest?.withheldReason ?? null,
      };
    }

    const ageDays = wholeDaysBetween(verification.verifiedAt, now);
    return {
      provider,
      state: ageDays !== null && ageDays >= reviewIntervalDays ? "review_due" : "current",
      lastVerifiedAt: verification.verifiedAt,
      lastVerifiedBy: verification.verifiedBy,
      ageDays,
      frozenPoints,
      verificationEvents,
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
