/**
 * Analytics consent: the rules, with no browser or server APIs in them.
 *
 * ## The three answers
 *
 * | visitor | browser analytics | server events |
 * | --- | --- | --- |
 * | accepted | full PostHog: persistent anonymous id, identify on sign-in | keyed on the account |
 * | rejected, default-on region | cookieless: counted by a daily server-side hash, no identifier stored on the device, never identified | personless |
 * | rejected, prior-consent or unknown region | nothing at all | nothing |
 * | not decided, prior-consent or unknown region | nothing at all until they choose | nothing |
 * | not decided, elsewhere | full PostHog, with the banner offering Reject | keyed on the account |
 * | Do Not Track or Global Privacy Control | PostHog never starts | nothing |
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

/**
 * What a server-side event may do:
 *
 * - `granted` — keyed on the account (consent given, or the default where the
 *   region is default-on);
 * - `anonymous` — counted with no identifier at all, for a visitor who declined
 *   in a default-on region, matching the cookieless counting their browser gets;
 * - `none` — not sent: a refusal or an undecided visitor in a prior-consent or
 *   unknown region, or a Do Not Track / GPC signal.
 */
export type ServerConsent = "granted" | "anonymous" | "none";

const SERVER_CONSENT_ORDER: Readonly<Record<ServerConsent, number>> = { none: 0, anonymous: 1, granted: 2 };

/** The more restrictive of two consents. */
export function stricterServerConsent(a: ServerConsent, b: ServerConsent): ServerConsent {
  return SERVER_CONSENT_ORDER[a] <= SERVER_CONSENT_ORDER[b] ? a : b;
}

/** EU member states, plus Iceland, Liechtenstein and Norway (EEA), the UK and Switzerland. */
export const PRIOR_CONSENT_COUNTRIES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT",
  "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO",
  "GB", "CH",
]);

/**
 * Two-letter values geolocation databases use for "not a country": unknown (`XX`,
 * `ZZ`) and region-level fallbacks (`EU` Europe, `AP` Asia/Pacific). They pass the
 * shape check, so they are listed; each gets the strict default — `EU` because it
 * means somewhere in Europe.
 */
const NOT_A_COUNTRY: ReadonlySet<string> = new Set(["XX", "ZZ", "EU", "AP"]);

export function parseConsentChoice(value: string | null | undefined): ConsentChoice | null {
  return value === "granted" || value === "denied" ? value : null;
}

/** The default before a choice, from an ISO 3166-1 alpha-2 country code. */
export function consentDefaultFor(country: string | null | undefined): ConsentDefault {
  const code = country?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(code) || NOT_A_COUNTRY.has(code)) return "pending";
  return PRIOR_CONSENT_COUNTRIES.has(code) ? "pending" : "granted";
}

/**
 * The consent a server-side event may assume for one request.
 *
 * A Do Not Track or Global Privacy Control signal wins over everything (`none`),
 * then an explicit choice, then the regional default. A refusal is an anonymous
 * count only in a default-on region; in a prior-consent or unknown one it is
 * `none`, as is anything unclear.
 */
export function serverAnalyticsConsent(input: {
  readonly cookie: string | null | undefined;
  readonly country: string | null | undefined;
  readonly doNotTrack: boolean;
}): ServerConsent {
  if (input.doNotTrack) return "none";
  const defaultOn = consentDefaultFor(input.country) === "granted";
  const choice = parseConsentChoice(input.cookie);
  if (choice === "granted") return "granted";
  if (choice === "denied") return defaultOn ? "anonymous" : "none";
  return defaultOn ? "granted" : "none";
}

/**
 * The consent recorded on a Stripe object at checkout. Anything absent or
 * unrecognised — including the `not_granted` written before this distinction
 * existed — is `none`.
 */
export function consentFromStripeMetadata(metadata: Readonly<Record<string, string>> | null | undefined): ServerConsent {
  const value = metadata?.[STRIPE_METADATA_ANALYTICS_CONSENT];
  return value === "granted" || value === "anonymous" ? value : "none";
}
