/**
 * Model Economics demo data: one deterministic data graph and the views
 * derived from it.
 *
 *   Labs (token-providers.ts)
 *     ↓
 *   Models (MODEL_ROSTER: family, access class, blended price, capability)
 *     ↓
 *   Token price observations   → Token Price (TOKEN_INSTRUMENTS, shared with UCPI)
 *   Token volume observations  → UTVI, Market Share, Open-weight volume share,
 *                                Model Frontier point size
 *   Capability + access class  → Model Frontier, Open-weight capability and price gaps
 *
 * Every number the page shows is computed here from these records; nothing
 * is typed into the UI. All of it is deterministic demo data anchored at
 * MOCK_AS_OF, and none of it is a real observation.
 */

import { buildDailySeries, buildIntradaySeries } from "@/data/mock/series-generator";
import { findTokenLab } from "@/data/mock/token-providers";
import { MOCK_AS_OF } from "@/data/mock/ucpi";
import { availableRanges, periodReturn } from "@/lib/market-ranges";
import type { MarketInstrumentDetail, TimeSeriesPoint } from "@/types/market";
import type { AccessClass, FrontierPoint, ModelRecord, OpenWeightAnalysis, ShareRow } from "@/types/model-economics";

export const MODEL_ECONOMICS_AS_OF = MOCK_AS_OF;

/** Volume history length: comfortably more than the longest selectable range. */
const VOLUME_HISTORY_DAYS = 420;
/** Market share, frontier sizing, and open-weight analytics use this trailing window. */
export const SHARE_WINDOW_DAYS = 30;
/** Price-gap medians only consider models at or above this capability, so like is compared with like. */
export const PRICE_GAP_CAPABILITY_THRESHOLD = 80;
/** Model share tables list this many models before folding the rest into "Other". */
export const MODEL_SHARE_TOP_N = 8;

type ModelSpec = Omit<ModelRecord, "labName" | "modelFamily"> & {
  /** Latest observed tokens per day. */
  latestVolume: number;
  /** Mean daily growth of observed volume, read forwards. */
  growth: number;
  volatility: number;
  seed: number;
};

/**
 * A restrained representative roster: recognisable model families with
 * more than one representative for the largest labs, so model share differs
 * from lab share and the frontier has depth. Blended prices are $/1M tokens,
 * capability is a 0–100 demo score, and access class is demo metadata.
 */
const MODEL_SPECS: ModelSpec[] = [
  { id: "claude-opus", labId: "anthropic", modelName: "Claude Opus", accessClass: "proprietary", blendedPrice: 15.0, capabilityScore: 94.2, latestVolume: 0.95e12, growth: 0.0022, volatility: 0.03, seed: 41_001 },
  { id: "claude-sonnet", labId: "anthropic", modelName: "Claude Sonnet", accessClass: "proprietary", blendedPrice: 6.0, capabilityScore: 90.5, latestVolume: 1.7e12, growth: 0.0028, volatility: 0.03, seed: 41_002 },
  { id: "gpt-5", labId: "openai", modelName: "GPT-5", accessClass: "proprietary", blendedPrice: 8.75, capabilityScore: 93.6, latestVolume: 2.05e12, growth: 0.0018, volatility: 0.03, seed: 41_003 },
  { id: "gpt-mini", labId: "openai", modelName: "GPT mini", accessClass: "proprietary", blendedPrice: 1.2, capabilityScore: 82.0, latestVolume: 1.3e12, growth: 0.0012, volatility: 0.035, seed: 41_004 },
  { id: "gpt-oss", labId: "openai", modelName: "gpt-oss", accessClass: "open-weight", blendedPrice: 0.4, capabilityScore: 83.5, latestVolume: 0.4e12, growth: 0.0045, volatility: 0.04, seed: 41_005 },
  { id: "gemini-pro", labId: "google", modelName: "Gemini Pro", accessClass: "proprietary", blendedPrice: 6.25, capabilityScore: 92.4, latestVolume: 1.5e12, growth: 0.0026, volatility: 0.03, seed: 41_006 },
  { id: "gemini-flash", labId: "google", modelName: "Gemini Flash", accessClass: "proprietary", blendedPrice: 0.9, capabilityScore: 80.5, latestVolume: 1.9e12, growth: 0.0021, volatility: 0.035, seed: 41_007 },
  { id: "gemma", labId: "google", modelName: "Gemma", accessClass: "open-weight", blendedPrice: 0.35, capabilityScore: 76.8, latestVolume: 0.3e12, growth: 0.0015, volatility: 0.04, seed: 41_008 },
  { id: "deepseek-v", labId: "deepseek", modelName: "DeepSeek V", accessClass: "open-weight", blendedPrice: 0.85, capabilityScore: 88.7, latestVolume: 1.45e12, growth: 0.0042, volatility: 0.04, seed: 41_009 },
  { id: "deepseek-r", labId: "deepseek", modelName: "DeepSeek R", accessClass: "open-weight", blendedPrice: 1.4, capabilityScore: 91.3, latestVolume: 0.8e12, growth: 0.005, volatility: 0.045, seed: 41_010 },
  { id: "qwen", labId: "alibaba", modelName: "Qwen", accessClass: "open-weight", blendedPrice: 1.1, capabilityScore: 87.9, latestVolume: 1.1e12, growth: 0.0038, volatility: 0.04, seed: 41_011 },
  { id: "kimi", labId: "moonshot-ai", modelName: "Kimi", accessClass: "open-weight", blendedPrice: 1.6, capabilityScore: 89.6, latestVolume: 0.65e12, growth: 0.0048, volatility: 0.045, seed: 41_012 },
  { id: "minimax", labId: "minimax", modelName: "MiniMax", accessClass: "open-weight", blendedPrice: 0.7, capabilityScore: 84.1, latestVolume: 0.45e12, growth: 0.0035, volatility: 0.045, seed: 41_013 },
  { id: "mimo", labId: "xiaomi", modelName: "MiMo", accessClass: "open-weight", blendedPrice: 0.45, capabilityScore: 78.3, latestVolume: 0.25e12, growth: 0.006, volatility: 0.05, seed: 41_014 },
  { id: "llama", labId: "meta", modelName: "Llama", accessClass: "open-weight", blendedPrice: 0.6, capabilityScore: 81.6, latestVolume: 0.85e12, growth: 0.0006, volatility: 0.035, seed: 41_015 },
  { id: "glm", labId: "zhipu-ai", modelName: "GLM", accessClass: "open-weight", blendedPrice: 0.95, capabilityScore: 86.2, latestVolume: 0.55e12, growth: 0.004, volatility: 0.045, seed: 41_016 },
];

