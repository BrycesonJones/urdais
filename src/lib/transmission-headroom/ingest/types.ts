/**
 * The contract a transmission source implements.
 *
 * Shaped like the Interconnection Queue adapters: the adapter owns `discover` and `parse`, both
 * pure given bytes, and the framework owns retrieval, hashing, rights, identity, idempotence and
 * persistence. An adapter never touches SQL and never decides publication.
 *
 * The parsed record is deliberately close to the publisher's own row. Normalisation happens once,
 * in the store, so that two markets with genuinely different shapes are not forced through a common
 * intermediate that would lose direction on one side and contingency on the other.
 */

import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import type {
  ContingencyKind, DeferralReason, EntityKind, LimitDirection, TimestampZoneStatus,
} from "@/lib/transmission-headroom/types";

/** One artifact the adapter wants retrieved. */
export type TransmissionArtifactRef = {
  url: string;
  /** The publisher's own key for this artifact. NYISO: the calendar day. ERCOT: the doclookupId. */
  nativeKey: string;
  /** What the artifact is expected to cover, where the name says. */
  coverageStart?: string;
  coverageEnd?: string;
  /** Unzip before parsing. */
  isZip?: boolean;
};

/** A limit as the publisher printed it, before classification. */
export type ParsedLimit = {
  nativeField: string;
  direction: LimitDirection;
  rawValue: string;
  limitMw: number;
};

/**
 * One parsed row: an entity, an instant, a flow, and the limits published alongside it.
 *
 * NYISO yields two limits per row (one per direction); ERCOT yields one. The shape holds both
 * without either pretending to be the other.
 */
export type ParsedObservation = {
  entityKind: EntityKind;
  /**
   * NYISO: the Point ID. ERCOT: the (constraint name, contingency name) pair joined on ASCII
   * Unit Separator, which is the composite that is actually identity. Not NUL: PostgreSQL rejects
   * a NUL byte in a text column.
   */
  nativeEntityKey: string;
  nativeName: string;
  /** ERCOT only. */
  nativeContingencyName?: string;
  contingencyKind: ContingencyKind;
  fromStation?: string | null;
  toStation?: string | null;
  fromStationKv?: number | null;
  toStationKv?: number | null;

  nativeTimestamp: string;
  observedAt: Date;
  timestampZoneStatus: TimestampZoneStatus;

  flowNativeField: string;
  flowRawValue: string;
  flowMw: number;
  unitAsPublished: string;

  limits: ParsedLimit[];
  rowOrdinal: number;
  /** Everything else the publisher printed, kept verbatim as raw evidence. */
  payload: Record<string, string>;
  /** Source-native metadata that is not identity and must never gate eligibility. */
  nativeMetadata: Record<string, string>;
};

export type ParsedDeferral = {
  reason: DeferralReason;
  nativeEntityKey?: string;
  nativeValue?: string;
  detail: string;
  rowOrdinal?: number;
};

export type ParseResult = {
  observations: ParsedObservation[];
  deferrals: ParsedDeferral[];
  /** What the publisher says about its own freshness, where it says anything. */
  sourcePublishedAt?: Date;
};

export type TransmissionAdapter = {
  key: string;
  sourceInterfaceSlug: string;
  gridAreaSlug: string;
  entityKind: EntityKind;
  /**
   * Which artifacts to retrieve. `window` lets a caller bound a historical backfill; an adapter
   * with a rolling listing ignores it and returns whatever the publisher currently exposes.
   */
  discover: (options: {
    window?: { start: Date; end: Date };
    limit?: number;
    fetchText: (url: string) => Promise<string>;
  }) => Promise<TransmissionArtifactRef[]>;
  parse: (artifact: RetrievedArtifact, ref: TransmissionArtifactRef) => ParseResult;
};
