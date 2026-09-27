/**
 * The onboarding screens: what they say, and what they refuse to do.
 *
 * Two kinds of test. The rendering cases pin the copy a reader actually sees, because
 * the price and the checkout boundary are the two places where wrong words are a
 * commercial problem rather than a cosmetic one. The structural cases scan the
 * onboarding source itself for the things that must not exist anywhere in it — a
 * write to `premium_entitlements`, anything Stripe, a fake payment control — which is
 * the only way to assert an absence across a whole surface rather than one file.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveOnboarding = vi.hoisted(() => vi.fn());
const resolveOnboardingEntry = vi.hoisted(() => vi.fn());
const resolveCheckoutHandoff = vi.hoisted(() => vi.fn());
const resolveSupabaseIdentity = vi.hoisted(() => vi.fn());
const readPendingEmail = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
);

vi.mock("@/lib/onboarding/server", () => ({ resolveOnboarding, resolveOnboardingEntry }));
vi.mock("@/lib/onboarding/checkout-handoff", () => ({ resolveCheckoutHandoff }));
vi.mock("@/lib/auth/identity", () => ({ resolveSupabaseIdentity }));
vi.mock("@/lib/onboarding/pending-email", () => ({ readPendingEmail, rememberPendingEmail: vi.fn(), forgetPendingEmail: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => null }));
// The forms are client components whose behaviour is exercised elsewhere; here they
// only need to be identifiable in the markup.
vi.mock("@/components/onboarding/credentials-form", () => ({
  CredentialsForm: ({ submitLabel }: { submitLabel: string }) => <button type="submit">{submitLabel}</button>,
}));
vi.mock("@/components/onboarding/resend-verification", () => ({
  ResendVerification: () => <button type="submit">Resend verification email</button>,
}));

import AccessRoute from "@/app/access/page";
import CreateAccountRoute from "@/app/access/create/page";
import OnboardingLoginRoute from "@/app/access/login/page";
import VerifyEmailRoute from "@/app/access/verify/page";
import ReadyForCheckoutRoute from "@/app/access/ready/page";
import AlreadySubscribedRoute from "@/app/access/subscribed/page";
import { ANONYMOUS_VIEWER, authenticatedViewer, subscriberViewer } from "@/lib/access/entitlement";
import { PREMIUM_PRODUCT_IDS, findProduct } from "@/lib/access/products";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const params = (query: Record<string, string> = {}) => Promise.resolve(query);

function renderGate(viewer = ANONYMOUS_VIEWER, state = "intro", returnTo: string | null = null) {
  resolveOnboarding.mockResolvedValue({ kind: "render", viewer, state, returnTo });
  resolveOnboardingEntry.mockResolvedValue({ kind: "render", viewer, state, returnTo });
}

beforeEach(() => {
  for (const mock of [resolveOnboarding, resolveOnboardingEntry, resolveCheckoutHandoff, resolveSupabaseIdentity, readPendingEmail]) {
    mock.mockReset();
  }
  redirect.mockClear();
  readPendingEmail.mockResolvedValue(null);
  resolveSupabaseIdentity.mockResolvedValue({ kind: "anonymous", reason: "no_session" });
});

describe("the intro", () => {
  it("says what a subscription is and what it costs", async () => {
    renderGate();
    const html = renderToStaticMarkup(await AccessRoute({ searchParams: params() }));

    expect(html).toContain("Get full access to Urdais");
    expect(html).toContain("One subscription unlocks Urdais&#x27;s premium analytics and infrastructure data.");
    // The price, before anyone hands over an email address.
    expect(html).toContain("$80/week");
    expect(html).toContain("No free trial.");
  });

  it("lists exactly the five premium products, named from the registry", async () => {
    renderGate();
    const html = renderToStaticMarkup(await AccessRoute({ searchParams: params() }));

    for (const id of PREMIUM_PRODUCT_IDS) {
      const name = findProduct(id)!.name;
      expect(html, name).toContain(name);
    }
    // And nothing public advertised as part of the subscription.
    expect(html).not.toContain(findProduct("model_economics")!.name);
    expect(html).not.toContain(findProduct("map_data_centers")!.name);
  });

  it("offers an explicit choice rather than guessing whether an account exists", async () => {
    renderGate();
    const html = renderToStaticMarkup(await AccessRoute({ searchParams: params() }));
    expect(html).toContain("Continue");
    expect(html).toContain("Already have an account?");
    expect(html).toContain("/access/login");
  });

  it("shows no payment control", async () => {
    renderGate();
    const html = renderToStaticMarkup(await AccessRoute({ searchParams: params() }));
    expect(html.toLowerCase()).not.toMatch(/card number|cvc|stripe|pay now|subscribe now/);
  });

  it("carries the destination into both branches", async () => {
    renderGate(ANONYMOUS_VIEWER, "intro", "/markets/compute-analytics");
    const html = renderToStaticMarkup(await AccessRoute({ searchParams: params({ returnTo: "/markets/compute-analytics" }) }));
    const encoded = encodeURIComponent("/markets/compute-analytics");
    expect(html).toContain(`/access/create?returnTo=${encoded}`);
    expect(html).toContain(`/access/login?returnTo=${encoded}`);
  });

  it("redirects an authenticated reader instead of rendering", async () => {
    resolveOnboardingEntry.mockResolvedValue({ kind: "redirect", href: "/access/ready", state: "ready_for_checkout" });
    await expect(AccessRoute({ searchParams: params() })).rejects.toThrow("NEXT_REDIRECT:/access/ready");
  });
});

describe("create account", () => {
  it("says plainly that an account is not a subscription", async () => {
    renderGate(ANONYMOUS_VIEWER, "create_account");
    const html = renderToStaticMarkup(await CreateAccountRoute({ searchParams: params() }));
    expect(html).toContain("Create your Urdais account");
    expect(html).toContain("does not include premium access");
  });

  it("offers a way back and a way to log in instead", async () => {
    renderGate(ANONYMOUS_VIEWER, "create_account");
    const html = renderToStaticMarkup(await CreateAccountRoute({ searchParams: params() }));
    expect(html).toContain("Back");
    expect(html).toContain("/access/login");
  });

  it("redirects a signed-in reader away", async () => {
    resolveOnboarding.mockResolvedValue({ kind: "redirect", href: "/access/ready", state: "ready_for_checkout" });
    await expect(CreateAccountRoute({ searchParams: params() })).rejects.toThrow("NEXT_REDIRECT:/access/ready");
  });
});

describe("log in", () => {
  it("renders the form and a way to create an account instead", async () => {
    renderGate(ANONYMOUS_VIEWER, "login");
    const html = renderToStaticMarkup(await OnboardingLoginRoute({ searchParams: params() }));
    expect(html).toContain("Log in to Urdais");
    expect(html).toContain("/access/create");
  });

  it("redirects a signed-in reader away", async () => {
    resolveOnboarding.mockResolvedValue({ kind: "redirect", href: "/access/verify", state: "verification_required" });
    await expect(OnboardingLoginRoute({ searchParams: params() })).rejects.toThrow("NEXT_REDIRECT:/access/verify");
  });
});

describe("verification required", () => {
  it("names the address from the authoritative session", async () => {
    renderGate(authenticatedViewer("acct-1", false), "verification_required");
    resolveSupabaseIdentity.mockResolvedValue({
      kind: "authenticated",
      identity: { subject: "uuid-1", email: "reader@example.invalid", emailVerified: false },
    });

    const html = renderToStaticMarkup(await VerifyEmailRoute({ searchParams: params() }));
    expect(html).toContain("Verify your email");
    expect(html).toContain("reader@example.invalid");
    expect(html).toContain("Resend verification email");
  });

  it("names the pending address when signup produced no session", async () => {
    // Supabase issues no session when it requires confirmation, so this reader is
    // anonymous — the state exists only because a signup is pending on this device.
    resolveOnboarding.mockResolvedValue({ kind: "redirect", href: "/access", state: "intro" });
    readPendingEmail.mockResolvedValue("pending@example.invalid");

    const html = renderToStaticMarkup(await VerifyEmailRoute({ searchParams: params() }));
    expect(html).toContain("pending@example.invalid");
  });

  it("redirects a wandering anonymous reader with nothing pending", async () => {
    resolveOnboarding.mockResolvedValue({ kind: "redirect", href: "/access", state: "intro" });
    readPendingEmail.mockResolvedValue(null);
    await expect(VerifyEmailRoute({ searchParams: params() })).rejects.toThrow("NEXT_REDIRECT:/access");
  });

  it("offers no way to self-declare verification", async () => {
    renderGate(authenticatedViewer("acct-1", false), "verification_required");
    const html = renderToStaticMarkup(await VerifyEmailRoute({ searchParams: params() }));
    // A reader cannot assert their own verification; only the Auth server can.
    expect(html.toLowerCase()).not.toMatch(/i.?ve verified|mark as verified|already verified\?.*continue/);
  });
});

describe("the checkout boundary", () => {
  beforeEach(() => {
    renderGate(authenticatedViewer("acct-1", true), "ready_for_checkout");
    resolveCheckoutHandoff.mockResolvedValue({ kind: "ready", accountId: "acct-1", returnTo: null });
  });

  it("says the account is ready without claiming a purchase is possible", async () => {
    const html = renderToStaticMarkup(await ReadyForCheckoutRoute({ searchParams: params() }));
    expect(html).toContain("ready to continue");
    expect(html).toContain("Your Urdais account is set up and ready for premium access.");
    expect(html).toContain("Checkout setup coming next");
    expect(html).toContain("no charge has been made");
  });

  it("repeats the price at the boundary", async () => {
    const html = renderToStaticMarkup(await ReadyForCheckoutRoute({ searchParams: params() }));
    expect(html).toContain("$80/week");
  });

  it("shows no payment control, real or imitation", async () => {
    const html = renderToStaticMarkup(await ReadyForCheckoutRoute({ searchParams: params() }));
    const lower = html.toLowerCase();
    for (const forbidden of ["card number", "cvc", "expiry", "stripe", "pay now", "start subscription", "complete payment"]) {
      expect(lower, forbidden).not.toContain(forbidden);
    }
    // And not even a disabled button pretending to be one.
    expect(lower).not.toMatch(/<button[^>]*disabled/);
  });

  it("never exposes the account id to the browser", async () => {
    // Phase 5 must derive it server-side; a hidden field here would let someone open
    // a checkout session against another account.
    const html = renderToStaticMarkup(await ReadyForCheckoutRoute({ searchParams: params() }));
    expect(html).not.toContain("acct-1");
    expect(html).not.toMatch(/name="accountId"/);
  });

  it("redirects when the handoff refuses, even if the route resolution allowed it", async () => {
    // Two independent checks. If they ever disagree, the reader is sent back rather
    // than shown a boundary the handoff would refuse.
    resolveCheckoutHandoff.mockResolvedValue({ kind: "refused", reason: "unverified" });
    await expect(ReadyForCheckoutRoute({ searchParams: params() })).rejects.toThrow("NEXT_REDIRECT:/access");
  });
});

describe("already a subscriber", () => {
  beforeEach(() => renderGate(subscriberViewer("acct-1"), "already_entitled"));

  it("says they already have access and offers only the way onward", async () => {
    const html = renderToStaticMarkup(await AlreadySubscribedRoute({ searchParams: params() }));
    expect(html).toContain("You already have full access");
    expect(html).toContain("already includes every premium product");
    expect(html).toContain("Continue to Urdais");
  });

  it("offers nothing that could start a second subscription", async () => {
    const html = renderToStaticMarkup(await AlreadySubscribedRoute({ searchParams: params() }));
    const lower = html.toLowerCase();
    for (const forbidden of ["create account", "log in", "verify your email", "ready to continue", "checkout", "$80"]) {
      expect(lower, forbidden).not.toContain(forbidden);
    }
  });

  it("uses the destination they arrived with", async () => {
    renderGate(subscriberViewer("acct-1"), "already_entitled", "/markets/power-analytics");
    const html = renderToStaticMarkup(
      await AlreadySubscribedRoute({ searchParams: params({ returnTo: "/markets/power-analytics" }) }),
    );
    expect(html).toContain('href="/markets/power-analytics"');
    expect(html).toContain("Continue to where you were");
  });
});

describe("what onboarding cannot do, asserted across the whole surface", () => {
  /** Every onboarding source file. */
  function onboardingSources(): { file: string; source: string }[] {
    const roots = [path.join(REPO_ROOT, "src", "app", "access"), path.join(REPO_ROOT, "src", "lib", "onboarding"), path.join(REPO_ROOT, "src", "components", "onboarding")];
    const files: { file: string; source: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
        files.push({ file: path.relative(REPO_ROOT, full), source: readFileSync(full, "utf8") });
      }
    };
    for (const root of roots) walk(root);
    return files;
  }

  /** Source with comments removed: a doc comment naming a thing is not doing it. */
  const codeOf = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("covers a non-trivial surface, so the assertions below are not vacuous", () => {
    expect(onboardingSources().length).toBeGreaterThanOrEqual(10);
  });

  it("never writes an entitlement", async () => {
    // Invariant 5. Onboarding gets a reader ready to buy; it cannot grant.
    for (const { file, source } of onboardingSources()) {
      const code = codeOf(source);
      expect(code, file).not.toMatch(/premium_entitlements/);
      expect(code, file).not.toMatch(/\b(insert|update|upsert)\b[\s\S]{0,80}entitlement/i);
    }
  });

  it("contains nothing Stripe", async () => {
    for (const { file, source } of onboardingSources()) {
      // Comments naming the next phase are fine; imports and identifiers are not.
      expect(codeOf(source).toLowerCase(), file).not.toContain("stripe");
    }
  });

  it("never reads a verification flag from a request", async () => {
    for (const { file, source } of onboardingSources()) {
      expect(source, file).not.toMatch(/user_metadata/);
      expect(source, file).not.toMatch(/formData\.get\(\s*["'](emailVerified|verified|accountId|entitlement)["']/);
    }
  });

  it("sanitises every destination at the point it enters the server", async () => {
    // Only the files that *receive* an untrusted value are checked: anything reading
    // `searchParams` or a form field. A client component handed an already-validated
    // prop is a renderer, not a trust boundary, and requiring it to re-sanitise would
    // be the second sanitiser this architecture avoids.
    for (const { file, source } of onboardingSources()) {
      const code = codeOf(source);
      const readsUntrusted = /searchParams|formData\.get\(/.test(code);
      if (!readsUntrusted || !/returnTo/.test(code)) continue;

      const usesSanitiser = /safeReturnTo|onboardingReturnTo/.test(code);
      expect(usesSanitiser, `${file} reads returnTo from a request without the sanitiser`).toBe(true);
    }
  });
});
