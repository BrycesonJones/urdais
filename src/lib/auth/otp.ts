/**
 * The shape of an email verification code.
 *
 * ## The length is configuration, not a constant we get to choose
 *
 * Supabase's `otp_length` decides how many digits it mints, and it is settable
 * between 6 and 10. Hard-coding six in validation would mean that raising it in the
 * dashboard silently breaks sign-in: the server would reject a perfectly good code
 * before Supabase ever saw it, and the failure would look like "wrong code" to
 * everyone.
 *
 * So validation accepts the whole range Supabase can produce, and
 * `EXPECTED_OTP_LENGTH` is used only for presentation — the `maxLength` on the
 * input and the hint under it. Getting the presentation value wrong is a cosmetic
 * bug; getting the validation wrong would be an outage.
 *
 * `URDAIS_OTP_LENGTH` overrides the presentation value for a project configured
 * with something other than the default six.
 */

/** The bounds Supabase itself permits for `otp_length`. */
export const MIN_OTP_LENGTH = 6;
export const MAX_OTP_LENGTH = 10;

/** Supabase's default, and the value `supabase/config.toml` mirrors. */
const DEFAULT_OTP_LENGTH = 6;

export type ProcessEnvLike = Record<string, string | undefined>;

/**
 * How many digits to *expect*, for the input's `maxLength` and the hint.
 *
 * Never used to reject input. A code outside this length is still sent to Supabase,
 * which is the authority on whether it is right.
 */
export function expectedOtpLength(env: ProcessEnvLike = process.env): number {
  const configured = Number.parseInt(env.URDAIS_OTP_LENGTH ?? "", 10);
  if (!Number.isInteger(configured) || configured < MIN_OTP_LENGTH || configured > MAX_OTP_LENGTH) {
    return DEFAULT_OTP_LENGTH;
  }
  return configured;
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
