/**
 * UEPI domain contracts: raw source record, normalized hourly observation, released daily value.
 *
 * Three layers with one job each, following the shape PD-2 already runs in production
 * (`pipeline.raw_power_records` -> `pipeline.power_observations`). UEPI cannot reuse those tables
 * or these types' PD-2 equivalents for one decisive reason: a PD-2 observation is a non-negative
 * quantity of megawatts, and a UEPI observation is a signed price in dollars per megawatt-hour.
 * A wholesale power price that cannot be negative is not a wholesale power price -- SPP's North
 * Hub daily mean was -$0.11/MWh on 12 April 2026 -- so the non-negativity that is correct for load
 * would be a lie here.
 *
 * Specification: docs/research/uepi/uepi-v1-specification.md, frozen at 1.0.0. Section references
 * below are to that document.
 */

/** The seven public UEPI series. One identifier, spelled the same way in every layer (§I.1). */
export const UEPI_SERIES_IDS = [
  "uepi-ercot",
  "uepi-pjm",
  "uepi-caiso",
  "uepi-miso",
  "uepi-iso-ne",
  "uepi-nyiso",
  "uepi-spp",
] as const;

export type UepiSeriesId = (typeof UEPI_SERIES_IDS)[number];

export function isUepiSeriesId(value: string): value is UepiSeriesId {
  return (UEPI_SERIES_IDS as readonly string[]).includes(value);
}

/**
 * What the price actually contains (§A.1, §C.4).
 *
 * Kept as a first-class field rather than flattened into one "price" concept, because the two are
 * different economic objects that share a unit. Three markets publish a delivered price that
 * includes congestion (and losses where the market prices them); four publish only the uniform
 * system energy component, because they publish no footprint-wide total at all and Urdais will not
 * average hubs or zones into one. A surface that shows a UEPI value without this label overclaims.
 */
export const PRICE_CONSTRUCTS = ["delivered_price", "system_energy_component"] as const;
export type PriceConstruct = (typeof PRICE_CONSTRUCTS)[number];

/** Whether the market publishes the benchmark as a column, or Urdais derives it (§C.4). */
export const VALUE_DERIVATIONS = ["published_column", "derived_residual"] as const;
export type ValueDerivation = (typeof VALUE_DERIVATIONS)[number];

/** Hour labelling convention of the source. ISO-NE's is unresolved and blocks its release (§B.2). */
export const HOUR_CONVENTIONS = ["hour_ending", "hour_beginning", "unresolved"] as const;
export type HourConvention = (typeof HOUR_CONVENTIONS)[number];

/**
 * How well Urdais knows a market's daylight-saving behaviour (§C.6).
 *
 * `verified` -- a transition file was parsed and the hour count measured (MISO, NYISO, SPP).
 * `expected_unverified` -- prevailing time implies 23/25 and no transition file has been parsed
 * (ERCOT, PJM, CAISO). The count is computed, and a release on a transition day is blocked until
 * an operator confirms it, because "expected" is not "measured".
 * `unresolved` -- the convention itself is unknown (ISO-NE).
 */
export const DST_EVIDENCE = ["verified", "expected_unverified", "unresolved"] as const;
export type DstEvidence = (typeof DST_EVIDENCE)[number];

/**
 * Urdais's own posture for a series, independent of what its terms say (§J.5).
 *
 * `publishable` -- may reach a public surface once the rights determination allows it.
 * `internal_only` -- ingested and stored, never displayed (PJM, MISO, SPP).
 * `not_built` -- no adapter may emit for it yet (ISO-NE: no credential, no observed payload).
 */
export const PUBLICATION_POSTURES = ["publishable", "internal_only", "not_built"] as const;
export type PublicationPosture = (typeof PUBLICATION_POSTURES)[number];

/** An hour is either good enough to enter a mean or it is not. There is no middle grade (§F.3). */
export const OBSERVATION_QUALITIES = ["accepted", "suspect"] as const;
export type ObservationQuality = (typeof OBSERVATION_QUALITIES)[number];

