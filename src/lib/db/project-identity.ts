/**
 * Which database a connection string points at, read without touching its password.
 *
 * UrdaisDev and UrdaisProd sit behind the same Supabase pooler hostname, so the host alone
 * cannot tell them apart: the pooler routes by tenant, and the tenant is in the username
 * (`postgres.<ref>`, or `<role>.<ref>` for any other role). The direct host and the dedicated
 * pooler instead carry the reference in the hostname (`db.<ref>.supabase.co`, on 5432 or 6543)
 * with a bare username. Both forms are read; where both are present they must agree.
 *
 * Nothing here returns or formats the password, the query string, or the full URL.
 */

/** Supabase project references are twenty lowercase alphanumerics. */
export const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;

const SAFE_HOST = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$|^\[[0-9a-f:.]+\]$/;
const SAFE_DATABASE = /^[A-Za-z0-9_-]{1,63}$/;

const LOCAL_HOSTS =new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type DatabaseTarget =
  | { kind: "local"; host: string; port: string; database: string }
  | { kind: "supabase"; projectRef: string; host: string; port: string; database: string }
  /** A remote host that does not identify a Supabase project. Never safe to write to blind. */
  | { kind: "unidentified"; host: string; port: string; database: string };

export type IdentifyResult =
  | { ok: true; target: DatabaseTarget }
  | { ok: false; reason: string };

function isSupabasePoolerHost(host: string): boolean {
  return host === "pooler.supabase.com" || host.endsWith(".pooler.supabase.com");
}

export function identifyDatabaseTarget(url: string): IdentifyResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "the connection string is not a valid URL" };
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return { ok: false, reason: `the connection string uses ${parsed.protocol || "no"} scheme; expected postgresql:` };
  }

  const host = parsed.hostname.toLowerCase();
  if (host === "") {
    return { ok: false, reason: "the connection string names no host" };
  }
  // A password with an unencoded `/` or `#` shifts the rest of the string into the path, so the
  // path is printed only when it is plainly a database name.
  if (!SAFE_HOST.test(host)) {
    return { ok: false, reason: "the connection string's host is not a plain hostname (check that the password is URL-encoded)" };
  }
  const port = parsed.port || "5432";
  const path = parsed.pathname.replace(/^\//, "");
  if (path !== "" && !SAFE_DATABASE.test(path)) {
    return { ok: false, reason: "the connection string's database name is not a plain identifier (check that the password is URL-encoded)" };
  }
  const database = path || "(default)";

  if (LOCAL_HOSTS.has(host)) {
    return { ok: true, target: { kind: "local", host, port, database } };
  }

  let username: string;
  try {
    username = decodeURIComponent(parsed.username).toLowerCase();
  } catch {
    return { ok: false, reason: "the connection string's username is not validly encoded" };
  }
  const userSuffix = /^[^.]+\.([^.]+)$/.exec(username)?.[1] ?? null;
  const fromUser = userSuffix !== null && PROJECT_REF_PATTERN.test(userSuffix) ? userSuffix : null;
  const hostLabel = /^db\.([^.]+)\.supabase\.co$/.exec(host)?.[1] ?? null;
  const fromHost = hostLabel !== null && PROJECT_REF_PATTERN.test(hostLabel) ? hostLabel : null;

  if (fromHost !== null) {
    if (fromUser !== null && fromUser !== fromHost) {
      return {
        ok: false,
        reason: `the connection names two projects: ${fromHost} in the host and ${fromUser} in the username`,
      };
    }
    return { ok: true, target: { kind: "supabase", projectRef: fromHost, host, port, database } };
  }
  if (isSupabasePoolerHost(host) && fromUser !== null) {
    return { ok: true, target: { kind: "supabase", projectRef: fromUser, host, port, database } };
  }
  return { ok: true, target: { kind: "unidentified", host, port, database } };
}

/** `host:port/database` — the only form of a target that may appear in a log. */
export function describeDatabaseTarget(target: DatabaseTarget): string {
  return `${target.host}:${target.port}/${target.database}`;
}
