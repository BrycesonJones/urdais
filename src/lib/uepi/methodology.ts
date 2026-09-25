/**
 * UEPI specification 1.0.0: its identity, its digest, and the gate anything releasable must pass.
 *
 * The approved artefact for UEPI V1 is the specification itself,
 * `docs/research/uepi/uepi-v1-specification.md`, frozen on 24 September 2026. A public methodology
 * page derived from its §C will come later and will carry its own row and digest; it supersedes
 * nothing here.
 *
 * Authorisation is a registry read, never a filesystem read. The presence of the document on disk
 * grants nothing -- `docs/` is not in the serverless bundle, which is what broke Transmission
 * Headroom's first production cron. The digest binds this code to the exact bytes that were
 * approved, so a silent edit to the rules cannot pass as the version a released value claims.
 */

export const SPECIFICATION_SLUG = "uepi";
export const SPECIFICATION_VERSION = "1.0.0";
export const SPECIFICATION_DOCUMENT_PATH = "docs/research/uepi/uepi-v1-specification.md";

/** SHA-256 of the frozen specification. Mirrored in the migration that registers the version. */
export const SPECIFICATION_DIGEST =
  "14db88a1584b482ac7906cc10389f0176ac44e7982bc510a4d6665e99069939a";

/** The unit of every UEPI value. Not an index level, and never expressed in points. */
export const UEPI_UNIT = "$/MWh";

/**
 * Decimal places a released daily value is stored at (§C.5).
 *
 * Six, because source prices carry up to five (SPP MEC printed 18.5068 and CAISO MCE 22.51355) and
 * a mean of up to 25 of them needs one more place to be reproducible rather than merely close.
 * Display rounds to two; display rounding never feeds a calculation.
 */
export const RELEASED_VALUE_DECIMAL_PLACES = 6;

/**
 * An operational guard against a parse error, and nothing more (§G.3).
 *
 * It is not a claim about any market's offer cap. A price beyond this magnitude is far likelier to
 * be a column read from the wrong position than a cleared price, so the hour is marked suspect and
 * the day is held for an operator instead of being averaged.
 */
export const PLAUSIBILITY_GUARD_USD_PER_MWH = 25_000;

/** Operating days re-read on every scheduled run, so an in-window source revision is caught (§C.11). */
export const TRAILING_REREAD_DAYS = 7;

export class SpecificationRegistrationError extends Error {
  constructor(detail: string) {
    super(`UEPI specification ${SPECIFICATION_VERSION} is not usable: ${detail}`);
    this.name = "SpecificationRegistrationError";
  }
}

type RegistryReader = {
  query: (text: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

/**
 * The authorisation gate for anything that may become a released figure.
 *
 * Registry-backed on purpose: it reads approval state and the approved digest from the database
 * and needs no filesystem at all, so it behaves identically in a serverless bundle where the
 * repository is not present.
 */
export async function assertSpecificationApproved(
  sql: RegistryReader,
): Promise<{ methodologyVersionId: string }> {
  const result = await sql.query(
    `select mv.id, mv.version, mv.status, mv.content_hash
       from reference.methodology_versions mv
       join reference.methodologies m on m.id = mv.methodology_id
      where m.slug = $1 and mv.version = $2`,
    [SPECIFICATION_SLUG, SPECIFICATION_VERSION],
  );
  const row = result.rows[0];
  if (row === undefined) throw new SpecificationRegistrationError("it is not registered");
  if (String(row.status) !== "approved") {
    throw new SpecificationRegistrationError(`it is ${String(row.status)}, not approved`);
  }
  if (String(row.content_hash) !== SPECIFICATION_DIGEST) {
    throw new SpecificationRegistrationError(
      `the registered digest ${String(row.content_hash)} is not the ${SPECIFICATION_DIGEST} `
      + "this code was written against");
  }
  return { methodologyVersionId: String(row.id) };
}
