import { describe, expect, it } from "vitest";

import { identifyDatabaseTarget } from "@/lib/db/project-identity";

import { parseBackfillArgs, resolveBackfillTarget, type BackfillArgs, type BackfillEnv } from "./backfill-cli";

const PROD = "prodprodprodprodprod";
const DEV = "devdevdevdevdevdevde";
const OTHER = "otherotherotherother";
const SECRET = "s3cr%40t-p%2Fss";
const SECRET_DECODED = "s3cr@t-p/ss";

const sessionPooler = (ref: string) => `postgresql://postgres.${ref}:${SECRET}@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=/ca.crt`;
const transactionPooler = (ref: string) => `postgresql://postgres.${ref}:${SECRET}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
const directHost = (ref: string) => `postgresql://postgres:${SECRET}@db.${ref}.supabase.co:5432/postgres`;
const dedicatedPooler = (ref: string) => `postgresql://postgres:${SECRET}@db.${ref}.supabase.co:6543/postgres`;

const ENV: BackfillEnv = { SUPABASE_PRODUCTION_PROJECT_REF: PROD, SUPABASE_PROJECT_REF: DEV };

function args(overrides: Partial<BackfillArgs> = {}): BackfillArgs {
  return { start: null, end: null, dryRun: false, databaseUrl: null, acknowledgesProduction: false, ...overrides };
}

function parse(argv: string[]) {
  return parseBackfillArgs(argv);
}

function expectNoSecret(text: string) {
  expect(text).not.toContain(SECRET);
  expect(text).not.toContain(SECRET_DECODED);
  expect(text).not.toContain("s3cr");
  expect(text).not.toContain("sslrootcert");
}

