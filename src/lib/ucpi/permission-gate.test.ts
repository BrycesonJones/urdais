import { describe, expect, it } from "vitest";

import { authorizeProductionRequest } from "@/lib/ucpi/collector";
import { permitted, REGISTRY_TODAY } from "@/lib/ucpi/fixtures";
import { REGISTRY_SNAPSHOT_2026_09_13, assertProductionCollectionPermitted, describeCapability, productionCollectionPermitted } from "@/lib/ucpi/permission-gate";

describe("production permission gate", () => {
  it("permits no source in the registry as recorded on 13 September 2026", () => {
    for (const s of REGISTRY_SNAPSHOT_2026_09_13) {
      const e = productionCollectionPermitted(s);
      expect(e.permitted).toBe(false);
      if (!e.permitted) expect(e.reason).toBe("COLLECTION_NOT_PERMITTED");
    }
  });

  it("refuses Runpod and Lambda specifically, with the reason spelled out", () => {
    const runpod = REGISTRY_TODAY.find((s) => s.slug === "runpod-gpu-types")!;
    const lambda = REGISTRY_TODAY.find((s) => s.slug === "lambda-instance-types")!;
    expect(() => assertProductionCollectionPermitted(runpod)).toThrow(/collection not_permitted/);
    expect(() => assertProductionCollectionPermitted(lambda)).toThrow(/index use not_permitted/);
  });

  it("does not treat one permitted axis as permission", () => {
    const aws = REGISTRY_TODAY.find((s) => s.slug === "aws-price-list-bulk")!;
    expect(aws.termsReviewState).toBe("permitted");
    expect(productionCollectionPermitted(aws).permitted).toBe(false);
  });

  it("does not treat both axes permitted as permission without production approval", () => {
    expect(
      productionCollectionPermitted({ slug: "x", termsReviewState: "permitted", dataUseTermsState: "permitted", productionAccessState: "production_review_pending", writtenAgreementRequired: null })
        .permitted,
    ).toBe(false);
  });

  it("permits only when both axes are permitted and production is approved", () => {
    expect(productionCollectionPermitted(permitted("x")).permitted).toBe(true);
  });

  it("keeps adapter existence, technical support and production permission apart", () => {
    const runpod = REGISTRY_TODAY.find((s) => s.slug === "runpod-gpu-types")!;
    const cap = describeCapability({ adapterExists: true, technicallySupported: true, registry: runpod });
    expect(cap).toMatchObject({ adapterExists: true, technicallySupported: true, productionCollectionPermitted: false });
    expect(cap.registryDetail).toContain("production_blocked");
  });

  it("hands back a request only after the gate passes", () => {
    const request = { method: "GET" as const, url: "https://example.invalid/x", parameters: {}, requiredHeaders: ["Authorization"] };
    const lambda = REGISTRY_TODAY.find((s) => s.slug === "lambda-instance-types")!;
    expect(() => authorizeProductionRequest(request, lambda)).toThrow(/production collection refused/);
    expect(authorizeProductionRequest(request, permitted("lambda-instance-types"))).toBe(request);
  });
});
