/**
 * Choosing the two expirations, and refusing to proceed on one.
 *
 * Near Term is `10 ≤ DTE ≤ 30`, Next Term is `30 < DTE ≤ 120`, and the pair must strictly bracket
 * the 30-day horizon. UAVI therefore always interpolates between two observed terms and never
 * extrapolates beyond the observed term structure. A single strip, however close to 30 days, is
 * not sufficient — and this is the rule most likely to be quietly relaxed when data is thin,
 * because one good strip near 30 days *looks* like a reasonable 30-day estimate. It is not: it is
 * that expiration's variance relabelled, and the difference is exactly the term structure the
 * interpolation exists to account for.
 *
 * **Days to expiration are fractional calendar days, not an integer day count.** That is forced
 * rather than preferred. The bracket the interpolation requires is stated in minutes,
 * `N_1 ≤ N30 < N_2`, and an integer day count breaks it: an expiration 30.4 calendar days away
 * floors to 30, would be admitted as a Near Term under `DTE ≤ 30`, and carries 43,776 minutes —
 * more than N30 — so the interpolation weights would fall outside `[0, 1]` and the "interpolation"
 * would be an extrapolation computed with the interpolation formula. Fractional days and the
 * minute bracket agree by construction.
 */

import {
  N30,
  NEAR_TERM_MAX_DTE,
  NEAR_TERM_MIN_DTE,
  NEXT_TERM_MAX_DTE,
} from "@/lib/uavi/parameters";

export type ExpirationCandidate = {
  expirationDate: string;
  expirationTimestamp: string;
  /** Whether the venue lists this as one of its standard expiration series. */
  isStandardExpiration: boolean;
};

export type SelectedExpiration = ExpirationCandidate & {
  minutesToExpiration: number;
  daysToExpiration: number;
};

export type ExpirationSelection =
  | { selected: true; near: SelectedExpiration; next: SelectedExpiration }
  | { selected: false; reason: "near_expiry_missing" | "next_expiry_missing" };

function measure(
  candidate: ExpirationCandidate,
  snapshotMs: number,
): SelectedExpiration | null {
  const expiry = Date.parse(candidate.expirationTimestamp);
  if (!Number.isFinite(expiry)) return null;
  const minutes = (expiry - snapshotMs) / 60_000;
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return { ...candidate, minutesToExpiration: minutes, daysToExpiration: minutes / 1_440 };
}

/**
 * Pick one term from its candidates.
 *
 * Standard expirations are preferred outright; only where none satisfies the bound does a
 * non-standard listed expiration qualify. Within the preferred group the choice is the
 * expiration closest to 30 days, with an earlier expiration breaking a tie so that the selection
 * is deterministic rather than dependent on input order.
 */
function pick(candidates: readonly SelectedExpiration[]): SelectedExpiration | null {
  if (candidates.length === 0) return null;
  const standard = candidates.filter((c) => c.isStandardExpiration);
  const pool = standard.length > 0 ? standard : candidates;
  return [...pool].sort((a, b) => {
    const byDistance =
      Math.abs(a.daysToExpiration - 30) - Math.abs(b.daysToExpiration - 30);
    if (byDistance !== 0) return byDistance;
    return a.minutesToExpiration - b.minutesToExpiration;
  })[0]!;
}

export function selectExpirations(
  candidates: readonly ExpirationCandidate[],
  snapshotTimestamp: string,
): ExpirationSelection {
  const snapshotMs = Date.parse(snapshotTimestamp);
  if (!Number.isFinite(snapshotMs)) return { selected: false, reason: "near_expiry_missing" };

  const measured = candidates
    .map((c) => measure(c, snapshotMs))
    .filter((c): c is SelectedExpiration => c !== null);

  const nearPool = measured.filter(
    (c) => c.daysToExpiration >= NEAR_TERM_MIN_DTE && c.daysToExpiration <= NEAR_TERM_MAX_DTE,
  );
  const nextPool = measured.filter(
    (c) => c.daysToExpiration > NEAR_TERM_MAX_DTE && c.daysToExpiration <= NEXT_TERM_MAX_DTE,
  );

  const near = pick(nearPool);
  if (near === null) return { selected: false, reason: "near_expiry_missing" };
  const next = pick(nextPool);
  if (next === null) return { selected: false, reason: "next_expiry_missing" };

  // The minute bracket, re-checked against the selection the day bounds produced. They agree by
  // construction with fractional days; the assertion stands because "by construction" is a claim
  // about today's bounds and this is the invariant the interpolation actually needs.
  if (!(near.minutesToExpiration <= N30 && next.minutesToExpiration > N30)) {
    return { selected: false, reason: "next_expiry_missing" };
  }
  return { selected: true, near, next };
}
