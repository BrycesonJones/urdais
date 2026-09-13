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
];

export const docSections: readonly DocSection[] = ["Overview", "Methodology", "Developers", "Resources"];

export function docHref(slug: string) {
  return slug ? `/docs/${slug}` : "/docs";
}

export function findDoc(slug: string) {
  return docPages.find((page) => page.slug === slug);
}
