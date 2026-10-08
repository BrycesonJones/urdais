/**
 * The onboarding screens after the passwordless revision.
 *
 * Three kinds of test. The rendering cases pin what a reader sees. The *regression*
 * cases pin what they no longer see — the intro screen, the price, the password
 * field — because a removal is only real if something fails when it comes back. And
 * the structural cases scan the whole onboarding surface for what must not exist
 * anywhere in it, which is the only way to assert an absence across a surface rather
 * than in one file.
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
const isGoogleAuthAvailable = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
);

vi.mock("@/lib/onboarding/server", () => ({ resolveOnboarding, resolveOnboardingEntry }));
vi.mock("@/lib/onboarding/checkout-handoff", () => ({ resolveCheckoutHandoff }));
vi.mock("@/lib/auth/identity", () => ({ resolveSupabaseIdentity }));
vi.mock("@/lib/auth/google", () => ({ isGoogleAuthAvailable, GOOGLE_PROVIDER: "google" }));
vi.mock("@/lib/onboarding/pending-email", () => ({
  readPendingEmail,
  rememberPendingEmail: vi.fn(),
  forgetPendingEmail: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect, permanentRedirect: redirect }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/components/onboarding/email-form", () => ({
  EmailForm: ({ submitLabel = "Send code" }: { submitLabel?: string }) => (
    <form data-testid="email-form">
      <label htmlFor="e">Email address</label>
      <input id="e" type="email" name="email" />
      <button type="submit">{submitLabel}</button>
    </form>
  ),
}));
vi.mock("@/components/onboarding/google-button", () => ({
  GoogleButton: () => <button type="submit">Continue with Google</button>,
}));
vi.mock("@/components/onboarding/resend-code", () => ({
  ResendCode: () => <button type="submit">Resend code</button>,
}));
vi.mock("@/components/onboarding/otp-form", () => ({
  OtpForm: ({ expectedLength }: { expectedLength: number | null }) => (
    <form data-testid="otp-form">
      <label htmlFor="c">Verification code</label>
      <input id="c" name="code" inputMode="numeric" autoComplete="one-time-code" />
      <p>{expectedLength === null ? "Enter the code from the email." : `${expectedLength}-digit code from the email.`}</p>
      <button type="submit">Verify</button>
    </form>
  ),
}));

import AccessRoute from "@/app/access/page";
import DiscoverFullAccessRoute from "@/app/access/discover/page";
import AudienceClassificationRoute from "@/app/access/audience/page";
import OnboardingLoginRoute from "@/app/access/login/page";
import CheckEmailRoute from "@/app/access/verify/page";
import ReadyForCheckoutRoute from "@/app/access/ready/page";
import AlreadySubscribedRoute from "@/app/access/subscribed/page";
import { ANONYMOUS_VIEWER, authenticatedViewer, subscriberViewer } from "@/lib/access/entitlement";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const params = (query: Record<string, string> = {}) => Promise.resolve(query);

function renderGate(viewer = ANONYMOUS_VIEWER, state = "create_account", returnTo: string | null = null) {
  resolveOnboarding.mockResolvedValue({ kind: "render", viewer, state, returnTo });
  resolveOnboardingEntry.mockResolvedValue({ kind: "render", viewer, state, returnTo });
}

beforeEach(() => {
  for (const m of [resolveOnboarding, resolveOnboardingEntry, resolveCheckoutHandoff, resolveSupabaseIdentity, readPendingEmail, isGoogleAuthAvailable]) {
    m.mockReset();
  }
  redirect.mockClear();
  readPendingEmail.mockResolvedValue(null);
  resolveSupabaseIdentity.mockResolvedValue({ kind: "anonymous", reason: "no_session" });
  // Google is unconfigured unless a test says otherwise, matching production.
  isGoogleAuthAvailable.mockResolvedValue(false);
});

describe("/access is the account form", () => {
  it("asks for an account, not for another click", async () => {
    renderGate();
    const html = renderToStaticMarkup(await AccessRoute({ searchParams: params() }));

    expect(html).toContain("Create your account");
    expect(html).toContain("Email address");
    expect(html).toContain("Send code");
  });

  it("collects an email and nothing else", async () => {
    renderGate();
    const html = renderToStaticMarkup(await AccessRoute({ searchParams: params() }));

    expect(html).toContain('type="email"');
    // The heart of the revision: no password is collected because none is used.
    expect(html).not.toContain('type="password"');
    expect(html.toLowerCase()).not.toContain("password</span>");
  });

  it("tells no story about passwords or how Urdais used to authenticate", async () => {
    // Phase 7A: the screen is one task. A reader never needed to know passwords
    // existed, so "No password required." was migration history, not instruction.
    renderGate();
    const html = renderToStaticMarkup(await AccessRoute({ searchParams: params() }));
    expect(html.toLowerCase()).not.toContain("password");
    expect(html).not.toContain("FULL ACCESS");
    expect(html).not.toContain("Supabase");
  });

  it("offers log in without inferring whether the reader has an account", async () => {
    renderGate();
    const html = renderToStaticMarkup(await AccessRoute({ searchParams: params() }));
    expect(html).toContain("Already have an account?");
    expect(html).toMatch(/<a [^>]*href="\/access\/login"[^>]*>Sign in<\/a>/);
  });

  it("carries the destination to the login screen", async () => {
    renderGate(ANONYMOUS_VIEWER, "create_account", "/markets/power-analytics");
    const html = renderToStaticMarkup(await AccessRoute({ searchParams: params({ returnTo: "/markets/power-analytics" }) }));
    expect(html).toContain(`/access/login?returnTo=${encodeURIComponent("/markets/power-analytics")}`);
  });

  it("redirects an authenticated reader instead of rendering", async () => {
    resolveOnboardingEntry.mockResolvedValue({ kind: "redirect", href: "/access/ready", state: "ready_for_checkout" });
    await expect(AccessRoute({ searchParams: params() })).rejects.toThrow("NEXT_REDIRECT:/access/ready");
  });
});

describe("premium conversion introduction", () => {
  it("renders the approved four text-only product cards", async () => {
    renderGate(ANONYMOUS_VIEWER, "discover", "/markets/power-analytics");
    const html = renderToStaticMarkup(await DiscoverFullAccessRoute({
      params: Promise.resolve({}),
      searchParams: params({ returnTo: "/markets/power-analytics" }),
    }));

    expect(html).toContain("Intelligence for the Information Age.");
    for (const title of ["Compute Economics", "Power Analytics", "Infrastructure Maps", "Market Intelligence"]) {
      expect(html).toContain(title);
    }
    expect(html).toContain(`/access/audience?returnTo=${encodeURIComponent("/markets/power-analytics")}`);
    expect(html).not.toMatch(/<svg|<img/);
    for (const excluded of ["$80", "No free trial", "One subscription. Every premium product.", "No separate product purchases."]) {
      expect(html).not.toContain(excluded);
    }
  });

  it("renders an optional, unselected native dropdown and both onward actions", async () => {
    renderGate(ANONYMOUS_VIEWER, "audience", "/markets/compute-analytics");
    const html = renderToStaticMarkup(await AudienceClassificationRoute({
      params: Promise.resolve({}),
      searchParams: params({ returnTo: "/markets/compute-analytics" }),
    }));

    expect(html).toContain("What best describes you?");
    expect(html).toContain("Primary role or organization");
    expect(html).toMatch(/<select[^>]*name="primaryRole"/);
    expect(html).toContain('<option value="" selected="">Select your primary role</option>');
    expect(html).not.toContain("required=\"\"");
    expect(html).toContain("Continue to account creation");
    expect(html).toContain("Skip for now");
    expect(html).toContain("Sign in");
    expect(html).toContain("Your selection won’t restrict the products you can access.");
  });

  it("redirects authenticated visitors instead of repeating either introduction", async () => {
    resolveOnboarding.mockResolvedValue({ kind: "redirect", href: "/access/ready?returnTo=%2Fmarkets%2Fpower-analytics", state: "ready_for_checkout" });
    await expect(DiscoverFullAccessRoute({ params: Promise.resolve({}), searchParams: params({ returnTo: "/markets/power-analytics" }) }))
      .rejects.toThrow("NEXT_REDIRECT:/access/ready");

    resolveOnboarding.mockResolvedValue({ kind: "redirect", href: "/access/subscribed?returnTo=%2Fmarkets%2Fpower-analytics", state: "already_entitled" });
    await expect(AudienceClassificationRoute({ params: Promise.resolve({}), searchParams: params({ returnTo: "/markets/power-analytics" }) }))
      .rejects.toThrow("NEXT_REDIRECT:/access/subscribed");
  });
});

describe("pricing and account-form regressions", () => {
  it("shows no price before the reader has an account", async () => {
    // Phase 5 moved the price to Plan / Pay rather than removing it. What stays true
    // is that nobody is asked to weigh a number before they have seen what it buys,
    // so the account form and the login form still quote nothing.
    renderGate();
    const account = renderToStaticMarkup(await AccessRoute({ searchParams: params() }));

    renderGate(ANONYMOUS_VIEWER, "login");
    const login = renderToStaticMarkup(await OnboardingLoginRoute({ searchParams: params() }));

    for (const html of [account, login]) {
      expect(html).not.toContain("$80");
      expect(html).not.toContain("/week");
      expect(html).not.toContain("No free trial");
    }
  });

  it("quotes the price on Plan / Pay, beside the payment it explains", async () => {
    renderGate(authenticatedViewer("acct-1", true), "ready_for_checkout");
    resolveCheckoutHandoff.mockResolvedValue({ kind: "ready", accountId: "acct-1", returnTo: null });

    const ready = renderToStaticMarkup(await ReadyForCheckoutRoute({ searchParams: params() }));

    expect(ready).toContain("$80/week");
    expect(ready).toContain("No free trial.");
  });

  it("does not claim premium is free to read once enforcement is active", async () => {
    // Phase 7B: the Account Hub's Subscribe leads here, under active enforcement.
    // The Phase 5 footer said the product "is still readable without a
    // subscription today", which stopped being true at activation.
    const previous = process.env.URDAIS_PREMIUM_ENFORCEMENT;
    process.env.URDAIS_PREMIUM_ENFORCEMENT = "active";
    try {
      renderGate(authenticatedViewer("acct-1", true), "ready_for_checkout");
      resolveCheckoutHandoff.mockResolvedValue({ kind: "ready", accountId: "acct-1", returnTo: "/account" });
      const ready = renderToStaticMarkup(await ReadyForCheckoutRoute({ searchParams: params({ returnTo: "/account" }) }));
      expect(ready).not.toContain("readable without a subscription");
      expect(ready).toMatch(/<a [^>]*href="\/account"[^>]*>Go back<\/a>/);
      expect(ready).toContain("$80/week");
    } finally {
      if (previous === undefined) delete process.env.URDAIS_PREMIUM_ENFORCEMENT;
      else process.env.URDAIS_PREMIUM_ENFORCEMENT = previous;
    }
  });

  it("shows no price to somebody who already subscribes", async () => {
    // There is nothing to sell them, and a price on this screen reads as a second charge.
    renderGate(subscriberViewer("acct-1"), "already_entitled");
    const subscribed = renderToStaticMarkup(await AlreadySubscribedRoute({ searchParams: params() }));
    expect(subscribed).not.toContain("$80");
    expect(subscribed).not.toContain("/week");
  });

  it("no longer carries the old subscription value proposition", async () => {
    renderGate();
    const html = renderToStaticMarkup(await AccessRoute({ searchParams: params() }));
    expect(html).not.toContain("One subscription unlocks");
    expect(html).not.toContain("Get full access to Urdais");
  });

  it("does not repeat the premium product list as a sales screen before the account form", async () => {
    renderGate();
    const html = renderToStaticMarkup(await AccessRoute({ searchParams: params() }));
    // The gate already made the offer; the account form asks for an email.
    expect(html).not.toContain("Premium access includes");
    expect(html).not.toContain("GPU Compute Clusters");
  });

  it("puts no Continue step between the gate and the form", async () => {
    renderGate();
    const html = renderToStaticMarkup(await AccessRoute({ searchParams: params() }));
    // "Continue with Google" is a submit, not a step; plain "Continue" is gone.
    expect(html).not.toMatch(/>\s*Continue\s*</);
  });
});

describe("Google", () => {
  it("is absent when the provider is not configured", async () => {
    isGoogleAuthAvailable.mockResolvedValue(false);
    renderGate();
    const html = renderToStaticMarkup(await AccessRoute({ searchParams: params() }));
    // Not rendered disabled: a button that cannot work is worse than no button.
    expect(html).not.toContain("Continue with Google");
    expect(html).not.toContain("or</div>");
  });

  it("appears on both screens once configured", async () => {
    isGoogleAuthAvailable.mockResolvedValue(true);

    renderGate();
    expect(renderToStaticMarkup(await AccessRoute({ searchParams: params() }))).toContain("Continue with Google");

    renderGate(ANONYMOUS_VIEWER, "login");
    expect(renderToStaticMarkup(await OnboardingLoginRoute({ searchParams: params() }))).toContain("Continue with Google");
  });

  it("asks the server, never the request, whether it is available", async () => {
    renderGate();
    await AccessRoute({ searchParams: params({ google: "true", provider: "google" }) });
    // The query string cannot turn it on: availability came from one server call.
    expect(isGoogleAuthAvailable).toHaveBeenCalledOnce();
  });
});

describe("log in", () => {
  it("is the same email-only form under a different heading", async () => {
    renderGate(ANONYMOUS_VIEWER, "login");
    const html = renderToStaticMarkup(await OnboardingLoginRoute({ searchParams: params() }));

    expect(html).toContain("Sign in to Urdais");
    expect(html).toContain("Email address");
    expect(html).not.toContain('type="password"');
    expect(html).toContain("Send code");
  });

  it("carries none of the password-era copy", async () => {
    renderGate(ANONYMOUS_VIEWER, "login");
    const html = renderToStaticMarkup(await OnboardingLoginRoute({ searchParams: params() }));

    expect(html.toLowerCase()).not.toContain("password");
    for (const legacy of ["usual way", "Continue with email", "before that change", "Log in", "LOG IN", "Supabase"]) {
      expect(html, legacy).not.toContain(legacy);
    }
  });

  it("offers no way back to the account form other than the link itself", async () => {
    // The old "Back" link pointed at account creation, which is not where a reader
    // who came from the header's account icon came from.
    renderGate(ANONYMOUS_VIEWER, "login");
    const html = renderToStaticMarkup(await OnboardingLoginRoute({ searchParams: params() }));
    expect(html).not.toMatch(/>\s*Back\s*</);
  });

  it("offers account creation without switching automatically", async () => {
    renderGate(ANONYMOUS_VIEWER, "login");
    const html = renderToStaticMarkup(await OnboardingLoginRoute({ searchParams: params() }));
    expect(html).toContain("Don\u2019t have an account?");
    expect(html).toMatch(/<a [^>]*href="\/access"[^>]*>Create account<\/a>/);
  });

  it("carries the destination to the account form", async () => {
    renderGate(ANONYMOUS_VIEWER, "login", "/markets/power-analytics");
    const html = renderToStaticMarkup(
      await OnboardingLoginRoute({ searchParams: params({ returnTo: "/markets/power-analytics" }) }),
    );
    expect(html).toContain(`/access?returnTo=${encodeURIComponent("/markets/power-analytics")}`);
  });

  it("carries the account destination from the header's icon", async () => {
    renderGate(ANONYMOUS_VIEWER, "login", "/account");
    const html = renderToStaticMarkup(await OnboardingLoginRoute({ searchParams: params({ returnTo: "/account" }) }));
    expect(html).toContain(`/access?returnTo=${encodeURIComponent("/account")}`);
  });

  it("redirects a signed-in reader away", async () => {
    resolveOnboarding.mockResolvedValue({ kind: "redirect", href: "/access/ready", state: "ready_for_checkout" });
    await expect(OnboardingLoginRoute({ searchParams: params() })).rejects.toThrow("NEXT_REDIRECT:/access/ready");
  });
});

describe("the email challenge", () => {
  it("names the pending address and offers a resend", async () => {
    resolveOnboarding.mockResolvedValue({ kind: "redirect", href: "/access", state: "create_account" });
    readPendingEmail.mockResolvedValue("pending@example.invalid");

    const html = renderToStaticMarkup(await CheckEmailRoute({ searchParams: params() }));
    expect(html).toContain("Check your email");
    expect(html).toContain("We sent a verification code to");
    expect(html).toContain("pending@example.invalid");
    expect(html).toContain("Resend code");
    expect(html).toContain("Use a different email");
  });

  it("gives the reader somewhere to type the code, on the same screen", async () => {
    // The whole point of the OTP revision: the credential is entered here, in the
    // browser that asked for it. A screen that only said "check your email" would
    // be the link flow with different words.
    resolveOnboarding.mockResolvedValue({ kind: "redirect", href: "/access", state: "create_account" });
    readPendingEmail.mockResolvedValue("pending@example.invalid");

    const html = renderToStaticMarkup(await CheckEmailRoute({ searchParams: params() }));
    expect(html).toContain("Verification code");
    expect(html).toContain('name="code"');
    expect(html).toContain("Verify");
  });

  it("offers the code to the phone keyboard and to autofill", async () => {
    resolveOnboarding.mockResolvedValue({ kind: "redirect", href: "/access", state: "create_account" });
    readPendingEmail.mockResolvedValue("pending@example.invalid");

    const html = renderToStaticMarkup(await CheckEmailRoute({ searchParams: params() }));
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('autoComplete="one-time-code"');
  });

  it("does not claim a digit count nobody configured", async () => {
    // `otp_length` is hosted configuration the app cannot read. UrdaisDev is set to
    // 8, and a hard-coded "6-digit code" told readers their correct code was the
    // wrong shape.
    resolveOnboarding.mockResolvedValue({ kind: "redirect", href: "/access", state: "create_account" });
    readPendingEmail.mockResolvedValue("pending@example.invalid");

    const html = renderToStaticMarkup(await CheckEmailRoute({ searchParams: params() }));
    expect(html).toContain("Enter the code from the email.");
    expect(html).not.toMatch(/\d-digit code/);
  });

  it("prefers the authoritative address when a session exists", async () => {
    renderGate(authenticatedViewer("acct-1", false), "email_challenge");
    resolveSupabaseIdentity.mockResolvedValue({
      kind: "authenticated",
      identity: { subject: "uuid-1", email: "session@example.invalid", emailVerified: false },
    });
    readPendingEmail.mockResolvedValue("stale@example.invalid");

    const html = renderToStaticMarkup(await CheckEmailRoute({ searchParams: params() }));
    expect(html).toContain("session@example.invalid");
    expect(html).not.toContain("stale@example.invalid");
  });

  it("redirects an anonymous reader with nothing pending", async () => {
    resolveOnboarding.mockResolvedValue({ kind: "redirect", href: "/access", state: "create_account" });
    readPendingEmail.mockResolvedValue(null);
    await expect(CheckEmailRoute({ searchParams: params() })).rejects.toThrow("NEXT_REDIRECT:/access");
  });

  it("offers no way to self-declare authentication", async () => {
    resolveOnboarding.mockResolvedValue({ kind: "redirect", href: "/access", state: "create_account" });
    readPendingEmail.mockResolvedValue("pending@example.invalid");
    const html = renderToStaticMarkup(await CheckEmailRoute({ searchParams: params() }));
    expect(html.toLowerCase()).not.toMatch(/i.?ve (verified|clicked)|mark as verified|continue anyway/);
  });
});

describe("the checkout boundary and the subscriber screen are unchanged", () => {
  it("still gates on the handoff, and never puts the account id on the page", async () => {
    // Phase 5 replaced the "coming next" notice with the real offer. What must not
    // change is that the account id is derived from the session and never rendered
    // -- a hidden field carrying one is a subscription somebody else pays for.
    renderGate(authenticatedViewer("acct-1", true), "ready_for_checkout");
    resolveCheckoutHandoff.mockResolvedValue({ kind: "ready", accountId: "acct-1", returnTo: null });

    const html = renderToStaticMarkup(await ReadyForCheckoutRoute({ searchParams: params() }));
    expect(html).toContain("Urdais Premium");
    expect(html).not.toContain("acct-1");
  });

  it("renders no purchase control when billing is not configured", async () => {
    // Production holds no live Stripe credentials, so this is what a production
    // reader sees -- and it is why merging Phase 5 cannot start a Checkout there.
    renderGate(authenticatedViewer("acct-1", true), "ready_for_checkout");
    resolveCheckoutHandoff.mockResolvedValue({ kind: "ready", accountId: "acct-1", returnTo: null });

    const html = renderToStaticMarkup(await ReadyForCheckoutRoute({ searchParams: params() }));
    expect(html).toContain("Checkout is not open yet");
    expect(html).not.toContain("Continue to Checkout");
  });

  it("still tells a subscriber they already have access", async () => {
    renderGate(subscriberViewer("acct-1"), "already_entitled");
    const html = renderToStaticMarkup(await AlreadySubscribedRoute({ searchParams: params() }));
    expect(html).toContain("You already have full access");
    expect(html.toLowerCase()).not.toContain("create your account");
    expect(html.toLowerCase()).not.toContain("checkout");
  });

  it("sends a subscriber to /account to manage billing, rather than being a second management home", async () => {
    // Phase 7C: /account is the one place billing is managed from, and the Portal
    // returns there. This page stays in the purchase journey and links onward.
    renderGate(subscriberViewer("acct-1"), "already_entitled");
    const html = renderToStaticMarkup(await AlreadySubscribedRoute({ searchParams: params({ returnTo: "/markets/power-analytics" }) }));
    expect(html).toMatch(/<a [^>]*href="\/account"[^>]*>your account<\/a>/);
    expect(html).not.toMatch(/Manage subscription<\/button>|<form/);
    expect(html).toContain('href="/markets/power-analytics"');
  });
});

describe("what onboarding cannot do, asserted across the whole surface", () => {
  function onboardingSources(): { file: string; source: string }[] {
    const roots = [
      path.join(REPO_ROOT, "src", "app", "access"),
      path.join(REPO_ROOT, "src", "lib", "onboarding"),
      path.join(REPO_ROOT, "src", "components", "onboarding"),
    ];
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

  const codeOf = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("covers a non-trivial surface, so the assertions below are not vacuous", () => {
    expect(onboardingSources().length).toBeGreaterThanOrEqual(10);
  });

  it("contains no password anywhere in the customer flow", async () => {
    // Not merely hidden: the customer surface never references a password, never
    // imports the legacy password operations, and never renders such an input.
    for (const { file, source } of onboardingSources()) {
      const code = codeOf(source);
      expect(code, file).not.toMatch(/signInWithPassword|signUpWithPassword/);
      expect(code, file).not.toMatch(/type="password"/);
      expect(code, file).not.toMatch(/formData\.get\(\s*["']password["']/);
    }
  });

  it("never writes an entitlement", async () => {
    for (const { file, source } of onboardingSources()) {
      const code = codeOf(source);
      expect(code, file).not.toMatch(/premium_entitlements/);
      expect(code, file).not.toMatch(/\b(insert|update|upsert)\b[\s\S]{0,80}entitlement/i);
    }
  });

  it("no longer asks anyone to follow a link, anywhere in onboarding", async () => {
    // A removal is only real if something fails when it comes back. Copy that still
    // says "link" after the flow stopped sending one is a reader following an
    // instruction that cannot be carried out.
    for (const { file, source } of onboardingSources()) {
      expect(source, file).not.toMatch(/Send link|sign-in link|magic ?link|Resend email/i);
      expect(source, file).not.toMatch(/sendEmailSignInLink|emailRedirectTo/);
    }
  });

  it("holds no card data and builds no payment form of its own", async () => {
    // Phase 4 asserted "nothing Stripe" because there was no billing. Phase 5 has
    // billing, so the real invariant is narrower and more useful: Checkout is
    // Stripe-hosted, so Urdais renders no card field and loads no browser Stripe
    // client anywhere in onboarding.
    for (const { file, source } of onboardingSources()) {
      const code = codeOf(source);
      expect(code, file).not.toMatch(/name=["'](cardNumber|card_number|cvc|cvv|expiry)["']/i);
      expect(code, file).not.toMatch(/@stripe\/stripe-js/);
      expect(code, file).not.toMatch(/STRIPE_SECRET_KEY/);
    }
  });

  it("keeps Stripe out of the authentication screens specifically", async () => {
    // The account and login forms are about proving who somebody is. Billing belongs
    // after that, and a payment brand on a sign-in form is a different product.
    for (const { file, source } of onboardingSources()) {
      if (!/access\/(page|login)/.test(file)) continue;
      expect(codeOf(source).toLowerCase(), file).not.toContain("stripe");
    }
  });

  it("quotes a price on Plan / Pay and nowhere else in onboarding", async () => {
    // One screen may name the price: the one with the payment on it. Anywhere else is
    // either premature (before an account exists) or meaningless (after subscribing).
    const quoting = onboardingSources()
      .filter(({ source }) => /formatPremiumPrice|PREMIUM_TRIAL_NOTE|\$80/.test(codeOf(source)))
      .map(({ file }) => file);

    expect(quoting).toEqual(["src/app/access/ready/page.tsx"]);
  });

  it("never reads a verification flag from a request", async () => {
    for (const { file, source } of onboardingSources()) {
      expect(source, file).not.toMatch(/user_metadata/);
      expect(source, file).not.toMatch(/formData\.get\(\s*["'](emailVerified|verified|accountId|entitlement)["']/);
    }
  });

  it("sanitises every destination at the point it enters the server", async () => {
    for (const { file, source } of onboardingSources()) {
      const code = codeOf(source);
      if (!/searchParams|formData\.get\(/.test(code) || !/returnTo/.test(code)) continue;
      expect(/safeReturnTo|onboardingReturnTo/.test(code), `${file} reads returnTo without the sanitiser`).toBe(true);
    }
  });
});
