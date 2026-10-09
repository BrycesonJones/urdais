"use client";

import { useSyncExternalStore } from "react";

import { getConsentView, getServerConsentView, openConsentPreferences, subscribeConsent } from "@/lib/analytics/consent-client";

/**
 * The footer's "Privacy settings" item: reopens the analytics consent panel, so a choice can be
 * changed as easily as it was made. Absent when analytics is off, because then
 * there is nothing to set.
 */
export function PrivacySettingsItem({ className }: { className: string }) {
  const { status } = useSyncExternalStore(subscribeConsent, getConsentView, getServerConsentView);
  if (status === "off") return null;
  return (
    <li>
      <button type="button" onClick={openConsentPreferences} className={`cursor-pointer uppercase ${className}`}>
        Privacy settings
      </button>
    </li>
  );
}
