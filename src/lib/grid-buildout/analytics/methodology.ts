/**
 * Grid Buildout Velocity methodology 1.0.0.
 *
 * This file holds the analytical judgement. Ingestion holds none: it records what a publisher said
 * and preserves ambiguity where the publisher was unclear. Every rule that resolves an ambiguity
 * lives here, is versioned, and is written down in the methodology document.
 *
 * Two rules in particular exist because the sources are awkward in ways that are easy to get
 * wrong, and both were corrected against measured data rather than assumed:
 *
 *   Works character is decided by whether ERCOT's optional mileage columns were *reported*, not by
 *   whether they are positive. Service providers overwhelmingly write an explicit 0, so treating
 *   "not positive" as unclassified would have filed two thirds of completions as unknown.
 *
 *   CAISO puts one project on several owner sheets when the work is co-owned. Those occurrences
 *   resolve to one analytical project for counting, by exact identifier equality and nothing else.
 *
 * Authorisation is a registry check. The presence of the methodology document on disk grants
 * nothing -- a filesystem read is what broke Transmission Headroom's first production cron, where
 * `docs/` is not in the serverless bundle.
 */

import type { WorksCharacter } from "@/lib/grid-buildout/analytics/types";

export const METHODOLOGY_SLUG = "grid-buildout-velocity";
export const METHODOLOGY_VERSION = "1.0.0";
export const METHODOLOGY_DOCUMENT_PATH = "docs/methodology/grid-buildout-velocity.md";

/**
 * SHA-256 of the approved document. Binds this code to the exact bytes that were approved, so a
 * silent edit to the rules cannot pass as the version the figures claim.
 */
export const METHODOLOGY_DOCUMENT_SHA256 =
  "89e3089018d86e10d06e9b05c7b52f336494007ec2e1bde414816859ca5e1894";

/** The only markets in the 1.0.0 universe. ERCOT counts completions; CAISO measures slip. */
export const ANALYTICAL_MARKETS = ["ercot", "caiso"] as const;
export type AnalyticalMarket = (typeof ANALYTICAL_MARKETS)[number];

export const ERCOT_SOURCE_SLUG = "ercot-tpit-transmission-projects";
export const CAISO_SOURCE_SLUG = "caiso-tdf-approved-tpp-projects";

/**
 * Driver classes excluded from every published metric. Both require explicit publisher evidence to
 * be assigned at all, so `unknown` rows stay in the population rather than being quietly dropped
 * on a keyword.
 */
export const EXCLUDED_DRIVER_CLASSES = ["generator_interconnection", "load_interconnection"] as const;

/** M3: a kV class below this many completions in a period is suppressed. */
export const KV_CLASS_MINIMUM_COMPLETIONS = 5;

/**
 * M4: no slip distribution is published below this many analytical projects. Matches the
 * percentile floor reasoning used in Transmission Headroom.
 */
export const SLIP_MINIMUM_PROJECTS = 12;

/** Dates outside this span are not a date any publisher here means. */
export const EARLIEST_PLAUSIBLE_YEAR = 1900;
export const LATEST_PLAUSIBLE_YEAR = 2200;

export class MethodologyRegistrationError extends Error {
  constructor(detail: string) {
    super(`grid buildout methodology ${METHODOLOGY_VERSION} is not usable: ${detail}`);
    this.name = "MethodologyRegistrationError";
  }
}

/**
 * The authorisation gate for anything that may become a published figure.
 *
 * Registry-backed on purpose. It reads the approval state and the approved digest from the
 * database and needs no filesystem at all, so it behaves identically in a serverless bundle where
 * the repository is not present.
 */
export async function assertMethodologyApproved(
  sql: { query: (text: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
): Promise<{ methodologyVersionId: string }> {
  const result = await sql.query(
    `select mv.id, mv.version, mv.status, mv.content_hash
       from reference.methodology_versions mv
       join reference.methodologies m on m.id = mv.methodology_id
      where m.slug = $1 and mv.version = $2`,
    [METHODOLOGY_SLUG, METHODOLOGY_VERSION],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new MethodologyRegistrationError("it is not registered");
  }
  if (String(row.status) !== "approved") {
    throw new MethodologyRegistrationError(`it is ${String(row.status)}, not approved`);
  }
  if (String(row.content_hash) !== METHODOLOGY_DOCUMENT_SHA256) {
    throw new MethodologyRegistrationError(
      `the registered digest ${String(row.content_hash)} is not the ${METHODOLOGY_DOCUMENT_SHA256} `
      + "this code was written against");
  }
  return { methodologyVersionId: String(row.id) };
}

/**
 * Works character, per methodology §5.
 *
 * The distinction that matters is `reported` versus absent, taken before any comparison to zero.
 * A publisher writing 0 has said there is no line mileage; a publisher writing nothing has said
 * nothing, and the two must not become the same class.
 */
export function classifyWorksCharacter(
  newMiles: { value: number | null; isReported: boolean },
  rebuiltMiles: { value: number | null; isReported: boolean },
): WorksCharacter {
  if (!newMiles.isReported || !rebuiltMiles.isReported) return "unknown_unclassified";
  const hasNew = (newMiles.value ?? 0) > 0;
  const hasRebuilt = (rebuiltMiles.value ?? 0) > 0;
  if (hasNew && hasRebuilt) return "both";
  if (hasNew) return "new";
  if (hasRebuilt) return "rebuilt_or_reconductored";
  return "none_reported_zero";
}

/**
 * CAISO analytical identity, per methodology §6.
 *
 * Exact string equality of the publisher's own identifier, within one snapshot, for CAISO alone.
 * No normalisation, no case folding, no similarity: this resolves the one ambiguity GBV-2
 * established and deliberately generalises no further.
 */
export function analyticalProjectKey(market: AnalyticalMarket, nativeId: string): string {
  return `${market}:${nativeId}`;
}

/** Whether a market's occurrences may resolve to one analytical project. ERCOT's may not. */
export function resolvesDuplicateOccurrences(market: AnalyticalMarket): boolean {
  return market === "caiso";
}
