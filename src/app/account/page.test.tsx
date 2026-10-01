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
// The real button is a client component bound to the Portal Server Action. Its
// markup is reproduced faithfully enough to assert on: a form with no fields.
vi.mock("@/components/account/deletion-forms", () => ({
  FinishDeletionForm: () => (
    <form data-testid="finish-form">
      <button type="submit">Finish deleting account</button>
    </form>
  ),
}));
vi.mock("@/components/billing/manage-subscription-button", () => ({
  ManageSubscriptionButton: ({ label }: { label: string }) => (
    <form data-testid="portal-form">
      <button type="submit">{label}</button>
    </form>
  ),
}));

import AccountRoute from "@/app/account/page";
import RetiredManageSubscriptionRoute from "@/app/account/subscription/page";
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

  it("has no name, avatar, password or editable email (deletion lives in its own section; see below)", async () => {
    ready({ kind: "active", priceLabel: "$80/week", cancellationScheduled: false, endsAt: null });
    const html = await render();
    expect(html).not.toMatch(/<input(?![^>]*type="hidden")/);
    const profile = html.slice(html.indexOf('aria-labelledby="account-profile"'), html.indexOf('aria-labelledby="account-subscription"'));
    for (const absent of ["password", "avatar", "username", "change email"]) {
      expect(html.toLowerCase(), absent).not.toContain(absent);
    }
    // And the Profile section itself carries no destructive control.
    expect(profile.toLowerCase()).not.toContain("delete");
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
    // The subscription section names no plan for an account that never had one.
    // (The Delete account section further down mentions Urdais Premium by name.)
    const subscriptionText = text(html.slice(html.indexOf('aria-labelledby="account-subscription"'), html.indexOf('aria-labelledby="account-delete"')));
    expect(subscriptionText).not.toContain("Urdais Premium");
    expect(t).not.toContain("Manage subscription");
    // No Customer exists; billing management must not be offered as a way to make one.
    expect(html).not.toContain("portal-form");
  });

  it("active: Urdais Premium, Active · $80/week, Manage subscription opens the Portal", async () => {
    ready({ kind: "active", priceLabel: "$80/week", cancellationScheduled: false, endsAt: null });
    const html = await render();
    const t = text(html);
    expect(t).toContain("Urdais Premium");
    expect(t).toContain("Active · $80/week");
    expect(t).toContain("You have premium access.");
    expect(html).toMatch(/<form data-testid="portal-form"><button type="submit">Manage subscription<\/button><\/form>/);
    // No duplicate purchase path for somebody already paying.
    expect(html).not.toContain("/access/ready");
    expect(t).not.toMatch(/Subscribe/);
  });

  it("cancellation scheduled: Active until the date, access not yet ended, still manageable", async () => {
    ready({ kind: "active", priceLabel: "$80/week", cancellationScheduled: true, endsAt: "2026-10-08T00:00:00.000Z" });
    const html = await render();
    const t = text(html);
    expect(html).toMatch(/data-testid="subscription-status">Active until October 8, 2026</);
    expect(t).toContain("Cancellation scheduled. You have premium access until then.");
    expect(t).not.toMatch(/Canceled|has ended|Subscribe/);
    expect(t).toContain("Manage subscription");
  });

  it("cancellation scheduled without a reported date: still says access continues", async () => {
    ready({ kind: "active", priceLabel: "$80/week", cancellationScheduled: true, endsAt: null });
    const html = await render();
    expect(html).toMatch(/data-testid="subscription-status">Active</);
    expect(text(html)).toContain("until the end of the current billing period");
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
    // One billing call to action for a canceled account: Subscribe again.
    expect(html).not.toContain("portal-form");
  });

  it("past_due: Payment issue, unavailable now, Manage billing -- never a second Subscribe", async () => {
    ready({ kind: "payment_issue", status: "past_due" });
    const html = await render();
    const t = text(html);
    expect(t).toContain("Payment issue");
    expect(t).toContain("Premium access is currently unavailable");
    expect(t).toContain("access returns once the payment succeeds");
    expect(html).toMatch(/<form data-testid="portal-form"><button type="submit">Manage billing<\/button><\/form>/);
    expect(t).not.toMatch(/grace|Canceled|Subscribe/);
    expect(html).not.toContain("/access/ready");
  });

  it("incomplete: Payment issue with nothing to manage", async () => {
    ready({ kind: "payment_issue", status: "incomplete" });
    const html = await render();
    expect(text(html)).toContain("first payment did not complete");
    expect(html).not.toContain("portal-form");
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

describe("the retired /account/subscription", () => {
  it("carries an old link to the account, and launches nothing", () => {
    // A GET that created a Portal session could be triggered by a prefetch or a
    // crawler; management starts from the form on /account instead.
    expect(() => RetiredManageSubscriptionRoute()).toThrow("NEXT_REDIRECT:/account");
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

  it("calls no Stripe API while rendering, and offers no purchase control of its own", () => {
    // The Portal is reached only through ManageSubscriptionButton's Server Action,
    // on a press. Rendering /account constructs no Stripe client.
    for (const code of [page, seam]) {
      expect(code).not.toMatch(/from "stripe"|stripeContext|startCheckout|startBillingPortal|startCheckoutAction|SubscribeButton/);
    }
    expect(seam).not.toMatch(/ManageSubscriptionButton|openBillingPortalAction/);
  });

  it("is not an authorization surface", () => {
    expect(page).not.toMatch(/canAccess|denyUnlessEntitled|resolvePremiumGate|premium_entitlements/);
  });
});

describe("Delete account (Phase 7D)", () => {
  it("is its own labelled section at the bottom, after Profile and Subscription", async () => {
    ready({ kind: "active", priceLabel: "$80/week", cancellationScheduled: false, endsAt: null });
    const html = await render();
    const profile = html.indexOf('aria-labelledby="account-profile"');
    const subscription = html.indexOf('aria-labelledby="account-subscription"');
    const del = html.indexOf('aria-labelledby="account-delete"');
    expect(profile).toBeGreaterThan(-1);
    expect(subscription).toBeGreaterThan(profile);
    expect(del).toBeGreaterThan(subscription);
    expect(html).toMatch(/<h2 id="account-delete"[^>]*>Delete account<\/h2>/);
  });

  it("states the consequences and only links onward; nothing destructive happens here", async () => {
    ready({ kind: "none" });
    const html = await render();
    const t = text(html);
    expect(t).toContain("Permanently delete your Urdais account and account data.");
    expect(t).toContain("canceled immediately");
    expect(t).toContain("Any remaining paid access will be forfeited. This cannot be undone.");
    expect(html).toMatch(/<a [^>]*href="\/account\/delete"[^>]*>Delete account<\/a>/);
  });

  it("is shown even when the subscription could not be read", async () => {
    resolveAccountHub.mockResolvedValue({ kind: "unavailable", profile: PROFILE });
    expect(await render()).toContain('href="/account/delete"');
  });

  it("an unfinished deletion replaces the page with a finish action, and nothing else", async () => {
    resolveAccountHub.mockResolvedValue({ kind: "deletion_pending", profile: PROFILE });
    const html = await render();
    const t = text(html);
    expect(t).toContain("Account deletion in progress");
    expect(t).toContain("Your subscription has been canceled and your premium access has ended");
    expect(html).toContain("finish-form");
    expect(t).not.toMatch(/Subscribe|Manage subscription|Manage billing|Profile/);
  });
});
