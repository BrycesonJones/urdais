/**
 * Configuration hooks for the Phase 4 collectors.
 *
 * Both agencies require a registered key for production retrieval. No key exists in this
 * repository, none is committed, and nothing here fabricates a placeholder that could be
 * mistaken for one. Unit tests never need a key: the adapters are pure over a payload, and the
 * fixtures are synthetic.
 */

export const UMPI_ECOS_API_KEY_ENV = "UMPI_ECOS_API_KEY";
export const UMPI_DATA_GO_KR_SERVICE_KEY_ENV = "UMPI_DATA_GO_KR_SERVICE_KEY";

export type UmpiCredentialName = typeof UMPI_ECOS_API_KEY_ENV | typeof UMPI_DATA_GO_KR_SERVICE_KEY_ENV;

/** Present or absent, never the value. A caller that needs the key reads the environment itself. */
export function credentialPresence(env: NodeJS.ProcessEnv = process.env): Record<UmpiCredentialName, boolean> {
  return {
    [UMPI_ECOS_API_KEY_ENV]: Boolean(env[UMPI_ECOS_API_KEY_ENV]?.trim()),
    [UMPI_DATA_GO_KR_SERVICE_KEY_ENV]: Boolean(env[UMPI_DATA_GO_KR_SERVICE_KEY_ENV]?.trim()),
  };
}

/**
 * Phase 3 ships no collector, so nothing calls this yet. It exists so that when Phase 4 does,
 * the failure mode for a missing key is a named error at the boundary rather than a request
 * sent with the string "undefined" in it.
 */
export function requireCredential(name: UmpiCredentialName, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured; UMPI retrieval requires a registered key`);
  return value;
}
