import { describe, expect, it } from "vitest";

import { ACTIVATION_WORKFLOW, evaluateActivation, LAMBDA_ACTIVATION_2026_09_13, RUNPOD_ACTIVATION_2026_09_13, RUNPOD_ACTIVATION_2026_09_14, type ActivationInputs } from "@/lib/ucpi/activation";
import { SqlPersistence } from "@/lib/ucpi/runtime/persistence";

describe("activation workflow", () => {
  it("has fourteen ordered steps ending in collector activation, with production approval after both axes", () => {
    expect(ACTIVATION_WORKFLOW.map((s) => s.order)).toEqual([...Array(14)].map((_, i) => i + 1));
    const keys = ACTIVATION_WORKFLOW.map((s) => s.key);
    expect(keys.indexOf("collection_permitted")).toBeLessThan(keys.indexOf("production_approved"));
    expect(keys.indexOf("index_use_permitted")).toBeLessThan(keys.indexOf("production_approved"));
    expect(keys.indexOf("production_approved")).toBeLessThan(keys.indexOf("authenticated_validation_passed"));
    expect(keys[keys.length - 1]).toBe("collector_enabled");
  });

  it("neither candidate is ready for validation or production today", () => {
    for (const inputs of [RUNPOD_ACTIVATION_2026_09_13, LAMBDA_ACTIVATION_2026_09_13]) {
      const c = evaluateActivation(inputs);
      expect(c.items).toHaveLength(19);
      expect(c.readyForValidation).toBe(false);
      expect(c.readyForProduction).toBe(false);
      expect(c.items.find((i) => i.key === "collectorEnabled")!.status).toBe("fail");
    }
    expect(evaluateActivation(LAMBDA_ACTIVATION_2026_09_13).items.find((i) => i.key === "tenancy")!.status).toBe("pending");
    expect(evaluateActivation(RUNPOD_ACTIVATION_2026_09_13).items.find((i) => i.key === "tenancy")!.status).toBe("pass");
  });

  it("a checklist with every right and product item passing is validation-ready but not production-ready until validation passes", () => {
    const allPass = Object.fromEntries(Object.keys(RUNPOD_ACTIVATION_2026_09_13).filter((k) => k !== "provider" && k !== "notes").map((k) => [k, "pass"])) as Omit<ActivationInputs, "provider" | "notes">;
    const ready = evaluateActivation({ ...allPass, provider: "x", notes: {}, authenticatedValidationPassed: "pending", collectorEnabled: "pending" });
    expect(ready.readyForValidation).toBe(true);
    expect(ready.readyForProduction).toBe(false);
    expect(evaluateActivation({ ...allPass, provider: "x", notes: {} }).readyForProduction).toBe(true);
  });
});

describe("SQL persistence statements", () => {
  const sql = new SqlPersistence({ query: async () => ({ rows: [] }) }, { instrumentId: "i", instrumentSpecVersionId: "s", methodologyVersionId: "m", sourceInterfaceIdBySlug: new Map([["runpod-gpu-types", "iface"]]) });

  it("targets the pipeline tables with parameterized inserts and carries the permission reference", () => {
    const s = sql.retrievalStatement({
      id: "r1",
      sourceInterfaceSlug: "runpod-gpu-types",
      requestedAt: "2026-09-13T10:00:00Z",
      completedAt: "2026-09-13T10:00:01Z",
      responseStatus: 200,
      request: { method: "GET", url: "https://example.invalid", parameters: {}, requiredHeaders: ["Authorization"] },
      enumerationAssessment: "complete",
      retrievalPurpose: "production",
      permissionGrantId: "g1",
      responseHash: "a".repeat(64),
      responseBody: {},
      responseByteLength: 2,
      recordCount: 0,
      collectorIdentity: "t",
      calculationDate: "2026-09-13",
    });
    expect(s.text).toMatch(/^insert into pipeline\.source_retrievals/);
    expect(s.params).toContain("g1");
    expect(s.params).toContain("production");
    expect(s.text.match(/\$\d+/g)).toHaveLength(17);
    expect(s.text).not.toContain("Bearer");
  });

  it("the series query joins runs and publications and selects no participant or payload column", () => {
    const q = SqlPersistence.seriesQuery({ instrumentId: "i", country: "US", from: "2026-09-01", to: "2026-09-30" });
    expect(q.params).toEqual(["i", "US", "2026-09-01", "2026-09-30"]);
    expect(q.text).toContain("pipeline.regional_publications");
    expect(q.text).not.toMatch(/participants|raw_payload|representative_price|permission_grants/);
  });

  it("supersession is the only update it emits", () => {
    const s = sql.supersessionStatement("a", "b", "input correction", "2026-09-14T06:00:00Z");
    expect(s.text).toMatch(/^update pipeline\.regional_observations set superseded_by_id/);
    expect(s.text).toContain("superseded_by_id is null");
  });
});

describe("Runpod was refused, and the record says so", () => {
  it("is not ready for validation or production, and cannot become so", () => {
    const checklist = evaluateActivation(RUNPOD_ACTIVATION_2026_09_14);
    expect(checklist.readyForValidation).toBe(false);
    expect(checklist.readyForProduction).toBe(false);
  });

  it("records the answer as a refusal rather than an outstanding request", () => {
    // The failure this guards against is a record that still reads "pending"
    // after the provider has said no, which invites exactly the wrong next move.
    const checklist = evaluateActivation(RUNPOD_ACTIVATION_2026_09_14);
    const written = checklist.items.find((row) => row.key === "writtenPermissionOrAgreement")!;
    expect(written.status).toBe("fail");
    expect(written.detail).toContain("refused");
    expect(checklist.items.some((row) => row.status === "pending")).toBe(false);
  });

  it("keeps the 13 September record, where the request was still open", () => {
    const before = evaluateActivation(RUNPOD_ACTIVATION_2026_09_13);
    expect(before.items.find((row) => row.key === "writtenPermissionOrAgreement")!.status).toBe("pending");
  });

  it("keeps the product findings that were true when gathered", () => {
    const checklist = evaluateActivation(RUNPOD_ACTIVATION_2026_09_14);
    for (const key of ["productId", "tenancy", "availabilityGrade3", "countryMapping", "legalEntitySeeded"]) {
      expect(checklist.items.find((row) => row.key === key)!.status).toBe("pass");
    }
  });
});
