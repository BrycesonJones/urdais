/**
 * The Flexible Capacity API contract.
 *
 * The route is deliberately thin, so what is worth testing is the boundary it enforces rather than
 * its logic: that an unconfigured deployment answers with the unpublished model rather than an
 * error, that a payload failing its contract never reaches a client, that an unapproved
 * methodology or an unresolved parameter produces an honest unavailable state rather than figures,
 * and that the connection is closed whatever happens.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { unavailableFlexibleCapacityModel } from "@/lib/flexible-capacity/analytics/read";
import { validateFlexibleCapacityReadModel } from "@/lib/flexible-capacity/analytics/read-contract";

const ORIGINAL = { ...process.env };

beforeEach(() => { vi.resetModules(); });
afterEach(() => { process.env = { ...ORIGINAL }; vi.restoreAllMocks(); vi.doUnmock("@/lib/tokens/read/database"); });

describe("1. an unconfigured deployment", () => {
  it("serves the unpublished model rather than an error or a placeholder", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.URDAIS_DATABASE_URL;
    const { GET } = await import("@/app/api/flexible-capacity/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json() as ReturnType<typeof unavailableFlexibleCapacityModel>;
    expect(body.availability).toEqual({ state: "unavailable", reason: "no_database_configured" });
    expect(body.markets).toEqual([]);
    expect(body.calculatedAt).toBeNull();
    expect(body.methodology.version).toBe("1.1.0");
  });
});

/** Installs a stub executor and returns whether `end()` was called. */
function stubDatabase(behaviour: {
  load: () => Promise<unknown>;
}): { ended: () => boolean } {
  let ended = false;
  vi.doMock("@/lib/tokens/read/database", () => ({
    createTokenSqlExecutor: async () => ({
      query: async () => ({ rows: [] }),
      end: async () => { ended = true; },
    }),
  }));
  vi.doMock("@/lib/flexible-capacity/analytics/read", async () => {
    const actual = await vi.importActual<typeof import("@/lib/flexible-capacity/analytics/read")>(
      "@/lib/flexible-capacity/analytics/read");
    return { ...actual, loadFlexibleCapacityReadModel: behaviour.load };
  });
  return { ended: () => ended };
}

describe("2. what a configured deployment serves", () => {
  it("returns 200 and the validated model", async () => {
    process.env.DATABASE_URL = "postgresql://localhost/test";
    const model = unavailableFlexibleCapacityModel("no_validated_analytics");
    const database = stubDatabase({ load: async () => model });
    const { GET } = await import("@/app/api/flexible-capacity/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ availability: { state: "unavailable" } });
    expect(database.ended()).toBe(true);
  });

  it("answers 500 rather than serving a payload that failed its contract", async () => {
    process.env.DATABASE_URL = "postgresql://localhost/test";
    const broken = { ...unavailableFlexibleCapacityModel("no_validated_analytics"), total: { gw: 9 } };
    const database = stubDatabase({ load: async () => broken });
    const { GET } = await import("@/app/api/flexible-capacity/route");
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "contract_failed" });
    expect(database.ended()).toBe(true);
  });

  it("answers 500 when the read throws, and still closes the connection", async () => {
    process.env.DATABASE_URL = "postgresql://localhost/test";
    const database = stubDatabase({ load: async () => { throw new Error("connection reset"); } });
    const { GET } = await import("@/app/api/flexible-capacity/route");
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(database.ended()).toBe(true);
  });

  it("serves an unavailable model, not an error, when publication is not authorized", async () => {
    // The read model turns both gate failures into availability states, so a blocked publication
    // is a 200 describing why rather than a 500 that looks like an outage.
    process.env.DATABASE_URL = "postgresql://localhost/test";
    stubDatabase({ load: async () => unavailableFlexibleCapacityModel("publication_not_authorized") });
    const { GET } = await import("@/app/api/flexible-capacity/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json() as { availability: { reason: string }; markets: unknown[] };
    expect(body.availability.reason).toBe("publication_not_authorized");
    expect(body.markets).toEqual([]);
  });
});

describe("3. the route holds no product logic", () => {
  it("never calculates, and never falls back to a mock", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/app/api/flexible-capacity/route.ts", "utf8"));
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/solveHeadroom|curtailmentProfile|peakReference|headroomGaps/);
    expect(code).not.toMatch(/data\/mock|FLEXIBILITY_/);
    // Everything it serves comes from the read model and its contract check.
    expect(code).toMatch(/loadFlexibleCapacityReadModel/);
    expect(code).toMatch(/validateFlexibleCapacityReadModel/);
  });

  it("serves the same object the page renders", async () => {
    // One read model, two consumers. The API serialises it; the page passes it as a prop.
    const page = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/app/markets/power-analytics/page.tsx", "utf8"));
    expect(page).toMatch(/loadFlexibleCapacityReadModel/);
    const route = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/app/api/flexible-capacity/route.ts", "utf8"));
    expect(route).toMatch(/loadFlexibleCapacityReadModel/);
  });
});

describe("4. the payload a client receives", () => {
  it("names the product, not the schema", () => {
    const model = unavailableFlexibleCapacityModel("no_validated_analytics");
    expect(validateFlexibleCapacityReadModel(model)).toEqual([]);
    const serialised = JSON.stringify(model);
    expect(serialised).not.toMatch(/pipeline\.|flexible_capacity_scenario_results|grid_area_id|run_id|input_digest/);
    expect(Object.keys(model).sort()).toEqual([
      "assumptions", "availability", "calculatedAt", "generatedAt", "limitations",
      "markets", "methodology", "notes", "product", "source",
    ]);
  });
});
