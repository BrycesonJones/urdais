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
      <label htmlFor="e">Your email</label>
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
  OtpForm: ({ expectedLength }: { expectedLength: number }) => (
    <form data-testid="otp-form">
      <label htmlFor="c">Verification code</label>
      <input id="c" name="code" inputMode="numeric" autoComplete="one-time-code" />
      <p>{expectedLength}-digit code from the email.</p>
      <button type="submit">Verify</button>
    </form>
  ),
}));

import AccessRoute from "@/app/access/page";
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
    expect(html).toContain("Unlock Urdais&#x27; premium analytics and infrastructure data.");
    expect(html).toContain("Your email");
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

  it("says how sign-in will work", async () => {
    renderGate();
    const html = renderToStaticMarkup(await AccessRoute({ searchParams: params() }));
    expect(html).toContain("email you a verification code");
    expect(html).toContain("No password required.");
  });

  it("offers log in without inferring whether the reader has an account", async () => {
    renderGate();
    const html = renderToStaticMarkup(await AccessRoute({ searchParams: params() }));
    expect(html).toContain("Already have an account?");
    expect(html).toContain("/access/login");
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

describe("the removed intro — regressions", () => {
  it("shows no price anywhere in onboarding", async () => {
    renderGate();
    const account = renderToStaticMarkup(await AccessRoute({ searchParams: params() }));

    renderGate(authenticatedViewer("acct-1", true), "ready_for_checkout");
    resolveCheckoutHandoff.mockResolvedValue({ kind: "ready", accountId: "acct-1", returnTo: null });
    const ready = renderToStaticMarkup(await ReadyForCheckoutRoute({ searchParams: params() }));

    for (const html of [account, ready]) {
      expect(html).not.toContain("$80");
      expect(html).not.toContain("/week");
      expect(html).not.toContain("No free trial");
    }
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

    expect(html).toContain("Log in to Urdais");
    expect(html).toContain("Your email");
    expect(html).not.toContain('type="password"');
    expect(html).toContain("Send code");
  });

  it("offers account creation without switching automatically", async () => {
    renderGate(ANONYMOUS_VIEWER, "login");
    const html = renderToStaticMarkup(await OnboardingLoginRoute({ searchParams: params() }));
    expect(html).toContain("New to Urdais?");
    expect(html).toContain("Create account");
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

  it("tells the reader how long the code is, from configuration rather than a guess", async () => {
    resolveOnboarding.mockResolvedValue({ kind: "redirect", href: "/access", state: "create_account" });
    readPendingEmail.mockResolvedValue("pending@example.invalid");

    const html = renderToStaticMarkup(await CheckEmailRoute({ searchParams: params() }));
    expect(html).toContain("6-digit code from the email.");
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
  it("still gates on the handoff and states no charge was made", async () => {
    renderGate(authenticatedViewer("acct-1", true), "ready_for_checkout");
    resolveCheckoutHandoff.mockResolvedValue({ kind: "ready", accountId: "acct-1", returnTo: null });

    const html = renderToStaticMarkup(await ReadyForCheckoutRoute({ searchParams: params() }));
    expect(html).toContain("ready to continue");
    expect(html).toContain("Checkout setup coming next");
    expect(html).toContain("no charge has been made");
    expect(html).not.toContain("acct-1");
  });

  it("still tells a subscriber they already have access", async () => {
    renderGate(subscriberViewer("acct-1"), "already_entitled");
    const html = renderToStaticMarkup(await AlreadySubscribedRoute({ searchParams: params() }));
    expect(html).toContain("You already have full access");
    expect(html.toLowerCase()).not.toContain("create your account");
    expect(html.toLowerCase()).not.toContain("checkout");
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

  it("contains nothing Stripe", async () => {
    for (const { file, source } of onboardingSources()) {
      expect(codeOf(source).toLowerCase(), file).not.toContain("stripe");
    }
  });

  it("quotes no price", async () => {
    // Pricing moves to Plan / Pay with the payment it explains.
    for (const { file, source } of onboardingSources()) {
      const code = codeOf(source);
      expect(code, file).not.toMatch(/formatPremiumPrice|PREMIUM_TRIAL_NOTE|\$80/);
    }
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
