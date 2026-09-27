/**
 * Every premium data route refuses before it reads.
 *
 * One test file for all seven, because the property is the same in each and the
 * failure this guards against is structural: gating the page and leaving its JSON
 * callable. A reader refused at `/markets/power-analytics` who can still `curl`
 * `/api/interconnection-queue` has not been refused at all.
 *
 * The guard is mocked to a known refusal, so what is under test is whether each
 * route *honours* it — returns it verbatim, and does not go on to read anything.
 * Whether the guard itself decides correctly is `server.test.ts` and
 * `activation.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const denyUnlessEntitled = vi.hoisted(() => vi.fn());
const createTokenSqlExecutor = vi.hoisted(() => vi.fn());
const tokenSqlExecutor = vi.hoisted(() => vi.fn());

vi.mock("@/lib/access/server", () => ({ denyUnlessEntitled, resolveMapAccess: vi.fn() }));
vi.mock("@/lib/tokens/read/database", () => ({
  createTokenSqlExecutor,
  tokenSqlExecutor,
  resolveTokenDatabaseUrl: () => "postgresql://fixture/urdais",
}));


/**
 * A zero-argument `GET` is assignable to this, so the one shape covers both the
 * routes that read the request and those that ignore it.
 */
type RouteModule = { GET: (request: Request) => Promise<Response> };

const PREMIUM_ROUTES: readonly { path: string; product: string; module: () => Promise<RouteModule> }[] = [
  { path: "/api/compute/capacity", product: "compute_economics", module: () => import("@/app/api/compute/capacity/route") },
  { path: "/api/compute/capacity/series", product: "compute_economics", module: () => import("@/app/api/compute/capacity/series/route") },
  { path: "/api/power-delivery/gap", product: "power_analytics", module: () => import("@/app/api/power-delivery/gap/route") },
  { path: "/api/interconnection-queue", product: "power_analytics", module: () => import("@/app/api/interconnection-queue/route") },
  { path: "/api/transmission-headroom", product: "power_analytics", module: () => import("@/app/api/transmission-headroom/route") },
  { path: "/api/grid-buildout", product: "power_analytics", module: () => import("@/app/api/grid-buildout/route") },
  { path: "/api/flexible-capacity", product: "power_analytics", module: () => import("@/app/api/flexible-capacity/route") },
];

function request(path: string): Request {
  return new Request(`https://urdais.test${path}`);
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://fixture/urdais");
  denyUnlessEntitled.mockReset();
  createTokenSqlExecutor.mockReset().mockResolvedValue({ query: vi.fn().mockResolvedValue({ rows: [] }), end: vi.fn() });
  tokenSqlExecutor.mockReset().mockResolvedValue({ query: vi.fn().mockResolvedValue({ rows: [] }) });
});

afterEach(() => vi.unstubAllEnvs());

describe("when the guard refuses", () => {
  for (const route of PREMIUM_ROUTES) {
    describe(route.path, () => {
      it("asks the guard about the right product", async () => {
        denyUnlessEntitled.mockResolvedValue(null);
        const { GET } = await route.module();
        await GET(request(route.path));
        expect(denyUnlessEntitled).toHaveBeenCalledWith(route.product);
      });

      it("returns the refusal unchanged", async () => {
        const refusal = Response.json({ error: "access_denied", reason: "entitlement_required", product: route.product }, { status: 403 });
        denyUnlessEntitled.mockResolvedValue(refusal);

        const { GET } = await route.module();
        const response = await GET(request(route.path));

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "access_denied", reason: "entitlement_required", product: route.product });
      });

      it("reads nothing: no database connection is opened", async () => {
        denyUnlessEntitled.mockResolvedValue(Response.json({ error: "access_denied" }, { status: 401 }));
        const { GET } = await route.module();
        await GET(request(route.path));

        // The guard has to come first, not merely be consulted. A route that loaded
        // and then refused would pass a status assertion and still have run the query.
        expect(createTokenSqlExecutor).not.toHaveBeenCalled();
        expect(tokenSqlExecutor).not.toHaveBeenCalled();
      });

      it("carries no premium payload in the refusal", async () => {
        denyUnlessEntitled.mockResolvedValue(
          Response.json({ error: "access_denied", reason: "authentication_required", product: route.product }, { status: 401 }),
        );
        const { GET } = await route.module();
        const response = await GET(request(route.path));
        const body = (await response.json()) as Record<string, unknown>;

        expect(Object.keys(body).sort()).toEqual(["error", "product", "reason"]);
        // No numbers, series, coordinates or counts of any kind.
        expect(JSON.stringify(body)).not.toMatch(/\d{2,}/);
      });

      it("answers 401 for anonymous and 403 for a signed-in non-subscriber", async () => {
        for (const [status, reason] of [
          [401, "authentication_required"],
          [403, "entitlement_required"],
        ] as const) {
          denyUnlessEntitled.mockResolvedValue(Response.json({ error: "access_denied", reason, product: route.product }, { status }));
          const { GET } = await route.module();
          const response = await GET(request(route.path));
          expect(response.status, `${route.path} ${reason}`).toBe(status);
        }
      });
    });
  }
});

describe("when the guard permits", () => {
  for (const route of PREMIUM_ROUTES) {
    it(`${route.path} proceeds past the guard`, async () => {
      denyUnlessEntitled.mockResolvedValue(null);
      const { GET } = await route.module();
      const response = await GET(request(route.path));

      // It may well fail for want of a real database — what matters is that it did
      // not stop at the gate, which is what enforcement being inactive must look
      // like on every one of these routes today.
      expect([401, 403, 404]).not.toContain(response.status);
    });
  }
});

describe("coverage", () => {
  it("covers every route the enforcement ledger marks deny_request", async () => {
    const { PREMIUM_ENFORCEMENT_LEDGER } = await vi.importActual<typeof import("@/lib/access/server")>("@/lib/access/server");
    const expected = PREMIUM_ENFORCEMENT_LEDGER.filter((p) => p.enforcement === "deny_request" && p.path.startsWith("src/app/api/"))
      .map((p) => `/${p.path.replace("src/app/", "").replace("/route.ts", "")}`)
      .sort();
    expect(PREMIUM_ROUTES.map((r) => r.path).sort()).toEqual(expected);
  });
});
