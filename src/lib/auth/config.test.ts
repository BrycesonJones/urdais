/**
 * The public Supabase configuration, and the one failure that would be a
 * catastrophe rather than a bug: a secret key in a `NEXT_PUBLIC_*` variable,
 * which ships to every browser that loads Urdais.
 */

import { describe, expect, it } from "vitest";

import {
  SUPABASE_PUBLISHABLE_KEY_VAR,
  SUPABASE_URL_VAR,
  describeConfigProblem,
  isAuthConfigured,
  readSupabaseConfig,
} from "@/lib/auth/config";

const URL_OK = "https://scwwjoyouohfrwylalha.supabase.co";
const KEY_OK = "sb_publishable_AbCdEf1234567890";

function env(overrides: Record<string, string | undefined> = {}) {
  return { [SUPABASE_URL_VAR]: URL_OK, [SUPABASE_PUBLISHABLE_KEY_VAR]: KEY_OK, ...overrides };
}

/** A legacy service-role JWT, assembled so no real credential appears in the repo. */
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.signature`;
}

describe("a valid configuration", () => {
  it("is accepted and normalised to an origin", () => {
    const result = readSupabaseConfig(env({ [SUPABASE_URL_VAR]: `${URL_OK}/` }));
    expect("config" in result && result.config).toEqual({ url: URL_OK, publishableKey: KEY_OK });
    expect(isAuthConfigured(env())).toBe(true);
  });

  it("allows a local http project URL for development only", () => {
    expect("config" in readSupabaseConfig(env({ [SUPABASE_URL_VAR]: "http://127.0.0.1:54321" }))).toBe(true);
    expect("config" in readSupabaseConfig(env({ [SUPABASE_URL_VAR]: "http://localhost:54321" }))).toBe(true);
    // Any other plaintext host would put access tokens on the wire.
    expect("problem" in readSupabaseConfig(env({ [SUPABASE_URL_VAR]: "http://example.test" }))).toBe(true);
  });
});

describe("refusing a secret in a public variable", () => {
  it("refuses a modern secret key", () => {
    const result = readSupabaseConfig(env({ [SUPABASE_PUBLISHABLE_KEY_VAR]: "sb_secret_AbCdEf1234567890" }));
    expect("problem" in result && result.problem.kind).toBe("secret_in_public_variable");
  });

  it("refuses a legacy service_role JWT", () => {
    const result = readSupabaseConfig(env({ [SUPABASE_PUBLISHABLE_KEY_VAR]: fakeJwt({ role: "service_role", iss: "supabase" }) }));
    expect("problem" in result && result.problem.kind).toBe("secret_in_public_variable");
  });

  it("says so in terms an operator will act on", () => {
    const message = describeConfigProblem({ kind: "secret_in_public_variable", variable: SUPABASE_PUBLISHABLE_KEY_VAR });
    expect(message).toMatch(/SECRET/);
    expect(message).toMatch(/rotate/i);
  });
});

describe("refusing the legacy anon key", () => {
  it("rejects a legacy anon JWT even though it would currently work", () => {
    // Supabase retires the legacy keys at the end of 2026. Accepting one now
    // means a deployment that breaks on a date nobody is watching.
    const result = readSupabaseConfig(env({ [SUPABASE_PUBLISHABLE_KEY_VAR]: fakeJwt({ role: "anon", iss: "supabase" }) }));
    expect("problem" in result && result.problem.kind).toBe("legacy_anon_key");
  });
});

describe("absent or malformed configuration", () => {
  it("reports the missing variable by name", () => {
    const noUrl = readSupabaseConfig(env({ [SUPABASE_URL_VAR]: undefined }));
    expect("problem" in noUrl && noUrl.problem).toEqual({ kind: "missing", variable: SUPABASE_URL_VAR });

    const noKey = readSupabaseConfig(env({ [SUPABASE_PUBLISHABLE_KEY_VAR]: "  " }));
    expect("problem" in noKey && noKey.problem).toEqual({ kind: "missing", variable: SUPABASE_PUBLISHABLE_KEY_VAR });
  });

  it("reports a malformed URL", () => {
    const result = readSupabaseConfig(env({ [SUPABASE_URL_VAR]: "not a url" }));
    expect("problem" in result && result.problem.kind).toBe("bad_url");
  });

  it("is not configured, rather than throwing, when nothing is set", () => {
    expect(isAuthConfigured({})).toBe(false);
  });
});
