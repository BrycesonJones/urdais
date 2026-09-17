import { describe, expect, it } from "vitest";

import { GET as GET_HEADLINE } from "@/app/api/uavi/route";
import { GET as GET_SERIES } from "@/app/api/uavi/series/route";
import { validatePublicUavi, validatePublicUaviSeries } from "@/lib/uavi/read/read-model";

/**
 * These run without a database configured, which is the state the tests should describe: a
 * not-initialized index is a normal domain state rather than an outage, so the route answers 200
 * with a null level and its reason. A 500 here would put a real incident and a deliberate one in
 * the same bucket.
 */
describe("GET /api/uavi", () => {
  it("answers 200 with a null level and a stated reason", async () => {
    const response = await GET_HEADLINE();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.symbol).toBe("UAVI");
    expect(body.lifecycle).toBe("not_initialized");
    expect(body.level).toBeNull();
    expect(body.previousLevel).toBeNull();
    expect(body.change).toBeNull();
    expect(body.changePercent).toBeNull();
    expect(body.observationDate).toBeNull();
    expect(typeof body.publicReason).toBe("string");
    expect((body.publicReason as string).length).toBeGreaterThan(0);
  });

  it("satisfies its own public contract", async () => {
    const body = await (await GET_HEADLINE()).json();
    expect(validatePublicUavi(body)).toEqual([]);
  });

  it("exposes no option quotes, contracts or strip internals", async () => {
    const serialized = JSON.stringify(await (await GET_HEADLINE()).json());
    for (const forbidden of ["contractSymbol", "strike", "\"bid\"", "\"ask\"", "termVariance", "forwardPrice", "quoteMid"]) {
      expect(serialized, `${forbidden} must not appear`).not.toContain(forbidden);
    }
  });

  it("reports coverage as absent rather than as zero", async () => {
    // Nothing has been measured, and a coverage of zero would be a measurement.
    const body = (await (await GET_HEADLINE()).json()) as { coverage: Record<string, unknown> };
    expect(body.coverage.coveredParentWeight).toBeNull();
    expect(body.coverage.coveredIssuerCount).toBeNull();
    expect(body.coverage.maxConstituentWeight).toBeNull();
  });

  it("names its methodology version and presents it as the draft it is", async () => {
    const body = (await (await GET_HEADLINE()).json()) as {
      methodology: { version: string; status: string; documentPath: string };
    };
    expect(body.methodology.version).toBe("0.2.0-draft");
    expect(body.methodology.status).toBe("draft");
    expect(body.methodology.documentPath).toBe("/docs/methodology/uavi");
  });
});

describe("GET /api/uavi/series", () => {
  it("answers 200 with an empty series and fabricates no history", async () => {
    const response = await GET_SERIES();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { symbol: string; lifecycle: string; points: unknown[] };
    expect(body.symbol).toBe("UAVI");
    expect(body.lifecycle).toBe("not_initialized");
    expect(body.points).toEqual([]);
  });

  it("satisfies its own series contract", async () => {
    expect(validatePublicUaviSeries(await (await GET_SERIES()).json())).toEqual([]);
  });

  it("serves no points for any timeframe, because none exist", async () => {
    // A longer selector cannot conjure history. There is one answer and it is the empty one.
    const body = (await (await GET_SERIES()).json()) as { points: unknown[] };
    expect(body.points).toHaveLength(0);
  });
});