export const MODEL_ROSTER: ModelRecord[] = MODEL_SPECS.map((spec) => {
  const lab = findTokenLab(spec.labId);
  if (!lab) throw new Error(`Unknown lab for model ${spec.id}: ${spec.labId}`);
  return {
    id: spec.id,
    labId: spec.labId,
    labName: lab.name,
    modelName: spec.modelName,
    modelFamily: lab.modelFamily,
    accessClass: spec.accessClass,
    blendedPrice: spec.blendedPrice,
    capabilityScore: spec.capabilityScore,
  };
});

export function findModel(modelId: string): ModelRecord | undefined {
  return MODEL_ROSTER.find((model) => model.id === modelId);
}

/* ---------- Token volume observations ---------- */

/**
 * Daily observed tokens per day for each model, generated backwards from the
 * latest observation with each model's own growth and noise. Faster-growing
 * models were smaller in the past, so lab and model shares drift over time.
 * All series share the same dates, which is what lets them be summed.
 */
export const MODEL_VOLUME_SERIES: ReadonlyMap<string, TimeSeriesPoint[]> = new Map(
  MODEL_SPECS.map((spec) => [
    spec.id,
    buildDailySeries({
      seed: spec.seed,
      asOf: MODEL_ECONOMICS_AS_OF,
      latestValue: spec.latestVolume,
      latestDailyReturn: spec.growth,
      points: VOLUME_HISTORY_DAYS,
      volatility: spec.volatility,
      drift: spec.growth,
    }),
  ]),
);

function volumeSeries(modelId: string): TimeSeriesPoint[] {
  const series = MODEL_VOLUME_SERIES.get(modelId);
  if (!series) throw new Error(`No volume series for model ${modelId}`);
  return series;
}

/** Sum of every model's observed volume on each date. */
function aggregateVolume(modelIds: string[]): TimeSeriesPoint[] {
  const first = volumeSeries(modelIds[0]!);
  return first.map((point, index) => ({
    time: point.time,
    value: modelIds.reduce((sum, id) => sum + volumeSeries(id)[index]!.value, 0),
  }));
}

/* ---------- UTVI ---------- */

/**
 * UTVI, the Urdais Token Volume Index: UTVI(date) = sum of observed token
 * volume across every model in the demo universe on that date, in tokens
 * per day. The intraday tail is a bridge across the daily aggregate, pinned
 * to each day's total. The headline move is the trailing one-month change.
 */
const utviDaily = aggregateVolume(MODEL_SPECS.map((spec) => spec.id));
const utviIntraday = buildIntradaySeries(utviDaily, { seed: 42_000, days: 7, volatility: 0.01 });
const utviSeries = { daily: utviDaily, intraday: utviIntraday };
const utviLatest = utviDaily[utviDaily.length - 1]!;

export const UTVI: MarketInstrumentDetail = {
  id: "utvi",
  shortLabel: "UTVI",
  symbol: "UTVI",
  name: "Urdais Token Volume Index",
  unit: "tokens/day",
  snapshot: {
    value: utviLatest.value,
    changePercent: periodReturn(utviSeries, "1M", utviLatest.time) ?? 0,
    asOf: utviLatest.time,
  },
  series: utviSeries,
  availableRanges: availableRanges(utviSeries, utviLatest.time),
  comparisons: [],
};

/* ---------- Market share ---------- */

