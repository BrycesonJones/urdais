/**
 * `/account`, the Phase 7A placeholder.
 *
 * The page has one job: the header's account icon must never send a signed-in
 * reader through sign-in again, whatever their subscription is doing. So the cases
 * here are the viewer states, and the assertions are that every authenticated one
 * gets the same account page and the anonymous one is sent to sign in.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveViewer = vi.hoisted(() => vi.fn());
const resolveSupabaseIdentity = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
);

vi.mock("@/lib/access/server", () => ({ resolveViewer }));
vi.mock("@/lib/auth/identity", () => ({ resolveSupabaseIdentity }));
vi.mock("@/app/auth/actions", () => ({ signOutAction: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => null }));

import AccountRoute from "@/app/account/page";
import { ANONYMOUS_VIEWER, authenticatedViewer, subscriberViewer, type Viewer } from "@/lib/access/entitlement";

const signedInAs = (email: string | null) =>
  resolveSupabaseIdentity.mockResolvedValue({
    kind: "authenticated",
    identity: { subject: "sub-1", email, emailVerified: true },
  });

const AUTHENTICATED: ReadonlyArray<readonly [string, Viewer]> = [
  ["never subscribed", authenticatedViewer("acct-1")],
  ["active subscriber", subscriberViewer("acct-1", { source: "stripe" })],
  [
    "canceled / revoked",
    subscriberViewer("acct-1", { status: "inactive", source: "stripe", revokedAt: "2026-09-01T00:00:00.000Z" }),
  ],
  // past_due denies premium and is stored as an inactive entitlement, so to the
  // viewer it is the same state as a cancellation. Listed separately because the
  // brief names it.
  ["past_due", subscriberViewer("acct-1", { status: "inactive", source: "stripe", grantedAt: "2026-08-01T00:00:00.000Z" })],
];

beforeEach(() => {
  resolveViewer.mockReset();
  resolveSupabaseIdentity.mockReset();
  redirect.mockClear();
});

describe("an anonymous reader", () => {
  it("is sent to sign in, with the account as the destination", async () => {
    resolveViewer.mockResolvedValue(ANONYMOUS_VIEWER);
    await expect(AccountRoute()).rejects.toThrow(`NEXT_REDIRECT:/access/login?returnTo=${encodeURIComponent("/account")}`);
    expect(resolveSupabaseIdentity).not.toHaveBeenCalled();
  });
});

describe("every signed-in reader, whatever their subscription", () => {
  for (const [label, viewer] of AUTHENTICATED) {
    it(`${label}: sees the account page, not sign-in`, async () => {
      resolveViewer.mockResolvedValue(viewer);
      signedInAs("reader@example.invalid");

      const html = renderToStaticMarkup(await AccountRoute());

      expect(redirect).not.toHaveBeenCalled();
      expect(html).toContain("Account");
      expect(html).toContain("signed in as");
      expect(html).toContain("reader@example.invalid");
      expect(html).toContain("Sign out");
    });
  }

  it("all see the same page: nothing on it depends on entitlement", async () => {
    const pages = [];
    for (const [, viewer] of AUTHENTICATED) {
      resolveViewer.mockResolvedValue(viewer);
      signedInAs("reader@example.invalid");
      pages.push(renderToStaticMarkup(await AccountRoute()));
    }
    expect(new Set(pages).size).toBe(1);
  });

  it("is not a subscription, billing or profile surface yet", async () => {
    // Phase 7B. Nothing here may imply that a cancellation removed the account, or
    // offer to buy, manage or cancel anything.
    resolveViewer.mockResolvedValue(
      subscriberViewer("acct-1", { status: "inactive", source: "stripe", revokedAt: "2026-09-01T00:00:00.000Z" }),
    );
    signedInAs("reader@example.invalid");
    const html = renderToStaticMarkup(await AccountRoute()).toLowerCase();

    for (const absent of ["subscri", "premium", "$80", "/week", "checkout", "stripe", "billing", "cancel", "upgrade", "password", "<input"]) {
      expect(html, absent).not.toContain(absent);
    }
  });

  it("says signed in without an address when the account has none", async () => {
    resolveViewer.mockResolvedValue(authenticatedViewer("acct-1"));
    resolveSupabaseIdentity.mockResolvedValue({ kind: "authenticated", identity: { subject: "s", email: null, emailVerified: true } });
    const html = renderToStaticMarkup(await AccountRoute());
    expect(html).toContain("You’re signed in.");
  });

  it("signs out through the server action, with no destination that could loop", async () => {
    resolveViewer.mockResolvedValue(authenticatedViewer("acct-1"));
    signedInAs("reader@example.invalid");
    const html = renderToStaticMarkup(await AccountRoute());
    expect(html).toMatch(/<form[^>]*>[\s\S]*<button type="submit"[^>]*>Sign out<\/button>/);
    expect(html).not.toContain('name="returnTo"');
  });
});

describe("authority", () => {
  const source = readFileSync(path.join(__dirname, "page.tsx"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("decides from the server's viewer and reads nothing from the request", () => {
    expect(code).toMatch(/resolveViewer\(\)/);
    expect(code).not.toMatch(/searchParams|formData|cookies\(|headers\(/);
  });

  it("writes nothing: no entitlement, no billing, no Stripe", () => {
    expect(code).not.toMatch(/premium_entitlements|stripe|checkout|insert|update|upsert/i);
  });
});
