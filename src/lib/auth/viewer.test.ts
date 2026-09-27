/**
 * `resolveViewer` end to end: Supabase identity → Urdais account → entitlement →
 * access decision.
 *
 * This is the file that proves the phase's headline invariant — **authentication
 * does not imply entitlement**. A signed-in reader with no entitlement row must be
 * refused every premium product, and the only way to be sure is to run the real
 * `resolveViewer` against a real `canAccess` with the Supabase layer and the
 * database stubbed.
 *
 * It is also where the browser-cannot-decide properties are pinned: nothing a
 * request carries reaches the viewer except through a verified Supabase session.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/** The executor call signature, so `mock.calls[n][1]` is typed as the parameters. */
type QueryFn = (text: string, params: readonly unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

const resolveSupabaseIdentity = vi.hoisted(() => vi.fn());
const tokenSqlExecutor = vi.hoisted(() => vi.fn());
const resolveTokenDatabaseUrl = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/identity", () => ({ resolveSupabaseIdentity }));
vi.mock("@/lib/tokens/read/database", () => ({ tokenSqlExecutor, resolveTokenDatabaseUrl }));

import { canAccess, hasPremiumEntitlement } from "@/lib/access/entitlement";
import { PREMIUM_PRODUCT_IDS, URDAIS_PRODUCTS } from "@/lib/access/products";
import { resolveViewer } from "@/lib/access/server";

const PUBLIC_IDS = URDAIS_PRODUCTS.filter((p) => p.accessClass === "public").map((p) => p.id);

/** A database holding one account and, optionally, one entitlement for it. */
function database(options: { accountId?: string; entitlement?: Record<string, unknown> | null } = {}) {
  const accountId = options.accountId ?? "account-1";
  const queries: string[] = [];
  const sql = {
    async query(text: string) {
      queries.push((text.trim().split(/\s+/)[0] ?? "").toLowerCase());
      if (/identity\.premium_entitlements/.test(text)) {
        return { rows: options.entitlement ? [options.entitlement] : [] };
      }
      return { rows: [{ id: accountId, email: "reader@example.invalid" }] };
    },
  };
  tokenSqlExecutor.mockResolvedValue(sql);
  resolveTokenDatabaseUrl.mockReturnValue("postgresql://fixture/urdais");
  return { queries };
}

const ACTIVE_ROW = {
  status: "active",
  source: "manual",
  external_reference: null,
  granted_at: new Date("2026-02-01T00:00:00.000Z"),
  revoked_at: null,
};

function signedInAs(subject = "uuid-1", emailVerified = true) {
  resolveSupabaseIdentity.mockResolvedValue({
    kind: "authenticated",
    identity: { subject, email: "reader@example.invalid", emailVerified },
  });
}

beforeEach(() => {
  resolveSupabaseIdentity.mockReset();
  tokenSqlExecutor.mockReset();
  resolveTokenDatabaseUrl.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("an anonymous reader", () => {
  it("resolves anonymous and never touches the database", async () => {
    resolveSupabaseIdentity.mockResolvedValue({ kind: "anonymous", reason: "no_session" });
    const viewer = await resolveViewer();

    expect(viewer.authentication.kind).toBe("anonymous");
    expect(viewer.premiumEntitlement).toBeNull();
    // Public Urdais must not pay for a database round trip to learn nothing.
    expect(tokenSqlExecutor).not.toHaveBeenCalled();
  });

  it("is refused every premium product and allowed every public one", async () => {
    resolveSupabaseIdentity.mockResolvedValue({ kind: "anonymous", reason: "no_session" });
    const viewer = await resolveViewer();

    for (const id of PREMIUM_PRODUCT_IDS) expect(canAccess(viewer, id).allowed, id).toBe(false);
    for (const id of PUBLIC_IDS) expect(canAccess(viewer, id).allowed, id).toBe(true);
  });
});

describe("a signed-in reader with no entitlement", () => {
  it("is authenticated, carries the Urdais account id, and holds no entitlement", async () => {
    signedInAs();
    database({ accountId: "acct-42", entitlement: null });

    const viewer = await resolveViewer();
    expect(viewer.authentication).toEqual({ kind: "authenticated", accountId: "acct-42", emailVerified: true });
    expect(viewer.premiumEntitlement).toBeNull();
    expect(hasPremiumEntitlement(viewer)).toBe(false);
  });

  it("is refused every premium product — authentication is not entitlement", async () => {
    signedInAs();
    database({ entitlement: null });
    const viewer = await resolveViewer();

    // The invariant this phase must not break. If any of these passes, signing in
    // has become a way to obtain premium access.
    for (const id of PREMIUM_PRODUCT_IDS) {
      const decision = canAccess(viewer, id);
      expect(decision.allowed, id).toBe(false);
      expect(decision.allowed === false && decision.reason, id).toBe("entitlement_required");
    }
  });

  it("keeps every public product available", async () => {
    signedInAs();
    database({ entitlement: null });
    const viewer = await resolveViewer();
    for (const id of PUBLIC_IDS) expect(canAccess(viewer, id).allowed, id).toBe(true);
  });

  it("reports an unverified address without denying anything extra for it", async () => {
    // Phase 1 does not gate on verification and Phase 2 does not change that.
    signedInAs("uuid-1", false);
    database({ entitlement: null });
    const viewer = await resolveViewer();

    expect(viewer.authentication.kind === "authenticated" && viewer.authentication.emailVerified).toBe(false);
    for (const id of PUBLIC_IDS) expect(canAccess(viewer, id).allowed, id).toBe(true);
  });
});

describe("a signed-in reader with an entitlement", () => {
  it("is granted every premium product from the one entitlement", async () => {
    signedInAs();
    database({ entitlement: ACTIVE_ROW });
    const viewer = await resolveViewer();

    expect(hasPremiumEntitlement(viewer)).toBe(true);
    for (const id of PREMIUM_PRODUCT_IDS) expect(canAccess(viewer, id).allowed, id).toBe(true);
  });

  it("is refused when the entitlement is inactive", async () => {
    signedInAs();
    database({ entitlement: { ...ACTIVE_ROW, status: "inactive", revoked_at: new Date("2026-06-01T00:00:00Z") } });
    const viewer = await resolveViewer();

    expect(viewer.premiumEntitlement?.status).toBe("inactive");
    expect(hasPremiumEntitlement(viewer)).toBe(false);
    for (const id of PREMIUM_PRODUCT_IDS) expect(canAccess(viewer, id).allowed, id).toBe(false);
  });

  it("reads the entitlement for the resolved account, not for the auth subject", async () => {
    // The entitlement is keyed on the Urdais account id. Querying it by Supabase
    // subject would work today and break the moment a second provider exists.
    signedInAs("uuid-1");
    const sql = {
      query: vi.fn<QueryFn>(async (text) => {
        if (/premium_entitlements/.test(text)) return { rows: [] };
        return { rows: [{ id: "acct-99", email: null }] };
      }),
    };
    tokenSqlExecutor.mockResolvedValue(sql);
    resolveTokenDatabaseUrl.mockReturnValue("postgresql://fixture/urdais");

    await resolveViewer();
    const entitlementCall = sql.query.mock.calls.find(([text]) => /premium_entitlements/.test(text as string));
    expect(entitlementCall?.[1]).toEqual(["acct-99"]);
  });
});

describe("failing safe", () => {
  it("falls back to anonymous when the database is unreachable", async () => {
    signedInAs();
    resolveTokenDatabaseUrl.mockReturnValue("postgresql://fixture/urdais");
    tokenSqlExecutor.mockRejectedValue(new Error("DB_CONNECT_FAILED"));

    const viewer = await resolveViewer();
    // Losing premium a reader is owed is recoverable; granting premium they are
    // not owed is not. The fallback must be anonymous, never "authenticated with
    // an assumed entitlement".
    expect(viewer.authentication.kind).toBe("anonymous");
    expect(viewer.premiumEntitlement).toBeNull();
  });

  it("falls back to anonymous when no database is configured", async () => {
    signedInAs();
    resolveTokenDatabaseUrl.mockReturnValue(null);
    const viewer = await resolveViewer();
    expect(viewer.authentication.kind).toBe("anonymous");
    expect(tokenSqlExecutor).not.toHaveBeenCalled();
  });

  it("falls back to anonymous when provisioning fails", async () => {
    signedInAs();
    resolveTokenDatabaseUrl.mockReturnValue("postgresql://fixture/urdais");
    tokenSqlExecutor.mockResolvedValue({ query: vi.fn().mockRejectedValue(new Error("permission denied")) });

    const viewer = await resolveViewer();
    expect(viewer.authentication.kind).toBe("anonymous");
  });

  it("never throws out of resolveViewer", async () => {
    signedInAs();
    resolveTokenDatabaseUrl.mockImplementation(() => {
      throw new Error("env exploded");
    });
    // A page that renders public data must not 500 because authentication broke.
    await expect(resolveViewer()).resolves.toBeTruthy();
  });
});

describe("the browser decides nothing", () => {
  it("derives the account id from the verified subject, not from any request value", async () => {
    signedInAs("verified-subject");
    const sql = {
      query: vi.fn<QueryFn>(async (text) => {
        if (/premium_entitlements/.test(text)) return { rows: [] };
        return { rows: [{ id: "acct-from-db", email: null }] };
      }),
    };
    tokenSqlExecutor.mockResolvedValue(sql);
    resolveTokenDatabaseUrl.mockReturnValue("postgresql://fixture/urdais");

    const viewer = await resolveViewer();

    // The account lookup is parameterised by the verified subject.
    const lookup = sql.query.mock.calls.find(([text]) => /identity\.accounts/.test(text as string));
    expect(lookup?.[1]).toEqual(["supabase", "verified-subject"]);
    // And the id the viewer carries came from the database row, not the subject.
    expect(viewer.authentication.kind === "authenticated" && viewer.authentication.accountId).toBe("acct-from-db");
  });

  it("takes no arguments at all, so there is nothing to spoof", async () => {
    // Every input to resolveViewer is ambient and server-controlled: the session
    // cookie, the database. A caller cannot pass an identity or an entitlement.
    expect(resolveViewer.length).toBe(0);
  });

  it("ignores an entitlement the identity layer might claim", async () => {
    // Defence in depth: even if the Supabase layer were compromised into
    // returning extra fields, they are not read.
    resolveSupabaseIdentity.mockResolvedValue({
      kind: "authenticated",
      identity: {
        subject: "uuid-1",
        email: "reader@example.invalid",
        emailVerified: true,
        premiumEntitlement: { status: "active", source: "manual", externalReference: null, grantedAt: "x", revokedAt: null },
      },
    });
    database({ entitlement: null });

    const viewer = await resolveViewer();
    // The entitlement comes from the database and nowhere else.
    expect(viewer.premiumEntitlement).toBeNull();
    expect(hasPremiumEntitlement(viewer)).toBe(false);
  });
});