/** The canonical definition of one market's benchmark. The single place a market is described. */
export type UepiBenchmark = {
  readonly seriesId: UepiSeriesId;
  /** Display symbol, e.g. "ERCOT". The market entity, never a geography. */
  readonly market: string;
  /** `reference.grid_areas` / `grid_operators` slug. Shared identity, separate series. */
  readonly gridOperatorSlug: string;
  readonly construct: PriceConstruct;
  readonly derivation: ValueDerivation;
  /** The residual expression for a derived series, e.g. "LMP - MCC - MLC". Null when published. */
  readonly derivationExpression: string | null;
  /** Node, settlement point, pricing node, location or BAA the benchmark is read from. */
  readonly sourceLocator: string;
  readonly sourceInterfaceSlug: string;
  /** IANA zone of the operating day. MISO is a fixed offset, not a prevailing-time zone. */
  readonly operatingTimezone: string;
  /** False only for MISO, which is Eastern Standard Time all year and always has 24 hours. */
  readonly observesDst: boolean;
  readonly hourConvention: HourConvention;
  readonly dstEvidence: DstEvidence;
  readonly publicationPosture: PublicationPosture;
  /** Mirror of the rights determination in the registry. The runtime decision reads the database. */
  readonly expectedRightsClassification: string;
  readonly benchmarkDefinition: string;
  readonly geographicScope: string;
  /** What the construct leaves out, published verbatim beside the value (§I.2). */
  readonly excludes: readonly string[];
};

/** Layer A: one source row, exactly as it was published, before any interpretation (§F.2). */
export type RawPriceRecord = {
  readonly seriesId: UepiSeriesId;
  /** Source row order. Load-bearing: it is the only thing separating NYISO's two 01:00 rows. */
  readonly rowOrdinal: number;
  readonly nativeOperatingDate: string;
  readonly nativeIntervalLabel: string;
  /** The source's own UTC field where it has one; null for NYISO, MISO and the ERCOT display. */
  readonly nativeIntervalUtc: string | null;
  /** Verbatim, unparsed. A price is text until the normalizer has seen it. */
  readonly nativeValue: string;
  /** Component columns needed to derive the benchmark or to cross-check the published identity. */
  readonly nativeComponents: Readonly<Record<string, string>>;
  /** `version_nbr`/`row_is_current` (PJM), `DSTFlag` (ERCOT), `BAA`/RePrice (SPP). */
  readonly nativeSourceVersion: Readonly<Record<string, string>> | null;
  readonly rawPayload: Readonly<Record<string, unknown>>;
};

/** Layer B: one hour, normalized and keyed by UTC instant (§F.3). */
export type NormalizedHourlyPrice = {
  readonly seriesId: UepiSeriesId;
  /** The market's own calendar date. Not a UTC date, and not derived from one. */
  readonly operatingDate: string;
  /** ISO-8601 UTC. The key: it is what makes a repeated local hour representable at all. */
  readonly intervalStartUtc: string;
  readonly intervalEndUtc: string;
  /** Position within the operating day, 1..25. How a 23- or 25-hour day is presented honestly. */
  readonly hourOrdinal: number;
  /** Decimal string, signed. Never a float in the pipeline: a float will not reproduce a digest. */
  readonly priceUsdPerMwh: string;
  readonly construct: PriceConstruct;
  readonly derivation: ValueDerivation;
  readonly derivationExpression: string | null;
  readonly sourceVersion: Readonly<Record<string, string>> | null;
  readonly qualityStatus: ObservationQuality;
  readonly qualityNotes: readonly string[];
};

/** Layer C: the released daily value, and everything needed to reproduce and audit it (§F.4). */
export type ReleasedDailyValue = {
  readonly seriesId: UepiSeriesId;
  readonly operatingDate: string;
  /** Decimal string at 6 dp, signed. Display rounding happens at the surface, never here. */
  readonly valueUsdPerMwh: string;
  readonly observationCount: number;
  readonly expectedObservationCount: number;
  readonly hourSpanStartUtc: string;
  readonly hourSpanEndUtc: string;
  /** SHA-256 over the ordered (interval, price) pairs. Reproducibility without the source. */
  readonly inputDigest: string;
  readonly construct: PriceConstruct;
  /** The frozen specification that produced this value. Frozen onto it, never inferred later. */
  readonly specificationVersion: string;
  readonly specificationDigest: string;
  readonly qualityChecks: readonly QualityCheckResult[];
  readonly releasedAt: string;
  readonly releaseKind: ReleaseKind;
};

export const RELEASE_KINDS = ["scheduled", "backfill", "operator"] as const;
export type ReleaseKind = (typeof RELEASE_KINDS)[number];

/** One named release gate, with the margin it measured, stored beside the value (§G.3). */
export type QualityCheckResult = {
  readonly check: string;
  readonly passed: boolean;
  /** What the check measured, where it measured something: a count, a spread, a margin. */
  readonly measured: number | null;
  readonly detail: string;
};

export class UepiDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UepiDomainError";
  }
}
