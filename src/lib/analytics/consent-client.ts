/**
 * PostHog in the browser: when it starts, what it may store, and what the
 * visitor has chosen. The rules themselves are in `./consent`; this module
 * applies them to the SDK.
 *
 * ## Who decides
 *
 * The visitor's explicit choice lives in the `CONSENT_COOKIE` first-party cookie.
 * It is a record of the choice (the one thing that has to be stored to honour a
 * refusal), readable by the server so checkout events follow it too. PostHog's own
 * consent flag is only ever a mirror of it, re-applied on every load.
 *
 * ## How PostHog is configured for it
 *
 * `cookieless_mode: "on_reject"`, verified against the installed SDK
 * (posthog-js 1.438):
 *
 * - **granted** — normal PostHog: cookie and localStorage persistence.
 * - **denied** — cookieless: nothing stored on the device, the distinct id is the
 *   placeholder `$posthog_cookieless`, and PostHog's servers derive a daily hash to
 *   count visitors. Requires "Cookieless server hash mode" in the PostHog project's
 *   settings, **or every rejected visitor's events are dropped at ingestion**.
 * - **pending** — nothing captured, persistence disabled and *removed*.
 *
 * That last point is why `syncAtLoad` never moves an already-granted browser
 * through pending to look up its region: disabling persistence deletes the
 * anonymous id, and every page load would become a new visitor.
 *
 * Do Not Track and Global Privacy Control are checked here, before PostHog starts,
 * and stop it starting at all. PostHog's own `respect_dnt` is not used: under
 * `on_reject` it maps DNT to "rejected", which would turn a DNT browser into a
 * cookieless-*tracked* one.
 */

import posthog from "posthog-js";

import { analyticsConfig, type AnalyticsConfig } from "@/lib/analytics/config";
import { CONSENT_COOKIE, parseConsentChoice, type ConsentChoice, type ConsentDefault } from "@/lib/analytics/consent";
import { redactSensitiveUrls } from "@/lib/analytics/privacy";

export type ConsentStatus =
  /** No configuration, a test, or `next dev`: analytics does not exist. */
  | "off"
  /** Do Not Track or Global Privacy Control: PostHog never started. */
  | "blocked"
  /** Asking the server for this region's default. */
  | "resolving"
  | "pending"
  | "granted"
  | "denied";

export type ConsentView = {
  readonly status: ConsentStatus;
  /** True when the status is the visitor's own choice, not a default. */
  readonly explicit: boolean;
  /** The preferences panel was opened from "Privacy settings". */
  readonly preferencesOpen: boolean;
};

const OFF: ConsentView = Object.freeze({ status: "off", explicit: false, preferencesOpen: false });

let view: ConsentView = OFF;
const listeners = new Set<() => void>();

function update(next: Partial<ConsentView>): void {
  view = { ...view, ...next };
  for (const listener of listeners) listener();
}

/* ------------------------------------------------------------ for React */

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getConsentView(): ConsentView {
  return view;
}
/** The server render, and the first client render, always see `off`: no hydration mismatch. */
export function getServerConsentView(): ConsentView {
  return OFF;
}

/* ---------------------------------------------------------- the record */

function readChoice(): ConsentChoice | null {
  try {
    const entry = document.cookie.split("; ").find((part) => part.startsWith(`${CONSENT_COOKIE}=`));
    return parseConsentChoice(entry?.slice(CONSENT_COOKIE.length + 1));
  } catch {
    return null;
  }
}

function writeChoice(choice: ConsentChoice): void {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${CONSENT_COOKIE}=${choice}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
  } catch {
    // A browser that refuses the cookie still gets this page's choice applied.
  }
}

