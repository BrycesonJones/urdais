/**
 * The `/auth` routes after Phase 7A.
 *
 * `/auth/sign-in` was a password form that premium gates linked to. It now carries
 * an old link to the passwordless sign-in screen, the way `/auth/sign-up` already
 * did; and sign-out is still a plain server action that lands somewhere public.
 */

import { existsSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
);
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect, permanentRedirect: redirect }));
vi.mock("@/lib/auth/server-client", () => ({ createServerSupabaseClient }));
vi.mock("@/lib/auth/operations", () => ({ signOut }));

import LegacySignInRoute from "@/app/auth/sign-in/page";
import { signOutAction } from "@/app/auth/actions";

const params = (query: Record<string, string> = {}) => Promise.resolve(query);

beforeEach(() => {
  redirect.mockClear();
  createServerSupabaseClient.mockReset();
  signOut.mockReset();
});

describe("/auth/sign-in", () => {
  it("redirects to the passwordless sign-in screen", async () => {
    await expect(LegacySignInRoute({ searchParams: params() })).rejects.toThrow("NEXT_REDIRECT:/access/login");
  });

  it("keeps the reader's destination", async () => {
    await expect(LegacySignInRoute({ searchParams: params({ returnTo: "/markets/power-analytics" }) })).rejects.toThrow(
      `NEXT_REDIRECT:/access/login?returnTo=${encodeURIComponent("/markets/power-analytics")}`,
    );
  });

  it("drops a hostile or looping destination", async () => {
    for (const hostile of ["https://evil.test", "//evil.test", "/auth/sign-in", "/access/login"]) {
      redirect.mockClear();
      await expect(LegacySignInRoute({ searchParams: params({ returnTo: hostile }) }), hostile).rejects.toThrow(
        /^NEXT_REDIRECT:\/access\/login$/,
      );
    }
  });

  it("no longer has a password form to render", () => {
    expect(existsSync(path.join(__dirname, "legacy-password-form.tsx"))).toBe(false);
  });
});

describe("sign-out", () => {
  it("ends the session on the server and lands on the public home page", async () => {
    const client = {};
    createServerSupabaseClient.mockResolvedValue({ client });
    await expect(signOutAction(new FormData())).rejects.toThrow("NEXT_REDIRECT:/");
    expect(signOut).toHaveBeenCalledWith(client);
  });

  it("never lands on an auth or onboarding screen, so it cannot loop", async () => {
    createServerSupabaseClient.mockResolvedValue({ client: {} });
    for (const destination of ["/access/login", "/auth/sign-in", "/access"]) {
      const form = new FormData();
      form.set("returnTo", destination);
      await expect(signOutAction(form), destination).rejects.toThrow(/^NEXT_REDIRECT:\/$/);
    }
  });
});
