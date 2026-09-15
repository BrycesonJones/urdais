/**
 * How Urdais connects to Postgres, and what it says when it cannot.
 *
 * Three connection *classes* exist, and they are not interchangeable. Forcing
 * one connection string onto all three is what produced the outage this module
 * exists to prevent.
 *
 * **A. The serverless request/read path.** Every public page read — the UBWI
 * row and chart, the three News rails, the token benchmarks, the market pages —
 * runs inside a Vercel serverless instance that lives for one request and may
 * be one of many alive at once. It wants the *transaction* pooler: a connection
 * is borrowed for the duration of a statement and returned, so N concurrent
 * instances do not each reserve a server-side session. See
 * `serverlessRuntimeUrl` and `SERVERLESS_POOL_OPTIONS`.
 *
 * **B. The cron / private job path.** `/api/cron/news`, `/api/cron/ubwi` and
 * `/api/cron/ucpi`, and the `scripts/` commands behind them. These genuinely
 * own a connection: they run one multi-statement transaction and exit, and they
 * close what they opened. They keep the configured URL verbatim — one client,
 * once a day, is not what exhausts a pooler.
 *
 * **C. The migration / admin path.** `npm run migrations:check --production`,
 * `supabase db push`, and the `production migration ledger` CI job. Tooling
 * here expects a session connection and reads server bookkeeping; it keeps the
 * configured URL verbatim too.
 *
 * ## Why the rewrite in `serverlessRuntimeUrl` exists
 *
 * Supabase's session pooler (`…pooler.supabase.com:5432`) allots roughly
 * fifteen clients to a role/database pair. Class A used to take that path with
 * `pg.Pool({ max: 4 })` per instance, so four concurrent warm instances could
 * claim every slot. Past that point Supavisor answers
 *
 *     (EMAXCONNSESSION) max clients reached in session mode -
 *     max clients are limited to pool_size: 15
 *
 * and *every* production read fails at once, over a database that is perfectly
 * healthy: UBWI vanishes from the Urdais Indices panel, all three News rails
 * render "unavailable right now", `/markets/ubwi` shows its not-yet-published
 * note, and `/api/tokens/prices` answers `{"benchmarks":[]}`. It heals two or
 * three minutes after the load stops, so it leaves nothing behind to find. The
 * same host serves Supavisor's *transaction* pooler on port 6543, whose budget
 * is far larger and whose unit of assignment is a statement rather than a
 * session, so the rewrite is a port change and nothing else.
 *
 * It is done in code rather than by asking an operator to edit `DATABASE_URL`
 * because the safe value is derivable, and a deployment that is one manual env
 * edit away from the old failure is not fixed. `URDAIS_DATABASE_RUNTIME_URL`
 * overrides it for an operator who wants to name class A explicitly.
 */

/** A `process.env`-shaped bag, so callers can pass a fixture. */
export type ProcessEnvLike = Record<string, string | undefined>;

/**
 * Per-instance pool size for the serverless read path.
 *
 * One. A serverless instance serves one request at a time, and the reads within
 * a request are short; a second connection buys almost no latency and doubles
 * this instance's claim on a shared budget. It also makes the pool behave like
 * the dedicated client the few multi-statement callers that borrow it assume:
 * with `max: 1` a `begin` and its `commit` cannot land on different backends.
 */
export const SERVERLESS_POOL_MAX = 1;

/** The full `pg.Pool` configuration for class A, minus the connection string. */
export const SERVERLESS_POOL_OPTIONS = {
  max: SERVERLESS_POOL_MAX,
  /**
   * Hand the connection back to the pooler when this instance goes quiet.
   * Vercel keeps an instance warm long after its last request, and an idle
   * instance holding a pooler slot is the same scarcity as a busy one.
   */
  idleTimeoutMillis: 10_000,
  /**
   * Fail fast and honestly rather than hanging a page render. When the pooler
   * is saturated this is what turns a stalled request into a logged
   * `DB_CONNECT_FAILED` the operator can see.
   */
  connectionTimeoutMillis: 10_000,
} as const;

/** Supavisor's session-mode port, and the transaction-mode port on the same host. */
const SESSION_POOLER_PORT = "5432";
const TRANSACTION_POOLER_PORT = "6543";

function isSupabasePoolerHost(hostname: string): boolean {
  return hostname === "pooler.supabase.com" || hostname.endsWith(".pooler.supabase.com");
}

export type ServerlessRuntimeUrl = {
  /** The URL class A should connect with. */
  url: string;
  /** Why it is that URL — one of three cases, for the log line and the tests. */
  source: "override" | "transaction-pooler" | "configured";
};

