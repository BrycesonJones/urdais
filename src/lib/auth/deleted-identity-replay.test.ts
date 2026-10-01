/**
 * A deleted identity must never come back from a replayed Auth answer.
 *
 * Reproduced in Phase 7D verification (docs/architecture/account-deletion.md
 * §11): after an account was deleted, a browser tab still holding the deleted
 * user's unexpired token was re-rendered by a development hot reload. Next's
 * Server Components HMR cache answered Supabase's `GET /auth/v1/user` with the
 * 200 it had stored while the user existed, Supabase was never asked, and
 * `resolveUrdaisAccount` recreated the account.
 *
 * Two halves, both against real code rather than a restatement of the config:
 *
 *   1. The mechanism. Next's own patched `fetch` and its own decision about
 *      whether a request gets an HMR cache, fed this repository's `next.config`.
 *      With the cache Next would otherwise attach, the stale 200 is replayed even
 *      for a `no-store` fetch -- the hazard, demonstrated -- and with the cache
 *      this config yields, the authoritative 403 comes through.
 *   2. The outcome. With Supabase answering `user_not_found`, the real
 *      `resolveSupabaseIdentity` -> `resolveViewer` path resolves anonymous and
 *      issues no account query at all, so nothing can be provisioned.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import nextConfig from "../../../next.config";

const AUTH_USER_URL = "https://project-ref.supabase.co/auth/v1/user";

/* ------------------------------------------------------------ 1. mechanism */

type WorkUnit = {
  type: "request";
  isHmrRefresh: boolean;
  serverComponentsHmrCache: Map<string, unknown> | undefined;
  implicitTags: undefined;
};

/**
 * Next's real patched fetch over a fake origin that answers the way Supabase
 * does around an account deletion: 200 with the user before, 403 after.
 */
async function patchedAuthFetch() {
  const { createPatchedFetcher } = await import("next/dist/server/lib/patch-fetch");
  const { IncrementalCache } = await import("next/dist/server/lib/incremental-cache");

  let userExists = true;
  const origin = vi.fn(async () =>
    userExists
      ? new Response(JSON.stringify({ id: "deleted-subject" }), { status: 200 })
      : new Response(JSON.stringify({ code: 403, error_code: "user_not_found" }), { status: 403 }),
  );

  const workAsyncStorage = new AsyncLocalStorage<Record<string, unknown>>();
  const workUnitAsyncStorage = new AsyncLocalStorage<WorkUnit>();
  const patched = createPatchedFetcher(origin as unknown as typeof fetch, {
    workAsyncStorage,
    workUnitAsyncStorage,
  } as never);

  const incrementalCache = {
    generateCacheKey: (url: string, init: RequestInit) => IncrementalCache.prototype.generateCacheKey.call({}, url, init),
    get: async () => null,
    set: async () => undefined,
    lock: async () => async () => undefined,
  };

  /** One server render: a fresh work store, as Next creates per request. */
  function render(unit: WorkUnit) {
    const workStore = { route: "/account", incrementalCache, isDraftMode: false, isStaticGeneration: false };
    return workAsyncStorage.run(workStore, () =>
      workUnitAsyncStorage.run(unit, () =>
        patched(AUTH_USER_URL, { cache: "no-store", headers: { Authorization: "Bearer same-unexpired-token" } }),
      ),
    );
  }

  return {
    origin,
    render,
    deleteUser: () => {
      userExists = false;
    },
  };
}

/**
 * What Next attaches to a request as its HMR cache, decided by Next's own
 * `getServerComponentsHmrCache` over a config merged the way Next merges it.
 */
async function hmrCacheFor(config: { experimental?: Record<string, unknown> }) {
  const { default: Server } = await import("next/dist/server/base-server");
  const { defaultConfig } = await import("next/dist/server/config-shared");
  const devCache = new Map<string, unknown>();
  const previous = (globalThis as Record<string, unknown>).__serverComponentsHmrCache;
  (globalThis as Record<string, unknown>).__serverComponentsHmrCache = devCache;
  try {
    const merged = { ...defaultConfig, ...config, experimental: { ...defaultConfig.experimental, ...config.experimental } };
    const attached = (Server.prototype as unknown as { getServerComponentsHmrCache(this: unknown): unknown }).getServerComponentsHmrCache.call({
      nextConfig: merged,
    });
    return attached as Map<string, unknown> | undefined;
  } finally {
    (globalThis as Record<string, unknown>).__serverComponentsHmrCache = previous;
  }
}

