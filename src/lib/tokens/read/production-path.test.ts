import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MAX_COMPARISONS } from "@/components/market-detail/use-instrument-chart";
import { findMarket } from "@/data/mock/market-detail";
import { tokenInstrumentsFromSeries } from "@/lib/tokens/read/instruments";
import { listPublicTokenSeries } from "@/lib/tokens/read/series";
import { seedTokenReadCatalog } from "@/lib/tokens/read/test-support";

const ROOT = process.cwd();

function readSrc(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

const PRODUCTION_TOKEN_PATHS = [
  "src/app/markets/page.tsx",
  "src/app/markets/[symbol]/page.tsx",
  "src/app/markets/model-economics/page.tsx",
  "src/app/api/tokens/prices/route.ts",
  "src/components/market-detail/market-detail-page.tsx",
  "src/components/market-detail/market-header.tsx",
  "src/components/market-detail/market-selectors.tsx",
  "src/components/market-detail/token-series-selectors.tsx",
  "src/components/model-economics/token-price-section.tsx",
  "src/data/mock/market-detail.ts",
  "src/lib/tokens/read/load.ts",
  "src/lib/tokens/read/instruments.ts",
  "src/lib/tokens/read/series.ts",
  "src/lib/tokens/read/publication.ts",
  "src/lib/tokens/read/sql.ts",
  "src/lib/tokens/read/database.ts",
  "src/lib/tokens/preview-seed.ts",
  "src/components/market-detail/research-preview-badge.tsx",
  "src/components/model-economics/model-economics-page.tsx",
];

describe("production Tokens path", () => {
  it("does not import demo token pricing", () => {
    for (const file of PRODUCTION_TOKEN_PATHS) {
      const source = readSrc(file);
      expect(source, file).not.toMatch(/@\/data\/mock\/token-providers/);
      expect(source, file).not.toMatch(/TOKEN_INSTRUMENTS/);
      expect(source, file).not.toMatch(/latestValue:\s*9\.0/);
      expect(source, file).not.toMatch(/tokens-anthropic"/);
    }
  });

  it("leaves the static UCPI Tokens family empty so demo labs cannot load", () => {
    const tokens = findMarket("ucpi")!.families.find((family) => family.id === "tokens")!;
    expect(tokens.instruments).toEqual([]);
    expect(tokens.defaultInstrumentId).toBe("");
  });

  it("keeps compare at four series total and does not model absolute point change", () => {
    expect(MAX_COMPARISONS).toBe(3);
    const source = readSrc("src/types/market.ts") + readSrc("src/components/market-detail/market-header.tsx") + readSrc("src/components/model-economics/token-price-section.tsx");
    expect(source).not.toMatch(/changeAbsolute|pointChange|absoluteChange/);
    const instruments = tokenInstrumentsFromSeries(
      listPublicTokenSeries(
        seedTokenReadCatalog([
          { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z" },
          { provider: "anthropic", providerModelId: "claude-sonnet-5", dimension: "output", price: 10, retrievedAt: "2026-09-14T03:10:00Z" },
          { provider: "anthropic", providerModelId: "claude-opus-5", dimension: "input", price: 5, retrievedAt: "2026-09-14T03:10:00Z" },
          { provider: "anthropic", providerModelId: "claude-haiku-4-5-20251001", dimension: "input", price: 1, retrievedAt: "2026-09-14T03:10:00Z" },
          { provider: "xai", providerModelId: "grok-4.6", dimension: "input", price: 2, retrievedAt: "2026-09-14T03:10:00Z", contextTier: "prompt_lt_200k" },
        ]),
      ),
    );
    expect(instruments[0]?.comparisons.length).toBeGreaterThanOrEqual(4);
    expect(instruments.every((row) => Object.keys(row.snapshot).sort().join(",") === "asOf,changePercent,value")).toBe(true);
  });
});
