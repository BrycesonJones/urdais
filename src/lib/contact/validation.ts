/**
 * Contact form validation, shared by the modal and `POST /api/contact`.
 *
 * The server's call is authoritative; the modal runs the same rules first so a
 * reader sees a field error without a round trip. Nothing is ever truncated: an
 * over-long field is rejected and the reader shortens it themselves.
 */

/** RFC 5321 caps a forward path at 254 characters. */
export const CONTACT_EMAIL_MAX_LENGTH = 254;
export const CONTACT_MESSAGE_MAX_LENGTH = 5000;

/**
 * Deliberately plain: one `@`, a dot in the domain, and none of the characters
 * that could break out of a header (whitespace, which includes CR/LF, and the
 * address-list punctuation). The address is used as Reply-To and in the subject,
 * so anything that could smuggle a second address or header line is refused.
 */
const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]+$/;

export type ContactInput = { email: string; message: string };

export type ContactFieldError =
  | "email_required"
  | "email_invalid"
  | "email_too_long"
  | "message_required"
  | "message_too_long";

export type ContactValidation =
  | { ok: true; value: ContactInput }
  | { ok: false; errors: { email?: ContactFieldError; message?: ContactFieldError } };

export const CONTACT_FIELD_ERROR_TEXT: Record<ContactFieldError, string> = {
  email_required: "Enter your email.",
  email_invalid: "Enter a valid email address.",
  email_too_long: `Keep your email under ${CONTACT_EMAIL_MAX_LENGTH} characters.`,
  message_required: "Enter a message.",
  message_too_long: `Keep your message under ${CONTACT_MESSAGE_MAX_LENGTH.toLocaleString("en-US")} characters.`,
};

function validateEmail(email: string): ContactFieldError | undefined {
  if (email === "") return "email_required";
  if (email.length > CONTACT_EMAIL_MAX_LENGTH) return "email_too_long";
  if (!EMAIL_PATTERN.test(email)) return "email_invalid";
  return undefined;
}

function validateMessage(message: string): ContactFieldError | undefined {
  if (message === "") return "message_required";
  if (message.length > CONTACT_MESSAGE_MAX_LENGTH) return "message_too_long";
  return undefined;
}

/**
 * Accepts anything (a parsed request body is untrusted) and returns either the
 * trimmed fields or a per-field reason. A non-string field is treated as missing.
 */
export function validateContactInput(input: unknown): ContactValidation {
  const record = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const email = typeof record.email === "string" ? record.email.trim() : "";
  const message = typeof record.message === "string" ? record.message.trim() : "";

  const errors = { email: validateEmail(email), message: validateMessage(message) };
  if (errors.email || errors.message) {
    return {
      ok: false,
      errors: {
        ...(errors.email && { email: errors.email }),
        ...(errors.message && { message: errors.message }),
      },
    };
  }
  return { ok: true, value: { email, message } };
}
