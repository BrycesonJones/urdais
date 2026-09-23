/**
 * Deterministic digests over analytical inputs.
 *
 * Two of them, because they answer different questions and collapsing them would lose one.
 *
 *   `observationsDigest` identifies the **evidence**: which hours, with which values. It changes
 *   when EIA revises a value or when a missing hour arrives, and not otherwise.
 *
 *   `inputDigest` identifies the **question**: those observations, plus the methodology version
 *   and digest, plus the parameters in force, plus alpha. Two runs with equal input digests are
 *   asking the same thing of the same evidence and must produce the same answer, which is what
 *   makes reuse safe rather than merely convenient.
 *
 * Nothing generated enters either. No timestamps, no run ids, no host, no ordering artifact: the
 * series is sorted by instant before hashing and every object is serialised with sorted keys, so
 * the same inputs hash identically on any machine at any time. A digest that moved on its own
 * would make idempotence meaningless and provenance a lie.
 */

import { createHash } from "node:crypto";

import type { FlexibleCapacityMarket, HourlyLoadPoint, ModeledPeriod }
  from "@/lib/flexible-capacity/types";

/** JSON with keys emitted in sorted order at every level. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

/**
 * A digest of the observations themselves.
 *
 * Values are rendered through `toPrecision(12)` rather than raw, so that a float that reaches the
 * process as 12345.678900000001 on one path and 12345.6789 on another does not produce two
 * digests for one piece of evidence. Twelve significant figures is far beyond the precision of a
 * megawatt reading and far short of where float noise lives.
 */
export function observationsDigest(series: readonly HourlyLoadPoint[]): string {
  const ordered = [...series]
    .sort((left, right) => Date.parse(left.periodStartUtc) - Date.parse(right.periodStartUtc))
    .map((point) => `${point.periodStartUtc}=${point.valueMw.toPrecision(12)}`);
  return sha256(ordered.join("\n"));
}

export type InputDigestParts = {
  readonly market: FlexibleCapacityMarket;
  readonly modeledPeriod: ModeledPeriod;
  readonly observationsDigest: string;
  readonly methodologySlug: string;
  readonly methodologyVersion: string;
  readonly methodologyDocumentSha256: string;
  /** The approved parameter values the calculation actually depends on. */
  readonly parameters: Readonly<Record<string, string | number | boolean | null>>;
  readonly alpha: number;
};

export function inputDigest(parts: InputDigestParts): string {
  return sha256(canonicalJson({
    market: parts.market,
    period: {
      localYear: parts.modeledPeriod.localYear,
      timezone: parts.modeledPeriod.timezone,
      startUtc: parts.modeledPeriod.startUtc,
      endUtc: parts.modeledPeriod.endUtc,
      expectedObservationCount: parts.modeledPeriod.expectedObservationCount,
    },
    observations: parts.observationsDigest,
    methodology: {
      slug: parts.methodologySlug,
      version: parts.methodologyVersion,
      documentSha256: parts.methodologyDocumentSha256,
    },
    parameters: parts.parameters,
    alpha: parts.alpha,
  }));
}