describe("Next's development HMR fetch cache and the Auth lookup", () => {
  it("replays a stored 200 for a deleted user on hot reload, even for a no-store fetch (the hazard)", async () => {
    const cache = await hmrCacheFor({}); // Next's default: the cache is attached
    expect(cache).toBeInstanceOf(Map);

    const { origin, render, deleteUser } = await patchedAuthFetch();
    const before = await render({ type: "request", isHmrRefresh: false, serverComponentsHmrCache: cache, implicitTags: undefined });
    expect(before.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 0)); // the cache fills asynchronously

    deleteUser();
    const hotReload = await render({ type: "request", isHmrRefresh: true, serverComponentsHmrCache: cache, implicitTags: undefined });

    expect(hotReload.status).toBe(200);
    expect(origin).toHaveBeenCalledTimes(1); // Supabase was never asked
  });

  it("asks Supabase on hot reload under this repository's config, and gets the deletion's 403", async () => {
    const cache = await hmrCacheFor(nextConfig as { experimental?: Record<string, unknown> });
    expect(cache).toBeUndefined();

    const { origin, render, deleteUser } = await patchedAuthFetch();
    const before = await render({ type: "request", isHmrRefresh: false, serverComponentsHmrCache: cache, implicitTags: undefined });
    expect(before.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 0));

    deleteUser();
    const hotReload = await render({ type: "request", isHmrRefresh: true, serverComponentsHmrCache: cache, implicitTags: undefined });

    expect(hotReload.status).toBe(403);
    expect(origin).toHaveBeenCalledTimes(2);
  });
});

/* -------------------------------------------------------------- 2. outcome */

const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const tokenSqlExecutor = vi.hoisted(() => vi.fn());
const resolveTokenDatabaseUrl = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/server-client", () => ({ createServerSupabaseClient }));
vi.mock("@/lib/tokens/read/database", () => ({ tokenSqlExecutor, resolveTokenDatabaseUrl }));

describe("a deleted identity presenting a still-valid token", () => {
  let queries: string[];

  beforeEach(() => {
    queries = [];
    resolveTokenDatabaseUrl.mockReturnValue("postgresql://fixture/urdais");
    tokenSqlExecutor.mockResolvedValue({
      async query(text: string) {
        queries.push(text);
        // No account row and no in-flight deletion: exactly the state after a
        // completed deletion, in which provisioning would otherwise insert.
        return { rows: [] };
      },
    });
  });
  afterEach(() => vi.clearAllMocks());

  function supabaseAnswers(result: { data: { user: unknown }; error: unknown }) {
    createServerSupabaseClient.mockResolvedValue({ client: { auth: { getUser: vi.fn().mockResolvedValue(result) } } });
  }

  it("resolves anonymous on Supabase's user_not_found and provisions nothing", async () => {
    const { AuthApiError } = await import("@supabase/supabase-js");
    supabaseAnswers({ data: { user: null }, error: new AuthApiError("User from sub claim in JWT does not exist", 403, "user_not_found") });

    const { resolveViewer } = await import("@/lib/access/server");
    const viewer = await resolveViewer();

    expect(viewer.authentication.kind).toBe("anonymous");
    expect(queries).toEqual([]);
    expect(tokenSqlExecutor).not.toHaveBeenCalled();
  });

  it("would provision if Auth vouched for the subject -- which is why the answer must be fresh", async () => {
    supabaseAnswers({ data: { user: { id: "deleted-subject", email: "reader@example.invalid", email_confirmed_at: "2026-10-01T00:00:00Z" } }, error: null });

    const { resolveViewer } = await import("@/lib/access/server");
    await resolveViewer();

    expect(queries.some((text) => /insert into identity\.accounts/.test(text))).toBe(true);
  });
});
