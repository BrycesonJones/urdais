/**
 * The email-confirmation callback.
 *
 * Supabase's confirmation email links here. A Route Handler, not a page, because
 * completing the confirmation establishes a session and therefore writes cookies.
 *
 * ## Two link shapes, both handled
 *
 * Supabase's *default* email template points at the project's own verify endpoint,
 * which then redirects here with a PKCE `code`. A template customised for
 * server-side auth — the form Supabase documents for Next.js — links here
 * directly with `token_hash` and `type`:
 *
 *     {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 *
 * Both are accepted, so confirmation works before anyone edits the template and
 * keeps working after. The customised form is preferable — the token is used
 * exactly once, by the server, and never lands in a redirect chain — and the
 * operations documentation records it as the recommended dashboard change.
 *
 * ## Failure is not a stack trace
 *
 * An expired link, a reused link and a tampered token all end at the sign-in page
 * with a short reason. Confirmation links get clicked days later and from email
 * clients that prefetch them, so a dead link is an ordinary event and must read
 * like one.
 */

import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/auth/server-client";
import { safeReturnTo } from "@/lib/auth/return-to";
import { forgetPendingEmail } from "@/lib/onboarding/pending-email";
import { ONBOARDING_PATHS } from "@/lib/onboarding/routes";

/** The OTP types that can legitimately arrive on a confirmation link. */
const ALLOWED_OTP_TYPES: readonly string[] = ["email", "signup", "email_change", "recovery", "invite", "magiclink"];

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return typeof value === "string" && ALLOWED_OTP_TYPES.includes(value);
}

/** Back to sign-in, carrying a reason and the reader's original destination. */
function failed(request: NextRequest, reason: string, next: string): NextResponse {
  const url = new URL(ONBOARDING_PATHS.login, request.nextUrl.origin);
  url.searchParams.set("error", reason);
  if (next !== "/") url.searchParams.set("returnTo", next);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;

  // Validated before use: this arrives from an email, which is to say from
  // outside. An off-site value is discarded for "/".
  const next = safeReturnTo(params.get("next"));

  const created = await createServerSupabaseClient();
  if ("problem" in created) return failed(request, "unavailable", next);
  const supabase = created.client;

  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const code = params.get("code");

  try {
    if (tokenHash && isEmailOtpType(type)) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (error) return failed(request, "link_invalid", next);
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return failed(request, "link_invalid", next);
    } else {
      // Neither shape. Someone opened the route directly.
      return failed(request, "link_missing", next);
    }
  } catch {
    return failed(request, "unavailable", next);
  }

  // Confirmed and signed in. There is an authoritative session now, so onboarding's
  // remembered pending address would only be a second source that could disagree
  // with it.
  await forgetPendingEmail();

  // `redirect` here carries the session cookies the Supabase client just set on this
  // response. `next` is already validated; for the onboarding flow it is `/access`,
  // which resolves the newly verified viewer and continues to the checkout boundary.
  return NextResponse.redirect(new URL(next, request.nextUrl.origin));
}
