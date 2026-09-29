/**
 * The shape of an email verification code.
 *
 * ## The length is hosted configuration, and the application cannot read it
 *
 * Supabase's `otp_length` decides how many digits it mints. It is settable from 6 to
 * 10, it lives in the dashboard, and **it is not exposed on any endpoint the
 * application can query** — `GET /auth/v1/settings` does not carry it. So the app
 * has no way to *know* the length, only to be told.
 *
 * Two consequences, and they pull in opposite directions:
 *
 * **Validation must not assume one.** Hard-coding six would mean that raising
 * `otp_length` silently breaks sign-in: the server would reject a perfectly good
 * code before Supabase ever saw it, and the failure would read as "wrong code" to
 * everyone. So validation accepts the whole range Supabase can produce and lets
 * Supabase be the authority. This is not hypothetical — UrdaisDev was set to 8, and
 * this is the reason the first real end-to-end sign-in worked anyway.
 *
 * **Presentation must not guess one either.** The hint under the input is a promise
 * about what the reader will find in their email. Defaulting it to six produced a
 * screen that said "6-digit code" above a box expecting eight, which is worse than
 * saying nothing: it tells the reader their correct code is the wrong shape.
 *
 * So `configuredOtpLength` returns `null` unless someone has actually configured
 * `URDAIS_OTP_LENGTH`, and the form drops the number from the hint when it is null.
 * An unset deployment says something true but vague; a configured one says something
 * true and specific. Neither says something false.
 */

/** The bounds Supabase itself permits for `otp_length`. */
export const MIN_OTP_LENGTH = 6;
export const MAX_OTP_LENGTH = 10;

export type ProcessEnvLike = Record<string, string | undefined>;

/**
 * How many digits to tell the reader to expect, or `null` if nobody has said.
 *
 * Never used to reject input. A code of any length in range is still sent to
 * Supabase, which is the only authority on whether it is right.
 *
 * Set `URDAIS_OTP_LENGTH` per deployment to match that project's `otp_length`
 * (Authentication → Providers → Email). Leaving it unset is safe and merely costs
 * the reader a small hint.
 */
export function configuredOtpLength(env: ProcessEnvLike = process.env): number | null {
  const raw = env.URDAIS_OTP_LENGTH;
  if (raw === undefined || raw.trim() === "") return null;

  // Strict: "8abc" must not be read as 8. A malformed value means nobody has
  // reliably said what the length is, which is exactly the `null` case.
  if (!/^\d+$/.test(raw.trim())) return null;

  const parsed = Number.parseInt(raw, 10);
  if (parsed < MIN_OTP_LENGTH || parsed > MAX_OTP_LENGTH) return null;
  return parsed;
}

/**
 * The submitted code, reduced to the digits a reader meant to type.
 *
 * People paste codes out of email with a trailing space, a non-breaking space, or
 * the surrounding sentence's punctuation. Stripping non-digits is not laxity — it
 * is the difference between "paste worked" and an error message for something the
 * reader did correctly.
 */
export function normalizeOtp(raw: string): string {
  return (raw ?? "").replace(/\D+/g, "");
}

/**
 * Whether this could be a code Supabase minted.
 *
 * A shape check, deliberately not a correctness check: it exists to avoid a
 * pointless provider round trip on an empty or obviously wrong submission, and to
 * give a clearer message than "incorrect" when someone typed four digits. Anything
 * in range goes to Supabase, which decides.
 */
export function looksLikeOtp(candidate: string): boolean {
  const digits = normalizeOtp(candidate);
  return digits.length >= MIN_OTP_LENGTH && digits.length <= MAX_OTP_LENGTH;
}
