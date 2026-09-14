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
    description: "Proposed methodology for the Urdais Bitcoin Wealth Index: Bitcoin market capitalization as a percentage of Total Global Wealth, defined on the national-accounts net-worth identity and excluding human capital.",
    section: "Methodology",
    file: "methodology/ubwi.md",
  },
];

export const docSections: readonly DocSection[] = ["Overview", "Methodology", "Developers", "Resources"];

export function docHref(slug: string) {
  return slug ? `/docs/${slug}` : "/docs";
}

export function findDoc(slug: string) {
  return docPages.find((page) => page.slug === slug);
}
