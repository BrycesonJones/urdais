/**
 * The Grid Buildout API contract.
 *
 * The route is deliberately thin, so what is worth testing is the boundary it enforces rather than
 * its logic: that an unconfigured deployment answers with the unpublished model rather than an
 * error, that a payload failing its contract never reaches a client, and that a read failure —
 * including an unapproved methodology — answers 500 rather than something plausible-looking.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { validateGridBuildoutModel, unavailableGridBuildoutModel }
  from "@/lib/grid-buildout/analytics/read";

const ORIGINAL = { ...process.env };

beforeEach(() => { vi.resetModules(); });
afterEach(() => { process.env = { ...ORIGINAL }; vi.restoreAllMocks(); });

describe("an unconfigured deployment", () => {
  it("serves the unpublished model rather than an error or a placeholder", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.URDAIS_DATABASE_URL;
    const { GET } = await import("@/app/api/grid-buildout/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json() as ReturnType<typeof unavailableGridBuildoutModel>;
    expect(body.metrics).toEqual({ m1: null, m2: null, m3: null, m4: null, m5: null });
    expect(body.calculatedAt).toBeNull();
    expect(body.methodology.version).toBe("1.0.0");
    // A surface that has not been calculated is not an outage, and carries no invented figure.
    expect(body.markets).toEqual({ ercot: null, caiso: null });
  });
});

describe("the payload a client receives", () => {
  it("is the read model, not raw database rows", () => {
    const model = unavailableGridBuildoutModel();
    // The public shape names the product, not the schema: no run ids, no snapshot uuids,
    // no table names.
    const serialised = JSON.stringify(model);
    expect(Object.keys(model).sort()).toEqual(
      ["calculatedAt", "coverage", "generatedAt", "inputDigest", "markets", "methodology", "metrics", "notes", "product"]);
    expect(serialised).not.toMatch(/pipeline\.|buildout_analytics_runs|raw_record_id|run_id/);
  });

  it("states its methodology version and document path", () => {
    const model = unavailableGridBuildoutModel();
    expect(model.methodology.version).toBe("1.0.0");
    expect(model.methodology.documentPath).toBe("/docs/methodology/grid-buildout-velocity");
    expect(model.methodology.slug).toBe("grid-buildout-velocity");
  });

  it("separates the markets and says so, with no combined figure", () => {
    const model = unavailableGridBuildoutModel();
    expect(model.notes.join(" ")).toMatch(/never combined/);
    expect(validateGridBuildoutModel(model)).toEqual([]);
    expect(Object.keys(model.metrics).sort()).toEqual(["m1", "m2", "m3", "m4", "m5"]);
  });

  it("never presents assembly time as the dataset's age", () => {
    const model = unavailableGridBuildoutModel();
    // generatedAt is when the payload was built; calculatedAt is when the figures were produced.
    // They are different fields, and an unpublished model has no calculation time at all.
    expect(model.generatedAt).not.toBe(model.calculatedAt);
    expect(model.calculatedAt).toBeNull();
    expect(Number.isNaN(Date.parse(model.generatedAt))).toBe(false);
  });
});
