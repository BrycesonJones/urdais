import { describe, expect, it } from "vitest";

import { evaluateLifecycle, lifecycleCarriesLevel } from "@/lib/ugai/read/lifecycle";
import {
  unconfiguredUgaiReadModel,
  validatePublicUgai,
  validatePublicUgaiSeries,
} from "@/lib/ugai/read/read-model";

const passing = (name: string) => ({ checkName: name, result: "passed" as const, parameterKey: null, basis: "ok" });

describe("lifecycle", () => {
  it("is not_initialized when nothing has ever been published", () => {
    const out = evaluateLifecycle({
      hasBaseObservation: false,
      latestPublishedAt: null,
      checks: [],
      staleToleranceApproved: false,
    });
    expect(out.lifecycle).toBe("not_initialized");
    expect(out.publicReason).toMatch(/has not yet begun live publication/);
    expect(lifecycleCarriesLevel(out.lifecycle)).toBe(false);
  });

  it("is blocked when a published series exists but a check is not passing", () => {
    const out = evaluateLifecycle({
      hasBaseObservation: true,
      latestPublishedAt: "2026-09-17T00:00:00Z",
      checks: [passing("divisor_valid"), { checkName: "source_rights_permit_publication", result: "failed", parameterKey: null, basis: "x" }],
      staleToleranceApproved: false,
    });
    expect(out.lifecycle).toBe("blocked");
    expect(out.unmetChecks).toEqual(["source_rights_permit_publication"]);
  });

  it("is live when everything passes", () => {
    const out = evaluateLifecycle({
      hasBaseObservation: true,
      latestPublishedAt: "2026-09-17T00:00:00Z",
      checks: [passing("divisor_valid"), passing("lineage_complete")],
      staleToleranceApproved: false,
      now: "2026-09-17T18:00:00Z",
    });
    expect(out.lifecycle).toBe("live");
  });

  it("never claims delayed while the stale tolerance is unresolved", () => {
    // The methodology leaves the tolerance unresolved, so there is no threshold to be past.
    // Inventing 24 or 48 hours here would be deciding timing policy in read code.
    const out = evaluateLifecycle({
      hasBaseObservation: true,
      latestPublishedAt: "2020-01-01T00:00:00Z",
      checks: [passing("divisor_valid")],
      staleToleranceApproved: false,
      now: "2026-09-17T00:00:00Z",
    });
    expect(out.lifecycle).toBe("live");
  });

  it("claims delayed only once the tolerance is approved and exceeded", () => {
    const base = {
      hasBaseObservation: true,
      latestPublishedAt: "2026-09-15T00:00:00Z",
      checks: [passing("divisor_valid")],
      staleToleranceApproved: true,
      staleToleranceSeconds: 86_400,
    };
    expect(evaluateLifecycle({ ...base, now: "2026-09-17T00:00:00Z" }).lifecycle).toBe("delayed");
    expect(evaluateLifecycle({ ...base, now: "2026-09-15T06:00:00Z" }).lifecycle).toBe("live");
  });

  it("does not infer a level from a state that has none", () => {
    expect(lifecycleCarriesLevel("not_initialized")).toBe(false);
    expect(lifecycleCarriesLevel("blocked")).toBe(false);
    expect(lifecycleCarriesLevel("live")).toBe(true);
    expect(lifecycleCarriesLevel("delayed")).toBe(true);
  });
});

describe("the public contract", () => {
  it("serves a null level and no fake change when not initialized", () => {
    const model = unconfiguredUgaiReadModel();
    expect(model.lifecycle).toBe("not_initialized");
    expect(model.level).toBeNull();
    expect(model.previousLevel).toBeNull();
    expect(model.change).toBeNull();
    expect(model.changePercent).toBeNull();
    expect(model.observationDate).toBeNull();
    expect(model.publishedAt).toBeNull();
    // Explicitly not zero. "0.00 pts (0.00%)" is a statement about the market nobody made.
    expect(model.level).not.toBe(0);
    expect(model.changePercent).not.toBe(0);
    expect(validatePublicUgai(model)).toEqual([]);
  });

  it("presents a draft methodology as a draft", () => {
    const model = unconfiguredUgaiReadModel();
    expect(model.methodology.version).toBe("0.2.0-draft");
    expect(model.methodology.status).toBe("draft");
    // And keeps the parent separate: one document decides membership, the other weighting.
    expect(model.parentMethodology.name).toMatch(/AI Equity Universe/);
    expect(model.parentMethodology.documentPath).not.toBe(model.methodology.documentPath);
  });

  it("rejects a non-live state that carries a level", () => {
    const bad = { ...unconfiguredUgaiReadModel(), level: 1000 };
    expect(validatePublicUgai(bad)).toContain("not_initialized carries a non-null level");
  });

  it("rejects a zero standing in for an absent change", () => {
    const bad = { ...unconfiguredUgaiReadModel(), changePercent: 0 };
    expect(validatePublicUgai(bad).length).toBeGreaterThan(0);
  });

  it("rejects a change percent with no previous level to change from", () => {
    const bad = {
      ...unconfiguredUgaiReadModel(),
      lifecycle: "live" as const,
      level: 1000,
      previousLevel: null,
      changePercent: 1.5,
      observationDate: "2026-09-17",
      publishedAt: "2026-09-17T00:00:00Z",
    };
    expect(validatePublicUgai(bad)).toContain("a change percent exists with no previous level to change from");
  });

  it("rejects a response carrying a licensed input", () => {
    // The boundary where a rights breach would be invisible, so it is a contract test.
    for (const field of ["closePrice", "freeFloatFactor", "shareCount", "divisor", "sourcePayload", "permissionGrantId"]) {
      const leaked = { ...unconfiguredUgaiReadModel(), [field]: 1 };
      expect(validatePublicUgai(leaked)).toContain(`the response exposes the restricted field ${field}`);
    }
  });

  it("exposes source categories without the sources' values", () => {
    const model = unconfiguredUgaiReadModel();
    expect(model.sources.length).toBeGreaterThan(0);
    for (const source of model.sources) {
      expect(source.category).toBeTruthy();
      expect(source.rightsNote).toBeTruthy();
      expect(Object.keys(source)).toEqual(["category", "description", "rightsNote"]);
    }
  });

  it("never leaks internal blocker identifiers into public wording", () => {
    const model = unconfiguredUgaiReadModel();
    for (const fragment of ["permission_grant", "free_float_observation", "snapshot_id", "null", "undefined"]) {
      expect(model.publicReason).not.toContain(fragment);
    }
  });
});

describe("the published series", () => {
  it("is empty when nothing is published, and that is valid", () => {
    const model = { symbol: "UGAI", lifecycle: "not_initialized", points: [] };
    expect(validatePublicUgaiSeries(model)).toEqual([]);
  });

  it("refuses points on an uninitialized index", () => {
    // The rule that stops a chart existing before the index does -- a base point at 1,000 today
    // is the most plausible-looking version of that.
    const model = { symbol: "UGAI", lifecycle: "not_initialized", points: [{ date: "2026-09-17", level: 1000 }] };
    expect(validatePublicUgaiSeries(model)).toContain("an uninitialized index served series points");
  });

  it("accepts only real published points once live", () => {
    const model = { symbol: "UGAI", lifecycle: "live", points: [{ date: "2026-09-17", level: 1000 }] };
    expect(validatePublicUgaiSeries(model)).toEqual([]);
    const broken = { symbol: "UGAI", lifecycle: "live", points: [{ date: "2026-09-17", level: 0 }] };
    expect(validatePublicUgaiSeries(broken).length).toBeGreaterThan(0);
  });
});