export function browserSignalsDoNotTrack(): boolean {
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    const win = window as Window & { doNotTrack?: string };
    return nav.doNotTrack === "1" || win.doNotTrack === "1" || nav.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

/* --------------------------------------------------------- the SDK side */

function loaded(): boolean {
  return typeof window !== "undefined" && posthog.__loaded === true;
}

/**
 * Make PostHog's consent match `status`.
 *
 * Never records a `$pageview` itself: when capture becomes allowed, the SDK sends
 * the pageview it held back while pending (verified in the browser; a manual one
 * here doubled it).
 */
function applyToSdk(status: "granted" | "denied"): void {
  if (status === "granted") {
    if (posthog.get_explicit_consent_status() !== "granted") posthog.opt_in_capturing({ captureEventName: false });
    return;
  }
  if (posthog.get_explicit_consent_status() !== "denied") {
    // Reset first: it drops any identity and persisted data, and it clears consent,
    // so it must come before the opt-out rather than undo it.
    posthog.reset();
    posthog.opt_out_capturing();
    removeLeftoverStorage();
  }
}

/**
 * PostHog's per-tab window ids live in sessionStorage and outlive `reset()`, so a
 * browser that accepted and then declined would keep them. Cookieless mode never
 * writes them; this removes what an earlier acceptance left. PostHog's record of
 * the refusal itself (`__ph_opt_in_out_…`) is kept: it is the choice, not tracking.
 */
function removeLeftoverStorage(): void {
  for (const store of [window.sessionStorage, window.localStorage]) {
    try {
      for (const key of Object.keys(store)) if (key.startsWith("ph_")) store.removeItem(key);
    } catch {
      // Storage unavailable: nothing to remove.
    }
  }
}

async function fetchRegionDefault(): Promise<ConsentDefault> {
  try {
    const response = await fetch("/api/privacy/consent-default", { cache: "no-store" });
    const body = (await response.json()) as { default?: unknown };
    return body.default === "granted" ? "granted" : "pending";
  } catch {
    return "pending";
  }
}

/**
 * Called from PostHog's `loaded` hook, which the SDK runs before it decides
 * whether to send the initial `$pageview`.
 */
function syncAtLoad(): void {
  const choice = readChoice();

  if (choice) {
    applyToSdk(choice);
    update({ status: choice, explicit: true });
    return;
  }

  // No choice yet. A browser PostHog already counts as granted got there by this
  // region's default on an earlier visit: keep its id, and only check the region
  // still allows it (a visitor who has since travelled).
  if (posthog.get_explicit_consent_status() === "granted") {
    update({ status: "granted", explicit: false });
    void fetchRegionDefault().then((regionDefault) => {
      if (regionDefault === "granted" || readChoice()) return;
      posthog.reset(); // clears identity, persistence and consent: back to pending
      update({ status: "pending", explicit: false });
    });
    return;
  }

  // Nothing stored that grants: stay pending (nothing captured) while asking.
  if (posthog.get_explicit_consent_status() === "denied") posthog.clear_opt_in_out_capturing();
  update({ status: "resolving", explicit: false });
  void fetchRegionDefault().then((regionDefault) => {
    if (readChoice()) return; // chose while we were asking
    if (regionDefault === "granted") {
      // The SDK now sends the landing page's pageview it held back while pending.
      applyToSdk("granted");
      update({ status: "granted", explicit: false });
    } else {
      update({ status: "pending", explicit: false });
    }
  });
}

function init(config: AnalyticsConfig): void {
  posthog.init(config.key, {
    api_host: config.host,
    defaults: "2026-08-30",
    capture_pageview: "history_change",
    person_profiles: "identified_only",
    cookieless_mode: "on_reject",
    // Urdais uses no feature flags. Without this, every load would ask /flags
    // with a distinct id, consent or not.
    advanced_disable_flags: true,
    disable_session_recording: true,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_external_dependency_loading: true,
    mask_personal_data_properties: true,
    before_send: redactSensitiveUrls,
    loaded: () => {
      try {
        syncAtLoad();
      } catch {
        // Leave PostHog at its own default, which for a visitor with no stored
        // grant is pending: nothing captured.
      }
    },
  });
}

/* ------------------------------------------------------------ the API */

/** Start analytics, once, from `src/instrumentation-client.ts`. Never throws. */
export function startAnalytics(): void {
  try {
    const config = analyticsConfig();
    if (!config) return;
    if (browserSignalsDoNotTrack()) {
      update({ status: "blocked", explicit: false });
      return;
    }
    init(config);
  } catch {
    // Analytics failing to start must not stop Urdais from starting.
  }
}

/** The visitor chose. Recorded, applied immediately, and the panel closes. */
export function chooseConsent(choice: ConsentChoice): void {
  writeChoice(choice);
  try {
    if (loaded()) applyToSdk(choice);
  } catch {
    // The choice is recorded; the next load applies it.
  }
  update({ status: choice, explicit: true, preferencesOpen: false });
}

export function openConsentPreferences(): void {
  update({ preferencesOpen: true });
}

export function closeConsentPreferences(): void {
  update({ preferencesOpen: false });
}

/** May this browser be tied to an account? Only with consent, granted or by default. */
export function identificationAllowed(): boolean {
  return view.status === "granted";
}

/**
 * Re-apply the current consent after `posthog.reset()`, which clears it. Used by
 * sign-out so that signing out is not also a silent change of consent.
 */
export function reapplyConsentAfterReset(): void {
  if (view.status === "granted" || view.status === "denied") applyToSdk(view.status);
}

/** Test seam: restore the initial state. */
export function resetConsentForTests(): void {
  view = OFF;
  listeners.clear();
}
