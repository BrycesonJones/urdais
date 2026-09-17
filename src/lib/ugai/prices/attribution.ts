/**
 * The attribution the Taiwan Open Government Data License requires.
 *
 * Clause 3.2 is not a courtesy clause: "If User fails to comply with the attribution
 * requirement, the rights granted under this License shall be deemed to have been void ab
 * initio." An unattributed observation was therefore never lawfully collected, which is why the
 * credit is stored per observation and why the database refuses a row without one where the
 * grant says it is a condition.
 *
 * The wording is not paraphrased. A required citation that has been improved is no longer the
 * required citation — the same rule the UTV index already follows for OpenRouter's CC BY terms.
 */

export const TWSE_SOURCE_NAME = "臺灣證券交易所 (Taiwan Stock Exchange Corporation)" as const;
export const TWSE_LICENSE_NAME = "Open Government Data License, version 1.0" as const;
export const TWSE_LICENSE_URL = "https://data.gov.tw/license" as const;

/**
 * The credit recorded against every TWSE-sourced observation.
 *
 * Static rather than interpolated, because the OGDL's Exhibit asks for the providing
 * organisation and the licence, neither of which varies per retrieval. Where a licence does
 * interpolate — OpenRouter's `as_of`, for instance — the citation has to be rendered per
 * retrieval instead, and this module would look different.
 */
export const TWSE_ATTRIBUTION =
  "資料來源：臺灣證券交易所 (Source: Taiwan Stock Exchange Corporation). Open data released under the Open Government Data License, https://data.gov.tw/license";

/** Whether a stored credit is the required one, used by the store's own contract check. */
export function isRequiredTwseAttribution(candidate: string | null | undefined): boolean {
  return typeof candidate === "string" && candidate.trim() === TWSE_ATTRIBUTION;
}
