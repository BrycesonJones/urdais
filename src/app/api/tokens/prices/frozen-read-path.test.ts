/**
 * The public API serves the frozen record, not a recalculation.
 *
 * Until October 2026 `GET /api/tokens/prices` recalculated every benchmark from
 * observations on each request while the market pages served the frozen rows.
 * The two agreed on every price, so nothing looked wrong, but the API labelled
 * Anthropic's and OpenAI's 14 September rows methodology 1.2: the calculator
 * re-derives a point's version from its date, and 1.0, 1.1 and 1.2 all take
 * effect on 14 September, so the latest of them wins. Both rows were frozen
 * under 1.1, and the frozen row is the record.
 *
 * The label was the visible symptom. The invariant underneath is that once a
 * value is frozen, a later correction to a raw leg does not move what is
 * published -- and an API that recalculates honours that only until the first
 * correction lands.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PersistedBenchmarkRow } from "@/lib/tokens/read/benchmark-store";
import type { TokenReadCatalog } from "@/lib/tokens/read/series";
import { seedTokenReadCatalog, type SeedQuote } from "@/lib/tokens/read/test-support";

const database = vi.hoisted(() => ({
  catalog: null as TokenReadCatalog | null,
  frozen: null as PersistedBenchmarkRow[] | null,
}));

vi.mock("@/lib/tokens/read/database", () => ({
  loadTokenReadCatalogFromDatabase: async () => database.catalog,
  loadFrozenBenchmarksFromDatabase: async () => database.frozen,
  loadVerificationEventsFromDatabase: async () => [],
}));

const { GET } = await import("@/app/api/tokens/prices/route");
const { loadVisibleTokenInstruments, visibleTokenBenchmarks } = await import("@/lib/tokens/read/load");

const SEP_14_A = "2026-09-14T12:03:02.002Z";
const SEP_14_B = "2026-09-14T17:43:35.197Z";
const SEP_14_C = "2026-09-14T22:16:11.904Z";
const SEP_20 = "2026-09-20T09:00:00.000Z";
const SEP_22 = "2026-09-22T20:26:30.000Z";

type Leg = { provider: SeedQuote["provider"]; model: string; input: number; output: number; at: string; contextTier?: string };

/** Production's frozen state on 1 October 2026, one entry per frozen value row. */
const PRODUCTION: (Leg & { name: string; version: string; price: number })[] = [
  { provider: "anthropic", model: "claude-fable-5-1", name: "Claude Fable 5.1", version: "1.1", input: 10, output: 50, price: 30, at: SEP_14_A },
  { provider: "openai", model: "gpt-6-astra", name: "GPT-6 Astra", version: "1.1", input: 10, output: 50, price: 30, at: SEP_14_A },
  { provider: "xai", model: "grok-4.6", name: "Grok 4.6", version: "1.1", input: 2, output: 6, price: 4, at: SEP_14_A, contextTier: "prompt_lt_200k" },
  { provider: "xai", model: "grok-4.7", name: "Grok 4.7", version: "1.3", input: 2, output: 6, price: 4, at: SEP_22, contextTier: "prompt_lt_200k" },
  { provider: "google", model: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview", version: "1.2", input: 2, output: 12, price: 7, at: SEP_14_B },
  { provider: "alibaba", model: "qwen3.8-max", name: "Qwen3.8-Max", version: "1.2", input: 2, output: 6, price: 4, at: SEP_14_B },
  { provider: "moonshot", model: "kimi-k3", name: "Kimi K3", version: "1.2", input: 3, output: 15, price: 9, at: SEP_14_C },
];

function quotes(legs: readonly Leg[]): SeedQuote[] {
  return legs.flatMap((leg) => [
    { provider: leg.provider, providerModelId: leg.model, dimension: "input" as const, price: leg.input, retrievedAt: leg.at, contextTier: leg.contextTier, acquisitionMode: "manual_verified" as const, verificationEvidence: "test" },
    { provider: leg.provider, providerModelId: leg.model, dimension: "output" as const, price: leg.output, retrievedAt: leg.at, contextTier: leg.contextTier, acquisitionMode: "manual_verified" as const, verificationEvidence: "test" },
  ]);
}

/** A frozen value row whose legs are the catalog observations seeded for it. */
function frozenRow(catalog: TokenReadCatalog, row: (typeof PRODUCTION)[number]): PersistedBenchmarkRow {
  const leg = (dimension: string) =>
    catalog.observations.find(
      (obs) => obs.providerSlug === row.provider && obs.providerModelId === row.model && obs.pricingDimension === dimension && obs.retrievedAt === row.at,
    )!.id;
  return {
    id: `${row.provider}-${row.model}`,
    providerSlug: row.provider,
    methodologyVersion: row.version,
    benchmarkModelId: row.model,
    benchmarkModelName: row.name,
    calculationStatus: "value",
    withheldReason: null,
    priceUsdPer1m: row.price,
    inputObservationId: leg("input"),
    outputObservationId: leg("output"),
    inputPriceUsdPer1m: row.input,
    outputPriceUsdPer1m: row.output,
    inputObservedAt: row.at,
    outputObservedAt: row.at,
    calculatedAt: row.at,
  };
}

const DEEPSEEK_WITHHELD: PersistedBenchmarkRow = {
  id: "deepseek-withheld",
  providerSlug: "deepseek",
  methodologyVersion: "1.2",
  benchmarkModelId: null,
  benchmarkModelName: null,
  calculationStatus: "withheld",
  withheldReason: "NO_STANDARD_SERVICE_TIER",
  priceUsdPer1m: null,
  inputObservationId: null,
  outputObservationId: null,
  inputPriceUsdPer1m: null,
  outputPriceUsdPer1m: null,
  inputObservedAt: null,
  outputObservedAt: null,
  calculatedAt: SEP_14_B,
} as unknown as PersistedBenchmarkRow;

function seed(rows: typeof PRODUCTION, extra: readonly Leg[] = []): void {
  database.catalog = seedTokenReadCatalog([...quotes(rows), ...quotes(extra)]);
  database.frozen = [...rows.map((row) => frozenRow(database.catalog!, row)), DEEPSEEK_WITHHELD];
}

type ApiBenchmark = {
  providerSlug: string;
  benchmarkModelId: string;
  methodologyVersion: string;
  priceUsdPer1m: number;
  updatedAt: string;
  percentageChange: number | null;
  history: { time: string; priceUsdPer1m: number }[];
};

async function api(): Promise<ApiBenchmark[]> {
  const response = await GET();
  expect(response.status).toBe(200);
  return ((await response.json()) as { benchmarks: ApiBenchmark[] }).benchmarks;
}

const bySlug = (rows: ApiBenchmark[], slug: string) => rows.find((row) => row.providerSlug === slug);

describe("GET /api/tokens/prices serves the frozen record", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    database.catalog = null;
    database.frozen = null;
  });

  it("keeps the methodology version a row was frozen under", async () => {
    const anthropic = PRODUCTION.filter((row) => row.provider === "anthropic");
    seed(anthropic);
    // Not vacuous: the same observations recalculated are labelled 1.2.
    expect(visibleTokenBenchmarks(database.catalog!).find((row) => row.providerSlug === "anthropic")?.methodologyVersion).toBe("1.2");

    expect(bySlug(await api(), "anthropic")?.methodologyVersion).toBe("1.1");
  });

  it("keeps the frozen value when a later raw leg would recalculate it", async () => {
    const anthropic = PRODUCTION.filter((row) => row.provider === "anthropic");
    // A corrected input leg read on 20 September; nothing was frozen from it.
    seed(anthropic, [{ provider: "anthropic", model: "claude-fable-5-1", input: 12, output: 50, at: SEP_20 }]);
    const recalculated = visibleTokenBenchmarks(database.catalog!).find((row) => row.providerSlug === "anthropic");
    expect(recalculated?.priceUsdPer1m).toBe(31);

    const served = bySlug(await api(), "anthropic")!;
    expect(served.priceUsdPer1m).toBe(30);
    expect(served.updatedAt).toBe(SEP_14_A);
    expect(served.history).toEqual([{ time: SEP_14_A, priceUsdPer1m: 30 }]);
  });

  it("serves production's 1 October state exactly as frozen", async () => {
    seed(PRODUCTION);
    const rows = await api();

    expect(rows.map((row) => [row.providerSlug, row.benchmarkModelId, row.methodologyVersion, row.priceUsdPer1m, row.updatedAt])).toEqual([
      ["alibaba", "qwen3.8-max", "1.2", 4, SEP_14_B],
      ["anthropic", "claude-fable-5-1", "1.1", 30, SEP_14_A],
      ["google", "gemini-3.1-pro-preview", "1.2", 7, SEP_14_B],
      ["moonshot", "kimi-k3", "1.2", 9, SEP_14_C],
      ["openai", "gpt-6-astra", "1.1", 30, SEP_14_A],
      ["xai", "grok-4.7", "1.3", 4, SEP_22],
    ]);
    // One point per unchanged provider, the xAI succession as two, and nothing after it.
    for (const row of rows.filter((row) => row.providerSlug !== "xai")) expect(row.history).toEqual([{ time: row.updatedAt, priceUsdPer1m: row.priceUsdPer1m }]);
    expect(bySlug(rows, "xai")!.history).toEqual([
      { time: SEP_14_A, priceUsdPer1m: 4 },
      { time: SEP_22, priceUsdPer1m: 4 },
    ]);
    expect(bySlug(rows, "xai")!.percentageChange).toBeNull();
    // DeepSeek is withheld, so it has no number to serve.
    expect(bySlug(rows, "deepseek")).toBeUndefined();
    expect(JSON.stringify(rows)).not.toContain("deepseek");
  });

  it("agrees with the market page on every published fact", async () => {
    seed(PRODUCTION, [{ provider: "anthropic", model: "claude-fable-5-1", input: 12, output: 50, at: SEP_20 }]);
    const rows = await api();
    const instruments = await loadVisibleTokenInstruments();

    expect(instruments.map((row) => row.id)).toEqual(rows.map((row) => `token-price:${row.providerSlug}`));
    for (const row of rows) {
      const page = instruments.find((instrument) => instrument.id === `token-price:${row.providerSlug}`)!;
      const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000);
      expect(page.snapshot.value, row.providerSlug).toBe(row.priceUsdPer1m);
      expect(page.snapshot.asOf, row.providerSlug).toBe(unix(row.updatedAt));
      expect(page.snapshot.changePercent, row.providerSlug).toBe(row.percentageChange);
      expect(page.series.daily.map((point) => [point.time, point.value]), row.providerSlug).toEqual(
        row.history.map((point) => [unix(point.time), point.priceUsdPer1m]),
      );
      expect(page.benchmarkIdentity?.methodologyVersion, row.providerSlug).toBe(row.methodologyVersion);
      expect(page.benchmarkIdentity?.benchmarkModelId, row.providerSlug).toBe(row.benchmarkModelId);
    }
  });
});
