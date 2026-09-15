/**
 * Terms-artifact integrity.
 *
 * The invariant this file exists to enforce:
 *
 *   A source-rights record that cites a retained terms artifact must match that
 *   artifact's actual bytes -- its hash, its length, and the words it is quoting.
 *
 * The reason is a real incident rather than a hypothetical. During UBWI Production V1 an
 * agent wrote terms hashes and licence clauses into the rights record from memory, caught
 * itself, and recomputed everything from the retained files; several of the remembered
 * quotes were wrong and one artifact it had reached for was a 404 page. Nothing in the
 * codebase would have caught that. This does.
 *
 * Two checks, and they are deliberately different in strength.
 *
 * `checkTermsArtifactShape` runs everywhere, needs no bytes, and catches the cheap
 * fabrications: a hash that is not a hash, a zero byte length, a retrieval timestamp in
 * the future, one hash cited for two different documents, a clause with no words in it.
 *
 * `verifyAgainstRetainedBytes` needs the actual document and is the real check. It
 * compares the hash, compares the byte length, and -- the part that catches a remembered
 * quote -- requires every word of the decisive clause to occur, in order, in the text of
 * the document. Word-subsequence rather than substring containment, because several
 * licences present the decisive sentence as a bulleted list and any flattening of that
 * markup inserts punctuation the source does not contain: the OGL v3.0, the ABS notice,
 * the Istat notice and the CBS notice all do this. Punctuation is brittle. Word identity
 * and word order are not, and a clause written from memory fails them.
 */
import type { UbwiSourceInterface } from "./rights";

export type TermsArtifactShapeProblem =
  | "HASH_MALFORMED"
  | "BYTE_LENGTH_NOT_POSITIVE"
  | "HTTP_STATUS_NOT_OK"
  | "RETRIEVED_AT_UNPARSEABLE"
  | "RETRIEVED_AT_IN_FUTURE"
  | "DECISIVE_CLAUSE_TOO_SHORT"
  | "TERMS_URL_NOT_ABSOLUTE"
  | "HASH_REUSED_FOR_A_DIFFERENT_DOCUMENT"
  | "CLEARED_WITHOUT_ARTIFACT";

export type TermsArtifactShapeFinding = {
  slug: string;
  problem: TermsArtifactShapeProblem;
  detail: string;
};

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** A clause shorter than this cannot identify a licence and is not evidence of one. */
export const MINIMUM_DECISIVE_CLAUSE_WORDS = 8;

/**
 * Structural checks over the whole rights record. Runs without the artifacts, so it runs
 * in the gate and in CI. It cannot prove a hash is right; it can prove a hash is fake.
 */
export function checkTermsArtifactShape(
  interfaces: readonly UbwiSourceInterface[],
  now: Date = new Date(),
): TermsArtifactShapeFinding[] {
  const findings: TermsArtifactShapeFinding[] = [];
  const hashToUrl = new Map<string, { slug: string; url: string }>();

  for (const iface of interfaces) {
    const artifact = iface.termsArtifact;
    if (artifact === null) {
      // Not a problem by itself -- an unreviewed source is honestly recorded as one.
      // It is a problem only if the source also claims to be permitted on both axes,
      // which `effectiveRightsStatus` already refuses; this states it as a finding too.
      if (iface.termsReviewState === "permitted" && iface.dataUseTermsState === "permitted") {
        findings.push({
          slug: iface.slug,
          problem: "CLEARED_WITHOUT_ARTIFACT",
          detail: "both terms axes read permitted with no retained artifact to rest on",
        });
      }
      continue;
    }

    if (!SHA256_HEX.test(artifact.contentHash)) {
      findings.push({
        slug: iface.slug,
        problem: "HASH_MALFORMED",
        detail: `contentHash "${artifact.contentHash}" is not 64 lowercase hex characters`,
      });
    }
    if (!Number.isInteger(artifact.byteLength) || artifact.byteLength <= 0) {
      findings.push({
        slug: iface.slug,
        problem: "BYTE_LENGTH_NOT_POSITIVE",
        detail: `byteLength ${artifact.byteLength} is not a positive integer`,
      });
    }
    if (artifact.httpStatus !== 200) {
      findings.push({
        slug: iface.slug,
        problem: "HTTP_STATUS_NOT_OK",
        detail: `retained with HTTP ${artifact.httpStatus}; a non-200 body is an error page, not terms`,
      });
    }
    const retrieved = Date.parse(artifact.retrievedAt);
    if (Number.isNaN(retrieved)) {
      findings.push({
        slug: iface.slug,
        problem: "RETRIEVED_AT_UNPARSEABLE",
        detail: `retrievedAt "${artifact.retrievedAt}" is not a parseable instant`,
      });
    } else if (retrieved > now.getTime()) {
      findings.push({
        slug: iface.slug,
        problem: "RETRIEVED_AT_IN_FUTURE",
        detail: `retrievedAt ${artifact.retrievedAt} is after the check time`,
      });
    }
    if (clauseWords(artifact.decisiveClause).length < MINIMUM_DECISIVE_CLAUSE_WORDS) {
      findings.push({
        slug: iface.slug,
        problem: "DECISIVE_CLAUSE_TOO_SHORT",
        detail: `the decisive clause carries fewer than ${MINIMUM_DECISIVE_CLAUSE_WORDS} words`,
      });
    }
    if (!/^https?:\/\//.test(artifact.url)) {
      findings.push({
        slug: iface.slug,
        problem: "TERMS_URL_NOT_ABSOLUTE",
        detail: `terms url "${artifact.url}" is not an absolute http(s) url`,
      });
    }

    const seen = hashToUrl.get(artifact.contentHash);
    if (seen !== undefined && seen.url !== artifact.url) {
      findings.push({
        slug: iface.slug,
        problem: "HASH_REUSED_FOR_A_DIFFERENT_DOCUMENT",
        detail: `cites the same hash as ${seen.slug} for a different url (${seen.url})`,
      });
    } else if (seen === undefined) {
      hashToUrl.set(artifact.contentHash, { slug: iface.slug, url: artifact.url });
    }
  }

  return findings;
}

