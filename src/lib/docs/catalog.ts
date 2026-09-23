export type DocSection = "Overview" | "Methodology" | "Developers" | "Resources";

export type DocPage = {
  slug: string;
  title: string;
  description: string;
  section: DocSection;
  file: string;
  /**
   * Whether the page is offered as current public documentation. Omitted means yes; only a
   * withheld page says otherwise, so registering a page stays a single unadorned entry.
   *
   * A withheld page keeps everything else: its registration here, its slug, its title, and above
   * all its file, whose bytes are frozen -- a methodology document's SHA-256 is the
   * `content_hash` of an approved methodology version. Withholding is a presentation decision and
   * must never reach the document.
   *
   * This is the docs half of `publiclyPresented` in @/data/market-catalog: a methodology document
   * for an index Urdais no longer presents as a product is not current public documentation
   * either. The two are set independently, because a document can outlive its product.
   */
  publiclyListed?: false;
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
  // UGAI and UAVI are not publicly presented products, so their methodology documents are not
  // current public documentation. Both entries stay: the documents, their versions and their
  // cross-links are preserved exactly, and restoring either page is removing one line.
  {
    slug: "methodology/ugai",
    publiclyListed: false,
    title: "UGAI",
    description: "Proposed methodology for the Urdais Global AI Index: calculation, index shares, divisor, currency, corporate actions, and publication on top of the AI Equity Universe.",
    section: "Methodology",
    file: "methodology/ugai.md",
  },
  {
    slug: "methodology/uavi",
    publiclyListed: false,
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
    slug: "methodology/transmission-headroom",
    title: "Transmission Headroom",
    description:
      "Production methodology for operational transmission margin: NYISO interface headroom and ERCOT constraint margin as two separate market-specific measurements, why they are never combined, the exact sentinel and plausibility rules that decide when a published limit is a number at all, and the populations each source actually observes.",
    section: "Methodology",
    file: "methodology/transmission-headroom.md",
  },
  {
    slug: "methodology/grid-buildout-velocity",
    title: "Grid Buildout Velocity",
    description:
      "Production methodology for how fast transmission is built: why ERCOT counts completions and CAISO measures schedule slip without the two ever being combined, how a publisher's reported zero is kept distinct from a blank cell, how one project appearing on several owner sheets resolves to one counted project without merging any record, and what each source cannot support.",
    section: "Methodology",
    file: "methodology/grid-buildout-velocity.md",
  },
  {
    slug: "methodology/flexible-capacity",
    title: "Flexible Capacity",
    description:
      "Production methodology for curtailment-enabled headroom: how much additional flat load a balancing authority could have carried below its own observed peak if that load accepted an annual curtailment energy allowance, why the control is an energy budget rather than a count of hours, why storage and demand response contribute nothing in 1.0.0, and why the result is electrical load headroom and never compute capacity.",
    section: "Methodology",
    file: "methodology/flexible-capacity.md",
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
    title: "UMPI-DRAM Spot (deferred)",
    description:
      "Deferred draft for the proprietary-source spot architecture: the spot-market price of six defined DRAM chips in USD per chip, with branded and eTT held apart. Not the UMPI V1 launch methodology — publication is blocked until a source's rights are resolved in writing.",
    section: "Methodology",
    file: "methodology/umpi.md",
  },
  {
    slug: "methodology/umpi-kr-dram",
    title: "UMPI-KR DRAM",
    description:
      "Draft methodology for UMPI V1: two monthly official-data DRAM indexes — the Bank of Korea DRAM producer price index published as a cited series, and a Urdais-calculated export unit-value index from Korea Customs value and weight under HSK 8542321010 — held apart as a price index and a unit-value index, in index points, with MoM change.",
    section: "Methodology",
    file: "methodology/umpi-kr-dram.md",
  },
];

export const docSections: readonly DocSection[] = ["Overview", "Methodology", "Developers", "Resources"];

/**
 * The pages offered as current public documentation: the navigation, the route's static params,
 * the previous/next pager and the file loader all read this, never `docPages`.
 *
 * `docPages` stays the canonical registry so a withheld document keeps its identity and its file
 * mapping, and so the order the registry declares is still the order the public pager walks.
 */
export const publicDocPages: readonly DocPage[] = docPages.filter((page) => page.publiclyListed !== false);

export function docHref(slug: string) {
  return slug ? `/docs/${slug}` : "/docs";
}

/** Registry lookup across every page, listed publicly or not. */
export function findDoc(slug: string) {
  return docPages.find((page) => page.slug === slug);
}

/** Lookup restricted to current public documentation. A withheld slug resolves to nothing. */
export function findPublicDoc(slug: string) {
  return publicDocPages.find((page) => page.slug === slug);
}

/**
 * Whether a `/docs/...` href points at a page the public documentation offers.
 *
 * Used by the renderer: the withheld documents are still linked to from documents that remain
 * public, and those documents cannot be edited to remove the links. The link is rendered as plain
 * text instead, so browsing the public docs never leads to a 404.
 */
export function isPublicDocHref(href: string): boolean {
  if (!href.startsWith("/docs")) return true;
  const slug = (href.replace(/^\/docs\/?/, "").split(/[#?]/)[0] ?? "").replace(/\/$/, "");
  if (!slug) return true;
  return findDoc(slug) === undefined || findPublicDoc(slug) !== undefined;
}
