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

import { describe, expect, it } from "vitest";

import { ANONYMOUS_VIEWER, authenticatedViewer, subscriberViewer } from "@/lib/access/entitlement";
import { PREMIUM_PRODUCT_IDS } from "@/lib/access/products";
import {
  DEFERRED_PREMIUM_ENFORCEMENT,
  denyUnlessEntitled,
  resolveAccess,
  resolveViewer,
  type AccessDenialBody,
} from "@/lib/access/server";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

async function body(response: Response): Promise<AccessDenialBody> {
  return (await response.json()) as AccessDenialBody;
}

describe("resolveViewer", () => {
  it("is anonymous, because Urdais has no authentication system yet", () => {
    // This assertion is expected to be *changed* by the authentication phase.
    // Until then it records the truth rather than a placeholder: every reader of
    // Urdais today is anonymous.
    return expect(resolveViewer()).resolves.toEqual(ANONYMOUS_VIEWER);
  });

  it("takes no request argument, so nothing request-shaped can be passed in", () => {
    expect(resolveViewer.length).toBe(0);
  });
});

describe("the guard", () => {
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
    // The default path: no caller-supplied viewer, and the server's own answer
    // is anonymous, so premium is refused.
    const denied = await denyUnlessEntitled("compute_economics");
    expect(denied!.status).toBe(401);
  });

  it("carries no premium payload in a denial", async () => {
    const denied = await denyUnlessEntitled("compute_economics", ANONYMOUS_VIEWER);
    const text = await denied!.clone().text();
    // A refusal is a refusal. Nothing about the data, not even a shape or a
    // count, may ride along for a blur to reveal.
    expect(Object.keys(await body(denied!)).sort()).toEqual(["error", "product", "reason"]);
    expect(text.length).toBeLessThan(200);
  });
});

describe("resolveAccess", () => {
  it("gives a Server Component the decision without an HTTP shape", async () => {
    const decision = await resolveAccess("compute_economics", subscriberViewer());
    expect(decision.allowed).toBe(true);
    const denied = await resolveAccess("compute_economics", authenticatedViewer());
    expect(denied.allowed === false && denied.reason).toBe("entitlement_required");
  });

  it("defaults to the server-resolved viewer", async () => {
    const decision = await resolveAccess("map_semiconductor_fabs");
    expect(decision.allowed).toBe(false);
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

describe("the deferred-enforcement ledger", () => {
  it("names paths that exist", () => {
    for (const point of DEFERRED_PREMIUM_ENFORCEMENT) {
      expect(() => readFileSync(path.join(REPO_ROOT, point.path), "utf8"), point.path).not.toThrow();
    }
  });

  it("covers both premium analytical markets and both map read paths", () => {
    const products = new Set(DEFERRED_PREMIUM_ENFORCEMENT.map((p) => p.product));
    expect(products.has("compute_economics")).toBe(true);
    expect(products.has("power_analytics")).toBe(true);
    // The map is filtered, not refused, so its ledger entries carry the map
    // product rather than the three premium layer products.
    const mapPoints = DEFERRED_PREMIUM_ENFORCEMENT.filter((p) => p.product === "map");
    expect(mapPoints.map((p) => p.path).sort()).toEqual(["src/app/api/map/facilities/route.ts", "src/app/map/page.tsx"]);
    expect(mapPoints.every((p) => p.enforcement === "filter_response")).toBe(true);
  });

  it("is not wired up: no route imports the guard yet", () => {
    // Phase 1 builds the primitive and deliberately does not activate it. If
    // this test fails, either Phase 2/5 has landed — and this test should be
    // deleted in that change — or a guard was switched on by accident, which
    // would deny a production product nobody can yet subscribe to.
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        if (/from\s+["']@\/lib\/access\/server["']/.test(readFileSync(full, "utf8"))) {
          importers.push(path.relative(REPO_ROOT, full));
        }
      }
    };
    walk(path.join(REPO_ROOT, "src", "app"));
    expect(importers).toEqual([]);
  });
});