/** The bytes a verification is run against, already read and hashed by the caller. */
export type RetainedArtifact = {
  /** SHA-256 of the retained file, computed over the actual bytes. */
  contentHash: string;
  byteLength: number;
  /** The document's readable text, extracted by `extractDocumentText`. */
  text: string;
};

export type TermsArtifactVerification = {
  slug: string;
  verified: boolean;
  hashMatches: boolean;
  byteLengthMatches: boolean;
  /** Every word of the decisive clause occurs, in order, in the document. */
  clauseIsPresent: boolean;
  /** Which "[...]"-separated segments of the clause could not be found. */
  missingClauseSegments: readonly string[];
  detail: string;
};

/**
 * Check a rights record against the bytes it claims to rest on. This is the only function
 * that can tell a real citation from a remembered one.
 */
export function verifyAgainstRetainedBytes(
  iface: UbwiSourceInterface,
  retained: RetainedArtifact,
): TermsArtifactVerification {
  const artifact = iface.termsArtifact;
  if (artifact === null) {
    return {
      slug: iface.slug,
      verified: false,
      hashMatches: false,
      byteLengthMatches: false,
      clauseIsPresent: false,
      missingClauseSegments: [],
      detail: "the rights record cites no artifact, so there is nothing to verify it against",
    };
  }

  const hashMatches = retained.contentHash === artifact.contentHash;
  const byteLengthMatches = retained.byteLength === artifact.byteLength;

  const haystack = clauseWords(retained.text);
  const segments = artifact.decisiveClause
    .split("[...]")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const missing = segments.filter((segment) => !isWordSubsequence(clauseWords(segment), haystack));

  const parts: string[] = [];
  if (!hashMatches) {
    parts.push(`hash mismatch: record ${artifact.contentHash}, bytes ${retained.contentHash}`);
  }
  if (!byteLengthMatches) {
    parts.push(`length mismatch: record ${artifact.byteLength} B, bytes ${retained.byteLength} B`);
  }
  if (missing.length > 0) {
    parts.push(`${missing.length} of ${segments.length} clause segment(s) do not occur in the document`);
  }

  return {
    slug: iface.slug,
    verified: hashMatches && byteLengthMatches && missing.length === 0,
    hashMatches,
    byteLengthMatches,
    clauseIsPresent: missing.length === 0,
    missingClauseSegments: missing,
    detail: parts.length === 0 ? "hash, length and every quoted clause reproduce from the retained bytes" : parts.join("; "),
  };
}

/**
 * Readable text from a retained HTML document. Deterministic and deliberately crude: it
 * drops script and style bodies, drops tags, unescapes the handful of entities that
 * appear in licence prose, and collapses whitespace. It is not a browser and does not
 * need to be -- it only has to make the licence's own sentences findable.
 */
export function extractDocumentText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Words, for comparison purposes. Punctuation, case, curly quotes and dash width are all
 * discarded; every non-ASCII character is its own token, so Japanese and Korean licence
 * text compares character by character rather than not at all.
 */
export function clauseWords(text: string): string[] {
  const flattened = text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .toLowerCase();
  return flattened.match(/[0-9a-z]+|[^\x00-\x7F]/g) ?? [];
}

/** Does `needle` occur as an in-order subsequence of `haystack`? */
export function isWordSubsequence(
  needle: readonly string[],
  haystack: readonly string[],
): boolean {
  if (needle.length === 0) return false;
  let i = 0;
  for (const word of haystack) {
    if (word === needle[i]) {
      i += 1;
      if (i === needle.length) return true;
    }
  }
  return false;
}
