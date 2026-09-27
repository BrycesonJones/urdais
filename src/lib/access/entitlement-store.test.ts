/**
 * Reading an entitlement out of the database.
 *
 * Every case below is a stored row that must not become premium access: a
 * status this build does not know, a source it does not know, a missing row.
 * Each answers `null` — no entitlement — rather than throwing or defaulting to
 * active.
 */

import { describe, expect, it } from "vitest";

import { PREMIUM_ENTITLEMENT_QUERY, loadPremiumEntitlement } from "@/lib/access/entitlement-store";
import { hasPremiumEntitlement, type Viewer } from "@/lib/access/entitlement";
import type { TokenSqlExecutor } from "@/lib/tokens/read/sql";

function executor(rows: Record<string, unknown>[], capture?: { text?: string; params?: readonly unknown[] }): TokenSqlExecutor {
  return {
    async query(text, params) {
      if (capture) {
        capture.text = text;
        capture.params = params;
      }
      return { rows };
    },
  };
}

const ACTIVE_ROW = {
  status: "active",
  source: "manual",
  external_reference: null,
  granted_at: new Date("2026-02-01T00:00:00.000Z"),
  revoked_at: null,
};

describe("loadPremiumEntitlement", () => {
  it("reads one account's row and parameterises the id", async () => {
    const capture: { text?: string; params?: readonly unknown[] } = {};
    const entitlement = await loadPremiumEntitlement(executor([ACTIVE_ROW], capture), "acct-1");
    expect(entitlement).toEqual({
      status: "active",
      source: "manual",
      externalReference: null,
      grantedAt: "2026-02-01T00:00:00.000Z",
      revokedAt: null,
    });
    // The account id is bound, never interpolated.
    expect(capture.params).toEqual(["acct-1"]);
    expect(capture.text).toBe(PREMIUM_ENTITLEMENT_QUERY);
    expect(capture.text).toContain("identity.premium_entitlements");
  });

  it("returns null when the account has no entitlement", async () => {
    expect(await loadPremiumEntitlement(executor([]), "acct-1")).toBeNull();
  });

  it("returns null for a blank account id without querying", async () => {
    let queried = false;
    const sql: TokenSqlExecutor = {
      async query() {
        queried = true;
        return { rows: [ACTIVE_ROW] };
      },
    };
    expect(await loadPremiumEntitlement(sql, "   ")).toBeNull();
    expect(queried).toBe(false);
  });

  it("carries a stripe reference through untouched", async () => {
    const entitlement = await loadPremiumEntitlement(
      executor([{ ...ACTIVE_ROW, source: "stripe", external_reference: "sub_1Abc" }]),
      "acct-1",
    );
    expect(entitlement?.source).toBe("stripe");
    expect(entitlement?.externalReference).toBe("sub_1Abc");
  });

  it("treats a status this build does not know as no entitlement", async () => {
    // Deploy skew: a later migration adds a status, an older instance reads it.
    // The safe answer is a gate for a subscriber, never data for a non-subscriber.
    expect(await loadPremiumEntitlement(executor([{ ...ACTIVE_ROW, status: "trialing" }]), "acct-1")).toBeNull();
    expect(await loadPremiumEntitlement(executor([{ ...ACTIVE_ROW, status: null }]), "acct-1")).toBeNull();
  });

  it("treats a source this build does not know as no entitlement", async () => {
    expect(await loadPremiumEntitlement(executor([{ ...ACTIVE_ROW, source: "paddle" }]), "acct-1")).toBeNull();
  });

  it("normalises timestamps and blank references", async () => {
    const entitlement = await loadPremiumEntitlement(
      executor([{ status: "inactive", source: "manual", external_reference: "   ", granted_at: null, revoked_at: "2026-06-01T00:00:00.000Z" }]),
      "acct-1",
    );
    expect(entitlement).toEqual({
      status: "inactive",
      source: "manual",
      externalReference: null,
      grantedAt: null,
      revokedAt: "2026-06-01T00:00:00.000Z",
    });
  });

  it("composes with the access decision", async () => {
    // The seam the authentication phase will complete: a row becomes a viewer,
    // and the viewer is what `canAccess` runs on.
    const premiumEntitlement = await loadPremiumEntitlement(executor([ACTIVE_ROW]), "acct-1");
    const viewer: Viewer = { authentication: { kind: "authenticated", accountId: "acct-1", emailVerified: true }, premiumEntitlement };
    expect(hasPremiumEntitlement(viewer)).toBe(true);
  });
});
