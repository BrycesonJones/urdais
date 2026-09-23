/**
 * When a monthly figure becomes due, and when its absence becomes a fault.
 *
 * UMPI is monthly, and the thing that matters operationally is not how recently Urdais checked a
 * source but which reference month the source should have produced by now. A check that succeeded
 * an hour ago tells you nothing if the month it found was August and it is late October.
 *
 * Each series therefore carries an explicit release policy rather than a wall-clock staleness
 * threshold. The policy says: reference month `M` is normally published on a given day of month
 * `M+1`, and Urdais does not treat its absence as a fault until a grace window past that day has
 * also elapsed. The grace exists because an agency's calendar slips for public holidays — Korea's
 * Chuseok and Lunar New Year both move — and calling an index stale because a holiday fell on a
 * Tuesday would be a false alarm about a working system.
 *
 * The parameters are evidence-based and recorded with that evidence. They are not tuning knobs:
 * changing one changes when Urdais claims its own data is late, so each carries its rationale.
 */

import type { UmpiSeriesCode } from "@/lib/umpi/types";

export type UmpiReleasePolicy = {
  /** Day of the month *following* the reference month on which the figure is normally published. */
  releaseDayOfMonth: number;
  /**
   * Days past the normal release day before absence is a fault rather than a wait. Sized to
   * absorb a public-holiday slip, not to hide a genuine outage.
   */
  graceDays: number;
  /**
   * How many recent months a routine check re-reads to notice a revision. Both agencies revise
   * recent months; neither revises deep history without a republication Urdais would learn of
   * another way.
   */
  revisionLookbackMonths: number;
  /**
   * How old the newest operational check may be before freshness stops being evaluable. A daily
   * schedule that has not run for two days is a fact about Urdais, not about the source, and the
   * honest answer then is that currentness is unknown.
   */
  maxCheckAgeHours: number;
  /** Why these numbers are these numbers. */
  rationale: string;
};

/**
 * Observed Bank of Korea PPI releases, reference month to publication date:
 * 2025-06 → 22 Jul 2025, 2025-07 → 21 Aug 2025, 2026-05 → 19 Jun 2026, 2026-06 → 22 Jul 2026.
 * The figure reaches ECOS at 08:00 KST on the release date and is marked preliminary, so recent
 * months revise.
 *
 * Korea Customs publishes item-level monthly trade statistics earlier in the following month;
 * Urdais observed August 2026 available on 22 September 2026. Its policy is set later and looser
 * than the observed behaviour because Urdais has fewer release dates for it than for the Bank of
 * Korea, and the cost of an over-tight rule is a false claim that Urdais's own data is late.
 */
export const UMPI_RELEASE_POLICIES: Readonly<Record<UmpiSeriesCode, UmpiReleasePolicy>> = {
  "UMPI-KR-DRAM-PPI": {
    releaseDayOfMonth: 22,
    graceDays: 7,
    revisionLookbackMonths: 3,
    maxCheckAgeHours: 48,
    rationale:
      "Bank of Korea PPI releases observed on the 19th-22nd of the following month (2025-06→22 Jul, "
      + "2025-07→21 Aug, 2026-05→19 Jun, 2026-06→22 Jul). Due on the 22nd, with a week's grace for "
      + "public-holiday slippage. Preliminary at first release, so three months are re-read for revisions.",
  },
  "UMPI-KR-DRAM-EXPORT-UV": {
    releaseDayOfMonth: 20,
    graceDays: 10,
    revisionLookbackMonths: 3,
    maxCheckAgeHours: 48,
    rationale:
      "Korea Customs item-level monthly trade statistics observed available for August 2026 on "
      + "22 September 2026. Urdais holds fewer observed release dates for this source than for the "
      + "Bank of Korea, so the due day is set at the 20th with ten days' grace: late enough that a "
      + "normal month is never called late, early enough that a genuinely missed month is caught "
      + "within about five weeks. Recent months can be revised as declarations are amended.",
  },
} as const;

/** `YYYY-MM` arithmetic, kept away from Date so a month never drifts across a timezone. */
export function addMonths(referenceMonth: string, delta: number): string {
  const [year, month] = referenceMonth.split("-").map(Number);
  const ordinal = (year ?? 0) * 12 + ((month ?? 1) - 1) + delta;
  return `${String(Math.floor(ordinal / 12)).padStart(4, "0")}-${String((ordinal % 12) + 1).padStart(2, "0")}`;
}

/** The reference month containing an instant, in UTC. */
export function monthOf(asOf: Date): string {
  return `${asOf.getUTCFullYear()}-${String(asOf.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * When reference month `M` is normally published: the policy's day of month `M+1`.
 *
 * Clamped to the end of the month so a policy day of 30 does not silently become March when the
 * following month is February.
 */
export function dueAt(referenceMonth: string, policy: UmpiReleasePolicy): Date {
  const next = addMonths(referenceMonth, 1);
  const [year, month] = next.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  return new Date(Date.UTC(year!, month! - 1, Math.min(policy.releaseDayOfMonth, lastDay)));
}

/** When the absence of reference month `M` stops being a wait and becomes a fault. */
export function overdueAt(referenceMonth: string, policy: UmpiReleasePolicy): Date {
  const due = dueAt(referenceMonth, policy);
  return new Date(due.getTime() + policy.graceDays * 86_400_000);
}

/**
 * The newest reference month that should already be published at `asOf`.
 *
 * Null before any month is due, which only happens far enough back that no policy reaches it.
 */
export function expectedReferenceMonth(asOf: Date, policy: UmpiReleasePolicy): string {
  // Walk back from the month containing `asOf`: the first month whose release day has passed.
  let candidate = monthOf(asOf);
  for (let step = 0; step < 24; step += 1) {
    if (dueAt(candidate, policy) <= asOf) return candidate;
    candidate = addMonths(candidate, -1);
  }
  return candidate;
}

/**
 * The narrow window a routine check reads: the month that may have just appeared, plus enough
 * recent months to notice a revision. Deliberately not the whole history — a daily schedule that
 * re-reads six years of an official source every morning is an abuse of it, and the 2020 base
 * year is audited on its own slower cadence instead.
 */
export function checkWindow(asOf: Date, policy: UmpiReleasePolicy): { fromMonth: string; toMonth: string } {
  const toMonth = expectedReferenceMonth(asOf, policy);
  return { fromMonth: addMonths(toMonth, -(policy.revisionLookbackMonths - 1)), toMonth };
}
