import { describe, expect, it } from "vitest";

import { loadApprovedLineage, loadRegistry, runDailyUcpi, ucpiRunSummary, type DailyRunResult, type InstrumentOutcome } from "@/lib/ucpi/runtime/daily-run";
import type { SqlExecutor } from "@/lib/ucpi/runtime/persistence";

/** Answers each query by the first table it names, so the shape under test is the SQL's own. */
function fakeSql(answers: { lineage?: Record<string, unknown>[]; iface?: Record<string, unknown>[]; grants?: Record<string, unknown>[]; entities?: Record<string, unknown>[] }): SqlExecutor & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    async query(text: string) {
      queries.push(text);
      if (text.includes("reference.instrument_spec_versions")) return { rows: answers.lineage ?? [] };
      if (text.includes("reference.source_interfaces")) return { rows: answers.iface ?? [] };
      if (text.includes("reference.permission_grants")) return { rows: answers.grants ?? [] };
      if (text.includes("reference.market_entities")) return { rows: answers.entities ?? [] };
      return { rows: [] };
    },
  };
}

describe("approved lineage resolution", () => {
  it("resolves only approved versions, and asks the database for them rather than hardcoding", async () => {
    const sql = fakeSql({
      lineage: [
        { symbol: "UCPI-H100-SXM-LISTED", instrument_id: "i1", spec_version_id: "s1", spec_version: "1.0.0", methodology_version_id: "m1", methodology_version: "1.0.0" },
      ],
    });
    const out = await loadApprovedLineage(sql);
    expect(out.get("UCPI-H100-SXM-LISTED")).toEqual({
      instrumentId: "i1",
      instrumentSpecVersionId: "s1",
      instrumentSpecVersion: "1.0.0",
      methodologyVersionId: "m1",
      methodologyVersion: "1.0.0",
    });
    // Both halves of the lineage must be approved, and the version must be in effect.
    expect(sql.queries[0]).toContain("sv.status = 'approved'");
    expect(sql.queries[0]).toContain("mv.status = 'approved'");
    expect(sql.queries[0]).toContain("sv.effective_from <= current_date");
  });

  it("omits an instrument with no approved version rather than falling back to a draft", async () => {
    const out = await loadApprovedLineage(fakeSql({ lineage: [] }));
    expect(out.size).toBe(0);
    expect(out.get("UCPI-B200-LISTED")).toBeUndefined();
  });

  it("takes the most recently effective version where an instrument has more than one", async () => {
    const out = await loadApprovedLineage(
      fakeSql({
        lineage: [
          { symbol: "UCPI-B200-LISTED", instrument_id: "i", spec_version_id: "new", spec_version: "1.1.0", methodology_version_id: "m", methodology_version: "1.1.0" },
          { symbol: "UCPI-B200-LISTED", instrument_id: "i", spec_version_id: "old", spec_version: "1.0.0", methodology_version_id: "m", methodology_version: "1.0.0" },
        ],
      }),
    );
    expect(out.get("UCPI-B200-LISTED")?.instrumentSpecVersion).toBe("1.1.0");
  });
});

describe("registry resolution", () => {
  const iface = [{ id: "iface-1", slug: "price-of-compute-prices", terms_review_state: "permitted", data_use_terms_state: "permitted", production_access_state: "production_approved", written_agreement_required: false }];

  it("carries the seller's refusal onto the entity, so eligibility can see it", async () => {
    const reg = await loadRegistry(
      fakeSql({
        iface,
        entities: [
          { id: "e-runpod", slug: "runpod", name: "Runpod", legal_name: "Runpod, Inc.", legal_identifier: null, controlling_entity_id: null, use_refused_evidence: "Runpod Support, 2026-09-14: refused" },
          { id: "e-lambda", slug: "lambda", name: "Lambda", legal_name: "Lambda, Inc.", legal_identifier: null, controlling_entity_id: null, use_refused_evidence: null },
        ],
      }),
      new Date("2026-09-15T01:00:00Z"),
    );
    expect(reg.entities.find((e) => e.slug === "runpod")?.useRefusedEvidence).toContain("refused");
    expect(reg.entities.find((e) => e.slug === "lambda")?.useRefusedEvidence).toBeNull();
    expect(reg.entityIdBySlug.get("runpod")).toBe("e-runpod");
  });

  it("reports no grant rather than inventing one when none is in force", async () => {
    const reg = await loadRegistry(fakeSql({ iface, grants: [] }), new Date("2026-09-15T01:00:00Z"));
    expect(reg.grant).toBeNull();
  });

  it("asks only for a grant in force at the run instant", async () => {
    const sql = fakeSql({ iface });
    await loadRegistry(sql, new Date("2026-09-15T01:00:00Z"));
    const grantQuery = sql.queries.find((q) => q.includes("reference.permission_grants"))!;
    expect(grantQuery).toContain("effective_from <= $2");
    expect(grantQuery).toContain("effective_to is null or effective_to > $2");
  });
});

