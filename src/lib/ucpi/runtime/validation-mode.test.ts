import { describe, expect, it } from "vitest";

import { LAMBDA_TENANCY_DOCUMENTED_SYNTHETIC, normalizationContext, REGISTRY_TODAY } from "@/lib/ucpi/fixtures";
import { InMemoryPersistence } from "@/lib/ucpi/runtime/persistence";
import { lambdaInput, runpodInput } from "@/lib/ucpi/runtime/test-support";
import { validateLambda, validateRunpod } from "@/lib/ucpi/runtime/validation-mode";

describe("first authenticated validation mode", () => {
  it("runs Runpod checks against the live shape, persists a validation retrieval, and creates no run or publication", async () => {
    const input = runpodInput();
    const { mode: _mode, ...rest } = input;
    void _mode;
    const report = await validateRunpod(rest);
    const p = input.persistence as InMemoryPersistence;
    expect(p.retrievals[0]!.retrievalPurpose).toBe("validation");
    expect(p.runs).toHaveLength(0);
    expect(p.publications).toHaveLength(0);
    const byName = Object.fromEntries(report.checks.map((c) => [c.check, c.outcome]));
    expect(byName).toMatchObject({ endpoint_reachable: "pass", h100_sxm_product_present: "pass", min_pod_gpu_count: "pass", datacenter_list: "pass", price_fields: "pass", secure_community_handling: "pass", bundle_data: "pass", observations_eligible: "pass", non_bid_price_confirmed: "pending" });
    expect(report.passed).toBe(false); // the non-bid confirmation stays pending until compared with the GraphQL field
    expect(input.events.ofType("validation_check").length).toBe(report.checks.length);
  });

  it("reports minPodGpuCount and bundle as pending when the companion details are absent", async () => {
    const input = runpodInput({ companion: new Map() });
    const { mode: _mode, ...rest } = input;
    void _mode;
    const report = await validateRunpod(rest);
    const byName = Object.fromEntries(report.checks.map((c) => [c.check, c.outcome]));
    expect(byName.min_pod_gpu_count).toBe("pending");
    expect(byName.bundle_data).toBe("pending");
  });

  it("refuses to validate a blocked source", async () => {
    const input = runpodInput({ registry: REGISTRY_TODAY.find((s) => s.slug === "runpod-gpu-types")! });
    const { mode: _mode, ...rest } = input;
    void _mode;
    const report = await validateRunpod(rest);
    expect(report.retrievalId).toBeNull();
    expect(report.checks[0]).toMatchObject({ check: "endpoint_reachable", outcome: "fail" });
    expect(report.checks[0]!.detail).toContain("PreflightError");
    expect((input.persistence as InMemoryPersistence).retrievals).toHaveLength(0);
  });

  it("Lambda: tenancy stays pending without a statement, and eligibility follows it", async () => {
    const input = lambdaInput();
    const { mode: _mode, ...rest } = input;
    void _mode;
    const report = await validateLambda(rest);
    const byName = Object.fromEntries(report.checks.map((c) => [c.check, c.outcome]));
    expect(byName).toMatchObject({ endpoint_reachable: "pass", gpu_1x_h100_sxm5_present: "pass", region_presence: "pass", price_tiers: "pass", product_specs: "pass", h100_tenancy_evidence: "pending", observations_eligible: "pending" });
    expect(report.passed).toBe(false);
  });

  it("Lambda: with a statement supplied, every check passes", async () => {
    const input = lambdaInput({ context: normalizationContext({ tenancyEvidence: new Map([["lambda", LAMBDA_TENANCY_DOCUMENTED_SYNTHETIC]]) }) });
    const { mode: _mode, ...rest } = input;
    void _mode;
    const report = await validateLambda(rest);
    expect(report.passed).toBe(true);
  });
});