/** Mean observed tokens per day for a model over the trailing share window. */
function windowVolume(modelId: string): number {
  const points = volumeSeries(modelId).slice(-SHARE_WINDOW_DAYS);
  return points.reduce((sum, point) => sum + point.value, 0) / points.length;
}

const MODEL_WINDOW_VOLUME: ReadonlyMap<string, number> = new Map(
  MODEL_SPECS.map((spec) => [spec.id, windowVolume(spec.id)]),
);
const WINDOW_TOTAL = [...MODEL_WINDOW_VOLUME.values()].reduce((sum, value) => sum + value, 0);

function toShare(volume: number): number {
  return (volume / WINDOW_TOTAL) * 100;
}

/** Trailing-window volume share by lab, descending; shares sum to 100. */
export const LAB_SHARES: ShareRow[] = (() => {
  const byLab = new Map<string, { label: string; volume: number }>();
  for (const model of MODEL_ROSTER) {
    const entry = byLab.get(model.labId) ?? { label: model.labName, volume: 0 };
    entry.volume += MODEL_WINDOW_VOLUME.get(model.id)!;
    byLab.set(model.labId, entry);
  }
  return [...byLab.entries()]
    .map(([id, entry]) => ({ id, label: entry.label, volume: entry.volume, share: toShare(entry.volume) }))
    .sort((a, b) => b.volume - a.volume);
})();

/** Trailing-window volume share by model, descending, with the tail folded into "Other" so shares still sum to 100. */
export const MODEL_SHARES: ShareRow[] = (() => {
  const rows = MODEL_ROSTER.map((model) => {
    const volume = MODEL_WINDOW_VOLUME.get(model.id)!;
    return { id: model.id, label: model.modelName, detail: model.labName, volume, share: toShare(volume) };
  }).sort((a, b) => b.volume - a.volume);
  if (rows.length <= MODEL_SHARE_TOP_N + 1) return rows;
  const top = rows.slice(0, MODEL_SHARE_TOP_N);
  const rest = rows.slice(MODEL_SHARE_TOP_N);
  const restVolume = rest.reduce((sum, row) => sum + row.volume, 0);
  return [
    ...top,
    { id: "other", label: "Other", detail: `${rest.length} models`, volume: restVolume, share: toShare(restVolume) },
  ];
})();

/* ---------- Model frontier ---------- */

/**
 * A model is on the frontier when no other model is at least as cheap and
 * at least as capable with one of those strictly better: nothing dominates it.
 */
function isOnFrontier(model: ModelRecord): boolean {
  return !MODEL_ROSTER.some(
    (other) =>
      other.id !== model.id &&
      other.blendedPrice <= model.blendedPrice &&
      other.capabilityScore >= model.capabilityScore &&
      (other.blendedPrice < model.blendedPrice || other.capabilityScore > model.capabilityScore),
  );
}

export const FRONTIER_POINTS: FrontierPoint[] = MODEL_ROSTER.map((model) => ({
  ...model,
  tokenVolume: MODEL_WINDOW_VOLUME.get(model.id)!,
  onFrontier: isOnFrontier(model),
}));

/* ---------- Open-weight vs proprietary ---------- */

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function ofClass(accessClass: AccessClass): FrontierPoint[] {
  return FRONTIER_POINTS.filter((model) => model.accessClass === accessClass);
}

/**
 * Volume share: trailing-window observed volume by access class.
 * Capability gap: the most capable model in each class.
 * Price gap: median blended price in each class among models at or above
 * PRICE_GAP_CAPABILITY_THRESHOLD, so cheap low-capability models do not
 * flatter the open-weight median.
 */
export const OPEN_WEIGHT_ANALYSIS: OpenWeightAnalysis = (() => {
  const open = ofClass("open-weight");
  const proprietary = ofClass("proprietary");
  const openVolume = open.reduce((sum, model) => sum + model.tokenVolume, 0);
  const proprietaryVolume = proprietary.reduce((sum, model) => sum + model.tokenVolume, 0);
  const capable = (models: FrontierPoint[]) => models.filter((model) => model.capabilityScore >= PRICE_GAP_CAPABILITY_THRESHOLD);
  const openCapable = capable(open);
  const proprietaryCapable = capable(proprietary);
  const openMedian = median(openCapable.map((model) => model.blendedPrice));
  const proprietaryMedian = median(proprietaryCapable.map((model) => model.blendedPrice));
  const openBest = Math.max(...open.map((model) => model.capabilityScore));
  const proprietaryBest = Math.max(...proprietary.map((model) => model.capabilityScore));
  return {
    volumeShare: { openWeight: toShare(openVolume), proprietary: toShare(proprietaryVolume) },
    capabilityGap: { openWeight: openBest, proprietary: proprietaryBest, gap: proprietaryBest - openBest },
    priceGap: {
      openWeight: openMedian,
      proprietary: proprietaryMedian,
      ratio: proprietaryMedian / openMedian,
      capabilityThreshold: PRICE_GAP_CAPABILITY_THRESHOLD,
      openWeightCount: openCapable.length,
      proprietaryCount: proprietaryCapable.length,
    },
  };
})();
