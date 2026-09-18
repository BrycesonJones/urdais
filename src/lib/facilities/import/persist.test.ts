/**
 * Writing a batch: one transaction, nothing partial, and the same result twice.
 *
 * The executor here is a recorder rather than a database — the database's own
 * rules are exercised in supabase/tests/390_map_facility_foundation.sql. What
 * these fixtures check is the shape of what the importer sends: that a failure
 * anywhere rolls back everything, that a plan carrying errors never reaches a
 * `begin`, and that a facility is addressed by its research key and by nothing
 * that could be mistaken for it.
 */

import { describe, expect, it } from "vitest";

import { parseFacilityImportDocument } from "@/lib/facilities/contract";
import { buildImportPlan } from "@/lib/facilities/import/plan";
import { applyImportPlan, loadExistingResearchKeys } from "@/lib/facilities/import/persist";

type Call = { text: string; values: readonly unknown[] };

/**
 * Records every statement. Facility inserts return a deterministic id and a
 * fingerprint the caller controls, so "inserted" and "unchanged" can be
 * distinguished without a real database.
 */
function recorder(
  options: {
    existingKeys?: readonly string[];
    fingerprint?: (key: string) => string;
    failOn?: RegExp;
    methodologyVersionId?: string | null;
    priorMethodologyVersionId?: string | null;
  } = {},
) {
  const calls: Call[] = [];
  const existing = new Set(options.existingKeys ?? []);
  let evidenceCounter = 0;
  return {
    calls,
    statements: () => calls.map((call) => call.text.trim().split("\n")[0]!.trim()),
    async query(text: string, values: readonly unknown[]) {
      calls.push({ text, values });
      if (options.failOn?.test(text)) throw new Error("fixture failure");

      if (/from reference\.methodology_versions/.test(text)) {
        const id = options.methodologyVersionId === undefined ? "methodology-1" : options.methodologyVersionId;
        return { rows: id === null ? [] : [{ id }] };
      }
      if (/^\s*select id::text as id,[\s\S]*from reference\.facilities where research_key/.test(text)) {
        const key = String(values[0]);
        return existing.has(key)
          ? { rows: [{ id: `id-${key}`, fingerprint: options.fingerprint?.(key) ?? "before", methodology_version_id: options.priorMethodologyVersionId ?? null }] }
          : { rows: [] };
      }
      if (/insert into reference\.facilities/.test(text)) {
        const key = String(values[0]);
        const id = options.methodologyVersionId === undefined ? "methodology-1" : options.methodologyVersionId;
        return { rows: [{ id: `id-${key}`, fingerprint: options.fingerprint?.(key) ?? "after", methodology_version_id: id }] };
      }
      if (/insert into reference\.facility_evidence \(/.test(text)) {
        evidenceCounter += 1;
        return { rows: [{ id: `evidence-${evidenceCounter}` }] };
      }
      if (/^\s*select id::text as id from reference\.facilities where research_key/.test(text)) {
        const key = String(values[0]);
        return existing.has(key) ? { rows: [{ id: `id-${key}` }] } : { rows: [] };
      }
      if (/select research_key from reference\.facilities/.test(text)) {
        return { rows: [...existing].map((key) => ({ research_key: key })) };
      }
      return { rows: [] };
    },
  };
}

function facility(overrides: Record<string, unknown> = {}) {
  return {
    researchKey: "fixture-campus",
    canonicalName: "Fixture Campus",
    category: "data_center",
    aliases: [{ alias: "The Fixture" }],
    location: { latitude: 64.23, longitude: 27.69, coordinatePrecision: "building", countryCode: "FI" },
    lifecycle: { status: "operational" },
    facts: [{ key: "capacity_mw", numericValue: 400, unit: "MW", evidenceUrl: "https://example.invalid/campus" }],
    evidence: [
      {
        publisher: "Fixture Publisher",
        title: "Fixture page",
        url: "https://example.invalid/campus",
        documentType: "company_facility_page",
        claims: [
          { field: "location", statement: "Fixture Street 1" },
          { field: "capacity", statement: "400 MW" },
        ],
      },
    ],
    quality: { confidence: "high", lastVerifiedDate: "2026-09-17", reviewNotes: [] },
    requestedPublicationState: "published",
    ...overrides,
  };
}

function plan(facilities: Array<Record<string, unknown>> = [facility()], relationships: Array<Record<string, unknown>> = [], existing: string[] = []) {
  const { document, issues } = parseFacilityImportDocument({
    contractVersion: "urdais.map.facility-import/2",
    datasetName: "Fixture dataset",
    researchDocument: "FIXTURE.md",
    generatedAt: "2026-09-17",
    facilities,
    relationships,
  });
  if (!document) throw new Error(`fixture failed the contract: ${JSON.stringify(issues)}`);
  return buildImportPlan(document, { existingResearchKeys: existing, today: new Date("2026-09-17T00:00:00Z") });
}

describe("applyImportPlan", () => {
  it("writes the whole batch inside one transaction", async () => {
    const sql = recorder();
    await applyImportPlan(sql, plan());
    const statements = sql.statements();
    // The methodology lookup happens before the transaction opens, on purpose:
    // a batch that cannot name its rules should fail before anything is begun.
    expect(statements.filter((statement) => statement === "begin")).toHaveLength(1);
    expect(statements.at(-1)).toBe("commit");
    expect(statements.filter((statement) => statement === "rollback")).toHaveLength(0);
    const begin = statements.indexOf("begin");
    expect(statements.slice(0, begin).every((statement) => statement.startsWith("select"))).toBe(true);
    expect(statements.slice(begin).some((statement) => statement.startsWith("insert into reference.facilities"))).toBe(true);
  });

  it("stamps every published row with the approved methodology version, and refuses to publish without one", async () => {
    const sql = recorder();
    const result = await applyImportPlan(sql, plan());
    expect(result.methodologyVersionId).toBe("methodology-1");
    const insert = sql.calls.find((call) => /insert into reference\.facilities/.test(call.text))!;
    expect(insert.values).toContain("methodology-1");

    // Nothing publishes under rules nobody approved.
    const unapproved = recorder({ methodologyVersionId: null });
    await expect(applyImportPlan(unapproved, plan())).rejects.toThrow("nothing publishes under rules nobody approved");
    expect(unapproved.statements()).not.toContain("begin");
  });

  it("reports a record re-approved under a different methodology version rather than letting it pass as an edit", async () => {
    // Re-approving under today's rules is a legitimate thing for an import to
    // do. Doing it without saying so is not: a reader would have no way to tell
    // a restamped record from one whose address changed.
    const sql = recorder({ existingKeys: ["fixture-campus"], priorMethodologyVersionId: "methodology-0", fingerprint: () => "before" });
    const result = await applyImportPlan(sql, plan());
    expect(result.restamped).toEqual([{ researchKey: "fixture-campus", from: "methodology-0", to: "methodology-1" }]);
  });

  it("reports nothing restamped when the version has not moved", async () => {
    const sql = recorder({ existingKeys: ["fixture-campus"], priorMethodologyVersionId: "methodology-1", fingerprint: () => "same" });
    const result = await applyImportPlan(sql, plan());
    expect(result.restamped).toEqual([]);
    expect(result.unchanged).toEqual(["fixture-campus"]);
  });

  it("writes a facility's AI relevance, defaulting an absent one to unknown", async () => {
    const sql = recorder();
    await applyImportPlan(sql, plan());
    const insert = sql.calls.find((call) => /insert into reference\.facilities/.test(call.text))!;
    expect(insert.values).toContain("unknown");

    const assessed = recorder();
    await applyImportPlan(assessed, plan([facility({ aiRelevance: "no_documented_ai" })]));
    const stated = assessed.calls.find((call) => /insert into reference\.facilities/.test(call.text))!;
    expect(stated.values).toContain("no_documented_ai");
  });

  it("leaves a research record unstamped, because no rule has been applied to it", async () => {
    const sql = recorder();
    const research = facility({ requestedPublicationState: "research" });
    await applyImportPlan(sql, plan([research]));
    const insert = sql.calls.find((call) => /insert into reference\.facilities/.test(call.text))!;
    expect(insert.values).not.toContain("methodology-1");
  });

  it("refuses a plan carrying errors without opening a transaction at all", async () => {
    const broken = plan([facility({ requestedPublicationState: "published", location: { countryCode: "FI" } })]);
    expect(broken.errors.length).toBeGreaterThan(0);
    const sql = recorder();
    await expect(applyImportPlan(sql, broken)).rejects.toThrow("nothing was written");
    expect(sql.calls).toHaveLength(0);
  });

  it("rolls the whole batch back when any statement fails, writing nothing", async () => {
    const sql = recorder({ failOn: /insert into reference\.facility_evidence_claims/ });
    await expect(applyImportPlan(sql, plan())).rejects.toThrow("fixture failure");
    const statements = sql.statements();
    expect(statements).toContain("rollback");
    expect(statements).not.toContain("commit");
  });

  it("addresses a facility by its research key, and by nothing else", async () => {
    const sql = recorder();
    await applyImportPlan(sql, plan());
    const insert = sql.calls.find((call) => /insert into reference\.facilities/.test(call.text))!;
    expect(insert.text).toContain("on conflict (research_key) do update set");
    // Nothing in the write path matches on a name or a position.
    for (const call of sql.calls) {
      expect(call.text).not.toMatch(/where\s+canonical_name\s*=/);
      expect(call.text).not.toMatch(/where\s+latitude\s*=/);
    }
  });

  it("reports a first run as inserted and an unchanged re-run as unchanged", async () => {
    const first = recorder();
    const inserted = await applyImportPlan(first, plan());
    expect(inserted.inserted).toEqual(["fixture-campus"]);
    expect(inserted.updated).toEqual([]);
    expect(inserted.unchanged).toEqual([]);

    // The same row, already present, with an unchanged fingerprint.
    const second = recorder({ existingKeys: ["fixture-campus"], fingerprint: () => "same" });
    const again = await applyImportPlan(second, plan());
    expect(again.unchanged).toEqual(["fixture-campus"]);
    expect(again.inserted).toEqual([]);
  });

  it("reports a changed record as updated", async () => {
    let seen = 0;
    const sql = recorder({ existingKeys: ["fixture-campus"], fingerprint: () => (seen++ === 0 ? "before" : "after") });
    const result = await applyImportPlan(sql, plan());
    expect(result.updated).toEqual(["fixture-campus"]);
  });

  it("replaces a facility's dependants rather than accumulating them, in an order the foreign keys allow", async () => {
    const sql = recorder();
    await applyImportPlan(sql, plan());
    const deletes = sql.calls.filter((call) => call.text.startsWith("delete from")).map((call) => call.text.split(" ")[2]);
    // Facts reference evidence, and relationships reference evidence, so both
    // are cleared before the evidence they point at.
    expect(deletes).toEqual([
      "reference.facility_facts",
      "reference.facility_aliases",
      "reference.facility_relationships",
      "reference.facility_evidence",
    ]);
  });

  it("writes each claim and each fact against the evidence that carries it", async () => {
    const sql = recorder();
    const result = await applyImportPlan(sql, plan());
    expect(result.evidence).toBe(1);
    expect(result.claims).toBe(2);
    expect(result.facts).toBe(1);
    expect(result.aliases).toBe(1);
    const fact = sql.calls.find((call) => /insert into reference\.facility_facts/.test(call.text))!;
    expect(fact.values).toContain("evidence-1");
  });

  it("writes relationships with the evidence their source facility carries", async () => {
    const other = facility({ researchKey: "fixture-other", canonicalName: "Fixture Other", facts: [] });
    const sql = recorder();
    const result = await applyImportPlan(
      sql,
      plan([facility(), other], [{ fromResearchKey: "fixture-campus", toResearchKey: "fixture-other", type: "hosted_by", evidenceUrl: "https://example.invalid/campus" }]),
    );
    expect(result.relationships).toBe(1);
    const edge = sql.calls.find((call) => /insert into reference\.facility_relationships/.test(call.text) && /values/.test(call.text))!;
    expect(edge.values.slice(0, 3)).toEqual(["id-fixture-campus", "id-fixture-other", "hosted_by"]);
    expect(edge.values[3]).toBe("evidence-1");
  });

  it("resolves an edge into a facility the database already holds", async () => {
    const sql = recorder({ existingKeys: ["earlier-batch"] });
    const result = await applyImportPlan(
      sql,
      plan([facility()], [{ fromResearchKey: "fixture-campus", toResearchKey: "earlier-batch", type: "hosted_by" }], ["earlier-batch"]),
    );
    expect(result.relationships).toBe(1);
  });
});

describe("loadExistingResearchKeys", () => {
  it("returns the keys the database holds, so a batch may point outside itself", async () => {
    const sql = recorder({ existingKeys: ["a-campus", "b-cluster"] });
    expect([...(await loadExistingResearchKeys(sql))].sort()).toEqual(["a-campus", "b-cluster"]);
  });
});
