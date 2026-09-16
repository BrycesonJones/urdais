/**
 * Model Frontier operational freshness: two clocks, deliberately not averaged.
 *
 * The product has two inputs acquired under different lawful models, and a single freshness
 * number would misdescribe both:
 *
 *   **Capability** is machine-collected. Epoch's bundle carries its own CC BY 4.0 grant, so a
 *   scheduled job may fetch it. Freshness here is *scheduler* freshness — did the job run —
 *   and that is a different question from whether the source moved. Epoch publishes when
 *   models are evaluated, so an unchanged bundle is the ordinary healthy outcome.
 *
 *   **Price** is human-verified. No token-pricing source is cleared for automated production
 *   retrieval and every one remains under terms review, so there is no ingestion clock to
 *   read. Freshness here is *verification recency*: how long since a person last checked.
 *   That is a fact about Urdais's operating discipline, not about a provider's website.
 *
 * Renderability is not freshness. The Frontier can draw a perfectly correct chart from data
 * nobody has touched in a month, and every point on it would still be right. So these states
 * are reported separately from whether the surface works, and a stale clock is a failure even
 * while the product looks fine.
 */

import { VERIFICATION_REVIEW_INTERVAL_DAYS } from "@/lib/tokens/verification-freshness";

/**
 * How long the capability scheduler may go without a successful run before it is stale.
 *
 * The job runs daily, so two days allows one missed run — a deploy window, a transient
 * upstream failure — without crying wolf, while still catching a scheduler that has genuinely
 * stopped. An operations interval, not a methodology rule: changing it changes no published
 * value, only when someone is told to look.
 */
export const CAPABILITY_CHECK_INTERVAL_DAYS = 2;

/**
 * The Token Price verification interval, adopted by reference from the Token Price watchdog.
 *
 * Seven days, already defined and already in use. Model Frontier does not get its own
 * threshold for the same fact: two products disagreeing about when a price is stale would be
 * worse than either answer.
 */
export const PRICE_VERIFICATION_INTERVAL_DAYS = VERIFICATION_REVIEW_INTERVAL_DAYS;

const DAY_MS = 86_400_000;

/** The overall operational state. Ordered from healthiest to worst. */
export type FrontierOperationalState =
  /** Both clocks inside their windows, and the capability source has moved at some point. */
  | "fresh"
  /** Scheduler healthy, bundle unchanged since the last ingestion, price still verified. */
  | "capability-source-unchanged"
  /** Capability healthy; price verification is approaching its threshold. */
  | "price-verification-due"
  /** A clock has exceeded its window. */
  | "stale";

export type CapabilityClock = {
  /** The last successful capability retrieval, which only happens when the source moved. */
  lastRetrievalAt: string | null;
  lastBundleHash: string | null;
  /** Whole days since the last successful retrieval. */
  retrievalAgeDays: number | null;
  /** Whole days since the scheduler last completed a run, successful or not. */
  schedulerAgeDays: number | null;
  intervalDays: number;
  healthy: boolean;
  detail: string;
};

export type PriceClock = {
  acquisitionMode: "human_verified";
  lastVerifiedAt: string | null;
  verificationAgeDays: number | null;
  latestObservationDate: string | null;
  intervalDays: number;
  /** Providers past the interval, and providers never verified at all. */
  reviewDue: string[];
  neverVerified: string[];
  healthy: boolean;
  approachingThreshold: boolean;
  detail: string;
};

export type FrontierFreshness = {
  state: FrontierOperationalState;
  capability: CapabilityClock;
  price: PriceClock;
  /** True when every clock is inside its window. Not the same as "the chart renders". */
  ok: boolean;
};

function wholeDaysSince(instant: string | null, now: Date): number | null {
  if (instant === null) return null;
  const parsed = Date.parse(instant);
  if (Number.isNaN(parsed)) return null;
  return Math.floor((now.getTime() - parsed) / DAY_MS);
}

