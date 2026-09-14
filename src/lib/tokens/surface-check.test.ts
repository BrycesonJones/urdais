/**
 * The check that would have caught a blank Tokens page: it looks at what the
 * running site serves, not only at the database.
 */

import { describe, expect, it } from "vitest";

import { checkTokenSurfaces, formattedPrice, visibleText, type Fetcher } from "@/lib/tokens/surface-check";

const BENCHMARKS = [
  { providerSlug: "alibaba", providerName: "Alibaba Cloud", priceUsdPer1m: 4 },
  { providerSlug: "anthropic", providerName: "Anthropic", priceUsdPer1m: 30 },
  { providerSlug: "openai", providerName: "OpenAI", priceUsdPer1m: 30 },
  { providerSlug: "xai", providerName: "xAI", priceUsdPer1m: 4 },
];

function site(options: { api?: unknown; apiStatus?: number; html?: string; pageStatus?: number } = {}): Fetcher {
  return async (url: string) => {
    if (url.endsWith("/api/tokens/prices")) {
      return { status: options.apiStatus ?? 200, text: async () => JSON.stringify(options.api ?? { benchmarks: BENCHMARKS }) };
    }
    return { status: options.pageStatus ?? 200, text: async () => options.html ?? "<html><body><h1>Anthropic</h1><p>$30.00 per 1M tokens</p><button>Compute</button><button>Tokens</button></body></html>" };
  };
}

describe("public surface check", () => {
  it("passes when the API has benchmarks and every page renders them", async () => {
    const report = await checkTokenSurfaces("https://example.invalid/", site());
    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
    expect(report.benchmarks).toHaveLength(4);
    expect(report.pages.every((page) => page.ok)).toBe(true);
    expect(report.origin).toBe("https://example.invalid");
  });

  it("fails when the API returns no benchmarks, which is the blank-surface case", async () => {
    const report = await checkTokenSurfaces("https://example.invalid", site({ api: { benchmarks: [] } }));
    expect(report.ok).toBe(false);
    const finding = report.findings.find((row) => row.code === "API_EMPTY")!;
    expect(finding.detail).toContain("no benchmarks");
    expect(finding.remedy).toContain("tokens:production:check");
  });

  it("fails when a page shows the benchmark-pending placeholder", async () => {
    const report = await checkTokenSurfaces(
      "https://example.invalid",
      site({ html: "<html><body>Token price benchmark not yet defined. Canonical model prices are collected;</body></html>" }),
    );
    expect(report.ok).toBe(false);
    expect(report.findings.some((row) => row.code === "PAGE_SHOWS_PLACEHOLDER")).toBe(true);
    expect(report.pages.every((page) => !page.ok)).toBe(true);
  });

  it("fails when the API has data the value page does not render", async () => {
    const report = await checkTokenSurfaces("https://example.invalid", site({ html: "<html><body><h1>Tokens</h1></body></html>" }), [
      { path: "/markets/model-economics", expects: "value" },
    ]);
    expect(report.ok).toBe(false);
    const finding = report.findings.find((row) => row.code === "PAGE_MISSING_VALUE")!;
    expect(finding.detail).toContain("Anthropic");
    expect(finding.detail).toContain("$30.00");
    expect(finding.remedy).toContain("the read path the page uses");
  });

  it("fails when the API or a page is unreachable", async () => {
    const down = await checkTokenSurfaces("https://example.invalid", site({ apiStatus: 503 }));
    expect(down.findings.some((row) => row.code === "API_UNREACHABLE")).toBe(true);

    const missingPage = await checkTokenSurfaces("https://example.invalid", site({ pageStatus: 404 }));
    expect(missingPage.findings.some((row) => row.code === "PAGE_UNREACHABLE")).toBe(true);

    const threw = await checkTokenSurfaces("https://example.invalid", async () => {
      throw new Error("connect ECONNREFUSED");
    });
    expect(threw.ok).toBe(false);
    expect(threw.findings.some((row) => row.detail.includes("ECONNREFUSED"))).toBe(true);
  });

  it("checks both public token surfaces by default", async () => {
    const seen: string[] = [];
    const report = await checkTokenSurfaces("https://example.invalid", async (url) => {
      seen.push(url);
      return site()(url);
    });
    expect(seen).toEqual([
      "https://example.invalid/api/tokens/prices",
      "https://example.invalid/markets/model-economics",
      "https://example.invalid/markets/ucpi",
    ]);
    expect(report.pages.map((page) => [page.path, page.expects])).toEqual([
      ["/markets/model-economics", "value"],
      ["/markets/ucpi", "family"],
    ]);
  });

  it("asserts the price as a reader sees it", () => {
    expect(formattedPrice(30)).toBe("$30.00");
    expect(formattedPrice(4)).toBe("$4.00");
    expect(formattedPrice(6.5)).toBe("$6.50");
  });
});

