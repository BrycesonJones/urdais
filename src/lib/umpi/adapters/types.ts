/**
 * The contract a Phase 4 source adapter implements.
 *
 * An adapter retrieves and parses. It does not decide methodology: it does not rebase, does not
 * compute a change, does not choose a vintage, and does not decide whether a row is publishable.
 * It returns what the source said, tagged with the identity it was read under, and the layers
 * above it apply the rules.
 *
 * Nothing in this file performs a request. Phase 3 ships no adapter.
 */

import type { UmpiRawObservation, UmpiSourceIdentity, ReferenceMonth } from "../types";

export type AdapterRequest = {
  identity: UmpiSourceIdentity;
  fromMonth: ReferenceMonth;
  toMonth: ReferenceMonth;
  /**
   * Resolved by the caller from the environment. Passed rather than read here so that an
   * adapter is a pure function of its inputs and is testable without a key.
   */
  apiKey: string;
};

/** One row as the source published it, before admission. */
export type AdapterRow = {
  identity: UmpiSourceIdentity;
  observation: UmpiRawObservation;
  /** The source's own record, retained verbatim for the evidence table. */
  rawPayload: Record<string, unknown>;
  /** Where the source exposes it: the release date of this value. */
  sourcePublishedAt?: string;
};

export type AdapterResult = {
  rows: AdapterRow[];
  /** Digest over the payload as received, for the run record and for idempotence. */
  payloadDigest: string;
  /** What the source itself said about completeness, where it says anything. */
  sourceClaimedComplete?: boolean;
};

/**
 * A source adapter. Two will exist in Phase 4:
 *
 *   - BOK ECOS: `StatisticSearch` over `(statCode, itemCode, cycle)` for a month range,
 *     returning `bok_index_level` rows in the agency's own base.
 *   - Korea Customs: `getNitemtradeList` for an HSK code and month range, returning
 *     `kcs_trade_month` rows carrying `expDlr` and `expWgt` unchanged.
 */
export type UmpiSourceAdapter = {
  readonly name: string;
  /** Which identity kind this adapter can read. Checked before a request is built. */
  readonly identityKind: UmpiSourceIdentity["kind"];
  fetch(request: AdapterRequest): Promise<AdapterResult>;
};

/**
 * Parsing is separated from fetching so Phase 4 can test the parser against a frozen payload
 * with no network and no key, which is how the fixtures in this directory are used.
 */
export type UmpiPayloadParser<TPayload = unknown> = (input: {
  identity: UmpiSourceIdentity;
  payload: TPayload;
}) => AdapterRow[];
