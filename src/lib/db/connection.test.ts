/**
 * The connection-class rules, and the vocabulary a failed read logs.
 *
 * Both halves are here because both are things an operator reads off a log line
 * during an incident: which pooler the runtime actually reached, and which of
 * "the table is empty", "the pooler is full" and "the password is wrong" the
 * empty rail on the page means.
 */

import { describe, expect, it } from "vitest";

import {
  SERVERLESS_POOL_MAX,
  SERVERLESS_POOL_OPTIONS,
  databaseErrorCode,
  describeDatabaseError,
  redactConnectionString,
  serverlessRuntimeUrl,
} from "@/lib/db/connection";

const SESSION_POOLER = "postgresql://postgres.cyqtaydtfuwaexjkuynq:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=/ca.crt";

describe("the serverless runtime URL", () => {
  it("moves a Supabase session-pooler URL to the transaction pooler's port", () => {
    const runtime = serverlessRuntimeUrl(SESSION_POOLER, {});

    expect(runtime.source).toBe("transaction-pooler");
    expect(new URL(runtime.url).port).toBe("6543");
  });

  it("changes nothing else about that URL", () => {
    const runtime = serverlessRuntimeUrl(SESSION_POOLER, {});
    const before = new URL(SESSION_POOLER);
    const after = new URL(runtime.url);

    // The host, the role, the database and above all the TLS parameters have to
    // survive: a rewrite that dropped `sslmode=verify-full` would trade a
    // capacity problem for an unverified connection.
    expect(after.hostname).toBe(before.hostname);
    expect(after.username).toBe(before.username);
    expect(after.password).toBe(before.password);
    expect(after.pathname).toBe(before.pathname);
    expect(after.searchParams.get("sslmode")).toBe("verify-full");
    expect(after.searchParams.get("sslrootcert")).toBe("/ca.crt");
  });

  it("leaves a direct Supabase host alone, because 6543 is not served there", () => {
    const direct = "postgresql://postgres:pw@db.cyqtaydtfuwaexjkuynq.supabase.co:5432/postgres";

    expect(serverlessRuntimeUrl(direct, {})).toEqual({ url: direct, source: "configured" });
  });

  it("leaves the local development harness alone", () => {
    const local = "postgresql://postgres@localhost:54329/urdais_local";

    expect(serverlessRuntimeUrl(local, {})).toEqual({ url: local, source: "configured" });
  });

  it("leaves a URL already on the transaction pooler alone", () => {
    const already = "postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

    expect(serverlessRuntimeUrl(already, {})).toEqual({ url: already, source: "configured" });
  });

  it("lets an operator name the runtime URL explicitly, overriding the rewrite", () => {
    const override = "postgresql://postgres.ref:pw@somewhere.else:6543/postgres";

    expect(serverlessRuntimeUrl(SESSION_POOLER, { URDAIS_DATABASE_RUNTIME_URL: override })).toEqual({
      url: override,
      source: "override",
    });
  });

  it("returns an unparseable URL unchanged rather than throwing", () => {
    // Refusing to connect at all is a worse failure than connecting the old way.
    expect(serverlessRuntimeUrl("not a url", {})).toEqual({ url: "not a url", source: "configured" });
  });
});

describe("the serverless pool configuration", () => {
  it("reserves one connection per instance, not four", () => {
    // The number this file exists for. At `max: 4`, four concurrent warm Vercel
    // instances could claim the session pooler's whole fifteen-client budget
    // and every production read failed at once.
    expect(SERVERLESS_POOL_MAX).toBe(1);
    expect(SERVERLESS_POOL_OPTIONS.max).toBe(1);
  });

  it("releases an idle connection and gives up on a stalled connect", () => {
    expect(SERVERLESS_POOL_OPTIONS.idleTimeoutMillis).toBeGreaterThan(0);
    expect(SERVERLESS_POOL_OPTIONS.connectionTimeoutMillis).toBeGreaterThan(0);
  });
});

describe("redacting a connection string", () => {
  it("removes the role as well as the password", () => {
    // `postgres.<project-ref>` names the production project, so half a
    // redaction is not one.
    const redacted = redactConnectionString(`connect ECONNREFUSED on ${SESSION_POOLER}`);

    expect(redacted).not.toContain("cyqtaydtfuwaexjkuynq:pw");
    expect(redacted).not.toContain("postgres.cyqtaydtfuwaexjkuynq");
    expect(redacted).toContain("://***@aws-0-us-east-1.pooler.supabase.com:5432");
  });

  it("leaves a credential-free string untouched", () => {
    expect(redactConnectionString("relation does not exist")).toBe("relation does not exist");
  });
});

describe("classifying a database failure", () => {
  it("names the Supavisor session-pool exhaustion that took production down", () => {
    const error = Object.assign(
      new Error("max clients reached in session mode - max clients are limited to pool_size: 15"),
      { code: "XX000" },
    );

    expect(databaseErrorCode(error)).toBe("DB_POOL_EXHAUSTED");
  });

  it("names the direct-Postgres form of the same condition", () => {
    expect(databaseErrorCode(Object.assign(new Error("sorry, too many clients already"), { code: "53300" }))).toBe(
      "DB_POOL_EXHAUSTED",
    );
    expect(databaseErrorCode(new Error("remaining connection slots are reserved"))).toBe("DB_POOL_EXHAUSTED");
  });

  it("keeps the teardown race distinguishable from exhaustion", () => {
    // Same blank page, opposite remedies: this one is a code defect (PR #82),
    // that one is capacity. Collapsing them would send an operator to the
    // wrong fix.
    expect(databaseErrorCode(new Error("Cannot use a pool after calling end on the pool"))).toBe("DB_POOL_CLOSED");
  });

  it("names an authentication failure", () => {
    expect(
      databaseErrorCode(Object.assign(new Error('password authentication failed for user "postgres"'), { code: "28P01" })),
    ).toBe("DB_AUTH_FAILED");
  });

  it("names a TLS trust failure", () => {
    expect(databaseErrorCode(new Error("self-signed certificate in certificate chain"))).toBe("DB_TLS_FAILED");
  });

  it("names a connection failure", () => {
    expect(databaseErrorCode(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }))).toBe(
      "DB_CONNECT_FAILED",
    );
    expect(databaseErrorCode(new Error("timeout exceeded when trying to connect"))).toBe("DB_CONNECT_FAILED");
  });

  it("falls back to a query failure rather than guessing", () => {
    expect(databaseErrorCode(Object.assign(new Error('relation "pipeline.nope" does not exist'), { code: "42P01" }))).toBe(
      "DB_QUERY_FAILED",
    );
    expect(databaseErrorCode(undefined)).toBe("DB_QUERY_FAILED");
  });
});

describe("the log line a failed read writes", () => {
  it("leads with the code and carries no credential", () => {
    const described = describeDatabaseError(new Error(`connect ECONNREFUSED ${SESSION_POOLER}`));

    expect(described.startsWith("DB_CONNECT_FAILED: ")).toBe(true);
    expect(described).not.toContain("postgres.cyqtaydtfuwaexjkuynq");
  });
});
