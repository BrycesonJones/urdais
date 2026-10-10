/**
 * The analytics consent for the current request, on the server.
 *
 * Reads the visitor's explicit choice from `CONSENT_COOKIE`, the browser's Do
 * Not Track (`DNT: 1`) and Global Privacy Control (`Sec-GPC: 1`) headers, and
 * the country Vercel's edge attaches as `x-vercel-ip-country`. No geolocation
 * of Urdais's own: the platform header or nothing, and nothing is the
 * conservative answer.
 *
 * Server-only (it reads request headers). Never throws: a failure is `none`.
 */

import { cookies, headers } from "next/headers";

import { CONSENT_COOKIE, consentDefaultFor, serverAnalyticsConsent, type ConsentDefault, type ServerConsent } from "@/lib/analytics/consent";

export const COUNTRY_HEADER = "x-vercel-ip-country";

export async function requestAnalyticsConsent(): Promise<ServerConsent> {
  try {
    const [jar, request] = await Promise.all([cookies(), headers()]);
    return serverAnalyticsConsent({
      cookie: jar.get(CONSENT_COOKIE)?.value,
      country: request.get(COUNTRY_HEADER),
      doNotTrack: request.get("dnt") === "1" || request.get("sec-gpc") === "1",
    });
  } catch {
    return "none";
  }
}

/** The pre-choice default for this request's region. */
export async function requestConsentDefault(): Promise<ConsentDefault> {
  try {
    return consentDefaultFor((await headers()).get(COUNTRY_HEADER));
  } catch {
    return "pending";
  }
}
