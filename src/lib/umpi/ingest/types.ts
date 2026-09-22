/**
 * The shapes the two adapters produce, and the shape the store consumes.
 *
 * An adapter's output is evidence, not a product. It carries what the agency said, the identity
 * it was read under, and enough provenance to reproduce the parse. Nothing here rebases,
 * computes a change, or decides whether a value may be published.
 */

import type { ReferenceMonth, UmpiRawObservation, UmpiSourceIdentity, UmpiSeriesCode } from "../types";

export type FetchRange = {
  fromMonth: ReferenceMonth;
  toMonth: ReferenceMonth;
};

/** One parsed row, admitted or not. A rejection keeps its reason and its raw payload. */
export type ParsedRow =
  | {
      state: "admitted";
      identity: UmpiSourceIdentity;
      observation: UmpiRawObservation;
      rawPayload: Record<string, unknown>;
      provenanceHash: string;
    }
  | {
      state: "rejected";
      code: string;
      detail: string;
      rawPayload: Record<string, unknown>;
    };

export type ParseResult = {
  rows: ParsedRow[];
  /** What the source said about itself, for the retrieval record. Never contains a credential. */
  sourceMetadata: Record<string, unknown>;
};

/** Urdais's own conclusion about whether the response enumerated the requested range. */
export type EnumerationAssessment = "complete" | "incomplete" | "unknown";

export type SourceFetchResult = ParseResult & {
  payloadDigest: string;
  enumerationAssessment: EnumerationAssessment;
  enumerationEvidence: string;
  retrievedAt: string;
  /** Already redacted. Safe to persist and to log. */
  requestUrl: string;
  requestParameters: Record<string, unknown>;
  httpStatus: number;
  contentType: string | null;
  responseByteLength: number;
};

/**
 * A concrete adapter. `fetch` performs I/O; `parse` does not, so a parser can be exercised
 * against a frozen payload with no key and no network.
 */
export type UmpiSourceAdapter<TPayload = string> = {
  readonly name: string;
  readonly seriesCode: UmpiSeriesCode;
  readonly identityKind: UmpiSourceIdentity["kind"];
  /** The environment variable the caller must resolve before calling `fetch`. */
  readonly credentialEnv: string;
  parse(input: { identity: UmpiSourceIdentity; payload: TPayload }): ParseResult;
  fetch(input: { identity: UmpiSourceIdentity; range: FetchRange; apiKey: string }): Promise<SourceFetchResult>;
};
