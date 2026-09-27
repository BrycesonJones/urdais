/**
 * Remembering which address a pending signup used.
 *
 * ## Why this is needed at all
 *
 * When Supabase requires email confirmation, `signUp` returns **no session**. The
 * reader who just submitted the form is, as far as the server is concerned,
 * anonymous — so the verification screen has nothing to tell it which address to
 * display or to resend to. This carries that one value across the redirect.
 *
 * ## Why a cookie and not the URL
 *
 * A query parameter would let anyone construct
 * `/access/verify?email=someone@else.test` and press "resend", turning Urdais into
 * a way to send mail to arbitrary addresses on someone else's behalf. An httpOnly
 * cookie is set by the server and unreadable to scripts, so it cannot be planted by
 * a link or by an XSS payload reading and rewriting it.
 *
 * It is not *unforgeable* — a crafted HTTP request can send any cookie value — and
 * that is acceptable rather than overlooked: the signup endpoint itself will already
 * send mail to any address anyone types, so a forged cookie grants no capability
 * they did not have. Supabase rate-limits both paths.
 *
 * ## What it must never be used for
 *
 * **This value is not an identity and not a verification state.** It decides what
 * to print on a screen and which address `auth.resend` is called with. Whether a
 * reader is authenticated, which account they are, and whether their address is
 * confirmed all come from `resolveViewer` and the Auth server's own
 * `email_confirmed_at` — never from here. If a future change makes this cookie
 * decide anything else, that change is a vulnerability.
 */

import { cookies } from "next/headers";

import { hardenCookieOptions } from "@/lib/auth/cookies";
import { looksLikeEmail, normalizeEmail } from "@/lib/auth/operations";

export const PENDING_EMAIL_COOKIE = "urdais_onboarding_email";

/**
 * Thirty minutes.
 *
 * Long enough to survive reading an email and coming back, short enough that a
 * shared or forgotten browser is not left displaying someone's address. Expiry is
 * not a security control here — the value is not sensitive and grants nothing — it
 * is hygiene.
 */
const MAX_AGE_SECONDS = 30 * 60;

/** Record the address a pending signup used. Call only from a Server Action or route. */
export async function rememberPendingEmail(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!looksLikeEmail(normalized)) return;

  const store = await cookies();
  store.set(
    PENDING_EMAIL_COOKIE,
    normalized,
    hardenCookieOptions({ path: "/", maxAge: MAX_AGE_SECONDS }),
  );
}

/**
 * The remembered address, or null.
 *
 * Re-validated on read rather than trusted: the value came back from a browser, and
 * a malformed one must not be printed onto a page or handed to the Auth server.
 */
export async function readPendingEmail(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(PENDING_EMAIL_COOKIE)?.value;
  if (typeof raw !== "string") return null;

  const normalized = normalizeEmail(raw);
  return looksLikeEmail(normalized) ? normalized : null;
}

/**
 * Forget it.
 *
 * Called once a reader has a real session, because from that point the authoritative
 * email is on the viewer and this copy would only be a second source that could
 * disagree with it.
 */
export async function forgetPendingEmail(): Promise<void> {
  const store = await cookies();
  store.set(PENDING_EMAIL_COOKIE, "", hardenCookieOptions({ path: "/", maxAge: 0 }));
}
