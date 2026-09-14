/**
 * Runtime configuration and the credential contract for provider collection.
 *
 * Credentials come only from the environment or a secret manager at run time,
 * through the `env` record passed in; nothing here reads process.env on import
 * and nothing here ever returns, logs or embeds a credential value in an error.
 * Simulation mode needs no credentials at all. This is the only module in
 * src/lib/ucpi that knows a credential variable's name.
 */

export type RunMode = "simulation" | "validation" | "production";

export type ProviderSlug = "runpod" | "lambda" | "price-of-compute";

/** The environment variable that carries each provider's API key. Names only; never values. A source with no key has no entry. */
export const CREDENTIAL_VARIABLES: Readonly<Partial<Record<ProviderSlug, string>>> = {
  runpod: "RUNPOD_API_KEY",
  lambda: "LAMBDA_API_KEY",
};

/** Base URLs are configuration, not assumptions; the documented hosts are confirmed at first authenticated validation. */
export const BASE_URL_VARIABLES: Readonly<Record<ProviderSlug, string>> = {
  runpod: "UCPI_RUNPOD_BASE_URL",
  lambda: "UCPI_LAMBDA_BASE_URL",
  "price-of-compute": "UCPI_PRICE_OF_COMPUTE_BASE_URL",
};

/** Whether a provider needs a credential at all. */
export function credentialRequired(provider: ProviderSlug): boolean {
  return CREDENTIAL_VARIABLES[provider] !== undefined;
}

export const RUN_MODE_VARIABLE = "UCPI_RUN_MODE";

export type EnvRecord = Readonly<Record<string, string | undefined>>;

export class MissingCredentialError extends Error {
  readonly variable: string;
  readonly provider: ProviderSlug;
  constructor(provider: ProviderSlug, variable: string) {
    super(`credential for ${provider} is not configured: set ${variable} in the environment or secret manager`);
    this.name = "MissingCredentialError";
    this.provider = provider;
    this.variable = variable;
  }
}

export class MissingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingConfigurationError";
  }
}

/** An opaque holder so a credential can be passed around without being printable. */
export class Credential {
  readonly #value: string;
  readonly provider: ProviderSlug;
  constructor(provider: ProviderSlug, value: string) {
    this.provider = provider;
    this.#value = value;
  }
  /** The only way to use the value: as a header the HTTP layer sets at send time. */
  authorizationHeader(): string {
    return `Bearer ${this.#value}`;
  }
  toString(): string {
    return `[credential ${this.provider}: redacted]`;
  }
  toJSON(): string {
    return this.toString();
  }
}

export function readRunMode(env: EnvRecord): RunMode {
  const raw = env[RUN_MODE_VARIABLE] ?? "simulation";
  if (raw === "simulation" || raw === "validation" || raw === "production") return raw;
  throw new MissingConfigurationError(`${RUN_MODE_VARIABLE} must be simulation, validation or production, got ${JSON.stringify(raw)}`);
}

/** Reads a provider credential. Throws a clear, value-free error when absent or blank. */
export function readCredential(env: EnvRecord, provider: ProviderSlug): Credential {
  const variable = CREDENTIAL_VARIABLES[provider];
  if (variable === undefined) throw new MissingConfigurationError(`${provider} takes no credential`);
  const value = env[variable];
  if (value === undefined || value.trim() === "") throw new MissingCredentialError(provider, variable);
  return new Credential(provider, value.trim());
}

export function hasCredential(env: EnvRecord, provider: ProviderSlug): boolean {
  const variable = CREDENTIAL_VARIABLES[provider];
  if (variable === undefined) return true;
  const value = env[variable];
  return value !== undefined && value.trim() !== "";
}

export function readBaseUrl(env: EnvRecord, provider: ProviderSlug): string {
  const variable = BASE_URL_VARIABLES[provider];
  const value = env[variable];
  if (value === undefined || !/^https:\/\/[^/\s]+/.test(value)) {
    throw new MissingConfigurationError(`${variable} must be an https base URL for the documented ${provider} API host`);
  }
  return value.replace(/\/$/, "");
}

/** Removes anything that looks like a bearer token or key from a string destined for a log. */
export function redactSecrets(text: string): string {
  return text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g, "Bearer [redacted]").replace(/(api[_-]?key["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi, "$1[redacted]");
}
