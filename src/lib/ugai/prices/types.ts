/**
 * Canonical shapes for UGAI end-of-day equity closes.
 *
 * The type that matters here is `CanonicalClose`, and what matters about it is what it refuses
 * to carry. There is no `adjustedClose`, because a field that exists will eventually be written
 * to and a split-adjusted number in a raw-close column is unrecoverable. There is no `ticker` on
 * the canonical shape either: a ticker resolves to a listing during parsing and is not an
 * identity afterwards, so carrying it forward would invite a later join on the wrong thing.
 *
 * Prices are strings, not numbers. The source publishes "2380.00" and the column is `numeric`;
 * routing that through an IEEE-754 double in between would silently reshape values that cannot
 * be represented exactly, for no gain at all — nothing in this layer does arithmetic on a price.
 */

/** The venue trading calendar's answer for one date, which is not the same as having a price. */
export type SessionStatus =
  | "traded"
  | "exchange_holiday"
  | "no_official_close"
  | "source_unavailable";

/** Research and production are distinct acts under the rights model, as they are for retrievals. */
export type ObservationPurpose = "research" | "production";

/** How a source record identifies the line it describes, before resolution to a listing. */
export type SourceListingRef = {
  /** ISO 10383 MIC of the venue the source speaks for. Never inferred from the code. */
  venueMic: string;
  /** The venue's own code for the line. A label, never an identity. */
  localCode: string;
};

/**
 * One parsed close, before it is resolved against the security master.
 *
 * `closePrice` is null exactly when `sessionStatus` is not "traded". The database enforces the
 * same biconditional; it is repeated here so a parser cannot hand a fabricated holiday price to
 * the store and have it rejected three layers later with a less useful message.
 */
export type ParsedClose = {
  listingRef: SourceListingRef;
  tradingDate: string;
  sessionStatus: SessionStatus;
  closePrice: string | null;
  priceCurrency: string | null;
  priceUnit: "major" | "minor" | null;
  sourceReportedAt: string | null;
  /** The source record verbatim, retained as evidence. Nothing reads a price back out of it. */
  sourcePayload: unknown;
};

/** A parsed close that has been resolved to a listing and is ready to persist. */
export type CanonicalClose = ParsedClose & {
  listingId: string;
  retrievedAt: string;
  sourceInterfaceId: string;
  permissionGrantId: string;
  attribution: string | null;
  observationPurpose: ObservationPurpose;
  idempotencyKey: string;
};

/** What a source adapter must be able to do, expressed without reference to any issuer. */
export interface PriceSourceAdapter {
  /** Registry slug of the interface this adapter reads. Rights are looked up by it. */
  readonly sourceSlug: string;
  /** The venue MIC this adapter speaks for. One adapter, one venue. */
  readonly venueMic: string;
  /** Fetch and parse every close the source published for a date. */
  fetchCloses(tradingDate: string): Promise<ParsedClose[]>;
  /** Whether the venue held a session that date, from the venue's own calendar. */
  sessionStatusFor(tradingDate: string): Promise<SessionStatus>;
}

/** Raised when source data is malformed, ambiguous, or contradicts the security master. */
export class PriceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriceContractError";
  }
}

/**
 * A price that is not a positive finite decimal is not a price.
 *
 * Deliberately not a plausibility range. A GBX quote read as GBP is a hundredfold error and
 * still lands inside any range wide enough to be useful, so the guard against that is the
 * currency and unit equality check against the listing, not arithmetic about what looks sensible.
 */
export function assertPriceLiteral(raw: string, context: string): string {
  const value = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new PriceContractError(`${context}: '${raw}' is not a decimal price literal`);
  }
  if (Number(value) <= 0) {
    throw new PriceContractError(`${context}: price '${raw}' is not greater than zero`);
  }
  return value;
}

/**
 * The deterministic identity of an observed fact: what it describes, never when it was read.
 *
 * Keying on the run time would make every retry a new observation and every re-read a false
 * revision, which is the failure the UTVI slice already had to design around.
 */
export function idempotencyKeyFor(
  sourceSlug: string,
  venueMic: string,
  localCode: string,
  tradingDate: string,
  purpose: ObservationPurpose,
): string {
  return `${sourceSlug}:${venueMic}:${localCode}:${tradingDate}:${purpose}`;
}