/**
 * Combine the two clocks into one operational state.
 *
 * `schedulerAgeDays` is the age of the newest *run*, which the caller must supply from the
 * scheduler's own record rather than from the retrieval table: a run that found the bundle
 * unchanged writes no retrieval, so inferring scheduler health from retrieval age would call
 * a perfectly healthy quiet week stale. Where no such record exists the caller passes null,
 * and this reports the scheduler as unverified rather than assuming it ran.
 */
export function assessFreshness(input: {
  lastRetrievalAt: string | null;
  lastBundleHash: string | null;
  schedulerLastRanAt: string | null;
  priceLastVerifiedAt: string | null;
  priceLatestObservationDate: string | null;
  priceReviewDue: string[];
  priceNeverVerified: string[];
  now: Date;
}): FrontierFreshness {
  const retrievalAgeDays = wholeDaysSince(input.lastRetrievalAt, input.now);
  const schedulerAgeDays = wholeDaysSince(input.schedulerLastRanAt, input.now);

  const schedulerKnown = schedulerAgeDays !== null;
  const schedulerHealthy = schedulerKnown && schedulerAgeDays <= CAPABILITY_CHECK_INTERVAL_DAYS;
  const capability: CapabilityClock = {
    lastRetrievalAt: input.lastRetrievalAt,
    lastBundleHash: input.lastBundleHash,
    retrievalAgeDays,
    schedulerAgeDays,
    intervalDays: CAPABILITY_CHECK_INTERVAL_DAYS,
    healthy: schedulerHealthy,
    detail: !schedulerKnown
      ? "no scheduled capability run has been recorded; scheduler freshness is unverified"
      : schedulerHealthy
        ? `scheduled check ran ${schedulerAgeDays} day(s) ago, inside the ${CAPABILITY_CHECK_INTERVAL_DAYS}-day interval`
        : `scheduled check last ran ${schedulerAgeDays} day(s) ago, beyond the ${CAPABILITY_CHECK_INTERVAL_DAYS}-day interval`,
  };

  const verificationAgeDays = wholeDaysSince(input.priceLastVerifiedAt, input.now);
  const priceHealthy =
    input.priceNeverVerified.length === 0 &&
    verificationAgeDays !== null &&
    verificationAgeDays < PRICE_VERIFICATION_INTERVAL_DAYS;
  // "Approaching" is the last two days of the window: enough warning to act, not so much that
  // the warning is permanent.
  const approaching =
    priceHealthy && verificationAgeDays !== null && verificationAgeDays >= PRICE_VERIFICATION_INTERVAL_DAYS - 2;

  const price: PriceClock = {
    acquisitionMode: "human_verified",
    lastVerifiedAt: input.priceLastVerifiedAt,
    verificationAgeDays,
    latestObservationDate: input.priceLatestObservationDate,
    intervalDays: PRICE_VERIFICATION_INTERVAL_DAYS,
    reviewDue: input.priceReviewDue,
    neverVerified: input.priceNeverVerified,
    healthy: priceHealthy,
    approachingThreshold: approaching,
    detail:
      input.priceNeverVerified.length > 0
        ? `never verified: ${input.priceNeverVerified.join(", ")}`
        : verificationAgeDays === null
          ? "no verification on record"
          : priceHealthy
            ? `last verified ${verificationAgeDays} day(s) ago, inside the ${PRICE_VERIFICATION_INTERVAL_DAYS}-day review interval`
            : `last verified ${verificationAgeDays} day(s) ago, beyond the ${PRICE_VERIFICATION_INTERVAL_DAYS}-day review interval; a person must check`,
  };

  const state: FrontierOperationalState = !capability.healthy || !price.healthy
    ? "stale"
    : approaching
      ? "price-verification-due"
      : "capability-source-unchanged";

  return { state, capability, price, ok: capability.healthy && price.healthy };
}

/** One line a log or a readiness report can carry. */
export function freshnessLine(freshness: FrontierFreshness): string {
  return (
    `${freshness.state} | capability scheduler ${freshness.capability.schedulerAgeDays ?? "?"}d/` +
    `${freshness.capability.intervalDays}d | price verified ${freshness.price.verificationAgeDays ?? "?"}d/` +
    `${freshness.price.intervalDays}d (human-verified)`
  );
}
