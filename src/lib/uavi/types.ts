/**
 * The normalized option-data contract: the boundary between a vendor and the mathematics.
 *
 * Nothing below names a vendor, and nothing below is shaped by one. The engine consumes
 * `NormalizedOptionQuote` values and has no opinion about whether they arrived as an OPRA
 * snapshot packet, a tape reconstruction, a licensed consolidated feed, or a test fixture. That
 * is the property that lets the whole calculator be tested without a data agreement, which
 * matters because Urdais does not have one and the methodology must not be weakened while it
 * waits for one.
 *
 * Five separations the types make structural.
 *
 *   `bid` and `ask` are nullable. A missing side is exactly what makes a quote invalid, and a
 *   type that could not represent one would force the adapter to invent a number or drop the
 *   contract — the first is fabrication and the second hides the wing's true extent.
 *
 *   Diagnostics are a separate field and are never inputs. Vendor implied volatility, Greeks,
 *   volume and open interest are recorded because they are useful for cross-checks, and the
 *   methodology is explicit that a vendor-published implied volatility is never canonical. They
 *   sit in a bag no calculation path reads.
 *
 *   `expirationTimestamp` is an absolute instant, not a date. Minutes to expiration is measured
 *   against it; a day count is a different and wrong number, and a date plus an assumed
 *   settlement hour is how a daylight-saving error enters.
 *
 *   `seriesState` has no default. An adjusted series may deliver a non-standard quantity, cash,
 *   or a second security after a corporate action, and an adapter that could omit the field would
 *   silently admit one.
 *
 *   The rate is supplied to the engine, never fetched by it. `RateResolver` is a synchronous
 *   lookup over already-resolved observations, so no mathematical function can perform I/O even
 *   by accident.
 */

/** Call or put. */
export type OptionRight = "call" | "put";

/** Whether the contract is a standard series or has been adjusted for a corporate action. */
export type SeriesState = "standard" | "adjusted";

/** Diagnostics retained beside a quote. Never an input to the official calculation. */
export type QuoteDiagnostics = {
  volume?: number;
  openInterest?: number;
  bidSize?: number;
  askSize?: number;
  /** A vendor's own implied volatility. Cross-check only; never canonical. */
  vendorImpliedVolatility?: number;
};

/**
 * One contract's NBBO at or before the official snapshot instant, normalized.
 *
 * This is the whole surface the engine sees. An adapter's job is to produce these and nothing
 * else; if a vendor payload cannot be turned into one honestly, the right outcome is a missing
 * quote rather than a filled-in one.
 */
export type NormalizedOptionQuote = {
  /** The vendor's or venue's contract identifier, retained for lineage. */
  contractSymbol: string;
  /** Urdais's security id for the underlying the option is written on. */
  underlyingSecurityId: string;
  /** The session this quote belongs to, as a calendar date. */
  sessionDate: string;
  /** When the quote was current. Never after the snapshot instant. */
  quoteTimestamp: string;
  /** The absolute expiration instant from contract reference data. */
  expirationTimestamp: string;
  /** The expiration's calendar date, for series identity and diagnostics. */
  expirationDate: string;
  right: OptionRight;
  strike: number;
  /** Null where the side is absent. Absence is a fact, not a gap to fill. */
  bid: number | null;
  ask: number | null;
  seriesState: SeriesState;
  contractMultiplier: number;
  /** The venue's expiration series label, e.g. a standard monthly or a Friday weekly. */
  expirationSeries: string;
  /** Whether the venue lists this series as one of its standard expirations. */
  isStandardExpiration: boolean;
  /** Where this came from. Present so a constituent's lineage names its source. */
  sourceInterfaceId?: string;
  diagnostics?: QuoteDiagnostics;
};

/**
 * One session's normalized input for one underlying, plus the instant it was taken at.
 *
 * The snapshot instant travels with the quotes rather than being recomputed by the engine,
 * because resolving 15:45 New York to an absolute instant depends on the session date's
 * daylight-saving state and that resolution belongs to one place.
 */
export type OptionChainSnapshot = {
  underlyingSecurityId: string;
  sessionDate: string;
  /** The official instant, already resolved through the named zone for this session date. */
  snapshotTimestamp: string;
  quotes: readonly NormalizedOptionQuote[];
};

/**
 * A resolved, continuously compounded rate for one expiration.
 *
 * Synchronous by design. A mathematical function that could await a rate could also fetch one,
 * and the methodology requires the calculation layer to hold no curve, no interpolation and no
 * network access. Returning null is a first-class answer and produces `rate_missing`.
 */
export type RateResolver = (expirationTimestamp: string) => ResolvedRate | null;

export type ResolvedRate = {
  /** Continuously compounded. Converted once at ingestion, never here. */
  continuousRate: number;
  /** Which published curve produced it. Carried for lineage, unused by the arithmetic. */
  curveFamily: string;
  /** Whether the maturity sat outside the published curve's tenor range. */
  isExtrapolated: boolean;
  rateObservationId?: string;
};

/**
 * The adapter boundary a future vendor integration implements.
 *
 * Asynchronous, unlike everything downstream of it: this is the one place I/O belongs. An
 * implementation returns normalized quotes or reports that it cannot, and never returns a
 * partially invented chain — a missing underlying makes an issuer uncovered, which is a correct
 * and publishable outcome, where a fabricated chain is neither.
 */
export interface OptionDataProvider {
  /** A stable identifier for the source, recorded on every observation it produces. */
  readonly sourceId: string;
  /**
   * Fetch one underlying's chain for one session at the official instant.
   * Returns null where the provider has no data for that underlying and session.
   */
  fetchChain(input: {
    underlyingSecurityId: string;
    sessionDate: string;
    snapshotTimestamp: string;
  }): Promise<OptionChainSnapshot | null>;
}
