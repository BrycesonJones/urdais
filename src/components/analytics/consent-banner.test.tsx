import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => {
  let view = { status: "off", explicit: false, preferencesOpen: false };
  const listeners = new Set<() => void>();
  return {
    set(next: Partial<typeof view>) {
      view = { ...view, ...next };
      for (const l of listeners) l();
    },
    subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
    get: () => view,
    chooseConsent: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
  };
});
vi.mock("@/lib/analytics/consent-client", () => ({
  subscribeConsent: store.subscribe,
  getConsentView: store.get,
  getServerConsentView: () => ({ status: "off", explicit: false, preferencesOpen: false }),
  chooseConsent: store.chooseConsent,
  openConsentPreferences: store.open,
  closeConsentPreferences: store.close,
}));

const policy = vi.hoisted(() => ({ linked: false }));
vi.mock("@/lib/privacy/policy", () => ({ PRIVACY_POLICY_HREF: "/privacy", privacyPolicyLinked: () => policy.linked }));

import { ConsentBanner } from "@/components/analytics/consent-banner";
import { PrivacySettingsButton, PrivacySettingsItem } from "@/components/analytics/privacy-settings-button";

beforeEach(() => {
  act(() => store.set({ status: "off", explicit: false, preferencesOpen: false }));
  store.chooseConsent.mockReset();
  store.close.mockReset();
});

const banner = () => screen.queryByRole("region", { name: "Analytics on Urdais" });

describe("ConsentBanner", () => {
  it("renders nothing when analytics is off or still resolving", () => {
    render(<ConsentBanner />);
    expect(banner()).toBeNull();
    act(() => store.set({ status: "resolving" }));
    expect(banner()).toBeNull();
  });

  it("asks before a choice, with two equal options and no way to dismiss without choosing", () => {
    act(() => store.set({ status: "pending" }));
    render(<ConsentBanner />);
    const accept = screen.getByRole("button", { name: "Accept analytics" });
    const decline = screen.getByRole("button", { name: "Decline" });
    expect(accept.className).toBe(decline.className);
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    fireEvent.click(decline);
    expect(store.chooseConsent).toHaveBeenCalledWith("denied");
    fireEvent.click(accept);
    expect(store.chooseConsent).toHaveBeenCalledWith("granted");
  });

  it("says when analytics is on by default and offers Decline", () => {
    act(() => store.set({ status: "granted", explicit: false }));
    render(<ConsentBanner />);
    expect(screen.getByText(/on by default where you are/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
  });

  it("stays away once the visitor has chosen, and comes back from Privacy settings showing the choice", () => {
    act(() => store.set({ status: "denied", explicit: true }));
    render(<ConsentBanner />);
    expect(banner()).toBeNull();
    act(() => store.set({ preferencesOpen: true }));
    expect(screen.getByText("Your current choice: declined.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(store.close).toHaveBeenCalled();
  });

  it("explains a Do Not Track browser instead of offering a choice", () => {
    act(() => store.set({ status: "blocked", preferencesOpen: true }));
    render(<ConsentBanner />);
    expect(screen.getByText(/Do Not Track or Global Privacy Control/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept analytics" })).toBeNull();
  });

  it("is not modal", () => {
    act(() => store.set({ status: "pending" }));
    render(<ConsentBanner />);
    expect(banner()!.getAttribute("aria-modal")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("keyboard and screen readers", () => {
  it("takes focus when opened from Privacy settings, closes on Escape, and gives focus back", () => {
    act(() => store.set({ status: "granted", explicit: true }));
    render(
      <>
        <PrivacySettingsButton className="c" />
        <ConsentBanner />
      </>,
    );
    store.close.mockImplementation(() => store.set({ preferencesOpen: false }));
    const trigger = screen.getByRole("button", { name: "Privacy settings" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    trigger.focus();
    act(() => store.set({ preferencesOpen: true }));
    const panel = banner()!;
    expect(document.activeElement).toBe(panel);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
    act(() => {
      fireEvent.keyDown(panel, { key: "Escape" });
    });
    expect(banner()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("does not steal focus on the first ask", () => {
    act(() => store.set({ status: "pending" }));
    render(<ConsentBanner />);
    expect(document.activeElement).toBe(document.body);
  });
});

describe("privacy policy link", () => {
  it("is absent while the policy is a draft and present once published", () => {
    act(() => store.set({ status: "pending" }));
    policy.linked = false;
    const { unmount } = render(<ConsentBanner />);
    expect(screen.queryByRole("link", { name: "Privacy policy" })).toBeNull();
    unmount();
    policy.linked = true;
    render(<ConsentBanner />);
    expect(screen.getByRole("link", { name: "Privacy policy" }).getAttribute("href")).toBe("/privacy");
    policy.linked = false;
  });

  it("does not claim nothing is stored when the visitor declines", () => {
    act(() => store.set({ status: "pending" }));
    render(<ConsentBanner />);
    expect(banner()!.textContent).not.toMatch(/nothing stored/);
    expect(banner()!.textContent).toContain("only your choice is remembered");
  });
});

describe("PrivacySettingsItem", () => {
  it("is absent when analytics is off and reopens the panel otherwise", () => {
    render(
      <ul>
        <PrivacySettingsItem className="c" />
      </ul>,
    );
    expect(screen.queryByRole("button", { name: "Privacy settings" })).toBeNull();
    act(() => store.set({ status: "granted", explicit: true }));
    fireEvent.click(screen.getByRole("button", { name: "Privacy settings" }));
    expect(store.open).toHaveBeenCalled();
  });
});
