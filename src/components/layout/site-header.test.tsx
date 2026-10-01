import { readFileSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const prefetchMapRenderer = vi.hoisted(() => vi.fn());
vi.mock("@/components/map/prefetch-map", () => ({ prefetchMapRenderer }));
// The search modal reads the app router, which only exists inside a Next app tree.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { SiteHeader } from "@/components/layout/site-header";

describe("SiteHeader map navigation", () => {
  it("links to /map from the primary navigation at every width", () => {
    render(<SiteHeader />);
    const link = screen.getByRole("link", { name: "Map" });
    expect(link).toHaveAttribute("href", "/map");
    expect(link).not.toHaveClass("hidden");
    expect(link.closest("nav")).toHaveAttribute("aria-label", "Primary");
  });

  it("warms the map renderer on hover or focus, and only then", () => {
    render(<SiteHeader />);
    expect(prefetchMapRenderer).not.toHaveBeenCalled();
    const link = screen.getByRole("link", { name: "Map" });
    fireEvent.pointerEnter(link);
    fireEvent.focus(link);
    expect(prefetchMapRenderer).toHaveBeenCalledTimes(2);
  });

  it("keeps the other navigation links as they were, without Products", () => {
    render(<SiteHeader />);
    expect(screen.queryByRole("link", { name: "Products" })).toBeNull();
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact");
  });
});

describe("SiteHeader account entry", () => {
  it("no longer has a global Get Started button", () => {
    render(<SiteHeader />);
    expect(screen.queryByRole("link", { name: /get started/i })).toBeNull();
    expect(screen.queryByText(/get started/i)).toBeNull();
    // `/get-started` never had a route; the old button was a 404.
    expect(document.querySelector('a[href="/get-started"]')).toBeNull();
  });

  it("has an account icon named Account, linking to /account", () => {
    render(<SiteHeader />);
    const account = screen.getByRole("link", { name: "Account" });
    expect(account).toHaveAttribute("href", "/account");
    expect(account.closest("nav")).toHaveAttribute("aria-label", "Primary");
  });

  it("shows the icon at every width, and the icon alone", () => {
    render(<SiteHeader />);
    const account = screen.getByRole("link", { name: "Account" });
    // Not hidden behind a breakpoint, unlike Docs and Contact.
    expect(account.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    // The name comes from aria-label; the SVG is decorative and there is no text.
    expect(account.textContent).toBe("");
    const svg = account.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
  });

  it("is reachable by keyboard and shows the navigation's focus treatment", () => {
    render(<SiteHeader />);
    const account = screen.getByRole("link", { name: "Account" });
    expect(account.tagName).toBe("A");
    expect(account).not.toHaveAttribute("tabindex", "-1");
    account.focus();
    expect(document.activeElement).toBe(account);
    // The same focus-visible ring every other header control uses.
    const map = screen.getByRole("link", { name: "Map" });
    const ring = (el: Element) => el.className.split(/\s+/).filter((c) => c.startsWith("focus-visible:")).sort();
    expect(ring(account)).toEqual(ring(map));
    expect(ring(account).length).toBeGreaterThan(0);
  });

  it("follows the other primary links in tab order", () => {
    render(<SiteHeader />);
    const links = Array.from(document.querySelectorAll("nav[aria-label='Primary'] a"));
    expect(links.at(-1)).toBe(screen.getByRole("link", { name: "Account" }));
  });

  it("carries no subscription badge, crown or paid indicator", () => {
    render(<SiteHeader />);
    const account = screen.getByRole("link", { name: "Account" });
    expect(account.textContent).toBe("");
    expect(account.querySelectorAll("svg")).toHaveLength(1);
    const header = account.closest("header")!;
    for (const word of [/premium/i, /subscri/i, /\bpro\b/i, /paid/i, /upgrade/i, /sign in/i, /log in/i]) {
      expect(header.textContent ?? "", String(word)).not.toMatch(word);
    }
  });

  it("is the same for every viewer, because the header reads no session", () => {
    // The header takes no viewer and makes no request: whether the reader is signed
    // in is decided by /account on the server at the moment of the click. So there is
    // no authenticated header to go stale after sign-out, and nothing in the browser
    // for anyone to edit into an authority.
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const first = render(<SiteHeader />).container.innerHTML;
    const second = render(<SiteHeader />).container.innerHTML;
    expect(first).toBe(second);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("does not prefetch the account route", () => {
    // Rendering the header must never ask the server who the reader is.
    const source = readFileSync(path.join(__dirname, "site-header.tsx"), "utf8");
    expect(source).toMatch(/href=\{ACCOUNT_HREF\}\s+prefetch=\{false\}/);
  });
});
