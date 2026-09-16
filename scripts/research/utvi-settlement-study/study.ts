/**
 * The arithmetic of the UTVI settlement study. Pure: no fetch, no filesystem, no clock.
 *
 * The question the study exists to answer is narrow. Production currently treats the
 * just-closed UTC day as provisional and everything older as final, on the strength of one
 * afternoon in Phase 1A: D−1 accrued ~16 ppm/day while D−2 and D−3 moved by exactly zero
 * over 6.2 minutes. Six minutes proves a day is not *actively* accruing. It says nothing
 * about a batch correction a week later, which is the failure this study is looking for.
 *
 * Two design facts shape everything below.
 *
 * **The detector is the content hash, not `as_of`.** Phase 1A measured `meta.as_of` moving
 * on every single request whether the data moved or not, so it is useless as a revision
 * signal and is deliberately excluded from the hash. The hash is `hashDateRows` from the
 * production normalizer — the same function the pipeline uses — so a revision the study
 * sees is exactly a revision the pipeline would see.
 *
 * **With one run per day, no date is ever read twice at the same age.** A date is seen once
 * at D−1, once at D−2, once at D−3. So every comparison is a *transition* between ages, and
 * the D−1 column of the per-age summary is empty by construction rather than by stability.
 * That is stated in the report rather than papered over, and the transition tables are where
 * the evidence actually lives:
 *
 *   `D−1 → D−2` carries the tail of the just-closed day's accrual and is expected to move;
 *   `D−2 → D−3` is the pure test — a day already called final, re-read a day later.
 *
 * Reading the D−2 row of the per-age table as "how often a final day revises" would be
 * wrong, and `priorDayAge` is recorded on every comparison so the distinction is auditable.
 */

import { hashDateRows } from "@/lib/utvi/normalize";
import type { CoverageState, SettlementState, SourceRow } from "@/lib/utvi/types";

/** The number of daily observations the study is trying to collect. */
export const TARGET_RUN_COUNT = 14 as const;

/** Day ages every run must record. `1` means D−1, the most recently closed UTC day. */
export const REQUIRED_DAY_AGES = [1, 2, 3] as const;

/** The oldest day age the harness will accept on `--max-day-age`. */
export const MAX_SUPPORTED_DAY_AGE = 7 as const;

/**
 * The source's `cache-control: max-age=60`. Two reads inside this window return a
 * byte-identical body — Phase 1A's own in-run check fell into exactly that trap and measured
 * a false zero. Any comparison closer together than this is marked and excluded from the
 * statistics rather than counted as evidence of stability.
 */
export const SOURCE_CACHE_MAX_AGE_SECONDS = 60 as const;

/** Margin over the cache window before a deliberate re-read is allowed at all. */
export const RERUN_MIN_SPACING_SECONDS = 90 as const;

/**
 * The threshold separating outcome B from outcome C, in ppm.
 *
 * A study band, not a production policy. It sits at 100 ppm because Phase 1A measured the
 * just-closed day drifting ~16 ppm/day; a settled day moving more than six times that would
 * be a different phenomenon from residual accrual, not more of the same one.
 */
export const TRIVIAL_REVISION_PPM = 100 as const;

/** Why a target date does or does not have a usable observation. */
export type ValidationStatus =
  | "ok"
  | "no_rows"
  | "not_served"
  | "contract_violation"
  | "http_error"
  | "transport_error";

/**
 * Magnitude bands for reporting (§16 of the brief), plus one the brief does not have.
 *
 * `recomposed` is a hash change whose net token delta is exactly zero: rows moved against
 * each other and the total did not. Forcing that into `trace` would label a real content
 * change as a sub-10-ppm move, and forcing it into `unchanged` would hide it entirely.
 */
export type RevisionBand = "unchanged" | "recomposed" | "trace" | "small" | "noticeable" | "material";