describe("parseBackfillArgs", () => {
  it("accepts the documented flags", () => {
    const result = parse(["--start", "2026-10-03", "--end", "2026-10-05", "--dry-run", "--i-know-this-is-production"]);
    expect(result).toEqual({
      ok: true,
      args: { start: "2026-10-03", end: "2026-10-05", dryRun: true, databaseUrl: null, acknowledgesProduction: true },
    });
  });

  it("accepts no arguments", () => {
    expect(parse([])).toEqual({ ok: true, args: args() });
  });

  it("rejects --name=value instead of reading the flag as absent", () => {
    const result = parse(["--database-url=" + sessionPooler(PROD), "--i-know-this-is-production"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("--database-url <value>");
    expectNoSecret(result.error);
  });

  it("rejects an unknown or misspelt flag", () => {
    const result = parse(["--i-know-this-is-prod"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("unknown flag '--i-know-this-is-prod'");
    expect(result.error).toContain("--i-know-this-is-production");
  });

  it("rejects a value flag with no value", () => {
    expect(parse(["--database-url"])).toMatchObject({ ok: false, error: expect.stringContaining("--database-url needs a value") });
  });

  it("rejects a value flag followed by another flag rather than taking the flag as its value", () => {
    expect(parse(["--database-url", "--i-know-this-is-production"]))
      .toMatchObject({ ok: false, error: expect.stringContaining("--database-url needs a value") });
  });

  it("rejects an empty value, as an unset shell variable expands to", () => {
    expect(parse(["--database-url", ""])).toMatchObject({ ok: false, error: expect.stringContaining("empty value") });
  });

  it("rejects a positional argument without echoing a connection string", () => {
    const result = parse([sessionPooler(PROD)]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("unexpected argument");
    expectNoSecret(result.error);
  });

  it("rejects a repeated flag", () => {
    expect(parse(["--start", "2026-10-03", "--start", "2026-10-04"]))
      .toMatchObject({ ok: false, error: expect.stringContaining("more than once") });
  });

  it("rejects a malformed or impossible date", () => {
    expect(parse(["--start", "2026-10-3"])).toMatchObject({ ok: false });
    expect(parse(["--end", "2026-02-30"])).toMatchObject({ ok: false });
    expect(parse(["--end", "yesterday"])).toMatchObject({ ok: false });
  });

  it("rejects a value on a boolean flag", () => {
    expect(parse(["--dry-run=true"])).toMatchObject({ ok: false });
    expect(parse(["--dry-run", "true"])).toMatchObject({ ok: false, error: expect.stringContaining("unexpected argument 'true'") });
  });
});

describe("identifyDatabaseTarget", () => {
  it("reads the project from the pooler username on both pooler ports", () => {
    expect(identifyDatabaseTarget(sessionPooler(PROD))).toMatchObject({ ok: true, target: { kind: "supabase", projectRef: PROD, port: "5432" } });
    expect(identifyDatabaseTarget(transactionPooler(PROD))).toMatchObject({ ok: true, target: { kind: "supabase", projectRef: PROD, port: "6543" } });
  });

  it("reads the project from a non-postgres role on the pooler", () => {
    const url = `postgresql://urdais_reader.${PROD}:${SECRET}@aws-1-eu-west-2.pooler.supabase.com:6543/postgres`;
    expect(identifyDatabaseTarget(url)).toMatchObject({ ok: true, target: { kind: "supabase", projectRef: PROD } });
  });

  it("reads the project from the direct and dedicated-pooler hostnames", () => {
    expect(identifyDatabaseTarget(directHost(PROD))).toMatchObject({ ok: true, target: { kind: "supabase", projectRef: PROD } });
    expect(identifyDatabaseTarget(dedicatedPooler(PROD))).toMatchObject({ ok: true, target: { kind: "supabase", projectRef: PROD, port: "6543" } });
  });

  it("refuses a connection whose host and username name different projects", () => {
    const url = `postgresql://postgres.${DEV}:${SECRET}@db.${PROD}.supabase.co:5432/postgres`;
    expect(identifyDatabaseTarget(url)).toMatchObject({ ok: false, reason: expect.stringContaining("two projects") });
  });

  it("does not identify the pooler without a tenant in the username", () => {
    const url = `postgresql://postgres:${SECRET}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
    expect(identifyDatabaseTarget(url)).toMatchObject({ ok: true, target: { kind: "unidentified" } });
  });

  it("does not trust a tenant-shaped username on a host that is not Supabase", () => {
    const url = `postgresql://postgres.${PROD}:${SECRET}@db.example.com:5432/postgres`;
    expect(identifyDatabaseTarget(url)).toMatchObject({ ok: true, target: { kind: "unidentified" } });
  });

  it("recognises the local harness", () => {
    expect(identifyDatabaseTarget("postgresql://postgres@localhost:54329/urdais_local"))
      .toEqual({ ok: true, target: { kind: "local", host: "localhost", port: "54329", database: "urdais_local" } });
    expect(identifyDatabaseTarget("postgresql://postgres@[::1]:54329/urdais_local")).toMatchObject({ ok: true, target: { kind: "local" } });
  });

  it("refuses, without echoing it, a password whose unencoded slash shifts it into the database name", () => {
    const url = `postgresql://postgres.${PROD}:1234/s3cr@t@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
    const result = identifyDatabaseTarget(url);
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("URL-encoded") });
    if (!result.ok) expectNoSecret(result.reason);
  });

  it("rejects what is not a postgres URL", () => {
    expect(identifyDatabaseTarget("not a url")).toMatchObject({ ok: false });
    expect(identifyDatabaseTarget(`https://postgres.${PROD}:x@aws-0-us-east-1.pooler.supabase.com/`)).toMatchObject({ ok: false });
  });
});

describe("resolveBackfillTarget", () => {
  describe("missing environment", () => {
    it("refuses the production acknowledgement when no database was given, instead of running on localhost", () => {
      const result = resolveBackfillTarget(args({ acknowledgesProduction: true }), ENV);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain("neither --database-url nor UTVI_DATABASE_URL is set");
      expect(result.error).toContain("localhost:54329/urdais_local");
    });

    it("still defaults to the local harness when nothing claims production", () => {
      expect(resolveBackfillTarget(args(), {})).toMatchObject({
        ok: true,
        target: { environment: "local", source: "local default", description: "localhost:54329/urdais_local" },
      });
    });

    it("refuses an empty UTVI_DATABASE_URL rather than falling back", () => {
      expect(resolveBackfillTarget(args({ acknowledgesProduction: true }), { ...ENV, UTVI_DATABASE_URL: "  " }))
        .toMatchObject({ ok: false, error: expect.stringContaining("UTVI_DATABASE_URL is set but empty") });
    });

    it("refuses a malformed UTVI_DATABASE_URL rather than falling back", () => {
      const result = resolveBackfillTarget(args({ acknowledgesProduction: true }), { ...ENV, UTVI_DATABASE_URL: `postgres.${PROD}:${SECRET}@pooler` });
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining("did not fall back") });
      if (!result.ok) expectNoSecret(result.error);
    });

    it("refuses a Supabase target when SUPABASE_PRODUCTION_PROJECT_REF is not set", () => {
      const result = resolveBackfillTarget(args({ acknowledgesProduction: true }), { SUPABASE_PROJECT_REF: DEV, UTVI_DATABASE_URL: sessionPooler(PROD) });
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining("SUPABASE_PRODUCTION_PROJECT_REF is not set") });
    });

    it("refuses a malformed SUPABASE_PRODUCTION_PROJECT_REF", () => {
      expect(resolveBackfillTarget(args(), { SUPABASE_PRODUCTION_PROJECT_REF: "prod" }))
        .toMatchObject({ ok: false, error: expect.stringContaining("is not a Supabase project reference") });
    });

    it("refuses when the production and development refs are the same project", () => {
      expect(resolveBackfillTarget(args(), { SUPABASE_PRODUCTION_PROJECT_REF: PROD, SUPABASE_PROJECT_REF: PROD }))
        .toMatchObject({ ok: false, error: expect.stringContaining("same project") });
    });
  });

  describe("incorrect project references", () => {
    it("refuses a project that is neither production nor development", () => {
      const result = resolveBackfillTarget(args({ acknowledgesProduction: true }), { ...ENV, UTVI_DATABASE_URL: sessionPooler(OTHER) });
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining(`project ${OTHER}, which is neither`) });
    });

    it("refuses a remote host that identifies no project, even with the acknowledgement", () => {
      const result = resolveBackfillTarget(args({ acknowledgesProduction: true }), { ...ENV, UTVI_DATABASE_URL: `postgresql://postgres:${SECRET}@10.0.0.5:5432/postgres` });
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining("does not identify a Supabase project") });
    });

    it("refuses a production target without the acknowledgement", () => {
      expect(resolveBackfillTarget(args(), { ...ENV, UTVI_DATABASE_URL: sessionPooler(PROD) }))
        .toMatchObject({ ok: false, error: expect.stringContaining("pass --i-know-this-is-production") });
    });

    it("compares references case-insensitively", () => {
      expect(resolveBackfillTarget(args({ acknowledgesProduction: true }), { ...ENV, SUPABASE_PRODUCTION_PROJECT_REF: PROD.toUpperCase(), UTVI_DATABASE_URL: sessionPooler(PROD) }))
        .toMatchObject({ ok: true, target: { environment: "production" } });
    });
  });

  describe("development targets", () => {
    it("accepts UrdaisDev without the production acknowledgement", () => {
      expect(resolveBackfillTarget(args(), { ...ENV, UTVI_DATABASE_URL: sessionPooler(DEV) }))
        .toMatchObject({ ok: true, target: { environment: "development", projectRef: DEV } });
    });

    it("refuses UrdaisDev when the operator claimed production", () => {
      const result = resolveBackfillTarget(args({ acknowledgesProduction: true }), { ...ENV, UTVI_DATABASE_URL: sessionPooler(DEV) });
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining(`development project ${DEV}, not production ${PROD}`) });
    });

    it("refuses an unconfirmable Supabase target when no development ref is set", () => {
      expect(resolveBackfillTarget(args(), { SUPABASE_PRODUCTION_PROJECT_REF: PROD, UTVI_DATABASE_URL: sessionPooler(DEV) }))
        .toMatchObject({ ok: false, error: expect.stringContaining("which is not set") });
    });
  });

  describe("valid production connections", () => {
    it.each([
      ["session pooler", sessionPooler(PROD), "aws-0-us-east-1.pooler.supabase.com:5432/postgres"],
      ["transaction pooler", transactionPooler(PROD), "aws-0-us-east-1.pooler.supabase.com:6543/postgres"],
      ["direct host", directHost(PROD), `db.${PROD}.supabase.co:5432/postgres`],
      ["dedicated pooler", dedicatedPooler(PROD), `db.${PROD}.supabase.co:6543/postgres`],
    ])("accepts the %s from UTVI_DATABASE_URL", (_label, url, description) => {
      const result = resolveBackfillTarget(args({ acknowledgesProduction: true }), { ...ENV, UTVI_DATABASE_URL: url });
      expect(result).toEqual({
        ok: true,
        target: { connectionString: url, source: "UTVI_DATABASE_URL", environment: "production", projectRef: PROD, description },
      });
      if (result.ok) expectNoSecret(result.target.description);
    });

    it("prefers --database-url over UTVI_DATABASE_URL", () => {
      expect(resolveBackfillTarget(args({ acknowledgesProduction: true, databaseUrl: sessionPooler(PROD) }), { ...ENV, UTVI_DATABASE_URL: sessionPooler(DEV) }))
        .toMatchObject({ ok: true, target: { source: "--database-url", environment: "production" } });
    });

    it("refuses a username/host disagreement without leaking the password", () => {
      const url = `postgresql://postgres.${DEV}:${SECRET}@db.${PROD}.supabase.co:5432/postgres`;
      const result = resolveBackfillTarget(args({ acknowledgesProduction: true }), { ...ENV, UTVI_DATABASE_URL: url });
      expect(result.ok).toBe(false);
      if (!result.ok) expectNoSecret(result.error);
    });
  });
});
