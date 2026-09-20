import { describe, expect, it } from "vitest";

import { checkPlanningProductionGate, identifyDatabase } from "@/lib/power-delivery/planning/production-guard";

const PROD = "cyqtaydtfuwaexjkuynq";
const DEV = "scwwjoyouohfrwylalha";
const prodUrl = `postgresql://postgres.${PROD}:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
const devUrl = `postgresql://postgres.${DEV}:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
const localUrl = "postgresql://postgres@localhost:54329/urdais_local";

const MIGRATIONS = ["20260913060000_schemas.sql", "20260922100000_planning_source_monitoring.sql"];
const ledgerFor = (files: string[]) => files.map((file) => ({
  version: file.slice(0, file.indexOf("_")), name: file.slice(file.indexOf("_") + 1, -4),
}));

const gate = (over: Partial<Parameters<typeof checkPlanningProductionGate>[0]> = {}) =>
  checkPlanningProductionGate({
    url: prodUrl, expectedProjectRef: PROD, migrationFilenames: MIGRATIONS,
    ledger: ledgerFor(MIGRATIONS), write: true, ...over,
  });

describe("identifying the target database", () => {
  it("reads the project reference from a pooler user and a direct host", () => {
    expect(identifyDatabase(prodUrl)).toMatchObject({ projectRef: PROD, isLocal: false });
    expect(identifyDatabase(`postgresql://postgres:pw@db.${PROD}.supabase.co:5432/postgres`))
      .toMatchObject({ projectRef: PROD });
  });

  it("recognises the local harness", () => {
    expect(identifyDatabase(localUrl)).toMatchObject({ projectRef: null, isLocal: true, host: "localhost" });
  });
});

describe("the planning production gate", () => {
  it("passes a named project with a current schema", () => {
    expect(gate()).toMatchObject({ ok: true, refusals: [], mode: "write", pendingMigrations: [] });
  });

  it("refuses the development project when production was named", () => {
    const result = gate({ url: devUrl });
    expect(result.ok).toBe(false);
    expect(result.refusals[0]).toContain(`targets project ${DEV}`);
    expect(result.refusals[0]).toContain(`expects ${PROD}`);
  });

  it("refuses a remote database the operator did not name", () => {
    const result = gate({ expectedProjectRef: null });
    expect(result.ok).toBe(false);
    expect(result.refusals[0]).toMatch(/no expected project reference was given/);
  });

  it("refuses any database whose schema is behind the repository", () => {
    const result = gate({ ledger: ledgerFor(["20260913060000_schemas.sql"]) });
    expect(result.ok).toBe(false);
    expect(result.pendingMigrations).toEqual(["20260922100000_planning_source_monitoring.sql"]);
    expect(result.refusals[0]).toMatch(/1 migration\(s\) in the repository are not applied/);
    expect(result.refusals[0]).toMatch(/would write rows the schema has not agreed to/);
  });

  it("refuses a ledger that carries a migration under a different identity", () => {
    const result = gate({
      ledger: [
        { version: "20260913060000", name: "schemas" },
        { version: "20260922100000", name: "planning_source_monitoring_prod" },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.driftedMigrations).toEqual(["20260922100000_planning_source_monitoring.sql"]);
  });

  it("needs no project confirmation for the local harness", () => {
    expect(gate({ url: localUrl, expectedProjectRef: null })).toMatchObject({ ok: true, refusals: [] });
  });

  it("says which mode it is in, so a dry run cannot be misread as a write", () => {
    expect(gate({ write: false }).mode).toBe("dry_run");
    expect(gate({ write: true }).mode).toBe("write");
  });

  it("never echoes the connection string or its password", () => {
    const result = gate({ url: devUrl, ledger: ledgerFor(["20260913060000_schemas.sql"]) });
    const printed = JSON.stringify(result);
    expect(printed).not.toContain("secret");
    expect(printed).not.toContain("postgresql://");
  });
});
