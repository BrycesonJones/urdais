/**
 * Deletion's Server Actions: what is read from a form (only the confirmation word
 * and a code), what each outcome tells the reader, and that success signs out and
 * leaves for a public page.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteCurrentAccount = vi.hoisted(() => vi.fn());
const resolveSupabaseIdentity = vi.hoisted(() => vi.fn());
const sendEmailOtp = vi.hoisted(() => vi.fn());
const verifyEmailOtp = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
);

vi.mock("@/lib/account/deletion", () => ({ deleteCurrentAccount }));
vi.mock("@/lib/auth/identity", () => ({ resolveSupabaseIdentity }));
vi.mock("@/lib/auth/operations", () => ({ sendEmailOtp, verifyEmailOtp }));
vi.mock("@/lib/auth/server-client", () => ({ createServerSupabaseClient: async () => ({ client: { auth: { signOut } } }) }));
vi.mock("next/navigation", () => ({ redirect }));

import { deleteAccountAction, finishDeletionAction, sendStepUpCodeAction, verifyStepUpCodeAction } from "@/app/account/delete/actions";
import { IDLE_AUTH_STATE } from "@/app/auth/form-state";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};

beforeEach(() => {
  for (const m of [deleteCurrentAccount, resolveSupabaseIdentity, sendEmailOtp, verifyEmailOtp, signOut]) m.mockReset();
  redirect.mockClear();
  resolveSupabaseIdentity.mockResolvedValue({ kind: "authenticated", identity: { subject: "user-1", email: "me@example.invalid", emailVerified: true } });
});

describe("typed confirmation", () => {
  for (const typed of ["", "delete", "DELETE ", "Delete", "yes"]) {
    it(`refuses ${JSON.stringify(typed)} without starting anything`, async () => {
      const state = await deleteAccountAction(IDLE_AUTH_STATE, form({ confirmation: typed }));
      expect(state).toEqual({ status: "error", message: "Type DELETE to confirm. Your account has not been deleted." });
      expect(deleteCurrentAccount).not.toHaveBeenCalled();
    });
  }

  it("ignores any account, user, customer or subscription in the form", async () => {
    deleteCurrentAccount.mockResolvedValue({ kind: "unavailable" });
    await deleteAccountAction(IDLE_AUTH_STATE, form({ confirmation: "DELETE", accountId: "acct_other", subject: "user-2", customer: "cus_other", subscription: "sub_other" }));
    expect(deleteCurrentAccount).toHaveBeenCalledWith({ confirmed: true });
  });
});

describe("outcomes", () => {
  it("complete: signs this browser out and goes to the public deleted page", async () => {
    deleteCurrentAccount.mockResolvedValue({ kind: "complete" });
    await expect(deleteAccountAction(IDLE_AUTH_STATE, form({ confirmation: "DELETE" }))).rejects.toThrow("NEXT_REDIRECT:/account/deleted");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("reauth required: back to the deletion page for the emailed code", async () => {
    deleteCurrentAccount.mockResolvedValue({ kind: "reauth_required" });
    await expect(deleteAccountAction(IDLE_AUTH_STATE, form({ confirmation: "DELETE" }))).rejects.toThrow("NEXT_REDIRECT:/account/delete");
  });

  it("anonymous: to sign in, returning to deletion", async () => {
    deleteCurrentAccount.mockResolvedValue({ kind: "anonymous" });
    await expect(deleteAccountAction(IDLE_AUTH_STATE, form({ confirmation: "DELETE" }))).rejects.toThrow(`NEXT_REDIRECT:/access/login?returnTo=${encodeURIComponent("/account/delete")}`);
  });

  const cases: [unknown, RegExp, RegExp | null][] = [
    [{ kind: "unavailable" }, /has not been deleted/, null],
    [{ kind: "billing_not_terminated", anyCanceled: false }, /was not deleted\. Nothing has been changed/, null],
    [{ kind: "billing_not_terminated", anyCanceled: true }, /was not deleted\. Some of it may already be canceled/, /Nothing has been changed/],
    [{ kind: "incomplete" }, /canceled and your premium access has ended, but we couldn.t finish/, /Nothing has been changed|has been deleted\b/],
    [{ kind: "in_progress" }, /already being processed/, null],
  ];
  for (const [outcome, says, neverSays] of cases) {
    it(`${JSON.stringify(outcome)}: truthful, never success, no raw error`, async () => {
      deleteCurrentAccount.mockResolvedValue(outcome);
      const state = await deleteAccountAction(IDLE_AUTH_STATE, form({ confirmation: "DELETE" }));
      expect(state.status).toBe("error");
      const message = state.status === "error" ? state.message : "";
      expect(message).toMatch(says);
      if (neverSays) expect(message).not.toMatch(neverSays);
      expect(message).not.toMatch(/stripe_|database_|sb_|Postgres|ECONN/);
      expect(redirect).not.toHaveBeenCalled();
      expect(signOut).not.toHaveBeenCalled();
    });
  }

  it("finish needs no confirmation word", async () => {
    deleteCurrentAccount.mockResolvedValue({ kind: "complete" });
    await expect(finishDeletionAction(IDLE_AUTH_STATE, new FormData())).rejects.toThrow("NEXT_REDIRECT:/account/deleted");
    expect(deleteCurrentAccount).toHaveBeenCalledWith({ confirmed: false });
  });
});

describe("step-up", () => {
  it("sends the code to the session's own address, never one from the form", async () => {
    sendEmailOtp.mockResolvedValue({ kind: "sent" });
    const state = await sendStepUpCodeAction(IDLE_AUTH_STATE, form({ email: "attacker@example.invalid" }));
    expect(sendEmailOtp.mock.calls[0]?.[1]).toEqual({ email: "me@example.invalid" });
    expect(state.status).toBe("check_email");
  });

  it("verifies against the session's own address and returns to deletion", async () => {
    verifyEmailOtp.mockResolvedValue({ kind: "verified" });
    await expect(verifyStepUpCodeAction(IDLE_AUTH_STATE, form({ code: "12345678", email: "attacker@example.invalid" }))).rejects.toThrow("NEXT_REDIRECT:/account/delete");
    expect(verifyEmailOtp.mock.calls[0]?.[1]).toEqual({ email: "me@example.invalid", token: "12345678" });
  });

  it("a wrong, expired or replayed code stays on the code form with the provider's safe message", async () => {
    verifyEmailOtp.mockResolvedValue({ kind: "rejected", message: "That code is incorrect or has expired. Request a new one and try again." });
    const state = await verifyStepUpCodeAction(IDLE_AUTH_STATE, form({ code: "00000000" }));
    expect(state).toEqual({ status: "check_email", message: "That code is incorrect or has expired. Request a new one and try again." });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("signed out: to sign in", async () => {
    resolveSupabaseIdentity.mockResolvedValue({ kind: "anonymous", reason: "no_session" });
    await expect(sendStepUpCodeAction(IDLE_AUTH_STATE, new FormData())).rejects.toThrow(/NEXT_REDIRECT:\/access\/login/);
  });
});
