/**
 * The attribution OpenRouter requires, rendered exactly as documented.
 *
 * The licence is CC BY 4.0 and its only condition is attribution, so the citation is the
 * whole of what Urdais owes for the right to publish a derived index. OpenRouter specifies
 * the form and it interpolates a value from the response payload:
 *
 *   Source: OpenRouter (openrouter.ai/rankings), as of {as_of}.
 *
 * Which means a static credit line cannot discharge it. `as_of` is the response generation
 * time and Phase 1A measured it changing on every one of twenty-six requests, including
 * reads that returned identical bytes — so the citation is a property of a retrieval, is
 * stored per retrieval, and is carried onto every row and every published value derived
 * from it.
 *
 * The wording is not paraphrased anywhere. A required citation that has been improved is no
 * longer the required citation.
 */

import { UtviContractError } from "@/lib/utvi/types";

export const UTVI_SOURCE_NAME = "OpenRouter" as const;
export const UTVI_SOURCE_CITATION_URL = "https://openrouter.ai/rankings" as const;
export const UTVI_LICENSE_NAME = "Creative Commons Attribution 4.0 International (CC BY 4.0)" as const;
export const UTVI_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/" as const;

/** The documented citation template. `{as_of}` is the only substitution. */
export const UTVI_CITATION_TEMPLATE = "Source: OpenRouter (openrouter.ai/rankings), as of {as_of}." as const;

/**
 * Render the required citation for one retrieval.
 *
 * Throws on a missing or unparseable `as_of` rather than emitting the template with a hole
 * in it. A value whose attribution cannot be rendered is not published, and failing here is
 * how that rule reaches the caller.
 */
export function renderCitation(sourceAsOf: string | null | undefined): string {
  const asOf = sourceAsOf?.trim();
  if (!asOf) {
    throw new UtviContractError("the required citation interpolates meta.as_of, which is missing");
  }
  if (Number.isNaN(Date.parse(asOf))) {
    throw new UtviContractError(`meta.as_of '${asOf}' is not a timestamp and cannot be cited`);
  }
  return UTVI_CITATION_TEMPLATE.replace("{as_of}", asOf);
}

/** The attribution block the read surface exposes. Every field is required; none is optional. */
export type UtviAttribution = {
  sourceName: string;
  sourceUrl: string;
  licenseName: string;
  licenseUrl: string;
  sourceAsOf: string;
  citation: string;
};

export function attributionFor(sourceAsOf: string): UtviAttribution {
  return {
    sourceName: UTVI_SOURCE_NAME,
    sourceUrl: UTVI_SOURCE_CITATION_URL,
    licenseName: UTVI_LICENSE_NAME,
    licenseUrl: UTVI_LICENSE_URL,
    sourceAsOf,
    citation: renderCitation(sourceAsOf),
  };
}

/**
 * Whether a stored citation is the required one.
 *
 * Used by the read layer's own contract check, so that a value whose attribution has drifted
 * into a paraphrase fails to serve rather than serving without the credit the licence
 * requires.
 */
export function isRequiredCitation(candidate: string): boolean {
  const prefix = "Source: OpenRouter (openrouter.ai/rankings), as of ";
  if (!candidate.startsWith(prefix) || !candidate.endsWith(".")) return false;
  const asOf = candidate.slice(prefix.length, -1).trim();
  return asOf.length > 0 && !Number.isNaN(Date.parse(asOf));
}
