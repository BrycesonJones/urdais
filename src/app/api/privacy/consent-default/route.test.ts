import { describe, expect, it, vi } from "vitest";

const country = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => country.value }) }));

import { GET } from "@/app/api/privacy/consent-default/route";

describe("GET /api/privacy/consent-default", () => {
  it("answers the regional default only, never cached or shared", async () => {
    country.value = "US";
    const response = await GET();
    expect(await response.json()).toEqual({ default: "granted" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");

    country.value = "FR";
    expect(await (await GET()).json()).toEqual({ default: "pending" });
    country.value = null;
    expect(await (await GET()).json()).toEqual({ default: "pending" });
  });
});
