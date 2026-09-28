/**
 * Onboarding's Server Actions.
 *
 * The rendering tests in `onboarding.test.tsx` pin what a reader sees. These pin
 * what the server *does* with what they submit — in particular the one property
 * that would not show up on any screen: which address a submitted code is checked
 * against.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmailOtp = vi.hoisted(() => vi.fn());
const verifyEmailOtp = vi.hoisted(() => vi.fn());
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const readPendingEmail = vi.hoisted(() => vi.fn());
const rememberPendingEmail = vi.hoisted(() => vi.fn());
const forgetPendingEmail = vi.hoisted(() => vi.fn());
const isGoogleAuthAvailable = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
);

vi.mock("@/lib/auth/operations", () => ({ sendEmailOtp, verifyEmailOtp }));
vi.mock("@/lib/auth/server-client", () => ({ createServerSupabaseClient }));
vi.mock("@/lib/auth/google", () => ({ isGoogleAuthAvailable, GOOGLE_PROVIDER: "google" }));
vi.mock("@/lib/onboarding/pending-email", () => ({ readPendingEmail, rememberPendingEmail, forgetPendingEmail }));
vi.mock("next/navigation", () => ({ redirect }));

import { IDLE_AUTH_STATE } from "@/app/auth/form-state";
import { resendOtpAction, sendOtpAction, useDifferentEmailAction, verifyOtpAction } from "@/app/access/actions";

const signInWithOAuth = vi.fn();

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

/** What the action throws when it redirects, or null if it returned instead. */
async function destinationOf(run: Promise<unknown>): Promise<string | null> {
  try {
    await run;
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.startsWith("NEXT_REDIRECT:")) throw error;
    return message.slice("NEXT_REDIRECT:".length);
  }
}

beforeEach(() => {
  for (const m of [sendEmailOtp, verifyEmailOtp, createServerSupabaseClient, readPendingEmail, rememberPendingEmail, forgetPendingEmail, isGoogleAuthAvailable, signInWithOAuth]) {
    m.mockReset();
  }
  redirect.mockClear();
  createServerSupabaseClient.mockResolvedValue({ client: { auth: { signInWithOAuth } } });
  readPendingEmail.mockResolvedValue(null);
  isGoogleAuthAvailable.mockResolvedValue(false);
});

