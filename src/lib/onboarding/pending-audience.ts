/**
 * Integrity-protected pre-authentication audience state.
 *
 * The role is chosen before an account exists, so it cannot be written yet. A
 * short-lived signed cookie carries only the allow-listed category to the first
 * authenticated `/access` request. It carries no email, auth subject, account id,
 * token or entitlement. The signature prevents a browser from inventing a value;
 * the eventual database writer derives the account id from `resolveViewer()`.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { hardenCookieOptions } from "@/lib/auth/cookies";
import { isAudienceRole, type AudienceRole } from "@/lib/onboarding/audience";

export const PENDING_AUDIENCE_COOKIE = "urdais_onboarding_audience";
export const AUDIENCE_STATE_SECRET_VAR = "URDAIS_ONBOARDING_STATE_SECRET";
const VERSION = "v1";
const MAX_AGE_SECONDS = 30 * 60;

export class AudienceStateUnavailableError extends Error {
  constructor() {
    super(`${AUDIENCE_STATE_SECRET_VAR} is not configured`);
    this.name = "AudienceStateUnavailableError";
  }
}

function configuredSecret(): string | null {
  const secret = process.env[AUDIENCE_STATE_SECRET_VAR]?.trim() ?? "";
  return secret.length >= 32 ? secret : null;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function encodePendingAudience(role: AudienceRole, issuedAt: number, secret: string): string {
  const payload = Buffer.from(`${VERSION}|${role}|${issuedAt}`, "utf8").toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function decodePendingAudience(
  value: string,
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
): AudienceRole | null {
  const [payload, supplied, extra] = value.split(".");
  if (!payload || !supplied || extra !== undefined) return null;

  const expected = signature(payload, secret);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const [version, role, issuedAtRaw, remainder] = decoded.split("|");
  const issuedAt = Number(issuedAtRaw);
  if (version !== VERSION || remainder !== undefined || !isAudienceRole(role) || !Number.isInteger(issuedAt)) return null;
  if (issuedAt > now + 60 || now - issuedAt > MAX_AGE_SECONDS) return null;
  return role;
}

export async function rememberPendingAudience(role: AudienceRole): Promise<void> {
  const secret = configuredSecret();
  if (!secret) throw new AudienceStateUnavailableError();
  const value = encodePendingAudience(role, Math.floor(Date.now() / 1000), secret);
  (await cookies()).set(
    PENDING_AUDIENCE_COOKIE,
    value,
    hardenCookieOptions({ path: "/", maxAge: MAX_AGE_SECONDS }),
  );
}

export async function readPendingAudience(): Promise<AudienceRole | null> {
  const secret = configuredSecret();
  if (!secret) return null;
  const value = (await cookies()).get(PENDING_AUDIENCE_COOKIE)?.value;
  return typeof value === "string" ? decodePendingAudience(value, secret) : null;
}

export async function forgetPendingAudience(): Promise<void> {
  (await cookies()).set(PENDING_AUDIENCE_COOKIE, "", hardenCookieOptions({ path: "/", maxAge: 0 }));
}

