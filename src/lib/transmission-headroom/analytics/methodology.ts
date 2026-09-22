/**
 * The methodology this product calculates under, and the guard that stops it drifting.
 *
 * Every eligibility rule the engine applies is stated here rather than inline, so the code cannot
 * quietly diverge from the approved document. The hash check is the enforcement: if the document
 * has been edited since approval, calculation refuses to start rather than publishing numbers
 * under a version that no longer describes them.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const METHODOLOGY_SLUG = "transmission-headroom";
export const METHODOLOGY_VERSION = "1.0.0";
export const METHODOLOGY_DOCUMENT_PATH = "docs/methodology/transmission-headroom.md";

/** SHA-256 of the approved document. Bound in the migration that approved 1.0.0. */
export const METHODOLOGY_DOCUMENT_SHA256 =
  "965a5b70651879ad303316fbde86762faafdb9536d9c2c70b5b3dbd31df43ce6";

/**
 * NYISO's sentinel, exact.
 *
 * Never a threshold: the largest genuine limit in the archive is 9,899 MW, on 8,696 observations,
 * so `abs(limit) >= 9000` would discard real data.
 */
export const NYISO_SENTINEL_MW = 9999;

/**
 * The ERCOT plausibility bound, approved in methodology 1.0.0 on measured evidence.
 *
 * 23,637 canonical observations sit at or below it and 158 above; the largest below is 10,392.8 MW
 * and the smallest above is 84,999.1 MW, leaving an empty band 74,606.3 MW wide. Any bound inside
 * that band classifies the data identically, which is what makes the number defensible rather than
 * arbitrary.
 */
export const ERCOT_IMPLAUSIBLE_LIMIT_MW = 50_000;

/** Below these, a distribution is withheld rather than published from too few entities. */
export const MEDIAN_MINIMUM_ENTITIES = 10;
export const PERCENTILE_MINIMUM_ENTITIES = 12;

export class MethodologyDriftError extends Error {
  constructor(actual: string) {
    super(`the transmission headroom methodology document has changed: ${METHODOLOGY_VERSION} `
      + `was approved against ${METHODOLOGY_DOCUMENT_SHA256} but the file now hashes to ${actual}. `
      + `Approve a new version rather than publishing under a document that no longer describes `
      + `the calculation.`);
    this.name = "MethodologyDriftError";
  }
}

/**
 * Refuses to proceed if the approved document has moved.
 *
 * Only meaningful where the document exists. A serverless bundle ships code, not the repository,
 * so a missing file is not drift and must not be reported as it -- see `assertMethodologyApproved`
 * for the check that actually guards a running calculation.
 */
export async function assertMethodologyDocument(
  path = METHODOLOGY_DOCUMENT_PATH,
): Promise<"checked" | "document_unavailable"> {
  let body: Buffer;
  try {
    body = await readFile(path);
  } catch {
    return "document_unavailable";
  }
  const actual = createHash("sha256").update(body).digest("hex");
  if (actual !== METHODOLOGY_DOCUMENT_SHA256) throw new MethodologyDriftError(actual);
  return "checked";
}

export class MethodologyRegistrationError extends Error {
  constructor(detail: string) {
    super(`the approved transmission headroom methodology does not match this code: ${detail}. `
      + `Calculating would publish numbers under a version that describes different rules.`);
    this.name = "MethodologyRegistrationError";
  }
}

/**
 * The guard that actually protects a running calculation.
 *
 * Compares the digest recorded against the approved methodology row with the digest this code was
 * written for. It needs no filesystem, so it holds in a serverless function where the repository
 * is not present -- which is exactly where the file check silently could not run, and where the
 * first production cron failed on a missing `docs/` directory.
 */
export async function assertMethodologyApproved(
  sql: { query: (text: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
): Promise<void> {
  const rows = await sql.query(
    `select mv.version, mv.status, mv.content_hash
       from reference.methodology_versions mv
       join reference.methodologies m on m.id = mv.methodology_id
      where m.slug = $1 and mv.version = $2`,
    [METHODOLOGY_SLUG, METHODOLOGY_VERSION],
  );
  const row = rows.rows[0];
  if (row === undefined) {
    throw new MethodologyRegistrationError(`${METHODOLOGY_VERSION} is not registered`);
  }
  if (String(row.status) !== "approved") {
    throw new MethodologyRegistrationError(`${METHODOLOGY_VERSION} is ${String(row.status)}, not approved`);
  }
  if (String(row.content_hash) !== METHODOLOGY_DOCUMENT_SHA256) {
    throw new MethodologyRegistrationError(
      `registered digest ${String(row.content_hash)} but this code expects ${METHODOLOGY_DOCUMENT_SHA256}`);
  }
}

/** Markets this methodology approves, and the interface each draws from. */
export const APPROVED_MARKETS = {
  nyiso: {
    marketSlug: "nyiso",
    sourceInterfaceSlug: "nyiso-external-limits-flows",
    attribution: "Source: New York Independent System Operator, Inc., External Limits and Flows.",
  },
  ercot: {
    marketSlug: "ercot",
    sourceInterfaceSlug: "ercot-sced-binding-constraints",
    attribution: "Source: Electric Reliability Council of Texas, Inc., "
      + "SCED Shadow Prices and Binding Transmission Constraints (NP6-86-CD).",
  },
} as const;

export type ApprovedMarket = keyof typeof APPROVED_MARKETS;

/**
 * Whether a population is large enough for a statistic.
 *
 * The floors guard against a degenerate population, not against sampling error: NYISO's nineteen
 * interfaces are a census rather than a sample, which is why the candidate floor of 20 was
 * rejected — it would have suppressed a complete market permanently.
 */
export function meetsFloor(entities: number, floor: number | null): boolean {
  return floor === null || entities >= floor;
}
