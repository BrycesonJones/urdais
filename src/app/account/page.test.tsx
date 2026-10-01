/**
 * `/account`, the Account Hub.
 *
 * The page renders whatever `resolveAccountHub` decides; these cases pin the copy
 * and the one action for each state, and the structural guarantees: nothing is
 * read from the request, nothing reaches Stripe, nothing is deleted, and the
 * subscription section never stands in for authorization.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveAccountHub = vi.hoisted(() => vi.fn());
const resolveSupabaseIdentity = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
);

vi.mock("@/lib/account/hub", () => ({ resolveAccountHub }));
vi.mock("@/lib/auth/identity", () => ({ resolveSupabaseIdentity }));
vi.mock("@/app/auth/actions", () => ({ signOutAction: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => null }));

import AccountRoute from "@/app/account/page";
import ManageSubscriptionRoute from "@/app/account/subscription/page";
import { actionFor, type SubscriptionPresentation } from "@/lib/account/subscription-presentation";

const PROFILE = { email: "reader@example.invalid", emailVerified: true };
const ready = (subscription: SubscriptionPresentation) =>
  resolveAccountHub.mockResolvedValue({ kind: "ready", profile: PROFILE, subscription, action: actionFor(subscription) });
const render = async () => renderToStaticMarkup(await AccountRoute());
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&rsquo;/g, "’").replace(/\s+/g, " ");

beforeEach(() => {
  resolveAccountHub.mockReset();
  resolveSupabaseIdentity.mockReset();
  redirect.mockClear();
});

describe("anonymous", () => {
  it("is sent to sign in, with the account as the destination", async () => {
    resolveAccountHub.mockResolvedValue({ kind: "anonymous" });
    await expect(AccountRoute()).rejects.toThrow(`NEXT_REDIRECT:/access/login?returnTo=${encodeURIComponent("/account")}`);
  });
});

describe("profile", () => {
  it("shows the email, its verified state and Sign out, in a labelled section", async () => {
    ready({ kind: "none" });
    const html = await render();
    expect(html).toMatch(/<h1[^>]*>Account<\/h1>/);
    expect(html).toMatch(/<section aria-labelledby="account-profile"[\s\S]*<h2 id="account-profile"[^>]*>Profile<\/h2>/);
    expect(html).toContain("reader@example.invalid");
    expect(html).toContain("Verified");
    expect(html).toMatch(/<form[^>]*>[\s\S]*<button type="submit"[^>]*>Sign out<\/button>/);
    expect(html).not.toContain('name="returnTo"');
  });

  it("says Not verified when the Auth server says so", async () => {
    resolveAccountHub.mockResolvedValue({ kind: "ready", profile: { email: "a@b.co", emailVerified: false }, subscription: { kind: "none" }, action: null });
    expect(await render()).toContain("Not verified");
  });

  it("has no name, avatar, password, editable email or delete control", async () => {
    ready({ kind: "active", priceLabel: "$80/week", endsAt: null });
    const html = await render();
    expect(html).not.toMatch(/<input(?![^>]*type="hidden")/);
    for (const absent of ["password", "avatar", "username", "Delete", "delete account", "Change email"]) {
      expect(html.toLowerCase(), absent).not.toContain(absent.toLowerCase());
    }
  });
});

describe("subscription states", () => {
  it("never subscribed: No active subscription, $80/week, Subscribe into Plan / Pay", async () => {
    ready({ kind: "none" });
    const html = await render();
    const t = text(html);
    expect(t).toContain("No active subscription");
    expect(t).toContain("Get full access to Urdais premium products for $80/week.");
    expect(html).toMatch(/<a [^>]*href="\/access\/ready\?returnTo=%2Faccount"[^>]*>Subscribe<\/a>/);
    expect(t).not.toContain("Urdais Premium");
    expect(t).not.toContain("Manage subscription");
  });

  it("active: Urdais Premium, Active · $80/week, Manage subscription to the 7C seam", async () => {
    ready({ kind: "active", priceLabel: "$80/week", endsAt: null });
    const html = await render();
    const t = text(html);
    expect(t).toContain("Urdais Premium");
    expect(t).toContain("Active · $80/week");
    expect(t).toContain("You have premium access.");
    expect(html).toMatch(/<a [^>]*href="\/account\/subscription"[^>]*>Manage subscription<\/a>/);
    // No duplicate purchase path for somebody already paying.
    expect(html).not.toContain("/access/ready");
    expect(t).not.toMatch(/Subscribe/);
  });

  it("active, cancelling at period end: still Active, with the end date", async () => {
    ready({ kind: "active", priceLabel: "$80/week", endsAt: "2026-10-08T00:00:00.000Z" });
    const t = text(await render());
    expect(t).toContain("Active");
    expect(t).toContain("set to end on October 8, 2026");
  });

  it("canceled: Canceled, access ended, Subscribe again -- the account itself remains", async () => {
    ready({ kind: "canceled" });
    const html = await render();
    const t = text(html);
    expect(t).toContain("Urdais Premium");
    expect(t).toContain("Canceled");
    expect(t).toContain("Your premium access has ended.");
    expect(html).toMatch(/<a [^>]*href="\/access\/ready\?returnTo=%2Faccount"[^>]*>Subscribe again<\/a>/);
    expect(t).not.toContain("No active subscription");
    expect(t).toContain("Sign out");
  });

  it("past_due: Payment issue, unavailable now, no grace period and no second Subscribe", async () => {
    ready({ kind: "payment_issue", status: "past_due" });
    const html = await render();
    const t = text(html);
    expect(t).toContain("Payment issue");
    expect(t).toContain("Premium access is currently unavailable");
    expect(t).not.toMatch(/grace|until|Canceled|Subscribe|Manage/);
    expect(html).not.toContain("/access/ready");
  });

  it("paused: Paused, unavailable, no action", async () => {
    ready({ kind: "paused" });
    const t = text(await render());
    expect(t).toContain("Paused");
    expect(t).not.toMatch(/Subscribe|Manage/);
  });

  it("an operator grant: Active, included, nothing to buy or manage", async () => {
    ready({ kind: "complimentary" });
    const t = text(await render());
    expect(t).toContain("Active");
    expect(t).toContain("included with your account");
    expect(t).not.toMatch(/Subscribe|Manage|\$80/);
  });

  for (const reason of ["read_failed", "inconsistent"] as const) {
    it(`unreadable (${reason}): says so, offers nothing, and never claims 'never subscribed'`, async () => {
      ready({ kind: "unavailable", reason });
      const html = await render();
      const t = text(html);
      expect(t).toContain("Status unavailable");
      expect(t).not.toMatch(/No active subscription|Subscribe|Active|Canceled|\$80/);
      expect(html).not.toContain("/access/ready");
    });
  }

  it("account could not be loaded: profile still shows, subscription is unavailable", async () => {
    resolveAccountHub.mockResolvedValue({ kind: "unavailable", profile: PROFILE });
    const t = text(await render());
    expect(t).toContain("reader@example.invalid");
    expect(t).toContain("Sign out");
    expect(t).toContain("Status unavailable");
    expect(t).not.toMatch(/No active subscription|Subscribe/);
  });

  it("communicates status in words inside a labelled section", async () => {
    ready({ kind: "canceled" });
    const html = await render();
    expect(html).toMatch(/<section aria-labelledby="account-subscription"[\s\S]*<h2 id="account-subscription"[^>]*>Subscription<\/h2>/);
    expect(html).toMatch(/data-testid="subscription-status">Canceled</);
  });
});

describe("the Phase 7C seam", () => {
  it("is authenticated-only", async () => {
    resolveSupabaseIdentity.mockResolvedValue({ kind: "anonymous", reason: "no_session" });
    await expect(ManageSubscriptionRoute()).rejects.toThrow(
      `NEXT_REDIRECT:/access/login?returnTo=${encodeURIComponent("/account/subscription")}`,
    );
  });

  it("says management is not available yet, and offers no billing control", async () => {
    resolveSupabaseIdentity.mockResolvedValue({ kind: "authenticated", identity: { subject: "s", email: "a@b.co", emailVerified: true } });
    const html = renderToStaticMarkup(await ManageSubscriptionRoute());
    const t = text(html);
    expect(t).toContain("isn’t available yet");
    expect(t).toContain("Nothing has been changed.");
    expect(html).not.toMatch(/<form|<button|<input/);
    expect(t).not.toMatch(/Cancel subscription|card|invoice|payment method|billing address/i);
    expect(html).toContain('href="/account"');
  });
});

describe("structure", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const page = strip(readFileSync(path.join(__dirname, "page.tsx"), "utf8"));
  const seam = strip(readFileSync(path.join(__dirname, "subscription", "page.tsx"), "utf8"));

  it("reads nothing from the request", () => {
    for (const code of [page, seam]) {
      expect(code).not.toMatch(/searchParams|formData|cookies\(|headers\(/);
    }
  });

  it("reaches no Stripe and no purchase or portal action", () => {
    for (const code of [page, seam]) {
      expect(code).not.toMatch(/stripe|startCheckout|startBillingPortal|openBillingPortalAction|startCheckoutAction|SubscribeButton|ManageSubscriptionButton/i);
    }
  });

  it("is not an authorization surface", () => {
    expect(page).not.toMatch(/canAccess|denyUnlessEntitled|resolvePremiumGate|premium_entitlements/);
  });
});
