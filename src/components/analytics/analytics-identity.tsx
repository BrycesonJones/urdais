"use client";

import { useEffect, useSyncExternalStore } from "react";

import { identifyAccount, resetIdentity } from "@/lib/analytics/client";
import { getConsentView, getServerConsentView, subscribeConsent } from "@/lib/analytics/consent-client";

/**
 * Keeps PostHog's idea of who this browser is in line with the server's.
 *
 * Urdais sessions live in httpOnly cookies and the browser has no Supabase client,
 * so the browser cannot ask who is signed in — and should not. Instead, the pages
 * that already resolve the viewer on the server render this with the answer:
 *
 * - an account id identifies the browser with it (the stable internal id, nothing
 *   else about the reader), **only when the visitor has analytics consent**;
 * - `null` — a page that found no session — resets a browser PostHog still thinks
 *   is identified, which covers a session that expired rather than signed out.
 *
 * Every sign-in lands on one of those pages (`/access/*` or `/account`), so
 * identification happens on the first page after sign-in, and PostHog merges the
 * anonymous history from before it. Explicit sign-out resets in `SignOutForm`.
 */
export function AnalyticsIdentity({ accountId }: { accountId: string | null }) {
  // Re-run when consent changes, so a signed-in reader who accepts analytics on
  // this page is identified then — and one who has not is never identified.
  const consent = useSyncExternalStore(subscribeConsent, getConsentView, getServerConsentView).status;

  useEffect(() => {
    if (accountId) identifyAccount(accountId);
    else resetIdentity();
  }, [accountId, consent]);

  return null;
}
