import { describe, expect, it, vi } from "vitest";

import { productionIdentityFor } from "../identity";
import { ECOS_DEMO_KEY, ECOS_DEMO_PAGE_SIZE, createBokAdapter } from "./bok";
import { UmpiParseError } from "./errors";

const identity = productionIdentityFor("UMPI-KR-DRAM-PPI");

/** A month's worth of the real ECOS row shape, with a synthetic level. */
const ecosRow = (time: string, value: number) => ({
  STAT_CODE: "404Y016",
  STAT_NAME: "4.1.1.3. 생산자물가지수(품목별)",
  ITEM_CODE1: "30911201AA",
  ITEM_NAME1: "DRAM",
  UNIT_NAME: "2020=100",
  WGT: "1.2",
  TIME: time,
  DATA_VALUE: String(value),
});

/** Twenty-five consecutive months, so the demo key's ten-row cap needs three pages. */
const ALL_MONTHS = Array.from({ length: 25 }, (_, i) => {
  const month = ((i % 12) + 1).toString().padStart(2, "0");
  const year = 2024 + Math.floor(i / 12);
  return ecosRow(`${year}${month}`, 100 + i);
});

/** A fetcher that serves the 1-based inclusive window the URL asks for. */
function pagingFetcher(rows: typeof ALL_MONTHS, declaredTotal = rows.length, maxWindow = ECOS_DEMO_PAGE_SIZE) {
  return vi.fn(async (url: string) => {
    const match = /\/json\/kr\/(\d+)\/(\d+)\//.exec(url);
    const start = Number(match![1]);
    const end = Number(match![2]);
    if (end - start + 1 > maxWindow) {
      // What the service actually does for an over-wide demo window.
      return new Response(JSON.stringify({ RESULT: { CODE: "ERROR-301", MESSAGE: "조회건수 값의 타입이 유효하지 않습니다" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const page = rows.slice(start - 1, end);
    return new Response(
      JSON.stringify({ StatisticSearch: { list_total_count: declaredTotal, row: page } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}

describe("ECOS demo-key pagination", () => {
  it("walks ten-row windows until the service's own count is exhausted", async () => {
    const fetcher = pagingFetcher(ALL_MONTHS);
    const adapter = createBokAdapter({ fetcher, sleep: async () => {} });
    const result = await adapter.fetch({
      identity,
      range: { fromMonth: "2024-01", toMonth: "2026-01" },
      apiKey: ECOS_DEMO_KEY,
    });

    // 25 rows at ten per page is three calls, and every row arrives exactly once.
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(result.rows).toHaveLength(25);
    expect(result.rows.every((row) => row.state === "admitted")).toBe(true);
    expect(result.enumerationAssessment).toBe("complete");
    expect(result.sourceMetadata).toMatchObject({ pagesFetched: 3, pageSize: 10, usedDemoKey: true });

    // No window exceeds what the demo key allows.
    for (const call of fetcher.mock.calls) {
      const window = /\/json\/kr\/(\d+)\/(\d+)\//.exec(String(call[0]))!;
      expect(Number(window[2]) - Number(window[1]) + 1).toBeLessThanOrEqual(ECOS_DEMO_PAGE_SIZE);
    }
  });

  it("returns every month exactly once, in order, with no gaps or repeats", async () => {
    const adapter = createBokAdapter({ fetcher: pagingFetcher(ALL_MONTHS), sleep: async () => {} });
    const result = await adapter.fetch({
      identity,
      range: { fromMonth: "2024-01", toMonth: "2026-01" },
      apiKey: ECOS_DEMO_KEY,
    });
    const months = result.rows.map((row) => (row.state === "admitted" ? row.observation.referenceMonth : null));
    expect(new Set(months).size).toBe(months.length);
    expect(months[0]).toBe("2024-01");
    expect(months[months.length - 1]).toBe("2026-01");
  });

  it("stops on a short page even when the declared count is larger", async () => {
    // A service that over-reports must not send the adapter into an endless loop.
    const adapter = createBokAdapter({ fetcher: pagingFetcher(ALL_MONTHS.slice(0, 12), 9999), sleep: async () => {} });
    const result = await adapter.fetch({
      identity,
      range: { fromMonth: "2024-01", toMonth: "2024-12" },
      apiKey: ECOS_DEMO_KEY,
    });
    expect(result.rows).toHaveLength(12);
    // The disagreement is reported rather than hidden.
    expect(result.enumerationAssessment).toBe("unknown");
    expect(result.enumerationEvidence).toContain("9999");
  });

  it("makes exactly one call when the range fits in one page", async () => {
    const fetcher = pagingFetcher(ALL_MONTHS.slice(0, 4));
    const adapter = createBokAdapter({ fetcher, sleep: async () => {} });
    const result = await adapter.fetch({
      identity,
      range: { fromMonth: "2024-01", toMonth: "2024-04" },
      apiKey: ECOS_DEMO_KEY,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.rows).toHaveLength(4);
  });

  it("still refuses a response from the export price table, page by page", async () => {
    const wrongTable = [{ ...ecosRow("202406", 250), STAT_CODE: "402Y016" }];
    const adapter = createBokAdapter({ fetcher: pagingFetcher(wrongTable), sleep: async () => {} });
    await expect(
      adapter.fetch({ identity, range: { fromMonth: "2024-06", toMonth: "2024-06" }, apiKey: ECOS_DEMO_KEY }),
    ).rejects.toThrow(/402Y016/);
  });

  it("never sends a credential into the stored request URL", async () => {
    // A registered key takes a wider window, so the fake's cap is widened to match.
    const adapter = createBokAdapter({ fetcher: pagingFetcher(ALL_MONTHS.slice(0, 2), 2, 1000), sleep: async () => {} });
    const result = await adapter.fetch({
      identity,
      range: { fromMonth: "2024-01", toMonth: "2024-02" },
      apiKey: "a-registered-key",
    });
    expect(result.requestUrl).not.toContain("a-registered-key");
    expect(result.requestUrl).toContain("REDACTED");
  });

  it("refuses to page forever", async () => {
    // A service that always returns a full page and a huge count must terminate somewhere.
    const endless = vi.fn(async () =>
      new Response(JSON.stringify({ StatisticSearch: { list_total_count: 10_000_000, row: ALL_MONTHS.slice(0, 10) } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const adapter = createBokAdapter({ fetcher: endless, sleep: async () => {} });
    await expect(
      adapter.fetch({ identity, range: { fromMonth: "1995-01", toMonth: "2026-08" }, apiKey: ECOS_DEMO_KEY }),
    ).rejects.toThrow(UmpiParseError);
  });
});