describe("requesting a code", () => {
  beforeEach(() => sendEmailOtp.mockResolvedValue({ kind: "sent" }));

  it("sends, remembers the address, and moves to the code screen", async () => {
    const href = await destinationOf(sendOtpAction(IDLE_AUTH_STATE, form({ email: "reader@example.invalid" })));

    expect(sendEmailOtp.mock.calls[0]?.[1]).toEqual({ email: "reader@example.invalid" });
    expect(rememberPendingEmail).toHaveBeenCalledWith("reader@example.invalid");
    expect(href).toBe("/access/verify");
  });

  it("carries the reader's destination forward", async () => {
    const href = await destinationOf(
      sendOtpAction(IDLE_AUTH_STATE, form({ email: "a@b.co", returnTo: "/markets/power-analytics" })),
    );
    expect(href).toBe(`/access/verify?returnTo=${encodeURIComponent("/markets/power-analytics")}`);
  });

  it("refuses a destination that points off-site or back into onboarding", async () => {
    for (const hostile of ["https://evil.test/steal", "//evil.test", "/access/ready", "/auth/sign-in"]) {
      redirect.mockClear();
      const href = await destinationOf(sendOtpAction(IDLE_AUTH_STATE, form({ email: "a@b.co", returnTo: hostile })));
      expect(href, hostile).toBe("/access/verify");
    }
  });

  it("stays on the form and remembers nothing when the provider refuses", async () => {
    sendEmailOtp.mockResolvedValue({ kind: "rejected", reason: "rate_limited", message: "Too many attempts." });

    const state = await sendOtpAction(IDLE_AUTH_STATE, form({ email: "a@b.co" }));

    expect(state).toEqual({ status: "error", message: "Too many attempts." });
    // Remembering here would take the reader to a screen naming an address that
    // was never mailed, and offer to resend to it.
    expect(rememberPendingEmail).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("verifying a code", () => {
  it("checks it against the server's pending address, never the form's", async () => {
    // The property this whole test file exists for. An action that accepted an
    // address beside the code would let someone sit and brute-force codes against
    // a mailbox they do not own.
    readPendingEmail.mockResolvedValue("owner@example.invalid");
    verifyEmailOtp.mockResolvedValue({ kind: "verified" });

    await destinationOf(
      verifyOtpAction(IDLE_AUTH_STATE, form({ code: "123456", email: "victim@example.invalid" })),
    );

    expect(verifyEmailOtp.mock.calls[0]?.[1]).toEqual({ email: "owner@example.invalid", token: "123456" });
  });

  it("sends the new session back to /access to be resolved, not straight to the product", async () => {
    // The state machine lives in one place. Deciding "ready" here would compute the
    // new state inside the request that created it.
    readPendingEmail.mockResolvedValue("owner@example.invalid");
    verifyEmailOtp.mockResolvedValue({ kind: "verified" });

    const href = await destinationOf(
      verifyOtpAction(IDLE_AUTH_STATE, form({ code: "123456", returnTo: "/markets/power-analytics" })),
    );

    expect(href).toBe(`/access?returnTo=${encodeURIComponent("/markets/power-analytics")}`);
    expect(forgetPendingEmail).toHaveBeenCalled();
  });

  it("keeps the reader on the code screen when the code is refused", async () => {
    readPendingEmail.mockResolvedValue("owner@example.invalid");
    verifyEmailOtp.mockResolvedValue({
      kind: "rejected",
      reason: "code_rejected",
      message: "That code is incorrect or has expired. Request a new one and try again.",
    });

    const state = await verifyOtpAction(IDLE_AUTH_STATE, form({ code: "000000" }));

    expect(state.status).toBe("error");
    // The address is untouched, so retyping or resending both still work.
    expect(forgetPendingEmail).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("says so plainly when there is no pending request on this device", async () => {
    readPendingEmail.mockResolvedValue(null);

    const state = await verifyOtpAction(IDLE_AUTH_STATE, form({ code: "123456" }));

    expect(state).toMatchObject({ status: "error", message: expect.stringMatching(/Enter your email again/) });
    expect(verifyEmailOtp).not.toHaveBeenCalled();
  });
});

describe("resending", () => {
  it("mails the pending address and nothing a caller supplies", async () => {
    // A resend that took an address from the form would make Urdais a way to mail
    // anyone. Changing address goes through "Use a different email".
    readPendingEmail.mockResolvedValue("owner@example.invalid");
    sendEmailOtp.mockResolvedValue({ kind: "sent" });

    const state = await resendOtpAction(IDLE_AUTH_STATE, form({ email: "victim@example.invalid" }));

    expect(sendEmailOtp.mock.calls[0]?.[1]).toEqual({ email: "owner@example.invalid" });
    expect(state).toEqual({ status: "check_email", message: "A new code is on its way." });
  });

  it("reports a refusal as a refusal", async () => {
    readPendingEmail.mockResolvedValue("owner@example.invalid");
    sendEmailOtp.mockResolvedValue({ kind: "rejected", reason: "rate_limited", message: "Too many attempts." });

    // Saying "sent" here leaves someone waiting for mail that is not coming.
    expect((await resendOtpAction(IDLE_AUTH_STATE, form({}))).status).toBe("error");
  });

  it("refuses when nothing is pending", async () => {
    readPendingEmail.mockResolvedValue(null);
    expect((await resendOtpAction(IDLE_AUTH_STATE, form({}))).status).toBe("error");
    expect(sendEmailOtp).not.toHaveBeenCalled();
  });
});

describe("Google", () => {
  it("refuses before touching Supabase when the provider is unconfigured", async () => {
    isGoogleAuthAvailable.mockResolvedValue(false);

    // Re-checked in the action, not only at render: a form can be submitted by
    // something that never rendered the page.
    const { signInWithGoogleAction } = await import("@/app/access/actions");
    const state = await signInWithGoogleAction(IDLE_AUTH_STATE, form({}));

    expect(state.status).toBe("error");
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it("redirects to Supabase's own authorization URL, never one assembled here", async () => {
    isGoogleAuthAvailable.mockResolvedValue(true);
    signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.test/o/oauth2/auth?x=1" }, error: null });

    const { signInWithGoogleAction } = await import("@/app/access/actions");
    const href = await destinationOf(signInWithGoogleAction(IDLE_AUTH_STATE, form({})));

    expect(href).toBe("https://accounts.google.test/o/oauth2/auth?x=1");
    expect(signInWithOAuth.mock.calls[0]?.[0]?.options?.skipBrowserRedirect).toBe(true);
    expect(signInWithOAuth.mock.calls[0]?.[0]?.options?.redirectTo).toContain("/auth/confirm");
  });
});

describe("using a different email", () => {
  it("clears the pending record rather than leaving two addresses in play", async () => {
    const href = await destinationOf(useDifferentEmailAction(form({ returnTo: "/markets/power-analytics" })));

    expect(forgetPendingEmail).toHaveBeenCalled();
    expect(href).toBe(`/access?returnTo=${encodeURIComponent("/markets/power-analytics")}`);
  });
});
