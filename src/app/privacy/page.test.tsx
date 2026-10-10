import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => null }));
const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
}));
vi.mock("next/navigation", () => ({ notFound }));

import PrivacyPolicyRoute from "@/app/privacy/page";
import { CONSENT_COOKIE } from "@/lib/analytics/consent";
import { PENDING_AUDIENCE_COOKIE } from "@/lib/onboarding/pending-audience";
import { PENDING_EMAIL_COOKIE } from "@/lib/onboarding/pending-email";

afterEach(() => vi.unstubAllEnvs());

describe("/privacy while a draft", () => {
  it("404s on Vercel Production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => PrivacyPolicyRoute()).toThrow("NEXT_NOT_FOUND");
  });

  it("renders on previews, marked as a draft with its open items visible", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    render(<PrivacyPolicyRoute />);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("Draft — not in effect.");
    expect(screen.getAllByText(/^To confirm:/).length).toBeGreaterThan(5);
  });
});

describe("the policy matches the code", () => {
  // The cookie table is written by hand; these pin it to the constants it describes.
  const source = readFileSync(join(process.cwd(), "src/app/privacy/page.tsx"), "utf8");

  it("names every first-party cookie Urdais sets", () => {
    for (const name of [CONSENT_COOKIE, PENDING_EMAIL_COOKIE, PENDING_AUDIENCE_COOKIE]) expect(source).toContain(`"${name}"`);
  });

  it("states the durations the code uses", () => {
    const email = readFileSync(join(process.cwd(), "src/lib/onboarding/pending-email.ts"), "utf8");
    const audience = readFileSync(join(process.cwd(), "src/lib/onboarding/pending-audience.ts"), "utf8");
    const consent = readFileSync(join(process.cwd(), "src/lib/analytics/consent-client.ts"), "utf8");
    expect(email).toContain("MAX_AGE_SECONDS = 30 * 60");
    expect(audience).toContain("MAX_AGE_SECONDS = 30 * 60");
    expect(consent).toContain("Max-Age=${60 * 60 * 24 * 365}");
    expect(source).toMatch(/urdais_onboarding_email[^\]]*30 minutes/);
    expect(source).toMatch(/urdais_onboarding_audience[^\]]*30 minutes/);
    expect(source).toMatch(/urdais_analytics_consent[^\]]*1 year/);
  });

  it("describes the consent behaviour the code implements", () => {
    // If session replay or the prior-consent regions change, the policy must too.
    const client = readFileSync(join(process.cwd(), "src/lib/analytics/consent-client.ts"), "utf8");
    expect(client).toContain("disable_session_recording: true");
    expect(client).toContain('cookieless_mode: "on_reject"');
    expect(source).toContain("We do not record your screen or sessions");
    expect(source).toContain("European Economic Area, the United Kingdom or Switzerland");
  });

  it("says a decline in the prior-consent regions collects nothing, as the code does", () => {
    const client = readFileSync(join(process.cwd(), "src/lib/analytics/consent-client.ts"), "utf8");
    const consent = readFileSync(join(process.cwd(), "src/lib/analytics/consent.ts"), "utf8");
    expect(client).toContain('if (view.regionDefault !== "granted")');
    expect(consent).toContain('if (choice === "denied") return defaultOn ? "anonymous" : "none";');
    expect(source).toContain("You decline analytics, and you are in the European Economic Area, the United Kingdom or Switzerland");
    expect(source).toContain("Our pages do not send analytics from your browser");
  });
});
