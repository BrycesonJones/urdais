/**
 * The server-side guard: that it refuses, that it refuses with the right status,
 * and that it cannot be talked out of refusing by anything a browser controls.
 *
 * The last group is the one that matters. `canAccess` is pure and will answer a
 * question about any viewer it is handed, so the security property is not "the
 * decision is correct" — it is "the viewer the decision runs on comes from the
 * server". These tests pin that down, and pin down the deferred-wiring ledger so
 * it cannot rot into a list of paths that no longer exist.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ANONYMOUS_VIEWER, authenticatedViewer, subscriberViewer } from "@/lib/access/entitlement";
import { PREMIUM_PRODUCT_IDS } from "@/lib/access/products";
import {
  PREMIUM_ENFORCEMENT_LEDGER,
  denyUnlessEntitled,
  resolvePremiumGate,
  resolveViewer,
  type AccessDenialBody,
} from "@/lib/access/server";
import { PREMIUM_ENFORCEMENT_VAR } from "@/lib/access/activation";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

async function body(response: Response): Promise<AccessDenialBody> {
  return (await response.json()) as AccessDenialBody;
}


/**
 * Enforcement is off by default, which is the whole point of the activation
 * boundary — so every test of an actual refusal has to switch it on explicitly.
 * That is not ceremony: a test that forgot to would pass while asserting nothing,
 * because an unenforced gate allows everything.
 */
function withEnforcementActive() {
  beforeEach(() => vi.stubEnv(PREMIUM_ENFORCEMENT_VAR, "active"));
  afterEach(() => vi.unstubAllEnvs());
}

describe("resolveViewer", () => {
  it("is anonymous when Supabase Auth is not configured", () => {
    // The unit-test environment sets no NEXT_PUBLIC_SUPABASE_* variables, so this
    // exercises the unconfigured path: a deployment without auth is the
    // public-only product, not a broken one. The authenticated path is covered in
    // `src/lib/auth/viewer.test.ts`, which stubs the Supabase identity.
    return expect(resolveViewer()).resolves.toEqual(ANONYMOUS_VIEWER);
  });

  it("takes no request argument, so nothing request-shaped can be passed in", () => {
    expect(resolveViewer.length).toBe(0);
  });
});

describe("the guard, with enforcement active", () => {
  withEnforcementActive();

  it("lets a public product through with no response", async () => {
    expect(await denyUnlessEntitled("model_economics")).toBeNull();
    expect(await denyUnlessEntitled("map", ANONYMOUS_VIEWER)).toBeNull();
  });

  it("answers 401 for an anonymous reader of a premium product", async () => {
    for (const id of PREMIUM_PRODUCT_IDS) {
      const denied = await denyUnlessEntitled(id, ANONYMOUS_VIEWER);
      expect(denied, id).not.toBeNull();
      expect(denied!.status, id).toBe(401);
      expect(await body(denied!)).toEqual({ error: "access_denied", reason: "authentication_required", product: id });
    }
  });

  it("answers 403 for a signed-in non-subscriber", async () => {
    const denied = await denyUnlessEntitled("power_analytics", authenticatedViewer());
    expect(denied!.status).toBe(403);
    expect(await body(denied!)).toEqual({ error: "access_denied", reason: "entitlement_required", product: "power_analytics" });
  });

  it("answers 404 for a product Urdais does not have", async () => {
    const denied = await denyUnlessEntitled("market_nope", subscriberViewer());
    expect(denied!.status).toBe(404);
    expect((await body(denied!)).product).toBeNull();
  });

  it("lets a subscriber through to every premium product", async () => {
    const viewer = subscriberViewer();
    for (const id of PREMIUM_PRODUCT_IDS) {
      expect(await denyUnlessEntitled(id, viewer), id).toBeNull();
    }
  });

  it("falls back to the server-resolved viewer when none is passed", async () => {
    const denied = await denyUnlessEntitled("compute_economics");
    expect(denied!.status).toBe(401);
  });

  it("carries no premium payload in a denial", async () => {
    const denied = await denyUnlessEntitled("compute_economics", ANONYMOUS_VIEWER);
    const text = await denied!.clone().text();
    expect(Object.keys(await body(denied!)).sort()).toEqual(["error", "product", "reason"]);
    expect(text.length).toBeLessThan(200);
  });
});

describe("the guard, with enforcement inactive (the production default)", () => {
  it("permits every premium product to an anonymous reader", async () => {
    // Current production behaviour, asserted rather than assumed. If this ever
    // fails, a shipped product has been paywalled with no way to buy it.
    for (const id of PREMIUM_PRODUCT_IDS) {
      expect(await denyUnlessEntitled(id, ANONYMOUS_VIEWER), id).toBeNull();
    }
  });

  it("permits an unregistered product too, because nothing is being checked", async () => {
    // Not a hole: with enforcement off the gate is not the thing deciding, and the
    // route's own 404 handling is unaffected.
    expect(await denyUnlessEntitled("market_nope", ANONYMOUS_VIEWER)).toBeNull();
  });

  it("resolves no viewer at all", async () => {
    const gate = await resolvePremiumGate("compute_economics");
    expect(gate).toEqual({ enforced: false, allowed: true });
  });
});

