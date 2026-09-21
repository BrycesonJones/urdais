/**
 * Artifact identity for the capacity sources.
 *
 * Separate from the planning helpers rather than shared with them, because the retrieval key
 * carries the domain: the same publisher can appear in both domains with different artifacts, and
 * a key that did not say which domain it belonged to would let one silently resolve to the other.
 */

import { createHash } from "node:crypto";

import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";

export const CAPACITY_COLLECTOR = "urdais-power-delivery-capacity-v1" as const;

/** Bumped when an extraction changes meaning, so evidence records which reader produced it. */
export const CAPACITY_EXTRACTION_VERSION = "urdais-capacity-extractor/1.0.0";

/**
 * Deterministic identity for one extracted value, so a rerun writes no second copy of it.
 *
 * The publisher's own term is part of the identity. Two quantities can share a cell reference
 * across restatements and a row can carry the same number under two names; the word the source
 * used is what tells them apart, and it is the thing an auditor checks the classification against.
 */
export function capacityRecordHash(input: {
  artifactSha256: string;
  nativeGeography: string;
  nativePeriod: string;
  nativeScenario: string | null;
  nativeTerm: string;
  nativeValue: string;
  nativeUnit: string;
  locator: Record<string, unknown>;
}): string {
  const locator = Object.keys(input.locator)
    .sort()
    .map((key) => [key, input.locator[key]] as const)
    .filter(([, value]) => value !== undefined);
  return createHash("sha256")
    .update(JSON.stringify([
      input.artifactSha256, input.nativeGeography, input.nativePeriod, input.nativeScenario,
      input.nativeTerm, input.nativeValue, input.nativeUnit, locator,
    ]))
    .digest("hex");
}

/**
 * One retrieval per artifact and content. Re-fetching a byte-identical file resolves to the
 * retrieval already recorded; a changed file is a new retrieval and, downstream, a correction.
 */
export function capacityRetrievalKey(source: string, artifact: RetrievedArtifact): string {
  return `capacity|${source}|${artifact.label}|${artifact.sha256}`;
}
