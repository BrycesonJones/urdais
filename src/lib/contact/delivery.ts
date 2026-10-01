/**
 * Delivers a validated contact-form message to the Urdais contact inbox through
 * Resend. Server-only: it reads the provider key and the recipient from the
 * environment, and nothing here is imported by client code.
 *
 * Resend is called over its REST API with `fetch` rather than through its SDK;
 * the one request this needs does not justify a dependency, and a plain request
 * is trivial to stub in tests.
 *
 * ## What reaches the inbox
 *
 * Plain text only. The submitted message is never rendered as HTML, so markup in
 * it arrives as the literal characters the reader typed. The sender is
 * `CONTACT_FROM_EMAIL`, an address on a domain verified with Resend; the reader's
 * address is only ever the Reply-To. Sending *as* the reader would fail SPF and
 * DMARC on their domain and land in spam or nowhere.
 *
 * ## What is never logged or returned
 *
 * The API key, the reader's address, the message, and the provider's response
 * body. A failure is reduced to a reason code and, for a provider rejection, its
 * HTTP status; the route turns all of them into one generic error.
 */

import type { ContactInput } from "@/lib/contact/validation";

export const RESEND_API_KEY_VAR = "RESEND_API_KEY";
export const CONTACT_TO_EMAIL_VAR = "CONTACT_TO_EMAIL";
export const CONTACT_FROM_EMAIL_VAR = "CONTACT_FROM_EMAIL";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const PROVIDER_TIMEOUT_MS = 10_000;

export type ContactDeliveryConfig = { apiKey: string; to: string; from: string };

export type ContactDeliveryResult =
  | { ok: true }
  | { ok: false; reason: "not_configured"; missing: string[] }
  | { ok: false; reason: "provider_rejected"; status: number }
  | { ok: false; reason: "provider_unreachable" };

/** Returns the configuration, or the names (never values) of what is missing. */
export function contactDeliveryConfig(
  env: Record<string, string | undefined> = process.env,
): { ok: true; config: ContactDeliveryConfig } | { ok: false; missing: string[] } {
  const apiKey = (env[RESEND_API_KEY_VAR] ?? "").trim();
  const to = (env[CONTACT_TO_EMAIL_VAR] ?? "").trim();
  const from = (env[CONTACT_FROM_EMAIL_VAR] ?? "").trim();
  const missing = [
    ...(apiKey ? [] : [RESEND_API_KEY_VAR]),
    ...(to ? [] : [CONTACT_TO_EMAIL_VAR]),
    ...(from ? [] : [CONTACT_FROM_EMAIL_VAR]),
  ];
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, config: { apiKey, to, from } };
}

export function buildContactEmail({ email, message }: ContactInput): { subject: string; text: string } {
  return {
    subject: `Urdais Contact — ${email}`,
    text: ["New message from the Urdais contact form", "", "From:", email, "", "Message:", message, ""].join("\n"),
  };
}

export async function deliverContactMessage(
  input: ContactInput,
  options: { env?: Record<string, string | undefined>; fetch?: typeof fetch } = {},
): Promise<ContactDeliveryResult> {
  const configured = contactDeliveryConfig(options.env);
  if (!configured.ok) return { ok: false, reason: "not_configured", missing: configured.missing };
  const { apiKey, to, from } = configured.config;
  const { subject, text } = buildContactEmail(input);
  const doFetch = options.fetch ?? fetch;

  let response: Response;
  try {
    response = await doFetch(RESEND_EMAILS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], reply_to: input.email, subject, text }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "provider_unreachable" };
  }

  if (!response.ok) return { ok: false, reason: "provider_rejected", status: response.status };
  return { ok: true };
}
