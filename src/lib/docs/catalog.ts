export type DocSection = "Overview" | "Methodology" | "Developers" | "Resources";

export type DocPage = {
  slug: string;
  title: string;
  description: string;
  section: DocSection;
  file: string;
};

/** Order controls navigation and previous/next. Register only published pages.
 * Nested slugs (e.g. methodology/indices) use the same route and renderer.
 */
export const docPages: readonly DocPage[] = [
  {
    slug: "",
    title: "Introduction",
    description: "Documentation for Urdais information products and their technical foundations.",
    section: "Overview",
    file: "introduction.md",
  },
  {
    slug: "methodology",
    title: "Methodology Overview",
    description: "The shared framework for defining Urdais outputs, provenance, lineage, and methodology versions.",
    section: "Methodology",
    file: "methodology.md",
  },
  {
    slug: "methodology/ai-equity-universe",
    title: "AI Equity Universe",
    description: "Proposed shared methodology for AI equity eligibility, classifications, and base weights used by future UGAI and UAVI outputs.",
    section: "Methodology",
    file: "methodology/ai-equity-universe.md",
  },
  {
    slug: "methodology/ugai",
    title: "UGAI",
    description: "Proposed methodology for the Urdais Global AI Index: calculation, index shares, divisor, currency, corporate actions, and publication on top of the AI Equity Universe.",
    section: "Methodology",
    file: "methodology/ugai.md",
  },
  {
    slug: "methodology/uavi",
    title: "UAVI",
    description: "Proposed methodology for the Urdais AI Volatility Index: options reference securities, 30-day VIX-style implied constituent variance, and aggregation over the AI Equity Universe.",
    section: "Methodology",
    file: "methodology/uavi.md",
  },
  {
    slug: "methodology/ucpi",
    title: "UCPI",
    description: "Proposed shared methodology for the Urdais Compute Price Index family: compute instrument identity, executable-offer observations, normalization, and aggregation for per-accelerator price children.",
    section: "Methodology",
    file: "methodology/ucpi.md",
  },
  {
    slug: "methodology/ucpi-h100-sxm",
    title: "UCPI-H100-SXM",
    description: "Proposed first child specification of the UCPI family: H100 SXM hardware identity, topology and procurement class, and an empirical market study of the family's open parameters.",
    section: "Methodology",
    file: "methodology/ucpi-h100-sxm.md",
  },
  {
    slug: "methodology/ucpi-h100-sxm-listed",
    title: "UCPI-H100-SXM-LISTED",
    description: "Proposed sibling specification measuring the listed on-demand H100 SXM price across independent sellers from licensed market-data sources; a different economic object from UCPI-H100-SXM.",
    section: "Methodology",
    file: "methodology/ucpi-h100-sxm-listed.md",
  },
  {
    slug: "methodology/ucpi-listed-gpu",
    title: "UCPI-LISTED-GPU",
    description: "Proposed reusable specification for listed on-demand GPU price siblings: the shared rules every listed GPU child inherits.",
    section: "Methodology",
    file: "methodology/ucpi-listed-gpu.md",
  },
  {
    slug: "methodology/ucpi-h200-sxm-listed",
    title: "UCPI-H200-SXM-LISTED",
    description: "Proposed child specification: listed on-demand H200 SXM price across independent legal sellers.",
    section: "Methodology",
    file: "methodology/ucpi-h200-sxm-listed.md",
  },
  {
    slug: "methodology/ucpi-b200-listed",
    title: "UCPI-B200-LISTED",
    description: "Proposed child specification: listed on-demand B200 (HGX, SXM6) price across independent legal sellers.",
    section: "Methodology",
    file: "methodology/ucpi-b200-listed.md",
  },
  {
    slug: "methodology/ucpi-a100-sxm4-80gb-listed",
    title: "UCPI-A100-SXM4-80GB-LISTED",
    description: "Proposed child specification: listed on-demand A100 SXM4 80 GB price across independent legal sellers.",
    section: "Methodology",
    file: "methodology/ucpi-a100-sxm4-80gb-listed.md",
  },
  {
    slug: "methodology/ucpi-rtx-5090-listed",
    title: "UCPI-RTX-5090-LISTED",
    description: "Proposed child specification: listed on-demand RTX 5090 whole-device rental price; unavailable on first retrieval.",
    section: "Methodology",
    file: "methodology/ucpi-rtx-5090-listed.md",
  },
  {
    slug: "methodology/token-price",
    title: "Urdais Token Price",
    description: "The derived benchmark that reduces a provider's model-level input and output prices to one cost for a standardized 1M-token workload.",
    section: "Methodology",
    file: "methodology/token-price.md",
  },
  {
    slug: "methodology/ubwi",
    title: "UBWI",
    description: "Production methodology for the Urdais Bitcoin Wealth Index: Bitcoin market capitalization as a percentage of Total Global Wealth, built from rights-cleared national balance sheets where observable and a versioned residual model for the rest of the world.",
    section: "Methodology",
    file: "methodology/ubwi.md",
  },
  {
    slug: "methodology/utvi",
    title: "UTVI",
    description: "Production methodology for the Urdais Observed Token Volume Index: token volume exposed by OpenRouter's rankings-daily dataset, in tokens per day, with a universe that defers to the source rather than asserting what it does not document, explicit coverage semantics, and settlement and revision rules.",
    section: "Methodology",
    file: "methodology/utvi.md",
  },
  {
    slug: "methodology/model-frontier",
    title: "Model Frontier",
    description: "Production methodology for Model Frontier: benchmark capability against provider list price per 1M tokens, as benchmark-specific Pareto frontiers over source-declared model configurations, with the cost boundary that equal unit token prices do not imply equal total cost.",
    section: "Methodology",
    file: "methodology/model-frontier.md",
  },
  {
    slug: "methodology/market-share",
    title: "Market Share",
    description: "Production methodology for Market Share: share of observed OpenRouter token volume represented in UTVI, by model and by canonical lab, with one denominator for both views, the source residual and the lab-attribution residual reported as separate rows, and unresolved lab mappings left unattributed rather than guessed.",
    section: "Methodology",
    file: "methodology/market-share.md",
  },
  {
    slug: "methodology/open-weight-proprietary",
    title: "Open-weight vs Proprietary",
    description:
      "Production methodology for Open-weight vs Proprietary: whether each model's publisher released downloadable weights, classified per exact model version on positive publisher evidence, with volume share against UTVI's own denominator, a capability gap per benchmark, and a price gap taken over a capability-matched band rather than a chosen threshold.",
    section: "Methodology",
    file: "methodology/open-weight-proprietary.md",
  },
  {
    slug: "methodology/available-compute-capacity",
    title: "Available Compute Capacity",
    description:
      "Draft methodology for the observed compute supply dataset: the measurement hierarchy from exact quantity to availability state, aggregation, deduplication, freshness, and why an advertised price is not evidence of capacity.",
    section: "Methodology",
    file: "methodology/available-compute-capacity.md",
  },
  {
    slug: "methodology/compute-economics",
    title: "Compute Economics",
    description:
      "Production methodology for Payback: current released Urdais listed-GPU prices combined with explicit scenario assumptions, reproducible cash-flow formulas, freshness controls, and utilization sensitivity.",
    section: "Methodology",
    file: "methodology/compute-economics.md",
  },
  {
    slug: "methodology/map-facilities",
    title: "Map Facilities",
    description:
      "Production methodology for the Urdais map: all verifiable physical data centres are in scope and AI relevance is enrichment rather than an inclusion criterion, with the four public categories, the tiered source hierarchy and what a directory may and may not place, coordinate precision and map eligibility, entity granularity and duplicate resolution, the evidenced compute relationship a power asset still needs to appear at all, and the staleness horizon.",
    section: "Methodology",
    file: "methodology/map-facilities.md",
  },
  {
    slug: "methodology/deliverable-capacity",
    title: "Deliverable Capacity",
    description:
      "Production methodology for planning capacity: the four quantities a grid publisher actually releases, why no universal cross-market formula is defensible, and the capability identities approved for ERCOT and the PJM RTO publicly and MISO internally, leaving CAISO, NYISO, ISO-NE and SPP component-only each for a recorded reason. Approves no arithmetic.",
    section: "Methodology",
    file: "methodology/deliverable-capacity.md",
  },
  {
    slug: "methodology/power-delivery-gap",
    title: "Power Delivery Gap",
    description:
      "Production methodology for the delivery gap: forecast peak demand minus approved planning capacity, for the market-season pairs where both sides describe the same thing. One market of seven qualifies, the sign convention is stated, and the result is explicitly not a reserve margin, transmission headroom, or a resource adequacy surplus.",
    section: "Methodology",
    file: "methodology/power-delivery-gap.md",
  },
  {
    slug: "methodology/interconnection-queue-analytics",
    title: "Interconnection Queue Analytics",
    description:
      "Production methodology for the interconnection queue: which analytics are defensible across seven markets and which are not, why no cross-market capacity total exists, the cohort and maturity rules that decide when a completion rate may be published, and the evidence each market does and does not provide.",
    section: "Methodology",
    file: "methodology/interconnection-queue-analytics.md",
  },
  {
    slug: "methodology/umpi",
    title: "UMPI-DRAM Spot",
    description:
      "Draft methodology for the Urdais Memory Price Index V1: the spot-market price of six defined DRAM chips in USD per chip, with branded and eTT held apart as separate instruments, spot separated from contract, HBM withheld for want of an observed price, and publication blocked until a source's rights are resolved in writing.",
    section: "Methodology",
    file: "methodology/umpi.md",
  },
];

export const docSections: readonly DocSection[] = ["Overview", "Methodology", "Developers", "Resources"];

export function docHref(slug: string) {
  return slug ? `/docs/${slug}` : "/docs";
}

export function findDoc(slug: string) {
  return docPages.find((page) => page.slug === slug);
}
