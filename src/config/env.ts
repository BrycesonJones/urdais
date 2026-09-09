/**
 * Application environment configuration.
 *
 * Only public (NEXT_PUBLIC_*) values are read here so this module is safe to
 * import from both server and client code. Server-only secrets should be read
 * in a separate server-only module when they are introduced.
 *
 * Keep this file minimal: add a variable here only when something uses it.
 */

const DEFAULT_APP_URL = "http://localhost:3000";

export const env = {
  /** Public origin of the web app, without a trailing slash. */
  appUrl: (process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL).replace(/\/$/, ""),
} as const;