/** One target date as one run saw it. Token counts are decimal strings, never numbers. */
export type Observation = {
  studyRunDateUtc: string;
  /** 0 for the first run on a study date; incremented only by an explicit re-run. */
  rerunOrdinal: number;
  retrievalTimestampUtc: string;
  targetDate: string;
  /** 1 means D−1. Derived from UTC dates only, never from a local clock. */
  dayAge: number;
  sourceAsOf: string | null;
  metaStartDate: string | null;
  metaEndDate: string | null;
  /** SHA-256 over this date's rows alone. The revision detector. */
  responseHash: string | null;
  /** SHA-256 of the whole response body. Recorded to show it moves when content does not. */
  rawBodyHash: string | null;
  namedRowCount: number | null;
  otherPresent: boolean | null;
  otherTokens: string | null;
  totalTokens: string | null;
  sourceRowCount: number | null;
  httpStatus: number | null;
  validationStatus: ValidationStatus;
  validationDetail: string | null;
  coverageState: CoverageState | null;
  /** What production's settlement rule would call this date at this moment. Context only. */
  productionSettlementState: SettlementState | null;
  /** permaslug → token string. Kept for row-level diffs; never rendered into the summary. */
  rows: Record<string, string> | null;
};

/** How one observation differs from the previous observation of the same target date. */
export type Revision = {
  priorRunDate: string | null;
  priorDayAge: number | null;
  /** Seconds between the two retrievals. Null when there is no prior. */
  secondsSincePrior: number | null;
  /** True when the two reads are closer together than the source's cache window. */
  cacheContaminated: boolean;
  hashChanged: boolean | null;
  previousTotalTokens: string | null;
  /** Signed: current − previous. */
  revisionTokens: string | null;
  revisionPct: number | null;
  revisionPpm: number | null;
  band: RevisionBand | null;
  rowsChanged: number | null;
  rowsAdded: number | null;
  rowsRemoved: number | null;
  otherTokensDelta: string | null;
  maxRowAbsRevision: string | null;
  maxRowAbsRevisionPermaslug: string | null;
  maxRowPctRevision: number | null;
  maxRowPctRevisionPermaslug: string | null;
};

/** One line of the append-only ledger. */
export type StudyEntry = {
  observation: Observation;
  revision: Revision;
};

