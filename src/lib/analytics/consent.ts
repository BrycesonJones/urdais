/**
 * Analytics consent: the rules, with no browser or server APIs in them.
 *
 * ## The three answers
 *
 * | visitor | browser analytics | server events |
 * | --- | --- | --- |
 * | accepted | full PostHog: persistent anonymous id, identify on sign-in | keyed on the account |
 * | rejected | cookieless: counted by a daily server-side hash, nothing stored on the device, never identified | personless |
 * | not decided, prior-consent region | nothing at all until they choose | personless |
 * | not decided, elsewhere | full PostHog, with the banner offering Reject | keyed on the account |
 * | Do Not Track or Global Privacy Control | PostHog never starts | personless |
 *
 * "Personless" means a server event with a random distinct id and person
 * processing off: it counts that a checkout or conversion happened and says
 * nothing about who. See `@/lib/analytics/server`.
 *
 * ## Which regions need prior consent
 *
 * The EEA, the United Kingdom and Switzerland, whose ePrivacy rules require
 * consent before non-essential storage on a device. **A country Urdais cannot
 * determine is treated as one of them**: no header (local development, a
 * non-Vercel host) means the conservative default, never the permissive one.
 *
 * This list is a product and legal judgement recorded in code, not a fact the
 * code can verify. Changing it is a one-line edit here; see
 * docs/architecture/analytics.md.
 */

export const CONSENT_COOKIE = "urdais_analytics_consent";

/** The Stripe metadata key carrying the consent in force when checkout started. */
export const STRIPE_METADATA_ANALYTICS_CONSENT = "urdais_analytics_consent";

/** An explicit choice, as stored in `CONSENT_COOKIE`. */
export type ConsentChoice = "granted" | "denied";

/** What applies before a visitor has chosen. */
export type ConsentDefault = "granted" | "pending";

/** Whether a server event may be tied to the account. */
export type ServerConsent = "granted" | "not_granted";

/** EU member states, plus Iceland, Liechtenstein and Norway (EEA), the UK and Switzerland. */
export const PRIOR_CONSENT_COUNTRIES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT",
  "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO",
  "GB", "CH",
]);

export function parseConsentChoice(value: string | null | undefined): ConsentChoice | null {
  return value === "granted" || value === "denied" ? value : null;
}

/** The default before a choice, from an ISO 3166-1 alpha-2 country code. */
export function consentDefaultFor(country: string | null | undefined): ConsentDefault {
  const code = country?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(code)) return "pending";
  return PRIOR_CONSENT_COUNTRIES.has(code) ? "pending" : "granted";
}

/**
 * The consent a server-side event may assume for one request.
 *
 * A Do Not Track or Global Privacy Control signal wins over everything, then an
 * explicit choice, then the regional default. Anything short of a clear grant is
 * `not_granted`.
 */
export function serverAnalyticsConsent(input: {
  readonly cookie: string | null | undefined;
  readonly country: string | null | undefined;
  readonly doNotTrack: boolean;
}): ServerConsent {
  if (input.doNotTrack) return "not_granted";
  const choice = parseConsentChoice(input.cookie);
  if (choice) return choice === "granted" ? "granted" : "not_granted";
  return consentDefaultFor(input.country) === "granted" ? "granted" : "not_granted";
}

/** The consent recorded on a Stripe object at checkout. Absent or anything else is `not_granted`. */
export function consentFromStripeMetadata(metadata: Readonly<Record<string, string>> | null | undefined): ServerConsent {
  return metadata?.[STRIPE_METADATA_ANALYTICS_CONSENT] === "granted" ? "granted" : "not_granted";
}
