/**
 * Establishing the Supabase identity.
 *
 * The important assertions here are about *where* each field comes from.
 * `emailVerified` must track `email_confirmed_at`, a column only the Auth server
 * writes, and must ignore `user_metadata.email_verified`, which the user can set
 * themselves with `auth.updateUser`. Trusting the latter would let any reader mark
 * their own address verified, so it is tested as a security property rather than
 * left to the comment that explains it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/server-client", () => ({ createServerSupabaseClient }));

import { resolveSupabaseIdentity } from "@/lib/auth/identity";

function withUser(user: Record<string, unknown> | null, error: unknown = null) {
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error });
  createServerSupabaseClient.mockResolvedValue({ client: { auth: { getUser } } });
  return getUser;
}

describe("an authenticated reader", () => {
  beforeEach(() => createServerSupabaseClient.mockReset());

  it("yields the Supabase user id as the subject", async () => {
    withUser({ id: "6b1f-uuid", email: "reader@example.invalid", email_confirmed_at: "2026-09-20T10:00:00Z" });
    const result = await resolveSupabaseIdentity();

    expect(result.kind).toBe("authenticated");
    expect(result.kind === "authenticated" && result.identity).toEqual({
      subject: "6b1f-uuid",
      email: "reader@example.invalid",
      emailVerified: true,
    });
  });

  it("normalises the address", async () => {
    withUser({ id: "u1", email: "  Reader@Example.INVALID ", email_confirmed_at: "2026-09-20T10:00:00Z" });
    const result = await resolveSupabaseIdentity();
    expect(result.kind === "authenticated" && result.identity.email).toBe("reader@example.invalid");
  });

  it("reports a user with no address as null rather than empty", async () => {
    withUser({ id: "u1", email: "", email_confirmed_at: null });
    const result = await resolveSupabaseIdentity();
    expect(result.kind === "authenticated" && result.identity.email).toBeNull();
  });
});

describe("email verification state", () => {
  beforeEach(() => createServerSupabaseClient.mockReset());

  it("is true only when email_confirmed_at is set", async () => {
    withUser({ id: "u1", email: "a@b.co", email_confirmed_at: "2026-09-20T10:00:00Z" });
    expect((await resolveSupabaseIdentity()).kind === "authenticated").toBe(true);
    let result = await resolveSupabaseIdentity();
    expect(result.kind === "authenticated" && result.identity.emailVerified).toBe(true);

    withUser({ id: "u1", email: "a@b.co", email_confirmed_at: null });
    result = await resolveSupabaseIdentity();
    expect(result.kind === "authenticated" && result.identity.emailVerified).toBe(false);

    withUser({ id: "u1", email: "a@b.co" });
    result = await resolveSupabaseIdentity();
    expect(result.kind === "authenticated" && result.identity.emailVerified).toBe(false);
  });

  it("ignores user_metadata.email_verified, which the user can write", async () => {
    // `auth.updateUser({ data: { email_verified: true } })` is something any
    // signed-in reader can call. If this assertion ever fails, self-verification
    // is possible.
    withUser({
      id: "u1",
      email: "a@b.co",
      email_confirmed_at: null,
      user_metadata: { email_verified: true },
      app_metadata: { email_verified: true },
    });
    const result = await resolveSupabaseIdentity();
    expect(result.kind === "authenticated" && result.identity.emailVerified).toBe(false);
  });

  it("ignores an empty confirmation timestamp", async () => {
    withUser({ id: "u1", email: "a@b.co", email_confirmed_at: "" });
    const result = await resolveSupabaseIdentity();
    expect(result.kind === "authenticated" && result.identity.emailVerified).toBe(false);
  });
});

describe("anonymity, and why", () => {
  beforeEach(() => createServerSupabaseClient.mockReset());

  it("is unconfigured when there is no Supabase project", async () => {
    createServerSupabaseClient.mockResolvedValue({ problem: { kind: "missing", variable: "NEXT_PUBLIC_SUPABASE_URL" } });
    expect(await resolveSupabaseIdentity()).toEqual({ kind: "anonymous", reason: "unconfigured" });
  });

  it("is no_session for an ordinary public visitor", async () => {
    withUser(null, { name: "AuthSessionMissingError", message: "Auth session missing!" });
    expect(await resolveSupabaseIdentity()).toEqual({ kind: "anonymous", reason: "no_session" });
  });

  it("is invalid_session for a rejected or tampered token", async () => {
    withUser(null, { name: "AuthApiError", message: "invalid JWT: unable to parse or verify signature" });
    expect(await resolveSupabaseIdentity()).toEqual({ kind: "anonymous", reason: "invalid_session" });
  });

  it("is provider_error when the Auth server cannot be reached", async () => {
    const getUser = vi.fn().mockRejectedValue(new Error("fetch failed"));
    createServerSupabaseClient.mockResolvedValue({ client: { auth: { getUser } } });
    expect(await resolveSupabaseIdentity()).toEqual({ kind: "anonymous", reason: "provider_error" });
  });

  it("is anonymous for a response with no user and no error", async () => {
    withUser(null);
    expect((await resolveSupabaseIdentity()).kind).toBe("anonymous");
  });

  it("never throws, even when constructing the client fails", async () => {
    // A Supabase or `next/headers` failure must not take public Urdais down. This
    // path was originally unguarded and threw; the guard in `identity.ts` exists
    // because of this test.
    //
    // A synchronous throw, which is what `cookies()` failing in an unexpected
    // render context looks like. `…Once` so the throwing implementation is consumed
    // by the call under test and cannot be invoked again outside the guard, which
    // vitest would report as an unhandled error.
    createServerSupabaseClient.mockImplementationOnce(() => {
      throw new Error("catastrophe");
    });

    // Asserted with an explicit catch rather than `.resolves`, so both properties
    // are checked directly: nothing escaped, and the value is the safe one.
    let outcome: unknown;
    let threw: unknown = null;
    try {
      outcome = await resolveSupabaseIdentity();
    } catch (error) {
      threw = error;
    }

    expect(threw).toBeNull();
    expect(outcome).toEqual({ kind: "anonymous", reason: "provider_error" });
  });
});