export const NO_REVISION: Revision = Object.freeze({
  priorRunDate: null,
  priorDayAge: null,
  secondsSincePrior: null,
  cacheContaminated: false,
  hashChanged: null,
  previousTotalTokens: null,
  revisionTokens: null,
  revisionPct: null,
  revisionPpm: null,
  band: null,
  rowsChanged: null,
  rowsAdded: null,
  rowsRemoved: null,
  otherTokensDelta: null,
  maxRowAbsRevision: null,
  maxRowAbsRevisionPermaslug: null,
  maxRowPctRevision: null,
  maxRowPctRevisionPermaslug: null,
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function utcMidnight(date: string): number {
  if (!ISO_DATE.test(date)) throw new Error(`'${date}' is not a YYYY-MM-DD date`);
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) throw new Error(`'${date}' is not a parseable date`);
  return parsed;
}

/** The UTC calendar date of an instant. Never the local one. */
export function utcDateOf(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/** Shift a UTC date by whole days. */
export function shiftUtcDate(date: string, days: number): string {
  return new Date(utcMidnight(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole UTC days from `earlier` to `later`. Negative when the order is reversed. */
export function daysBetweenUtc(earlier: string, later: string): number {
  return Math.round((utcMidnight(later) - utcMidnight(earlier)) / DAY_MS);
}

/**
 * The target dates for a run, newest first: D−1, D−2, … D−`maxDayAge`.
 *
 * `D−1` is the last completed UTC day, which is also the newest date the source will serve —
 * it rejects the current day outright and clamps a request for it down.
 */
export function targetDatesFor(now: Date, maxDayAge: number): { targetDate: string; dayAge: number }[] {
  if (!Number.isInteger(maxDayAge) || maxDayAge < 3 || maxDayAge > MAX_SUPPORTED_DAY_AGE) {
    throw new Error(`maxDayAge must be an integer from 3 to ${MAX_SUPPORTED_DAY_AGE}, got ${maxDayAge}`);
  }
  const today = utcDateOf(now);
  const targets: { targetDate: string; dayAge: number }[] = [];
  for (let dayAge = 1; dayAge <= maxDayAge; dayAge += 1) {
    targets.push({ targetDate: shiftUtcDate(today, -dayAge), dayAge });
  }
  return targets;
}

/** `D-1`, for labels and grouping keys. */
export function dayAgeLabel(dayAge: number): string {
  return `D-${dayAge}`;
}

/**
 * The semantic hash of one date's rows.
 *
 * Delegates to the production normalizer rather than reimplementing it, so that what the
 * study calls a revision is by construction what the pipeline would call a revision.
 *
 * Included: every returned row's `model_permaslug` and `total_tokens`, canonically ordered.
 * Excluded: `meta.as_of`, `meta.start_date`, `meta.end_date`, `meta.version`, the row order
 * the source chose, the retrieval timestamp, and every response header.
 */
export function hashRowsForDate(rows: readonly SourceRow[]): string {
  return hashDateRows(rows);
}

/** permaslug → token string, from the rows of one date. */
export function rowVector(rows: readonly SourceRow[]): Record<string, string> {
  const vector: Record<string, string> = {};
  for (const row of rows) vector[row.model_permaslug] = row.total_tokens.trim();
  return vector;
}

/**
 * A signed ratio, computed in BigInt and only then converted.
 *
 * Token totals sit three orders of magnitude inside the IEEE-754 safe range today, but that
 * is a fact about 2026 volumes rather than a property of the contract, so the division is
 * exact and the float appears only at the end. Resolution is 1e-6 ppm; Phase 1A's smallest
 * measured move was 5.2 ppb, which is 0.0052 ppm.
 */
const RATIO_SCALE = 1_000_000_000_000n;

function scaledRatio(delta: bigint, base: bigint): bigint | null {
  if (base === 0n) return null;
  return (delta * RATIO_SCALE) / base;
}

/** Percentage change, or null when the base is zero. */
export function revisionPct(current: bigint, previous: bigint): number | null {
  const scaled = scaledRatio(current - previous, previous);
  return scaled === null ? null : Number(scaled) / 1e10;
}

/** Parts-per-million change, or null when the base is zero. */
export function revisionPpm(current: bigint, previous: bigint): number | null {
  const scaled = scaledRatio(current - previous, previous);
  return scaled === null ? null : Number(scaled) / 1e6;
}

/**
 * The reporting band for one revision.
 *
 * `recomposed` is reserved for a genuinely zero net delta. A revision too small to register
 * at the ppm scale's resolution is still a revision and lands in `trace`: calling a real
 * one-token movement a recomposition would misdescribe it as rows cancelling out.
 *
 * A revision from a zero base has no finite relative magnitude, so it is banded `material`
 * rather than given a fabricated ppm. It has never been observed — the source has returned no
 * zero totals — and the case exists so that it cannot be silently mis-banded if it ever is.
 */
export function bandFor(hashChanged: boolean, revisionTokens: bigint | null, ppm: number | null): RevisionBand {
  if (!hashChanged) return "unchanged";
  if (revisionTokens !== null && revisionTokens === 0n) return "recomposed";
  if (ppm === null) return "material";
  const magnitude = Math.abs(ppm);
  if (magnitude <= 10) return "trace";
  if (magnitude <= 100) return "small";
  if (magnitude <= 1000) return "noticeable";
  return "material";
}

/**
 * Compare one observation against the previous observation of the same date.
 *
 * Returns all-null revision fields when there is no prior, when either side failed
 * validation, or when either side carries no content hash. An unobserved date is never
 * treated as a zero, so "the source served nothing" can never be read later as "the source
 * served nothing new".
 */
export function computeRevision(current: Observation, prior: Observation | null): Revision {
  if (prior === null) return { ...NO_REVISION };

  const secondsSincePrior =
    (Date.parse(current.retrievalTimestampUtc) - Date.parse(prior.retrievalTimestampUtc)) / 1000;
  const cacheContaminated = Number.isFinite(secondsSincePrior) && secondsSincePrior < SOURCE_CACHE_MAX_AGE_SECONDS;

  const base: Revision = {
    ...NO_REVISION,
    priorRunDate: prior.studyRunDateUtc,
    priorDayAge: prior.dayAge,
    secondsSincePrior: Number.isFinite(secondsSincePrior) ? secondsSincePrior : null,
    cacheContaminated,
  };

  if (current.responseHash === null || prior.responseHash === null) return base;

  const hashChanged = current.responseHash !== prior.responseHash;
  const withHash: Revision = { ...base, hashChanged };

  if (current.totalTokens === null || prior.totalTokens === null) return withHash;

  const currentTotal = BigInt(current.totalTokens);
  const previousTotal = BigInt(prior.totalTokens);
  const delta = currentTotal - previousTotal;
  const pct = revisionPct(currentTotal, previousTotal);
  const ppm = revisionPpm(currentTotal, previousTotal);

  const rowDiff = diffRowVectors(prior.rows, current.rows);
  const otherDelta =
    prior.otherTokens === null || current.otherTokens === null
      ? null
      : (BigInt(current.otherTokens) - BigInt(prior.otherTokens)).toString();

  return {
    ...withHash,
    previousTotalTokens: prior.totalTokens,
    revisionTokens: delta.toString(),
    revisionPct: pct,
    revisionPpm: ppm,
    band: bandFor(hashChanged, delta, ppm),
    otherTokensDelta: otherDelta,
    ...rowDiff,
  };
}

type RowDiff = Pick<
  Revision,
  | "rowsChanged"
  | "rowsAdded"
  | "rowsRemoved"
  | "maxRowAbsRevision"
  | "maxRowAbsRevisionPermaslug"
  | "maxRowPctRevision"
  | "maxRowPctRevisionPermaslug"
>;

const NO_ROW_DIFF: RowDiff = Object.freeze({
  rowsChanged: null,
  rowsAdded: null,
  rowsRemoved: null,
  maxRowAbsRevision: null,
  maxRowAbsRevisionPermaslug: null,
  maxRowPctRevision: null,
  maxRowPctRevisionPermaslug: null,
});

/**
 * Row-level shape of a revision: whether it is broad or concentrated.
 *
 * A model present in one vector and not the other is an addition or a removal, never a
 * change from or to zero — the source returns the top fifty models per day, so a model
 * leaving the response means it left the top fifty, not that its volume went to zero.
 * Percentage change is reported only where the denominator is a real prior value.
 */
export function diffRowVectors(
  prior: Record<string, string> | null,
  current: Record<string, string> | null,
): RowDiff {
  if (prior === null || current === null) return { ...NO_ROW_DIFF };

  let rowsChanged = 0;
  let rowsAdded = 0;
  let rowsRemoved = 0;
  let maxAbs: bigint | null = null;
  let maxAbsSlug: string | null = null;
  let maxAbsSigned: bigint | null = null;
  let maxPct: number | null = null;
  let maxPctSlug: string | null = null;

  for (const [permaslug, currentValue] of Object.entries(current)) {
    const priorValue = prior[permaslug];
    if (priorValue === undefined) {
      rowsAdded += 1;
      continue;
    }
    if (priorValue === currentValue) continue;
    rowsChanged += 1;
    const delta = BigInt(currentValue) - BigInt(priorValue);
    const magnitude = delta < 0n ? -delta : delta;
    if (maxAbs === null || magnitude > maxAbs) {
      maxAbs = magnitude;
      maxAbsSigned = delta;
      maxAbsSlug = permaslug;
    }
    const previous = BigInt(priorValue);
    if (previous !== 0n) {
      const pct = revisionPct(BigInt(currentValue), previous);
      if (pct !== null && (maxPct === null || Math.abs(pct) > Math.abs(maxPct))) {
        maxPct = pct;
        maxPctSlug = permaslug;
      }
    }
  }
  for (const permaslug of Object.keys(prior)) {
    if (!(permaslug in current)) rowsRemoved += 1;
  }

  return {
    rowsChanged,
    rowsAdded,
    rowsRemoved,
    maxRowAbsRevision: maxAbsSigned === null ? null : maxAbsSigned.toString(),
    maxRowAbsRevisionPermaslug: maxAbsSlug,
    maxRowPctRevision: maxPct,
    maxRowPctRevisionPermaslug: maxPctSlug,
  };
}

/* ---------- study state ---------- */

export type StudyState = {
  study: "utvi-settlement-study";
  targetRunCount: number;
  startedOnUtc: string | null;
  lastRunUtc: string | null;
  completedRunDates: string[];
  /** UTC dates between the first run and yesterday on which no run happened. */
  missedRunDates: string[];
  runsCompleted: number;
  runsRemaining: number;
  observationCount: number;
  /** The earliest date the study could finish if every remaining day is run. */
  projectedEndUtc: string | null;
};

/**
 * Derive the study's state from the ledger alone.
 *
 * Nothing about a missed day is inferred from a schedule: a day is missed if it fell between
 * the first run and yesterday and has no observation. Today is never counted as missed,
 * because the day is not over. The study ends after `TARGET_RUN_COUNT` *runs*, not after
 * fourteen calendar days — a skipped day extends the study rather than shortening it.
 */
export function deriveState(entries: readonly StudyEntry[], now: Date): StudyState {
  const runDates = [...new Set(entries.map((entry) => entry.observation.studyRunDateUtc))].sort();
  const today = utcDateOf(now);
  const startedOnUtc = runDates[0] ?? null;
  const lastRunUtc = runDates[runDates.length - 1] ?? null;

  const missedRunDates: string[] = [];
  if (startedOnUtc !== null) {
    const completed = new Set(runDates);
    const yesterday = shiftUtcDate(today, -1);
    for (let date = startedOnUtc; date <= yesterday; date = shiftUtcDate(date, 1)) {
      if (!completed.has(date)) missedRunDates.push(date);
    }
  }

  const runsCompleted = runDates.length;
  const runsRemaining = Math.max(0, TARGET_RUN_COUNT - runsCompleted);

  // The earliest the study could finish, counting from the next day that can still carry a
  // run. Whether today is one of those depends on whether today has already been run: with
  // thirteen runs left and today already recorded, the last of them lands thirteen days out,
  // not twelve. A finished study reports the day it actually finished rather than today.
  const projectedEndUtc =
    startedOnUtc === null
      ? null
      : runsRemaining === 0
        ? lastRunUtc
        : shiftUtcDate(today, runDates.includes(today) ? runsRemaining : runsRemaining - 1);

  return {
    study: "utvi-settlement-study",
    targetRunCount: TARGET_RUN_COUNT,
    startedOnUtc,
    lastRunUtc,
    completedRunDates: runDates,
    missedRunDates,
    runsCompleted,
    runsRemaining,
    observationCount: entries.length,
    projectedEndUtc,
  };
}

/* ---------- summary statistics ---------- */

export type GroupSummary = {
  key: string;
  observations: number;
  /** Observations that had a prior to compare against and were not cache-contaminated. */
  comparisons: number;
  hashChanges: number;
  revisionFrequency: number | null;
  exactStability: number;
  longestStableStreak: number;
  meanAbsPpm: number | null;
  medianAbsPpm: number | null;
  maxAbsPpm: number | null;
  minPct: number | null;
  maxPct: number | null;
  bands: Record<RevisionBand, number>;
  /** Comparisons dropped because the two reads fell inside the source's cache window. */
  cacheContaminatedDropped: number;
};

const EMPTY_BANDS = (): Record<RevisionBand, number> => ({
  unchanged: 0,
  recomposed: 0,
  trace: 0,
  small: 0,
  noticeable: 0,
  material: 0,
});

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Summarize a set of entries.
 *
 * A comparison is counted only where a prior observation existed and the two reads were
 * spaced beyond the source's cache window. Dropping the contaminated ones is the whole
 * reason the count is reported separately: a cached repeat is a byte-identical body, and
 * counting it as a stable observation would manufacture exactly the conclusion the study is
 * supposed to test.
 */
export function summarize(key: string, entries: readonly StudyEntry[]): GroupSummary {
  const comparable = entries.filter((entry) => entry.revision.priorRunDate !== null);
  const contaminated = comparable.filter((entry) => entry.revision.cacheContaminated);
  const usable = comparable.filter((entry) => !entry.revision.cacheContaminated);

  const hashChanges = usable.filter((entry) => entry.revision.hashChanged === true).length;
  const stable = usable.filter((entry) => entry.revision.hashChanged === false).length;

  const ppms = usable
    .map((entry) => entry.revision.revisionPpm)
    .filter((value): value is number => value !== null)
    .map(Math.abs);
  const pcts = usable
    .map((entry) => entry.revision.revisionPct)
    .filter((value): value is number => value !== null);

  const bands = EMPTY_BANDS();
  for (const entry of usable) {
    if (entry.revision.band !== null) bands[entry.revision.band] += 1;
  }

  let longest = 0;
  let current = 0;
  for (const entry of [...usable].sort((a, b) =>
    a.observation.studyRunDateUtc.localeCompare(b.observation.studyRunDateUtc),
  )) {
    if (entry.revision.hashChanged === false) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }

  return {
    key,
    observations: entries.length,
    comparisons: usable.length,
    hashChanges,
    revisionFrequency: usable.length === 0 ? null : hashChanges / usable.length,
    exactStability: stable,
    longestStableStreak: longest,
    meanAbsPpm: ppms.length === 0 ? null : ppms.reduce((sum, value) => sum + value, 0) / ppms.length,
    medianAbsPpm: median(ppms),
    maxAbsPpm: ppms.length === 0 ? null : Math.max(...ppms),
    minPct: pcts.length === 0 ? null : Math.min(...pcts),
    maxPct: pcts.length === 0 ? null : Math.max(...pcts),
    bands,
    cacheContaminatedDropped: contaminated.length,
  };
}

/** One summary per day age, ordered D−1 first. Never mixes ages. */
export function summarizeByDayAge(entries: readonly StudyEntry[]): GroupSummary[] {
  const ages = [...new Set(entries.map((entry) => entry.observation.dayAge))].sort((a, b) => a - b);
  return ages.map((age) =>
    summarize(
      dayAgeLabel(age),
      entries.filter((entry) => entry.observation.dayAge === age),
    ),
  );
}

/**
 * One summary per age transition — `D-1 → D-2` and so on.
 *
 * This is where a one-run-per-day study's evidence actually lives, because no date is ever
 * read twice at the same age.
 */
export function summarizeByTransition(entries: readonly StudyEntry[]): GroupSummary[] {
  const comparable = entries.filter((entry) => entry.revision.priorDayAge !== null);
  const keyOf = (entry: StudyEntry) =>
    `${dayAgeLabel(entry.revision.priorDayAge!)} → ${dayAgeLabel(entry.observation.dayAge)}`;
  const keys = [...new Set(comparable.map(keyOf))].sort();
  return keys.map((key) => summarize(key, comparable.filter((entry) => keyOf(entry) === key)));
}

/* ---------- the settlement decision rule ---------- */

export type SettlementOutcome = "A" | "B" | "C" | "insufficient_evidence";

export type SettlementVerdict = {
  outcome: SettlementOutcome;
  /** False until the study has collected its full run count. */
  final: boolean;
  headline: string;
  rationale: string;
  /** The D−2 evidence the verdict rests on. */
  evidence: GroupSummary | null;
};

/**
 * Evaluate the decision rule against the D−2 evidence.
 *
 * The rule is stated in advance and the evidence decides. Nothing here is hard-coded toward
 * the current production assumption, and a verdict is marked provisional until the full run
 * count is in — an outcome A drawn from three runs is a statement about three days.
 */
export function evaluateSettlement(entries: readonly StudyEntry[], state: StudyState): SettlementVerdict {
  const atD2 = entries.filter((entry) => entry.observation.dayAge === 2);
  const summary = atD2.length === 0 ? null : summarize(dayAgeLabel(2), atD2);
  const final = state.runsCompleted >= TARGET_RUN_COUNT;

  if (summary === null || summary.comparisons === 0) {
    return {
      outcome: "insufficient_evidence",
      final: false,
      headline: "Insufficient evidence",
      rationale:
        "No D−2 observation yet has a prior observation of the same date to compare against. " +
        "The first comparison becomes available on the study's second run.",
      evidence: summary,
    };
  }

  if (summary.hashChanges === 0) {
    return {
      outcome: "A",
      final,
      headline: "Outcome A — retain D−1 provisional / D−2 final",
      rationale:
        `Across ${summary.comparisons} D−2 comparison(s), the semantic content hash changed ${summary.hashChanges} time(s). ` +
        "On this evidence a day that has been closed for more than one further day does not revise at all.",
      evidence: summary,
    };
  }

  const maxAbsPpm = summary.maxAbsPpm ?? 0;
  if (maxAbsPpm <= TRIVIAL_REVISION_PPM) {
    return {
      outcome: "B",
      final,
      headline: "Outcome B — D−2 operationally final, with late-revision supersession",
      rationale:
        `${summary.hashChanges} of ${summary.comparisons} D−2 comparison(s) changed, but the largest absolute revision was ` +
        `${maxAbsPpm.toFixed(4)} ppm, inside the ${TRIVIAL_REVISION_PPM} ppm study threshold. ` +
        "Revisions exist and are below any plausible materiality bar, so finality can stand provided a later revision supersedes rather than being discarded.",
      evidence: summary,
    };
  }

  return {
    outcome: "C",
    final,
    headline: "Outcome C — move finalization to D−3 or later",
    rationale:
      `${summary.hashChanges} of ${summary.comparisons} D−2 comparison(s) changed, and the largest absolute revision was ` +
      `${maxAbsPpm.toFixed(4)} ppm, above the ${TRIVIAL_REVISION_PPM} ppm study threshold. ` +
      "A day called final at D−2 is still moving materially.",
    evidence: summary,
  };
}