describe("what a reader sees", () => {
  it("matches a price React split across a comment separator", () => {
    const html = '<span class="text-3xl">$<!-- -->30.00</span> <span>per 1M tokens</span>';
    expect(visibleText(html)).toContain("$30.00");
  });

  it("ignores framework payloads in scripts, so a page is not passed by its own flight data", () => {
    const html = '<script>self.__next_f.push([1,"Anthropic $30.00 per 1M tokens"])</script><body><h1>Tokens</h1></body>';
    expect(visibleText(html)).not.toContain("$30.00");
  });

  it("passes a real server-rendered page and fails one that only mentions the value in a script", async () => {
    const valuePage = [{ path: "/markets/model-economics", expects: "value" as const }];
    const rendered = '<h1>Anthropic</h1><p><span>$<!-- -->30.00</span> <span>per 1M tokens</span></p>';
    const ok = await checkTokenSurfaces("https://example.invalid", site({ html: rendered }), valuePage);
    expect(ok.ok).toBe(true);

    const scriptOnly = '<script>{"providerName":"Anthropic","priceUsdPer1m":30}</script><body>Tokens</body>';
    const bad = await checkTokenSurfaces("https://example.invalid", site({ html: scriptOnly }), valuePage);
    expect(bad.ok).toBe(false);
    expect(bad.findings.some((row) => row.code === "PAGE_MISSING_VALUE")).toBe(true);
  });
});

describe("each surface is asked for what it actually renders", () => {
  it("accepts a market page that offers the Tokens family without showing the price yet", async () => {
    const report = await checkTokenSurfaces("https://example.invalid", site({ html: "<html><body><h1>UCPI-H100-SXM</h1><button>Compute</button><button>Tokens</button></body></html>" }), [
      { path: "/markets/ucpi", expects: "family" },
    ]);
    expect(report.ok).toBe(true);
  });

  it("fails a market page whose Tokens family is missing altogether", async () => {
    const report = await checkTokenSurfaces("https://example.invalid", site({ html: "<html><body><h1>UCPI-H100-SXM</h1><button>Compute</button></body></html>" }), [
      { path: "/markets/ucpi", expects: "family" },
    ]);
    expect(report.ok).toBe(false);
    const finding = report.findings.find((row) => row.code === "PAGE_MISSING_VALUE")!;
    expect(finding.detail).toContain("Tokens family");
    expect(finding.remedy).toContain("family hydration");
  });
});

describe("the value page is checked for what it actually opens on", () => {
  it("looks for the designated default provider, not the API's first row", async () => {
    // Alibaba Cloud sorts first in the API payload; the page opens on Anthropic.
    // Checking the first row would fail a page that is working correctly.
    const rendered = "<html><body><h1>Anthropic</h1><p>$30.00 per 1M tokens</p></body></html>";
    const report = await checkTokenSurfaces("https://example.invalid", site({ html: rendered }), [
      { path: "/markets/model-economics", expects: "value" },
    ]);
    expect(report.ok).toBe(true);
  });

  it("still fails a page that shows no benchmark at all", async () => {
    const report = await checkTokenSurfaces("https://example.invalid", site({ html: "<html><body><h1>Tokens</h1></body></html>" }), [
      { path: "/markets/model-economics", expects: "value" },
    ]);
    expect(report.ok).toBe(false);
    expect(report.findings.some((row) => row.code === "PAGE_MISSING_VALUE")).toBe(true);
  });
});
