import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settleHeldDeletions = vi.hoisted(() => vi.fn());
const end = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/account/analytics-erasure", () => ({ settleHeldDeletions }));
vi.mock("@/lib/tokens/read/database", () => ({ createTokenSqlExecutor: async () => ({ query: vi.fn(), end }) }));

import { GET, cronRequestAuthorized } from "@/app/api/cron/analytics-erasure/route";

const SECRET = "fixture-cron-secret-0123456789";
const call = (authorization?: string) =>
  GET(new Request("https://urdais.com/api/cron/analytics-erasure", { headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("DATABASE_URL", "postgresql://test");
  settleHeldDeletions.mockReset();
  end.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe("analytics erasure cron", () => {
  it("refuses without the cron secret, and when none is configured", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(cronRequestAuthorized(`Bearer ${SECRET}`, undefined)).toBe(false);
    expect(settleHeldDeletions).not.toHaveBeenCalled();
  });

  it("answers 200 when nothing is left held", async () => {
    settleHeldDeletions.mockResolvedValue({ completed: 1, erased: 2, held: 0, skipped: 0, codes: [] });
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, erased: 2 });
    expect(end).toHaveBeenCalled();
  });

  it("answers 500 while anything is held, so the gap is visible daily", async () => {
    settleHeldDeletions.mockResolvedValue({ completed: 0, erased: 0, held: 3, skipped: 0, codes: ["analytics_erasure_unconfigured"] });
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false, held: 3, codes: ["analytics_erasure_unconfigured"] });
  });

  it("answers 500 when the sweep fails, and still closes the connection", async () => {
    settleHeldDeletions.mockRejectedValue(new Error("db"));
    expect((await call(`Bearer ${SECRET}`)).status).toBe(500);
    expect(end).toHaveBeenCalled();
  });
});
