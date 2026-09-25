/**
 * Credentials for the two authenticated UEPI sources, and the rules that keep them out of
 * everything else.
 *
 * The threat here is not an attacker; it is an ordinary Tuesday. A credential leaks into a
 * repository through an error message that interpolated a URL, a structured log that dumped a
 * request, a test snapshot, or a stored retrieval record that kept the query string it was fetched
 * with. Every one of those is a normal thing for ingestion code to do, so the defence has to be
 * structural rather than remembered: secrets are read here, never returned to callers in a
 * readable form, and every URL or message that could carry one passes through `redact` first.
 *
 * ERCOT is the sharper case. Its token flow puts the username and password in a POST body and
 * returns an hour-long bearer token, and the API then wants that token *and* a subscription key on
 * every request. Four secrets in one exchange, none of which may ever be written down.
 */

export const ERCOT_USERNAME_ENV = "ERCOT_API_USERNAME";
export const ERCOT_PASSWORD_ENV = "ERCOT_API_PASSWORD";
export const ERCOT_SUBSCRIPTION_KEY_ENV = "ERCOT_API_SUBSCRIPTION_KEY";
export const ISONE_USERNAME_ENV = "ISONE_USERNAME";
export const ISONE_PASSWORD_ENV = "ISONE_PASSWORD";

export type EnvLike = Record<string, string | undefined>;

/** Thrown when a credential is absent or refused. Carries a status and never a secret. */
export class UepiCredentialError extends Error {
  constructor(
    readonly source: string,
    readonly status: number | null,
    message: string,
  ) {
    super(`${source}: ${message}`);
    this.name = "UepiCredentialError";
  }
}

function read(env: EnvLike, name: string, source: string): string {
  const value = (env[name] ?? "").trim();
  if (value === "") {
    throw new UepiCredentialError(source, null, `${name} is not configured`);
  }
  return value;
}

export type ErcotCredentials = {
  readonly username: string;
  readonly password: string;
  readonly subscriptionKey: string;
};

export function readErcotCredentials(env: EnvLike = process.env): ErcotCredentials {
  return {
    username: read(env, ERCOT_USERNAME_ENV, "ercot"),
    password: read(env, ERCOT_PASSWORD_ENV, "ercot"),
    subscriptionKey: read(env, ERCOT_SUBSCRIPTION_KEY_ENV, "ercot"),
  };
}

export function hasErcotCredentials(env: EnvLike = process.env): boolean {
  return [ERCOT_USERNAME_ENV, ERCOT_PASSWORD_ENV, ERCOT_SUBSCRIPTION_KEY_ENV]
    .every((name) => (env[name] ?? "").trim() !== "");
}

export type IsoneCredentials = { readonly username: string; readonly password: string };

export function readIsoneCredentials(env: EnvLike = process.env): IsoneCredentials {
  return {
    username: read(env, ISONE_USERNAME_ENV, "iso-ne"),
    password: read(env, ISONE_PASSWORD_ENV, "iso-ne"),
  };
}

export function hasIsoneCredentials(env: EnvLike = process.env): boolean {
  return [ISONE_USERNAME_ENV, ISONE_PASSWORD_ENV].every((name) => (env[name] ?? "").trim() !== "");
}

/** Header names whose values must never be recorded, whatever produced them. */
export const SECRET_HEADERS: ReadonlySet<string> = new Set([
  "authorization", "ocp-apim-subscription-key", "cookie", "set-cookie",
]);

/** Query parameters whose values must never be recorded. */
const SECRET_PARAMS = new Set([
  "username", "password", "client_id", "client_secret", "id_token", "access_token",
  "refresh_token", "subscription-key", "subscriptionkey", "apikey", "api_key", "key",
]);

/**
 * A URL safe to store, log or put in an error.
 *
 * Parameter *names* survive, because the shape of a request is operationally useful and a name
 * reveals nothing. Values of anything secret-bearing are replaced outright rather than truncated:
 * a prefix of a token is still a piece of a token.
 */
export function redactUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "[unparseable url]";
  }
  for (const name of [...parsed.searchParams.keys()]) {
    if (SECRET_PARAMS.has(name.toLowerCase())) parsed.searchParams.set(name, "REDACTED");
  }
  // Credentials embedded in the authority are removed entirely, name included.
  parsed.username = "";
  parsed.password = "";
  return parsed.toString();
}

/** Headers safe to store: secret-bearing ones keep their name and lose their value. */
export function redactHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(
    ([name, value]) => [name, SECRET_HEADERS.has(name.toLowerCase()) ? "REDACTED" : value]));
}

/**
 * Remove any occurrence of a known secret from arbitrary text.
 *
 * The last line of defence, for text Urdais did not compose -- a publisher's error body that
 * echoes the query it received, for instance. Applied to every message that reaches an error or a
 * log from these two sources.
 */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of secrets) {
    if (secret.length < 4) continue;
    result = result.split(secret).join("REDACTED");
    result = result.split(encodeURIComponent(secret)).join("REDACTED");
  }
  return result;
}
