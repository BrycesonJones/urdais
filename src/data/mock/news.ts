/**
 * Deterministic dummy news for homepage layout work.
 *
 * Every story here is invented development content: no real publisher,
 * article, announcement, or company claim. Timestamps are fixed. `url` is
 * null so nothing links out. Thumbnails come from Lorem Picsum, a
 * placeholder image service allowed narrowly in next.config.ts for
 * development only; the production provider and image policy are decided
 * during backend work. Replace this module with the ingestion-backed data
 * source when it exists.
 */

import type { NewsArticle, NewsCategory } from "@/types/news";

/** Fixed demo publication window ending 2026-09-04 (the mock as-of date). */
const day = (daysAgo: number, hourUtc: number) =>
  new Date(Date.UTC(2026, 8, 4 - daysAgo, hourUtc, 0, 0)).toISOString();

/** Placeholder thumbnail from the mock-development image host, keyed by a stable seed. */
const mockThumbnail = (seed: string) => `https://picsum.photos/seed/urdais-${seed}/640/360`;

type Draft = Omit<NewsArticle, "id" | "category" | "imageUrl"> & { image?: false };

function build(category: NewsCategory, drafts: Draft[]): NewsArticle[] {
  return drafts.map((draft, i) => ({
    id: `${category}-${i + 1}`,
    category,
    title: draft.title,
    summary: draft.summary,
    source: draft.source,
    publishedAt: draft.publishedAt,
    url: draft.url,
    // One story per category has no image so the fallback is always exercised.
    imageUrl: draft.image === false ? null : mockThumbnail(`${category}-${i + 1}`),
  }));
}

