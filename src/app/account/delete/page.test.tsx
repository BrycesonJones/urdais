/**
 * `/account/delete`: step-up first when the sign-in is not recent, then the
 * destructive confirmation with consequences specific to the reader's state.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveSupabaseIdentity = vi.hoisted(() => vi.fn());
const resolveAccountHub = vi.hoisted(() => vi.fn());
const checkRecentAuthentication = vi.hoisted(() => vi.fn());
const accountDeletionAvailable = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
);

vi.mock("@/lib/auth/identity", () => ({ resolveSupabaseIdentity }));
vi.mock("@/lib/account/hub", () => ({ resolveAccountHub }));
vi.mock("@/lib/auth/recent-auth", () => ({ checkRecentAuthentication }));
vi.mock("@/lib/account/deletion", () => ({ accountDeletionAvailable }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/components/account/deletion-forms", () => ({
  StepUpForm: ({ email }: { email: string }) => <form data-testid="step-up">{email}</form>,
  DeleteConfirmForm: () => <form data-testid="confirm"><input name="confirmation" /></form>,
}));

import DeleteAccountRoute from "@/app/account/delete/page";
import type { SubscriptionPresentation } from "@/lib/account/subscription-presentation";

const PROFILE = { email: "me@example.invalid", emailVerified: true };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&rsquo;/g, "’").replace(/\s+/g, " ");
const ready = (subscription: SubscriptionPresentation) => resolveAccountHub.mockResolvedValue({ kind: "ready", profile: PROFILE, subscription, action: null });
const render = async () => renderToStaticMarkup(await DeleteAccountRoute());

beforeEach(() => {
  for (const m of [resolveSupabaseIdentity, resolveAccountHub, checkRecentAuthentication, accountDeletionAvailable]) m.mockReset();
  redirect.mockClear();
  resolveSupabaseIdentity.mockResolvedValue({ kind: "authenticated", identity: { subject: "user-1", email: "me@example.invalid", emailVerified: true } });
  accountDeletionAvailable.mockReturnValue(true);
  checkRecentAuthentication.mockResolvedValue({ kind: "recent" });
  ready({ kind: "none" });
});

describe("access", () => {
  it("anonymous: to sign in, returning here", async () => {
    resolveSupabaseIdentity.mockResolvedValue({ kind: "anonymous", reason: "no_session" });
    await expect(DeleteAccountRoute()).rejects.toThrow(`NEXT_REDIRECT:/access/login?returnTo=${encodeURIComponent("/account/delete")}`);
  });

  it("an unfinished deletion is finished from /account", async () => {
    resolveAccountHub.mockResolvedValue({ kind: "deletion_pending", profile: PROFILE });
    await expect(DeleteAccountRoute()).rejects.toThrow("NEXT_REDIRECT:/account");
  });

  it("a deployment without the Auth admin key says deletion is unavailable and offers nothing", async () => {
    accountDeletionAvailable.mockReturnValue(false);
    const html = await render();
    expect(text(html)).toContain("Account deletion isn’t available right now");
    expect(html).not.toContain("confirm");
    expect(html).not.toContain("step-up");
  });
});

describe("step-up", () => {
  it("a sign-in older than 15 minutes gets the emailed-code form, not the confirmation", async () => {
    checkRecentAuthentication.mockResolvedValue({ kind: "stale" });
    const html = await render();
    expect(text(html)).toContain("Deleting your account needs a recent sign-in");
    expect(html).toContain('data-testid="step-up"');
    expect(html).toContain("me@example.invalid");
    expect(html).not.toContain('data-testid="confirm"');
    expect(checkRecentAuthentication).toHaveBeenCalledWith("user-1");
  });

  it("an unverifiable session gets neither form", async () => {
    checkRecentAuthentication.mockResolvedValue({ kind: "unverifiable" });
    const html = await render();
    expect(html).not.toContain("step-up");
    expect(html).not.toContain('data-testid="confirm"');
  });

  it("a recent sign-in goes straight to the confirmation", async () => {
    const html = await render();
    expect(html).toContain('data-testid="confirm"');
    expect(html).not.toContain("step-up");
  });
});

describe("state-specific consequences", () => {
  it("never subscribed: permanence only; no subscription or invoice warning", async () => {
    const t = text(await render());
    expect(t).toContain("permanently deleted. This cannot be undone.");
    expect(t).not.toMatch(/subscription|invoice|refund|forfeit/i);
  });

  it("active: immediate cancellation, forfeiture, no refund", async () => {
    ready({ kind: "active", priceLabel: "$80/week", cancellationScheduled: false, endsAt: null });
    const t = text(await render());
    expect(t).toContain("canceled immediately");
    expect(t).toContain("remaining paid access will be forfeited");
    expect(t).toContain("no refund is issued");
    expect(t).not.toMatch(/invoice/i);
  });

  it("cancellation scheduled: says deletion makes it immediate instead", async () => {
    ready({ kind: "active", priceLabel: "$80/week", cancellationScheduled: true, endsAt: "2026-10-08T00:00:00.000Z" });
    const t = text(await render());
    expect(t).toContain("already set to end");
    expect(t).toContain("cancels it immediately instead");
  });

  for (const status of ["past_due", "unpaid"] as const) {
    it(`${status}: the unpaid invoice is not forgiven, and automatic retries stop`, async () => {
      ready({ kind: "payment_issue", status });
      const t = text(await render());
      expect(t).toContain("no further billing periods will be charged");
      expect(t).toContain("unpaid invoice is not forgiven");
      expect(t).toContain("Stripe stops retrying the payment automatically");
    });
  }

  it("canceled: no subscription warning", async () => {
    ready({ kind: "canceled" });
    expect(text(await render())).not.toMatch(/canceled immediately|invoice/);
  });

  it("subscription unreadable: assumes the worst, never 'nothing to cancel'", async () => {
    resolveAccountHub.mockResolvedValue({ kind: "unavailable", profile: PROFILE });
    expect(text(await render())).toContain("canceled immediately");
  });
});
