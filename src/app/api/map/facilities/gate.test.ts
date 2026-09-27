/**
 * The facilities endpoint filters rather than refuses.
 *
 * This is the map's real security boundary, and it matters more than the page: it
 * is directly fetchable, so a filter that lived in React would leave every premium
 * coordinate one request away. The route must stay 200 and public — taking the map
 * away to protect part of it is the wrong trade — while containing none of the
 * withheld categories.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolveMapAccess = vi.hoisted(() => vi.fn());
const loadFacilityReadModel = vi.hoisted(() => vi.fn());
const createTokenSqlExecutor = vi.hoisted(() => vi.fn());

vi.mock("@/lib/access/server", () => ({ resolveMapAccess, denyUnlessEntitled: vi.fn() }));
vi.mock("@/lib/facilities/read/load", () => ({ loadFacilityReadModel }));
vi.mock("@/lib/tokens/read/database", () => ({ createTokenSqlExecutor }));

import { GET } from "@/app/api/map/facilities/route";
import { OPEN_MAP_ACCESS } from "@/lib/access/map-access";
import { FACILITY_CATEGORIES } from "@/lib/facilities/domain";

const LOCKED = ["gpu_compute_cluster", "power_infrastructure", "semiconductor_fab"] as const;

/** A facility that satisfies the public contract, so the response is not rejected. */
function facility(category: string, index: number) {
  return {
    id: `facility-${category}`,
    name: `Fixture ${category}`,
    category,
    longitude: 10 + index,
    latitude: 20 + index,
    // One of MAP_ELIGIBLE_PRECISIONS; anything else fails the public contract.
    coordinatePrecision: "building",
    verificationStatus: "verified",
    lastVerifiedDate: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
    sources: [{ publisher: "Fixture", url: "https://example.invalid/a" }],
  };
}

function model() {
  return {
    dataset: "urdais-map-facilities",
    verificationHorizonDays: 180,
    facilities: FACILITY_CATEGORIES.map((category, index) => facility(category, index)),
    coverage: {
      published: 40,
      served: 4,
      byCategory: { data_center: 10, gpu_compute_cluster: 11, power_infrastructure: 12, semiconductor_fab: 13 },
      countries: 7,
    },
    unavailableReason: null,
  };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture/urdais");
  createTokenSqlExecutor.mockReset().mockResolvedValue({ query: vi.fn(), end: vi.fn() });
  loadFacilityReadModel.mockReset().mockResolvedValue(model());
  resolveMapAccess.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("an unentitled reader with enforcement active", () => {
  beforeEach(() => {
    resolveMapAccess.mockResolvedValue({
      enforced: true,
      visibleCategories: ["data_center"],
      lockedCategories: LOCKED,
      reason: "authentication_required",
    });
  });

  it("still answers 200: the map is public", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it("serves the public data-centre layer", async () => {
    const body = (await (await GET()).json()) as { facilities: { category: string }[] };
    expect(body.facilities.map((f) => f.category)).toEqual(["data_center"]);
  });

  it("contains no premium facility name or coordinate anywhere in the payload", async () => {
    // Asserted against the raw serialised text, because that is what crosses the
    // wire: a structural check could pass while a value survived in a stray field.
    //
    // Note what is deliberately *not* asserted. The category names themselves do
    // survive, as zeroed keys in `coverage.byCategory`, and that is correct — the
    // premium layers are advertised by name in the legend, so the taxonomy is public.
    // What must not survive is any facility: its name, and above all its position,
    // which is the entire product for a facility.
    const text = await (await GET()).text();

    for (const category of LOCKED) {
      expect(text, category).not.toContain(`Fixture ${category}`);
      expect(text, category).not.toContain(`facility-${category}`);
    }
    // The premium fixtures sat at latitudes 21–23 and longitudes 11–13.
    for (const latitude of [21, 22, 23]) expect(text).not.toContain(`"latitude":${latitude}`);
    for (const longitude of [11, 12, 13]) expect(text).not.toContain(`"longitude":${longitude}`);

    // The public one is present, so the assertions above are not passing vacuously.
    expect(text).toContain("Fixture data_center");
    expect(text).toContain('"latitude":20');
  });

  it("does not disclose how many premium facilities were withheld", async () => {
    const body = (await (await GET()).json()) as { coverage: { byCategory: Record<string, number>; served: number } };
    expect(body.coverage.byCategory).toEqual({
      data_center: 10,
      gpu_compute_cluster: 0,
      power_infrastructure: 0,
      semiconductor_fab: 0,
    });
    expect(body.coverage.served).toBe(1);
  });

  it("still satisfies the facility contract after filtering", async () => {
    // Narrowing the set must not produce a response that fails its own validation,
    // which would turn a gated map into a 500.
    expect((await GET()).status).not.toBe(500);
  });
});

describe("an entitled reader with enforcement active", () => {
  it("receives every authorized category", async () => {
    resolveMapAccess.mockResolvedValue({
      enforced: true,
      visibleCategories: FACILITY_CATEGORIES,
      lockedCategories: [],
      reason: null,
    });

    const body = (await (await GET()).json()) as { facilities: { category: string }[]; coverage: { byCategory: Record<string, number> } };
    expect(body.facilities.map((f) => f.category).sort()).toEqual([...FACILITY_CATEGORIES].sort());
    expect(body.coverage.byCategory.gpu_compute_cluster).toBe(11);
  });
});

describe("enforcement inactive — current production behaviour", () => {
  it("serves the whole dataset, unchanged", async () => {
    resolveMapAccess.mockResolvedValue(OPEN_MAP_ACCESS);

    const response = await GET();
    const body = (await response.json()) as { facilities: unknown[]; coverage: { served: number } };
    expect(response.status).toBe(200);
    expect(body.facilities).toHaveLength(FACILITY_CATEGORIES.length);
    expect(body.coverage.served).toBe(4);
  });
});
