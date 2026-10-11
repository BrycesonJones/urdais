import { fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => null }));
const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
}));
vi.mock("next/navigation", () => ({ notFound }));

import PrivacyPolicyRoute, { metadata } from "@/app/privacy/page";
import { ContactTrigger } from "@/components/layout/contact-trigger";
import { CONSENT_COOKIE } from "@/lib/analytics/consent";
import { PENDING_AUDIENCE_COOKIE } from "@/lib/onboarding/pending-audience";
import { PENDING_EMAIL_COOKIE } from "@/lib/onboarding/pending-email";
import { PRIVACY_POLICY_EFFECTIVE_DATE } from "@/lib/privacy/policy";

afterEach(() => vi.unstubAllEnvs());

// jsdom implements <dialog> markup but none of its methods; the same stubs as the footer test.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

describe("/privacy once published", () => {
  it("renders on Vercel Production, with its effective date and no draft markings", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    render(<PrivacyPolicyRoute />);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeTruthy();
    expect(screen.getByText(`Effective date: ${PRIVACY_POLICY_EFFECTIVE_DATE}`)).toBeTruthy();
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryAllByText(/To confirm/)).toHaveLength(0);
  });

  it("is indexable", () => {
    expect(metadata.robots).toBeUndefined();
  });

  it("leaves no open item in the source", () => {
    const source = readFileSync(join(process.cwd(), "src/app/privacy/page.tsx"), "utf8");
    // The only <Todo> left is the effective-date fallback, which renders only while the date is null.
    expect(source.match(/<Todo>/g)).toHaveLength(1);
    expect(source).toContain("PRIVACY_POLICY_EFFECTIVE_DATE ?? <Todo>");
  });

  it("describes a decline outside the prior-consent regions as PostHog handles it with cookieless mode off", () => {
    const source = readFileSync(join(process.cwd(), "src/app/privacy/page.tsx"), "utf8");
    expect(source).toContain("PostHog discards it on arrival under our settings, so your visit is not counted or stored");
    expect(source).not.toContain("Visits are still counted");
  });
});

describe("the operator", () => {
  it("names the individual operator and location, and no company or address", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    render(<PrivacyPolicyRoute />);
    const about = screen.getByRole("heading", { level: 2, name: "About this policy" }).closest("section")!;
    const text = about.textContent ?? "";
    expect(text).toContain("operated by Bryceson Jones, based in Georgia, United States");
    expect(text).toContain("refer to Bryceson Jones as the operator of the platform");
    expect(text).not.toMatch(/To confirm/);
    const source = readFileSync(join(process.cwd(), "src/app/privacy/page.tsx"), "utf8");
    expect(source).not.toMatch(/Hachisu|\bLLC\b|legal entity name and postal address/);
  });
});

describe("privacy questions and requests", () => {
  function requestsSection() {
    vi.stubEnv("VERCEL_ENV", "preview");
    render(<PrivacyPolicyRoute />);
    const heading = screen.getByRole("heading", { level: 2, name: "Privacy Questions and Requests" });
    return heading.closest("section")!;
  }

  it("names every kind of request the contact form takes", () => {
    const text = requestsSection().textContent ?? "";
    for (const kind of ["access", "correct", "delete", "analytics and your consent choices", "any other privacy question"]) {
      expect(text).toContain(kind);
    }
    expect(text).toContain("You do not need an account");
  });

  it("opens the existing contact form in place", () => {
    const section = requestsSection();
    const trigger = within(section).getByRole("button", { name: "Open the contact form" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    fireEvent.click(trigger);
    const dialog = within(section).getByRole<HTMLDialogElement>("dialog", { name: "Contact" });
    expect(dialog.open).toBe(true);
    expect(within(dialog).getByLabelText("Your email")).toBeTruthy();
  });

  it("is reached from the rights section", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    render(<PrivacyPolicyRoute />);
    const rights = screen.getByRole("heading", { level: 2, name: "Your rights" }).closest("section")!;
    expect(within(rights).getByRole("link", { name: "Privacy questions and requests" })).toHaveAttribute("href", "#privacy-requests");
    expect(document.getElementById("privacy-requests")).not.toBeNull();
  });

  it("keeps its form's ids distinct from the footer's form on the same page", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    render(
      <>
        <PrivacyPolicyRoute />
        <ContactTrigger />
      </>,
    );
    const ids = screen.getAllByLabelText("Your email").map((input) => input.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    const headings = screen.getAllByRole("dialog", { hidden: true }).map((dialog) => dialog.getAttribute("aria-labelledby"));
    expect(new Set(headings).size).toBe(2);
  });

  it("no longer asks for a dedicated privacy address: the contact form is the channel", () => {
    expect(readFileSync(join(process.cwd(), "src/app/privacy/page.tsx"), "utf8")).not.toContain("dedicated privacy contact");
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
