import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/tokens/prices/route";
import { validatePublicTokenPricesResponse } from "@/lib/tokens/read/api-contract";

describe("GET /api/tokens/prices", () => {
  it("returns an allowlisted empty catalog while no production-publicable observations exist", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as unknown;
    expect(body).toEqual({ series: [] });
    expect(validatePublicTokenPricesResponse(body)).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/research_usable|under_review|candidate|parserId|responseBody/);
  });
});