/**
 * The class-A connection string derived from the configured one.
 *
 * - `URDAIS_DATABASE_RUNTIME_URL`, when set, wins outright (`override`).
 * - A Supabase session-pooler URL becomes the same URL on the transaction
 *   pooler's port (`transaction-pooler`).
 * - Anything else — the local harness, a direct `db.<ref>.supabase.co` host, a
 *   URL already pointed at 6543 — is returned unchanged (`configured`).
 *
 * An unparseable URL is returned unchanged rather than thrown on: refusing to
 * connect at all is a worse failure than connecting the way we used to.
 */
export function serverlessRuntimeUrl(
  configured: string,
  env: ProcessEnvLike = process.env,
): ServerlessRuntimeUrl {
  const override = env.URDAIS_DATABASE_RUNTIME_URL?.trim();
  if (override) return { url: override, source: "override" };

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    return { url: configured, source: "configured" };
  }

  // `URL` leaves `port` empty for a URL that names no port, and Postgres's
  // default is 5432 — but a pooler URL always names one, so an absent port
  // here is some other topology and is left alone.
  if (isSupabasePoolerHost(parsed.hostname) && parsed.port === SESSION_POOLER_PORT) {
    parsed.port = TRANSACTION_POOLER_PORT;
    return { url: parsed.toString(), source: "transaction-pooler" };
  }

  return { url: configured, source: "configured" };
}

/**
 * A connection string with its credentials removed, safe to log.
 *
 * Both halves of the userinfo go, not just the password: the pooler username is
 * `postgres.<project-ref>`, which names the production project.
 */
export function redactConnectionString(value: string): string {
  return value.replace(/(\w+:\/\/)[^@/\s]+@/g, "$1***@");
}

/**
 * A stable code for why a database read failed.
 *
 * The read surfaces all degrade to the same thing — an empty rail, a missing
 * index row — whether the table is empty, the pooler is full, or the password
 * is wrong. These codes are what let an operator tell those apart from a log
 * without reproducing the failure, which for `DB_POOL_EXHAUSTED` means catching
 * a two-minute window that heals itself.
 */
export type DatabaseErrorCode =
  | "DB_POOL_EXHAUSTED"
  | "DB_POOL_CLOSED"
  | "DB_CONNECT_FAILED"
  | "DB_AUTH_FAILED"
  | "DB_TLS_FAILED"
  | "DB_QUERY_FAILED";

type PgErrorLike = { message?: unknown; code?: unknown };

export function databaseErrorCode(error: unknown): DatabaseErrorCode {
  const asPg = (error ?? {}) as PgErrorLike;
  const sqlState = typeof asPg.code === "string" ? asPg.code : "";
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();

  // Supavisor answers EMAXCONNSESSION; a direct Postgres answers 53300.
  if (
    sqlState === "53300" ||
    message.includes("emaxconnsession") ||
    message.includes("max clients reached") ||
    message.includes("remaining connection slots") ||
    message.includes("too many clients")
  ) {
    return "DB_POOL_EXHAUSTED";
  }

  // The teardown race PR #82 closed. It must stay distinguishable from
  // exhaustion: the remedy is a code fix, not capacity.
  if (message.includes("calling end on the pool") || message.includes("pool after calling end")) {
    return "DB_POOL_CLOSED";
  }

  // 28P01 invalid_password, 28000 invalid_authorization_specification.
  if (sqlState === "28P01" || sqlState === "28000" || message.includes("password authentication failed")) {
    return "DB_AUTH_FAILED";
  }

  if (
    message.includes("self-signed certificate") ||
    message.includes("self signed certificate") ||
    message.includes("unable to verify the first certificate") ||
    message.includes("certificate has expired") ||
    message.includes("altnames")
  ) {
    return "DB_TLS_FAILED";
  }

  if (
    sqlState === "ECONNREFUSED" ||
    sqlState === "ENOTFOUND" ||
    sqlState === "ETIMEDOUT" ||
    sqlState === "EAI_AGAIN" ||
    sqlState === "ECONNRESET" ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("etimedout") ||
    message.includes("eai_again") ||
    message.includes("connection terminated") ||
    message.includes("timeout exceeded when trying to connect") ||
    message.includes("getaddrinfo")
  ) {
    return "DB_CONNECT_FAILED";
  }

  return "DB_QUERY_FAILED";
}

/**
 * `CODE: message`, with any connection string in the message redacted.
 *
 * This is what goes in the log line of every read path that falls back to
 * empty, so the fallback is never silent about its reason.
 */
export function describeDatabaseError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${databaseErrorCode(error)}: ${redactConnectionString(detail)}`;
}