export const MOCK_NEWS: Record<NewsCategory, NewsArticle[]> = {
  compute: build("compute", [
    { title: "Demo: H100 hourly rates ease as spot capacity loosens across major clouds", summary: "Sample story tracking a modest week-over-week decline in on-demand GPU pricing, with reserved capacity holding steady.", source: "Demo Compute Desk", publishedAt: day(0, 14), url: null },
    { title: "Demo: H200 availability improves in North American regions", summary: "Illustrative coverage of shorter provisioning queues for next-generation accelerators as new capacity comes online.", source: "Demo Infrastructure Wire", publishedAt: day(0, 9), url: null },
    { title: "Demo: Neocloud providers expand reserved-instance terms for training clusters", summary: "Placeholder analysis of multi-year commitments and how they shape the visible spot market for compute.", source: "Demo Capacity Monitor", publishedAt: day(1, 16), url: null, image: false },
    { title: "Demo: Inference workloads shift the mix toward smaller GPU classes", summary: "Sample piece on how serving traffic changes which accelerator tiers see the tightest supply.", source: "Demo Compute Desk", publishedAt: day(2, 11), url: null },
    { title: "Demo: Regional compute price gaps narrow between US and EU", summary: "Mock comparison of hourly rates across regions as cross-border capacity balances out.", source: "Demo Infrastructure Wire", publishedAt: day(3, 8), url: null },
  ]),
  memory: build("memory", [
    { title: "Demo: HBM contract pricing firms as accelerator demand outpaces supply", summary: "Sample coverage of high-bandwidth memory allocations and the pricing pressure that follows.", source: "Demo Memory Monitor", publishedAt: day(0, 13), url: null },
    { title: "Demo: DRAM spot prices tick higher for a third week", summary: "Illustrative note on commodity DRAM tracking upward on inventory drawdowns.", source: "Demo Semiconductor Desk", publishedAt: day(0, 7), url: null },
    { title: "Demo: Memory bandwidth becomes the binding constraint for inference", summary: "Placeholder explainer on why bytes per second, not FLOPs, increasingly set serving costs.", source: "Demo Memory Monitor", publishedAt: day(1, 15), url: null },
    { title: "Demo: Next HBM generation sampling timelines reported", summary: "Mock report on qualification schedules and what they imply for accelerator roadmaps.", source: "Demo Semiconductor Desk", publishedAt: day(2, 10), url: null, image: false },
    { title: "Demo: Enterprise DRAM refresh cycle lengthens", summary: "Sample story on buyers stretching replacement cycles while prices are elevated.", source: "Demo Memory Monitor", publishedAt: day(4, 9), url: null },
  ]),
  photonics: build("photonics", [
    { title: "Demo: Silicon photonics transceivers reach volume for 800G links", summary: "Sample coverage of optical interconnect ramp inside large training clusters.", source: "Demo Photonics Brief", publishedAt: day(0, 12), url: null },
    { title: "Demo: Co-packaged optics timelines firm up for next-generation switches", summary: "Illustrative piece on moving optics closer to the switch ASIC to cut power per bit.", source: "Demo Optical Wire", publishedAt: day(1, 9), url: null, image: false },
    { title: "Demo: Optical interconnect pricing per lane continues to fall", summary: "Placeholder analysis of cost curves for pluggable and co-packaged modules.", source: "Demo Photonics Brief", publishedAt: day(1, 17), url: null },
    { title: "Demo: Laser supply flagged as a watch item for optics makers", summary: "Mock report on component constraints upstream of transceiver assembly.", source: "Demo Optical Wire", publishedAt: day(3, 10), url: null },
    { title: "Demo: Scale-up fabrics push photonics into the rack", summary: "Sample explainer on where optical links replace copper inside dense accelerator systems.", source: "Demo Photonics Brief", publishedAt: day(5, 8), url: null },
  ]),
  crypto: build("crypto", [
    { title: "Demo: Bitcoin holds a narrow range as spot volumes thin", summary: "Sample market note on subdued weekend activity and stable funding conditions.", source: "Demo Digital Asset Desk", publishedAt: day(0, 15), url: null },
    { title: "Demo: Stablecoin settlement volume sets another monthly high", summary: "Illustrative coverage of on-chain dollar transfers growing across payment corridors.", source: "Demo Chain Monitor", publishedAt: day(0, 8), url: null },
    { title: "Demo: Mining difficulty adjusts upward after hashrate recovery", summary: "Placeholder story on network security metrics following power-cost swings.", source: "Demo Digital Asset Desk", publishedAt: day(1, 12), url: null, image: false },
    { title: "Demo: Custody infrastructure expands institutional coverage", summary: "Mock report on qualified custody offerings and what they mean for allocators.", source: "Demo Chain Monitor", publishedAt: day(2, 14), url: null },
    { title: "Demo: Miners weigh compute hosting as an alternative revenue line", summary: "Sample analysis of facilities repurposing power capacity for AI workloads.", source: "Demo Digital Asset Desk", publishedAt: day(3, 11), url: null },
  ]),
  "energy-power": build("energy-power", [
    { title: "Demo: Data-center power demand forecasts revised higher again", summary: "Sample coverage of utility planning documents and multi-gigawatt interconnect queues.", source: "Demo Grid Monitor", publishedAt: day(0, 10), url: null },
    { title: "Demo: Grid capacity becomes the gating factor for new campuses", summary: "Illustrative piece on transmission constraints delaying otherwise-ready sites.", source: "Demo Power Wire", publishedAt: day(0, 6), url: null },
    { title: "Demo: Nuclear power agreements for compute move toward firm terms", summary: "Placeholder story on long-dated supply deals pairing reactors with data centers.", source: "Demo Grid Monitor", publishedAt: day(1, 13), url: null },
    { title: "Demo: On-site renewables plus storage gain favor for edge sites", summary: "Mock analysis of behind-the-meter builds where grid connections lag.", source: "Demo Power Wire", publishedAt: day(2, 9), url: null, image: false },
    { title: "Demo: Power price volatility feeds into hourly compute costs", summary: "Sample explainer linking wholesale electricity swings to GPU-hour pricing.", source: "Demo Grid Monitor", publishedAt: day(4, 16), url: null },
  ]),
  "ai-chips": build("ai-chips", [
    { title: "Demo: Accelerator roadmaps compress as vendors target yearly cadence", summary: "Sample coverage of shortened product cycles across leading GPU and ASIC makers.", source: "Demo Silicon Desk", publishedAt: day(0, 11), url: null },
    { title: "Demo: Custom accelerators take a larger share of hyperscaler capex", summary: "Illustrative piece on in-house chips displacing merchant GPUs for some workloads.", source: "Demo Chip Wire", publishedAt: day(0, 5), url: null, image: false },
    { title: "Demo: Inference-focused ASICs court cost-sensitive buyers", summary: "Placeholder analysis of price-per-token claims and the benchmarks behind them.", source: "Demo Silicon Desk", publishedAt: day(1, 14), url: null },
    { title: "Demo: Advanced packaging capacity remains the shared bottleneck", summary: "Mock report on how chip-on-wafer assembly limits output across vendors.", source: "Demo Chip Wire", publishedAt: day(2, 12), url: null },
    { title: "Demo: Second-source strategies gain traction among large buyers", summary: "Sample story on procurement teams qualifying multiple accelerator families.", source: "Demo Silicon Desk", publishedAt: day(3, 9), url: null },
  ]),
};

/** Mock stand-in for the future data access function. */
export function getMockNewsByCategory(category: NewsCategory): NewsArticle[] {
  return MOCK_NEWS[category];
}
