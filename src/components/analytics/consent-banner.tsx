"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent } from "react";

import { CONSENT_PANEL_ID } from "@/components/analytics/privacy-settings-button";
import { PRIVACY_POLICY_HREF, privacyPolicyLinked } from "@/lib/privacy/policy";

import {
  chooseConsent,
  closeConsentPreferences,
  getConsentView,
  getServerConsentView,
  subscribeConsent,
  type ConsentView,
} from "@/lib/analytics/consent-client";

/**
 * The analytics consent banner, and the preferences panel "Privacy settings"
 * reopens.
 *
 * ## No dark patterns
 *
 * - Accept and Decline are the same size, the same style, side by side. Neither
 *   is the default, and declining takes exactly as many clicks as accepting.
 * - There is no close button on the first ask. Dismissing without choosing would
 *   leave the visitor not knowing what they had agreed to.
 * - It is not modal. It sits over the bottom of the page, and every link and
 *   control on the page keeps working while it is open.
 * - Opened from "Privacy settings", it takes focus, closes on Escape, and returns
 *   focus to the control that opened it. The first ask does not steal focus.
 *
 * Shown when there is a decision to make: before a choice (whether the regional
 * default is "nothing yet" or "on, unless you decline"), and whenever the visitor
 * opens Privacy settings. Never shown when analytics is off, and only as an
 * explanation for a browser sending Do Not Track or Global Privacy Control,
 * where there is nothing to choose.
 *
 * Renders nothing on the server and on the first client render (the server
 * snapshot is `off`), so it cannot cause a hydration mismatch.
 */
export function ConsentBanner() {
  const view = useSyncExternalStore(subscribeConsent, getConsentView, getServerConsentView);
  const panelRef = useRef<HTMLElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  // Opened from "Privacy settings": move focus into the panel, so a keyboard or
  // screen-reader user lands on it rather than having to find it at the bottom of
  // the page; give focus back to the control that opened it when it closes.
  useEffect(() => {
    if (view.preferencesOpen) {
      returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      panelRef.current?.focus();
      return;
    }
    const target = returnFocusTo.current;
    returnFocusTo.current = null;
    if (target?.isConnected) target.focus();
  }, [view.preferencesOpen]);

  if (!shouldShow(view)) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && view.preferencesOpen) closeConsentPreferences();
  }

  const blocked = view.status === "blocked";

  return (
    <section
      ref={panelRef}
      id={CONSENT_PANEL_ID}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      aria-labelledby="analytics-consent-heading"
      className="fixed inset-x-3 bottom-3 z-50 rounded-lg border border-white/10 bg-[#111111] p-4 text-sm text-neutral-300 shadow-2xl shadow-black/50 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-md"
    >
      <h2 id="analytics-consent-heading" className="text-sm font-medium text-neutral-50">
        Analytics on Urdais
      </h2>

      {blocked ? (
        <p className="mt-2">
          Your browser is sending a Do Not Track or Global Privacy Control signal, so Urdais collects no analytics from it.
        </p>
      ) : (
        <>
          <p className="mt-2">
            We use analytics to understand which pages and data products are useful. If you accept, a cookie
            remembers this browser between visits, and if you sign in, your activity is linked to your Urdais
            account. If you decline, visits are still counted, but without cookies or any identifier stored on your
            device; only your choice is remembered.
          </p>
          {view.status === "granted" && !view.explicit ? (
            <p className="mt-2 text-neutral-400">Analytics is on by default where you are. You can decline it here.</p>
          ) : null}
          {view.explicit ? (
            <p className="mt-2 text-neutral-400">
              Your current choice: {view.status === "granted" ? "accepted" : "declined"}.
            </p>
          ) : null}
        </>
      )}

      {privacyPolicyLinked() ? (
        <p className="mt-2">
          <Link
            href={PRIVACY_POLICY_HREF}
            className="text-neutral-400 underline underline-offset-2 transition-colors hover:text-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
          >
            Privacy policy
          </Link>
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {blocked ? null : (
          <>
            <button type="button" onClick={() => chooseConsent("granted")} className={buttonClass}>
              Accept analytics
            </button>
            <button type="button" onClick={() => chooseConsent("denied")} className={buttonClass}>
              Decline
            </button>
          </>
        )}
        {view.preferencesOpen ? (
          <button
            type="button"
            onClick={closeConsentPreferences}
            className="px-2 py-2 text-xs text-neutral-500 underline underline-offset-2 transition-colors hover:text-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
          >
            Close
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** Identical for both choices: see "No dark patterns". */
const buttonClass =
  "flex-1 rounded-md border border-white/15 px-3.5 py-2 text-sm text-neutral-100 transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]";

export function shouldShow(view: ConsentView): boolean {
  if (view.status === "off" || view.status === "resolving") return false;
  if (view.preferencesOpen) return true;
  if (view.status === "blocked" || view.explicit) return false;
  // Pending, or on by regional default and not yet confirmed.
  return view.status === "pending" || view.status === "granted";
}
