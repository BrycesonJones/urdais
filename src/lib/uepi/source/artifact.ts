/**
 * Identity for UEPI retrievals and raw source rows.
 *
 * Two hashes, answering two questions, on the pattern the Interconnection Queue already uses:
 *
 *   retrieval key   did Urdais already fetch these exact bytes for this day?
 *   record hash     is this exact source row already recorded in this retrieval?
 *
 * Both are content identity rather than time identity, which is what makes a re-run of a
 * historical date idempotent: an unchanged file produces the same key and the same row hashes, so
 * a second backfill of the same range writes nothing rather than duplicating a year of history.
 */

import { createHash } from "node:crypto";

import type { RetrievedArtifact } from "@/lib/uepi/source/types";
import type { RawPriceRecord } from "@/lib/uepi/types";

export const UEPI_COLLECTOR = "urdais-uepi-v1" as const;

/** Bumped when a parser changes meaning, so evidence records which reader produced it. */
export const UEPI_EXTRACTION_VERSION = "urdais-uepi-extractor/1.0.0";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function artifactDigest(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * The idempotency key for one retrieval.
 *
 * Includes the operating date as well as the content digest: the same monthly archive serves
 * thirty operating days, and each of those is a separate retrieval of the same bytes.
 */
export function uepiRetrievalKey(
  seriesId: string, operatingDate: string, artifacts: readonly RetrievedArtifact[],
): string {
  const parts = artifacts.map((artifact) => `${artifact.label}:${artifact.sha256}`).sort();
  return `uepi|${seriesId}|${operatingDate}|${sha256(parts.join("|"))}`;
}

/** Identity of one source row within one retrieval. */
export function uepiRecordHash(input: {
  seriesId: string;
  artifactSha256: string;
  rowOrdinal: number;
  record: Pick<RawPriceRecord,
    "nativeOperatingDate" | "nativeIntervalLabel" | "nativeIntervalUtc" | "nativeValue" | "nativeComponents">;
}): string {
  const { record } = input;
  return sha256(JSON.stringify([
    input.seriesId,
    input.artifactSha256,
    input.rowOrdinal,
    record.nativeOperatingDate,
    record.nativeIntervalLabel,
    record.nativeIntervalUtc,
    record.nativeValue,
    Object.entries(record.nativeComponents).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  ]));
}
