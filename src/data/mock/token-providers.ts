/**
 * The token-provider catalog: the AI labs whose provider-level token
 * pricing Urdais tracks, with the seeded parameters for each deterministic
 * demo price history. This is the single source for both the UCPI Tokens
 * family and the Model Economics Token Price view, so the two never drift.
 *
 * Provider-level token pricing semantics are provisional. These are generic
 * per-provider demo series in $/1M tokens that exist to exercise the family
 * selector and data contract; real backend work may later distinguish input,
 * output, cached, batch, or reasoning token pricing series per model. The
 * values are not actual provider prices.
 *
 * The selector chooses the lab or provider, not a model. The Model Economics
 * roster adds representative models beneath each lab; `modelFamily` names
 * the family that layer belongs to.
 */

import type { DailySeriesConfig, IntradaySeriesConfig } from "@/data/mock/series-generator";

export type TokenLab = {
  /** Stable id, e.g. "moonshot-ai". */
  id: string;
  name: string;
  modelFamily: string;
  price: Omit<DailySeriesConfig, "asOf">;
  intraday: IntradaySeriesConfig;
};

export const TOKEN_UNIT = "$/1M tokens";

export const TOKEN_LABS: TokenLab[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    modelFamily: "Claude",
    price: { seed: 20230301, latestValue: 9.0, latestDailyReturn: 0.0022, points: 900, volatility: 0.004, drift: -0.0009 },
    intraday: { seed: 9_100_000, days: 7, volatility: 0.002 },
  },
  {
    id: "openai",
    name: "OpenAI",
    modelFamily: "GPT",
    price: { seed: 20230302, latestValue: 7.5, latestDailyReturn: -0.0066, points: 900, volatility: 0.005, drift: -0.001 },
    intraday: { seed: 9_200_000, days: 7, volatility: 0.002 },
  },
  {
    id: "google",
    name: "Google",
    modelFamily: "Gemini",
    price: { seed: 20230303, latestValue: 4.2, latestDailyReturn: 0.0024, points: 900, volatility: 0.005, drift: -0.0012 },
    intraday: { seed: 9_300_000, days: 7, volatility: 0.002 },
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    modelFamily: "DeepSeek",
    price: { seed: 20230304, latestValue: 1.1, latestDailyReturn: -0.0089, points: 700, volatility: 0.007, drift: -0.0015 },
    intraday: { seed: 9_400_000, days: 7, volatility: 0.003 },
  },
  {
    id: "alibaba",
    name: "Alibaba",
    modelFamily: "Qwen",
    price: { seed: 20230305, latestValue: 2.4, latestDailyReturn: -0.0041, points: 800, volatility: 0.006, drift: -0.0013 },
    intraday: { seed: 9_500_000, days: 7, volatility: 0.003 },
  },
  {
    id: "moonshot-ai",
    name: "Moonshot AI",
    modelFamily: "Kimi",
    price: { seed: 20230306, latestValue: 1.8, latestDailyReturn: 0.0056, points: 720, volatility: 0.008, drift: -0.0016 },
    intraday: { seed: 9_600_000, days: 7, volatility: 0.003 },
  },
  {
    id: "minimax",
    name: "MiniMax",
    modelFamily: "MiniMax",
    price: { seed: 20230307, latestValue: 1.2, latestDailyReturn: -0.0025, points: 700, volatility: 0.007, drift: -0.0011 },
    intraday: { seed: 9_700_000, days: 7, volatility: 0.003 },
  },
  {
    id: "xiaomi",
    name: "Xiaomi",
    modelFamily: "MiMo",
    price: { seed: 20230308, latestValue: 0.9, latestDailyReturn: 0.0112, points: 600, volatility: 0.009, drift: -0.0018 },
    intraday: { seed: 9_800_000, days: 7, volatility: 0.004 },
  },
  {
    id: "meta",
    name: "Meta",
    modelFamily: "Llama",
    price: { seed: 20230309, latestValue: 3.1, latestDailyReturn: 0.0016, points: 900, volatility: 0.004, drift: -0.0008 },
    intraday: { seed: 9_900_000, days: 7, volatility: 0.002 },
  },
  {
    id: "zhipu-ai",
    name: "Zhipu AI",
    modelFamily: "GLM",
    price: { seed: 20230310, latestValue: 1.5, latestDailyReturn: -0.0067, points: 760, volatility: 0.007, drift: -0.0014 },
    intraday: { seed: 9_950_000, days: 7, volatility: 0.003 },
  },
  {
    id: "xai",
    name: "xAI",
    modelFamily: "Grok",
    price: { seed: 20230311, latestValue: 4.0, latestDailyReturn: 0.0028, points: 720, volatility: 0.006, drift: -0.0011 },
    intraday: { seed: 9_970_000, days: 7, volatility: 0.003 },
  },
];

/** Labs listed alphabetically by display name, so selectors stay predictable as labs are added. */
export const TOKEN_LABS_SORTED: TokenLab[] = [...TOKEN_LABS].sort((a, b) => a.name.localeCompare(b.name, "en"));

/** The lab opened when the Tokens family or Token Price view is first shown. */
export const DEFAULT_TOKEN_LAB_ID = "anthropic";

/** Instrument id for a lab's token-price series, e.g. "tokens-anthropic". */
export function tokenInstrumentId(labId: string): string {
  return `tokens-${labId}`;
}

export function findTokenLab(labId: string): TokenLab | undefined {
  return TOKEN_LABS.find((lab) => lab.id === labId);
}