describe("resolvePremiumGate", () => {
  it("reports enforcement off by default", async () => {
    const gate = await resolvePremiumGate("compute_economics", ANONYMOUS_VIEWER);
    expect(gate.enforced).toBe(false);
    expect(gate.allowed).toBe(true);
  });

  describe("with enforcement active", () => {
    withEnforcementActive();

    it("gives a Server Component the decision without an HTTP shape", async () => {
      const allowed = await resolvePremiumGate("compute_economics", subscriberViewer());
      expect(allowed).toMatchObject({ enforced: true, allowed: true });

      const denied = await resolvePremiumGate("compute_economics", authenticatedViewer());
      expect(denied.enforced).toBe(true);
      expect(denied.allowed).toBe(false);
      expect(denied.allowed === false && denied.reason).toBe("entitlement_required");
    });

    it("defaults to the server-resolved viewer", async () => {
      const decision = await resolvePremiumGate("map_semiconductor_fabs");
      expect(decision.allowed).toBe(false);
    });
  });
});

describe("the security boundary", () => {
  it("is not reachable from a client component", () => {
    // The guard's authority rests on it running only on the server. A
    // `"use client"` module importing it would both break the build and, worse,
    // suggest the decision can be made in a browser.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) continue;
        const source = readFileSync(full, "utf8");
        if (!/^\s*["']use client["']/m.test(source)) continue;
        if (/from\s+["']@\/lib\/access\/(server|entitlement-store)["']/.test(source)) {
          offenders.push(path.relative(REPO_ROOT, full));
        }
      }
    };
    walk(path.join(REPO_ROOT, "src"));
    expect(offenders).toEqual([]);
  });

  it("keeps the registry and the decision free of payment-processor concepts", () => {
    // A caller asking whether someone may read Compute Economics must not learn
    // what a payment processor is. `source: "stripe"` is provenance on a stored
    // row, and is the only mention permitted; anything importing an SDK or
    // branching on a billing state here would be the coupling this phase exists
    // to prevent.
    for (const file of ["products.ts", "entitlement.ts", "server.ts"]) {
      const source = readFileSync(path.join(REPO_ROOT, "src", "lib", "access", file), "utf8");
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(/\bimport\b[^\n]*stripe/i.test(code), file).toBe(false);
      expect(/\bsubscription_status\b/.test(code), file).toBe(false);
    }
  });
});

describe("the enforcement ledger", () => {
  it("names paths that exist", () => {
    for (const point of PREMIUM_ENFORCEMENT_LEDGER) {
      expect(() => readFileSync(path.join(REPO_ROOT, point.path), "utf8"), point.path).not.toThrow();
    }
  });

  it("covers both premium analytical markets and both map read paths", () => {
    const products = new Set(PREMIUM_ENFORCEMENT_LEDGER.map((p) => p.product));
    expect(products.has("compute_economics")).toBe(true);
    expect(products.has("power_analytics")).toBe(true);

    const mapPoints = PREMIUM_ENFORCEMENT_LEDGER.filter((p) => p.product === "map");
    expect(mapPoints.map((p) => p.path).sort()).toEqual(["src/app/api/map/facilities/route.ts", "src/app/map/page.tsx"]);
    expect(mapPoints.every((p) => p.enforcement === "filter_response")).toBe(true);
  });

  it("is wired: every path it claims is implemented actually references the guard", () => {
    // The reconciliation Phase 3 owes Phase 1. The ledger used to assert these were
    // unguarded; now it asserts they are guarded, and this is what stops the claim
    // from being a stale comment. A path that is renamed, or whose guard is removed,
    // fails here.
    for (const point of PREMIUM_ENFORCEMENT_LEDGER.filter((p) => p.implemented)) {
      const source = readFileSync(path.join(REPO_ROOT, point.path), "utf8");
      const guarded =
        point.enforcement === "deny_request"
          ? /\b(denyUnlessEntitled|resolvePremiumGate)\s*\(/.test(source)
          : /\bresolveMapAccess\s*\(/.test(source) && /\bfilter(FacilityModel|MapPoints)\s*\(/.test(source);
      expect(guarded, `${point.path} is listed as implemented but references no guard`).toBe(true);
    }
  });

  it("accounts for every premium data route in the repository", () => {
    // The failure this catches is the one Phase 1 actually suffered: four premium
    // data routes shipped after its ledger was written and were not in it. Any route
    // under a premium product's API namespace must appear here.
    const premiumApiDirs = ["compute", "power-delivery", "interconnection-queue", "transmission-headroom", "grid-buildout", "flexible-capacity"];
    const listed = new Set(PREMIUM_ENFORCEMENT_LEDGER.map((p) => p.path));
    const missing: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (entry.name !== "route.ts") continue;
        const relative = path.relative(REPO_ROOT, full);
        const namespace = relative.replace("src/app/api/", "").split("/")[0];
        if (!premiumApiDirs.includes(namespace ?? "")) continue;
        if (!listed.has(relative)) missing.push(relative);
      }
    };
    walk(path.join(REPO_ROOT, "src", "app", "api"));
    expect(missing).toEqual([]);
  });

  it("distinguishes implemented from commercially activated", () => {
    // Every guard is in place; none of them enforces anything until the flag is set.
    expect(PREMIUM_ENFORCEMENT_LEDGER.every((p) => p.implemented)).toBe(true);
    expect(process.env[PREMIUM_ENFORCEMENT_VAR]).toBeUndefined();
  });
});
