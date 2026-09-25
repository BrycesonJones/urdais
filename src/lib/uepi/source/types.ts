/**
 * The contract a UEPI day-ahead price source implements.
 *
 * Shaped like the PD-3, PD-4 and Interconnection Queue adapters, deliberately: an adapter owns
 * only `parse`, a pure function of retrieved bytes, and the framework owns retrieval, hashing,
 * rights, identity, idempotence and persistence. One consequence is the point of the whole phase
 * -- a parser can be tested against a committed real artifact with no network, no clock and no
 * database, so six months from now a failing test distinguishes "the ISO changed its file" from
 * "our reader was always wrong".
 *
 * An adapter never decides whether its market may be published, never averages anything, and
 * never computes a daily value. It says what the file said.
 */

import type { RawPriceRecord, UepiSeriesId } from "@/lib/uepi/types";

/** One retrieved file, exactly as it arrived. */
export type RetrievedArtifact = {
  /** Stable name for this artifact within a day's retrieval, e.g. "day" or "monthly-archive". */
  label: string;
  url: string;
  retrievedAt: string;
  status: number;
  contentType: string | null;
  byteLength: number;
  sha256: string;
  body: Buffer;
};

/** What the framework must fetch before an adapter can parse a day. */
export type ArtifactRequest = {
  label: string;
  url: string;
  /** Whether a 404 is an ordinary outcome for this artifact rather than a failure. */
  optional?: boolean;
};

/**
 * Stable failure vocabulary. A refusal names itself, because "the day did not ingest" covers a
 * source outage, a schema change and a rights refusal, and an operator needs to tell them apart.
 */
export const SOURCE_FAILURE_REASONS = [
  "SOURCE_UNAVAILABLE",
  "AUTHENTICATION_REQUIRED",
  "SCHEMA_MISMATCH",
  "MISSING_CANONICAL_BENCHMARK",
  "INVALID_TIMESTAMP",
  "INVALID_PRICE",
  "DUPLICATE_INTERVAL",
  "UNSUPPORTED_SOURCE_ROW",
  "EMPTY_SOURCE",
  "RIGHTS_RETENTION_BLOCKED",
  "ADAPTER_UNAVAILABLE",
  /** The source was read and the write failed. Distinct, because the remedy is entirely different. */
  "PERSISTENCE_FAILED",
] as const;

export type SourceFailureReason = (typeof SOURCE_FAILURE_REASONS)[number];

export class UepiSourceError extends Error {
  constructor(
    readonly seriesId: string,
    readonly reason: SourceFailureReason,
    message: string,
  ) {
    super(`${seriesId}: ${message}`);
    this.name = "UepiSourceError";
  }
}

/** A row the parser saw and did not use, kept with the reason so a silent drop is impossible. */
export type RejectedRow = {
  /** 1-based line or row ordinal in the source artifact. */
  sourceRow: number;
  reason: SourceFailureReason | "NOT_CANONICAL_BENCHMARK";
  detail: string;
};

/**
 * One canonical row, as the adapter read it.
 *
 * Three parts, kept apart on purpose. `raw` is what the file printed and is never recomputed.
 * `intervalStartUtc` is the adapter's reading of *which instant* that row is, which for two of
 * these markets is an interpretation rather than a field: MISO prints an hour-ending index in a
 * fixed offset, and NYISO prints a local label that repeats on a fall-back day. `benchmarkPrice`
 * is the canonical price -- identical to the printed value where the market publishes the
 * benchmark as a column, and an exact decimal residual where the specification derives it.
 */
export type AdapterRecord = {
  raw: RawPriceRecord;
  /** ISO-8601 UTC instant the row's interval begins. */
  intervalStartUtc: string;
  /** Position within the operating day, 1-based, in source order. */
  hourOrdinal: number;
  /** The canonical benchmark price as a decimal string, signed. */
  benchmarkPrice: string;
};

/** What an adapter returns for one operating day. */
export type AdapterParseResult = {
  seriesId: UepiSeriesId;
  operatingDate: string;
  /** The canonical benchmark rows, in source order. */
  records: AdapterRecord[];
  /**
   * Cross-check rows the specification requires for this market: a second carrier for the
   * uniformity assertion, or the components of the published identity. Never averaged into
   * the value, and never persisted as the benchmark.
   */
  crossCheckRecords: AdapterRecord[];
  /** Every row the parser examined and did not take, with the reason. */
  rejected: RejectedRow[];
  /** Rows examined in total, including rejected ones. */
  examinedRowCount: number;
  /**
   * What the file said about its own shape: header fingerprint, schema variant, publisher
   * timestamps. Carried into the retrieval record so a later schema change is diagnosable.
   */
  sourceSchema: Record<string, string>;
  /** Non-fatal observations. An empty list is not an assertion that nothing was odd. */
  warnings: string[];
};

/**
 * How a source's credentials are presented, for the two markets that need them.
 *
 * `headers` is called once per operating day rather than once per request, and `invalidate` exists
 * for the one case a bounded retry cannot otherwise survive: a token that the issuer still
 * considers live but the API has stopped accepting.
 */
export type SourceAuthorization = {
  headers: () => Promise<Record<string, string>>;
  invalidate: () => void;
};

export interface UepiSourceAdapter {
  readonly seriesId: UepiSeriesId;
  readonly sourceInterfaceSlug: string;
  /**
   * `production` for a source Urdais may publish from; `research` for one retained internally
   * only. Taken from the rights determination, never from convenience.
   */
  readonly retrievalPurpose: "production" | "research";
  /** Which files this market needs for one operating day, in request order. */
  artifactsFor(operatingDate: string): ArtifactRequest[];
  /** Present only for an authenticated source. Absent means the source is anonymous. */
  readonly authorization?: SourceAuthorization;
  /** Pure. Bytes in, canonical rows out. No network, no clock, no database. */
  parse(operatingDate: string, artifacts: ReadonlyMap<string, RetrievedArtifact>): AdapterParseResult;
}

/**
 * A market Urdais has deliberately not built, and why.
 *
 * A typed declaration rather than an absent entry: "no adapter exists" and "an adapter exists and
 * refuses to run" are different states, and only the second can be tested.
 */
export type UnavailableAdapter = {
  readonly seriesId: UepiSeriesId;
  readonly available: false;
  readonly reason:
    | "AUTHENTICATED_SOURCE_EVIDENCE_REQUIRED"
    | "SOURCE_CREDENTIAL_REQUIRED";
  readonly detail: string;
  /** What would have to be true for this market to be implemented. */
  readonly unblockedBy: readonly string[];
};
