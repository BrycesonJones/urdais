/**
 * Reference implementation of the UCPI family's calculation calendar,
 * docs/methodology/ucpi.md 0.1.2-draft, "The calculation calendar and cutoff".
 *
 * A calculation date D is a UTC calendar date with the half-open window
 * [D 00:00:00Z, D+1 00:00:00Z). Urdais's own observation time controls
 * eligibility. The last complete reconfirmation before the cutoff is the
 * observation. Publication is due by the following cutoff. Like the other
 * modules here, this is a statement of the rule for tests, not a scheduler.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(calculationDate: string): number {
  if (!DATE_RE.test(calculationDate)) throw new RangeError(`calculation date must be YYYY-MM-DD, got ${calculationDate}`);
  const ms = Date.parse(`${calculationDate}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== calculationDate) {
    throw new RangeError(`not a calendar date: ${calculationDate}`);
  }
  return ms;
}

function parseInstant(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new RangeError(`not an instant: ${iso}`);
  return ms;
}

export type CalculationWindow = {
  calculationDate: string;
  /** Inclusive start, D 00:00:00Z. */
  windowStart: string;
  /** Exclusive end, which is the cutoff: D+1 00:00:00Z. */
  cutoff: string;
  /** Publication deadline: the following cutoff, D+2 00:00:00Z. */
  publicationDeadline: string;
};

export function calculationWindow(calculationDate: string): CalculationWindow {
  const start = parseDate(calculationDate);
  return {
    calculationDate,
    windowStart: new Date(start).toISOString(),
    cutoff: new Date(start + DAY_MS).toISOString(),
    publicationDeadline: new Date(start + 2 * DAY_MS).toISOString(),
  };
}

/** The calculation date an observation belongs to, from Urdais's observation instant. */
export function calculationDateOf(observedAt: string): string {
  return new Date(parseInstant(observedAt)).toISOString().slice(0, 10);
}

/** Half-open membership: start inclusive, cutoff exclusive. */
export function isWithinWindow(observedAt: string, calculationDate: string): boolean {
  const t = parseInstant(observedAt);
  const start = parseDate(calculationDate);
  return t >= start && t < start + DAY_MS;
}

export type Retrieval = {
  /** When the request began. Never controls eligibility. */
  requestedAt: string;
  /** When the response was received and recorded. Controls eligibility. Null if it never completed. */
  completedAt: string | null;
  /** Whether every eligibility-relevant field was re-established in this retrieval. */
  complete: boolean;
  /** The source's own effective time, if any. Never controls eligibility. */
  sourceEffectiveAt?: string | null;
};

/**
 * The observation for a date: the last complete reconfirmation whose completion
 * instant lies within the window. Earlier retrievals are evidence, not inputs.
 */
export function selectReconfirmation<T extends Retrieval>(retrievals: readonly T[], calculationDate: string): T | null {
  let chosen: T | null = null;
  for (const r of retrievals) {
    if (!r.complete || r.completedAt === null) continue;
    if (!isWithinWindow(r.completedAt, calculationDate)) continue;
    if (chosen === null || parseInstant(r.completedAt) > parseInstant(chosen.completedAt!)) chosen = r;
  }
  return chosen;
}

export type PublicationStatus = "published" | "delayed" | "unavailable";

/** Published if released before the deadline; Delayed if released at or after it, or not yet released; Unavailable if it cannot be produced. */
export function publicationStatus(input: { calculationDate: string; publishedAt: string | null; producible: boolean }): PublicationStatus {
  if (!input.producible) return "unavailable";
  const { publicationDeadline } = calculationWindow(input.calculationDate);
  if (input.publishedAt === null) return "delayed";
  return parseInstant(input.publishedAt) < parseInstant(publicationDeadline) ? "published" : "delayed";
}

export type PriorObservation =
  | { status: "unavailable" | "delayed" }
  | { status: "published"; breadth: "minimum" | "normal"; participantSetChanged: boolean };

export type ChangeDisposition = "published" | "annotated" | "withheld";

/**
 * Percentage change against the immediately preceding calculation date only:
 * withheld where that date has no Published level, annotated where the
 * participant set or the breadth changed, published otherwise.
 */
export function percentageChangeDisposition(prior: PriorObservation, current: { breadth: "minimum" | "normal" }): ChangeDisposition {
  if (prior.status !== "published") return "withheld";
  if (prior.participantSetChanged || prior.breadth !== current.breadth) return "annotated";
  return "published";
}