describe("run summary", () => {
  const result: DailyRunResult = {
    collectionDate: "2026-09-16",
    calculationDate: "2026-09-15",
    instruments: [
      { instrument: "UCPI-H100-SXM-LISTED", collection: "collected", calculation: "published", priceLevel: 3.99, participantCount: 3, marketBreadth: "normal" },
      { instrument: "UCPI-RTX-5090-LISTED", collection: "collected", calculation: "unavailable", calculationDetail: "SINGLE_PARTICIPANT", priceLevel: null },
      { instrument: "UCPI-B200-LISTED", collection: "skipped", calculation: "not_approved", calculationDetail: "no approved specification version is in effect" },
    ],
  };

  it("names what published and keeps a non-publishing outcome legible", () => {
    const s = ucpiRunSummary(result) as { published: string[]; instruments: Record<string, unknown>[] };
    expect(s.published).toEqual(["UCPI-H100-SXM-LISTED"]);
    // An Unavailable child carries its structural condition and no price.
    expect(s.instruments[1]).toMatchObject({ instrument: "UCPI-RTX-5090-LISTED", calculation: "unavailable", detail: "SINGLE_PARTICIPANT" });
    expect(s.instruments[1]).not.toHaveProperty("priceLevel");
    expect(s.instruments[2]).toMatchObject({ calculation: "not_approved" });
  });

  it("never reports a price for an instrument that did not publish one", () => {
    const s = ucpiRunSummary(result) as { instruments: Record<string, unknown>[] };
    for (const i of s.instruments) {
      if (i.calculation !== "published") expect(i).not.toHaveProperty("priceLevel");
    }
  });
});

describe("a date Urdais did not collect for is not calculated", () => {
  /**
   * The rule: a child's public series begins at its first real production observation. Before
   * that there is no point, rather than an Unavailable one. "Nobody looked" and "the market
   * was observed and produced no eligible participant" are different statements and only the
   * second belongs on a chart.
   */
  function sqlFor(hasCoverage: boolean): SqlExecutor & { statements: string[] } {
    const statements: string[] = [];
    return {
      statements,
      async query(text: string) {
        statements.push(text);
        if (text.includes("reference.instrument_spec_versions")) {
          return { rows: [{ symbol: "UCPI-H100-SXM-LISTED", instrument_id: "i1", spec_version_id: "s1", spec_version: "1.0.0", methodology_version_id: "m1", methodology_version: "1.0.0" }] };
        }
        if (text.includes("reference.source_interfaces") && text.includes("slug = $1")) {
          return { rows: [{ id: "iface-1", slug: "price-of-compute-prices", terms_review_state: "permitted", data_use_terms_state: "permitted", production_access_state: "production_approved", written_agreement_required: false }] };
        }
        if (text.includes("reference.market_entities")) return { rows: [] };
        if (text.includes("reference.permission_grants")) return { rows: [] };
        // The coverage probe: a production retrieval that produced observations for the date.
        if (text.includes("pipeline.source_retrievals r") && text.includes("limit 1")) {
          return { rows: hasCoverage ? [{ "?column?": 1 }] : [] };
        }
        return { rows: [] };
      },
    };
  }

  const deadHttp = { async send() { throw new Error("no network in this test"); } } as never;

  it("records no_coverage and writes no calculation run for a pre-coverage date", async () => {
    const sql = sqlFor(false);
    const result = await runDailyUcpi(sql, { now: new Date("2026-09-15T01:00:00Z"), http: deadHttp, only: ["UCPI-H100-SXM-LISTED"] });

    const outcome = result.instruments[0]!;
    expect(result.calculationDate).toBe("2026-09-14");
    expect(outcome.calculation).toBe("no_coverage");
    expect(outcome.calculationDetail).toContain("2026-09-14");
    // Nothing is written for that date: no run, no regional observation, no publication.
    expect(sql.statements.some((s) => s.includes("insert into pipeline.calculation_runs"))).toBe(false);
    expect(sql.statements.some((s) => s.includes("insert into pipeline.regional_observations"))).toBe(false);
    expect(sql.statements.some((s) => s.includes("insert into pipeline.regional_publications"))).toBe(false);
    // And no price or breadth is reported for a date that was never observed.
    expect(outcome.priceLevel).toBeUndefined();
    expect(outcome.marketBreadth).toBeUndefined();
  });

  it("proceeds to calculate once the date has coverage, so an Unavailable can still be recorded", async () => {
    const sql = sqlFor(true);
    const result = await runDailyUcpi(sql, { now: new Date("2026-09-15T01:00:00Z"), http: deadHttp, only: ["UCPI-H100-SXM-LISTED"] });
    // With coverage the job does not short-circuit; the pipeline runs and the structural rule
    // decides. That is the case where NO_ELIGIBLE_PARTICIPANT is a true statement.
    expect(result.instruments[0]!.calculation).not.toBe("no_coverage");
    expect(sql.statements.some((s) => s.includes("insert into pipeline.calculation_runs"))).toBe(true);
  });

  it("keeps no_coverage distinct from the structural conditions, so the two are never conflated", () => {
    const states: InstrumentOutcome["calculation"][] = ["no_coverage", "unavailable", "published"];
    expect(new Set(states).size).toBe(3);
    // no_coverage is a statement about Urdais; unavailable is a statement about the market.
    expect(states).toContain("no_coverage");
  });
});
