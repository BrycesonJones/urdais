/**
 * The public Supabase Auth configuration, and the rule that keeps a secret out
 * of the browser bundle.
 *
 * Only two values are read here, both `NEXT_PUBLIC_*`, so this module is safe to
 * import from client and server alike — the same contract `@/config/env`
 * already states for itself.
 *
 * ## Publishable key, not the legacy anon key
 *
 * Supabase issues two kinds of public key. The legacy `anon` key is an HS256
 * JWT; the modern one looks like `sb_publishable_…` and can be rotated
 * independently of the project's JWT secret. Supabase's own documentation says
 * the legacy keys "will work until the end of 2026" and strongly encourages
 * switching now — which, as of this phase, is three months of runway. Urdais
 * uses the publishable key, and `assertPublicKey` below rejects a legacy JWT
 * outright rather than quietly working until it doesn't.
 *
 * ## What must never appear here
 *
 * The service-role key and every database connection string. Neither is needed:
 * Urdais talks to Postgres through `pg` on a privileged connection that never
 * leaves the server (see `@/lib/db/connection`), and Supabase Auth is reached
 * with the publishable key plus the user's own session. There is no code path in
 * which the browser needs a privileged credential, so the safe design is for one
 * never to be readable from a module the browser can import.
 */

export type SupabasePublicConfig = {
  /** Project API origin, e.g. `https://<ref>.supabase.co`. */
  readonly url: string;
  /** The publishable (`sb_publishable_…`) key. Public by design. */
  readonly publishableKey: string;
};

export const SUPABASE_URL_VAR = "NEXT_PUBLIC_SUPABASE_URL";
export const SUPABASE_PUBLISHABLE_KEY_VAR = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

/** A `process.env`-shaped bag, so tests can pass a fixture. */
export type ProcessEnvLike = Record<string, string | undefined>;

/**
 * A secret that has been mistaken for a public key.
 *
 * `sb_secret_…` is the modern secret key and `service_role` is the legacy one;
 * either in a `NEXT_PUBLIC_*` variable would be shipped to every browser that
 * loads Urdais, which is a total compromise of the database rather than a
 * misconfiguration. It is checked for by shape because that check still works
 * when nobody is reviewing the deployment's environment.
 */
function looksLikeSecret(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  // A legacy service-role key is a JWT whose payload names the role. Decoding it
  // properly would mean trusting it; finding the claim is enough to refuse.
  const payload = key.split(".")[1];
  if (!payload) return false;
  try {
    const decoded = Buffer.from(payload, "base64").toString("utf8");
    return decoded.includes('"role":"service_role"') || decoded.includes('"role": "service_role"');
  } catch {
    return false;
  }
}

export type SupabaseConfigProblem =
  | { readonly kind: "missing"; readonly variable: string }
  | { readonly kind: "secret_in_public_variable"; readonly variable: string }
  | { readonly kind: "legacy_anon_key"; readonly variable: string }
  | { readonly kind: "bad_url"; readonly variable: string };

/**
 * The configuration, or the specific reason there isn't one.
 *
 * Returns a problem rather than throwing so that a caller which must not crash
 * — the proxy, above all — can degrade to "no authentication" instead of
 * failing every request on the site, including the public pages.
 */
export function readSupabaseConfig(env: ProcessEnvLike = process.env): { config: SupabasePublicConfig } | { problem: SupabaseConfigProblem } {
  const url = env[SUPABASE_URL_VAR]?.trim() ?? "";
  const key = env[SUPABASE_PUBLISHABLE_KEY_VAR]?.trim() ?? "";

  if (url === "") return { problem: { kind: "missing", variable: SUPABASE_URL_VAR } };
  if (key === "") return { problem: { kind: "missing", variable: SUPABASE_PUBLISHABLE_KEY_VAR } };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { problem: { kind: "bad_url", variable: SUPABASE_URL_VAR } };
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    // A plaintext project URL would put access tokens on the wire. Local
    // development is the only exception, and is named explicitly.
    return { problem: { kind: "bad_url", variable: SUPABASE_URL_VAR } };
  }

  if (looksLikeSecret(key)) return { problem: { kind: "secret_in_public_variable", variable: SUPABASE_PUBLISHABLE_KEY_VAR } };
  if (!key.startsWith("sb_publishable_")) {
    return { problem: { kind: "legacy_anon_key", variable: SUPABASE_PUBLISHABLE_KEY_VAR } };
  }

  return { config: { url: parsed.origin, publishableKey: key } };
}

/** Whether Supabase Auth is configured at all. Public Urdais works either way. */
export function isAuthConfigured(env: ProcessEnvLike = process.env): boolean {
  return "config" in readSupabaseConfig(env);
}

/** Human-readable explanation of a configuration problem, for a server log. */
export function describeConfigProblem(problem: SupabaseConfigProblem): string {
  switch (problem.kind) {
    case "missing":
      return `${problem.variable} is not set; Supabase Auth is disabled and every viewer is anonymous.`;
    case "bad_url":
      return `${problem.variable} is not a valid https project URL.`;
    case "legacy_anon_key":
      return `${problem.variable} does not look like a publishable key (sb_publishable_…). The legacy anon JWT is rejected: Supabase retires it at the end of 2026.`;
    case "secret_in_public_variable":
      return `${problem.variable} contains a SECRET key. It would be shipped to every browser. Remove it immediately and rotate the key.`;
  }
}
