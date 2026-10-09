"use client";

import { useSyncExternalStore } from "react";

import { getConsentView, getServerConsentView, openConsentPreferences, subscribeConsent } from "@/lib/analytics/consent-client";

/**
 * "Privacy settings": reopens the analytics consent panel, so a choice can be
 * changed as easily as it was made — signed in or not.
 *
 * One control, placed wherever a page has room for it: the site footer, the map
 * (which has no footer) and the premium onboarding frame (likewise). All of them
 * open the same panel over the same state. Absent when analytics is off, because
 * then there is nothing to set.
 *
 * `aria-expanded` reflects whether the panel is open; the panel takes focus when
 * it opens and gives it back when it closes (see `ConsentBanner`).
 */
export function PrivacySettingsButton({ className }: { className: string }) {
  const { status, preferencesOpen } = useSyncExternalStore(subscribeConsent, getConsentView, getServerConsentView);
  if (status === "off") return null;
  return (
    <button
      type="button"
      onClick={openConsentPreferences}
      aria-controls={CONSENT_PANEL_ID}
      aria-expanded={preferencesOpen}
      className={`cursor-pointer ${className}`}
    >
      Privacy settings
    </button>
  );
}

/** The footer's list item. Renders no empty `<li>` when analytics is off. */
export function PrivacySettingsItem({ className }: { className: string }) {
  const { status } = useSyncExternalStore(subscribeConsent, getConsentView, getServerConsentView);
  if (status === "off") return null;
  return (
    <li>
      <PrivacySettingsButton className={`uppercase ${className}`} />
    </li>
  );
}

export const CONSENT_PANEL_ID = "analytics-consent-panel";
