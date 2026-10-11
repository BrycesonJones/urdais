import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => {
  let view: { status: string; explicit: boolean; preferencesOpen: boolean; regionDefault: string | null } = {
    status: "granted",
    explicit: true,
    preferencesOpen: false,
    regionDefault: "granted",
  };
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

import { ConsentBanner } from "@/components/analytics/consent-banner";
import { MoreMenu } from "@/components/layout/more-menu";

beforeEach(() => {
  act(() => store.set({ status: "granted", explicit: true, preferencesOpen: false, regionDefault: "granted" }));
  store.open.mockReset();
  store.open.mockImplementation(() => store.set({ preferencesOpen: true }));
  store.close.mockReset();
  store.close.mockImplementation(() => store.set({ preferencesOpen: false }));
  store.chooseConsent.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const trigger = () => screen.getByRole("button", { name: "More options" });
const menu = () => screen.queryByRole("menu", { name: "More options" });
const itemNames = () => within(menu()!).getAllByRole("menuitem").map((item) => item.textContent);

describe("MoreMenu", () => {
  it("is a labelled menu button, closed until used", () => {
    render(<MoreMenu focusRing="" />);
    expect(trigger()).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(menu()).toBeNull();
  });

  it("opens on click with exactly Privacy Policy and Privacy Settings, focusing the first", () => {
    render(<MoreMenu focusRing="" />);
    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(trigger()).toHaveAttribute("aria-controls", menu()!.id);
    expect(itemNames()).toEqual(["Privacy Policy", "Privacy Settings"]);
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Privacy Policy" }));
  });

  it("links Privacy Policy to /privacy with a Next link", () => {
    render(<MoreMenu focusRing="" />);
    fireEvent.click(trigger());
    expect(screen.getByRole("menuitem", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });

  it("moves with the arrows, Home and End, and wraps", () => {
    render(<MoreMenu focusRing="" />);
    fireEvent.keyDown(trigger(), { key: "ArrowUp" });
    const [policy, settings] = within(menu()!).getAllByRole("menuitem");
    expect(document.activeElement).toBe(settings);
    fireEvent.keyDown(menu()!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(policy);
    fireEvent.keyDown(menu()!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(settings);
    fireEvent.keyDown(menu()!, { key: "Home" });
    expect(document.activeElement).toBe(policy);
    fireEvent.keyDown(menu()!, { key: "End" });
    expect(document.activeElement).toBe(settings);
  });

  it("closes on Escape and returns focus to the trigger", () => {
    render(<MoreMenu focusRing="" />);
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    fireEvent.keyDown(menu()!, { key: "Escape" });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("closes on a click outside, and on a second click of the trigger", () => {
    render(
      <>
        <MoreMenu focusRing="" />
        <p>elsewhere</p>
      </>,
    );
    fireEvent.click(trigger());
    fireEvent.pointerDown(screen.getByText("elsewhere"));
    expect(menu()).toBeNull();
    fireEvent.click(trigger());
    fireEvent.click(trigger());
    expect(menu()).toBeNull();
  });

  it("omits Privacy Settings when analytics is off, as every other privacy-settings control does", () => {
    act(() => store.set({ status: "off" }));
    render(<MoreMenu focusRing="" />);
    fireEvent.click(trigger());
    expect(itemNames()).toEqual(["Privacy Policy"]);
  });

  it("adds Docs on narrow screens only, where the header hides it", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} }));
    render(<MoreMenu focusRing="" />);
    fireEvent.click(trigger());
    expect(itemNames()).toEqual(["Docs", "Privacy Policy", "Privacy Settings"]);
    expect(screen.getByRole("menuitem", { name: "Docs" })).toHaveAttribute("href", "/docs");
  });
});

describe("Privacy Settings from the menu", () => {
  it("opens the existing consent panel, which returns focus to the trigger when closed", () => {
    render(
      <>
        <MoreMenu focusRing="" />
        <ConsentBanner />
      </>,
    );
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitem", { name: "Privacy Settings" }));
    expect(store.open).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
    const panel = screen.getByRole("region", { name: "Analytics on Urdais" });
    expect(document.activeElement).toBe(panel);
    act(() => {
      fireEvent.keyDown(panel, { key: "Escape" });
    });
    expect(screen.queryByRole("region", { name: "Analytics on Urdais" })).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("changes the analytics choice through the same consent store", () => {
    render(
      <>
        <MoreMenu focusRing="" />
        <ConsentBanner />
      </>,
    );
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitem", { name: "Privacy Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /decline/i }));
    expect(store.chooseConsent).toHaveBeenCalledWith("denied");
  });
});
