import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { docHref, docPages, findDoc } from "@/lib/docs/catalog";

describe("shared methodology pages", () => {
  const universe = findDoc("methodology/ai-equity-universe");

  it("registers the AI Equity Universe under Methodology, directly after the overview", () => {
    expect(universe).toMatchObject({ section: "Methodology", file: "methodology/ai-equity-universe.md" });
    const overview = docPages.findIndex((page) => page.slug === "methodology");
    expect(docPages[overview + 1]).toBe(universe);
    expect(docHref(universe!.slug)).toBe("/docs/methodology/ai-equity-universe");
  });

  it("is linked from the methodology overview, which stays the canonical framework page", () => {
    const overview = readFileSync(path.join(process.cwd(), "docs", "methodology.md"), "utf8");
    expect(overview).toContain(`](${docHref(universe!.slug)})`);
    const draft = readFileSync(path.join(process.cwd(), "docs", universe!.file), "utf8");
    expect(draft).toContain("](/docs/methodology)");
    expect(draft.match(/^# /gm)).toHaveLength(1);
  });
});

describe("compute price methodology", () => {
  const ucpi = findDoc("methodology/ucpi");
  const uavi = findDoc("methodology/uavi");

  it("registers UCPI under Methodology, after the equity outputs", () => {
    expect(ucpi).toMatchObject({ section: "Methodology", file: "methodology/ucpi.md" });
    expect(docPages[docPages.indexOf(uavi!) + 1]).toBe(ucpi);
    expect(docHref(ucpi!.slug)).toBe("/docs/methodology/ucpi");
  });

  it("links UCPI to the framework and is linked from the overview", () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), "docs", file), "utf8");
    const ucpiDoc = read(ucpi!.file);
    expect(ucpiDoc).toContain("](/docs/methodology)");
    expect(ucpiDoc.match(/^# /gm)).toHaveLength(1);
    expect(read("methodology.md")).toContain(`](${docHref(ucpi!.slug)})`);
  });

  it("is a family parent, not a child instrument specification", () => {
    const ucpiDoc = readFileSync(path.join(process.cwd(), "docs", ucpi!.file), "utf8");
    expect(ucpiDoc).toContain("version 0.1.2-draft");
    expect(ucpiDoc).toContain("0.1.1-draft, 13 September 2026");
    expect(ucpiDoc).toContain("0.1.0-draft, 12 September 2026");
    expect(ucpiDoc).not.toMatch(/^#+ .*UCPI-H100/m);
  });

  it("owns the calculation calendar with an exact half-open UTC window", () => {
    const ucpiDoc = readFileSync(path.join(process.cwd(), "docs", ucpi!.file), "utf8");
    expect(ucpiDoc).toContain("### The calculation calendar and cutoff");
    expect(ucpiDoc).toContain("`[D 00:00:00 UTC, D+1 00:00:00 UTC)`");
    expect(ucpiDoc).toContain("last complete reconfirmation before the cutoff");
    expect(ucpiDoc).toContain("The publication deadline for `D` is `D+2 00:00:00 UTC`");
    expect(ucpiDoc).not.toContain("The calculation cutoff, the publication target, and the publication deadline are **unresolved**");
  });

  it("owns the participant-count rule and reserves Limited for availability", () => {
    const ucpiDoc = readFileSync(path.join(process.cwd(), "docs", ucpi!.file), "utf8");
    expect(ucpiDoc).toContain("### Participant count and market breadth");
    expect(ucpiDoc).toContain("**Minimum** means the value rests on exactly two independent capacity sources");
    expect(ucpiDoc).toContain("A single participant's price is not a market price");
    expect(ucpiDoc).toContain("reserved for the availability state of an input");
    expect(ucpiDoc).toContain("The participant count is not a numerical gate above the structural floor");
  });
});

describe("compute price child specifications", () => {
  const child = findDoc("methodology/ucpi-h100-sxm");
  const ucpi = findDoc("methodology/ucpi");

  it("registers UCPI-H100-SXM under Methodology, directly after its parent family", () => {
    expect(child).toMatchObject({ section: "Methodology", file: "methodology/ucpi-h100-sxm.md" });
    expect(docPages[docPages.indexOf(ucpi!) + 1]).toBe(child);
    expect(docHref(child!.slug)).toBe("/docs/methodology/ucpi-h100-sxm");
  });

  it("links the child to its parent family and the parent back to the child", () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), "docs", file), "utf8");
    const childDoc = read(child!.file);
    expect(childDoc).toContain(`](${docHref(ucpi!.slug)})`);
    expect(childDoc.match(/^# /gm)).toHaveLength(1);
    expect(read(ucpi!.file)).toContain(`](${docHref(child!.slug)})`);
  });

  it("is a draft that states its launch is blocked and labels research prices", () => {
    const childDoc = readFileSync(path.join(process.cwd(), "docs", child!.file), "utf8");
    expect(childDoc).toContain("version 0.1.4-draft");
    expect(childDoc).toContain("Launch blocked");
    expect(childDoc).toContain("Research snapshot only");
    expect(childDoc).toContain("0.1.3-draft, 13 September 2026");
    expect(childDoc).toContain("0.1.2-draft, 13 September 2026");
    expect(childDoc).toContain("0.1.1-draft, 13 September 2026");
    expect(childDoc).toContain("0.1.0-draft, 12 September 2026");
  });

  it("keeps parameter decisions in the child and adopts the parent's market-breadth rule without restating thresholds", () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), "docs", file), "utf8");
    const childDoc = read(child!.file);
    expect(childDoc).toContain("Stage Criteria: P0, P1, and P2");
    expect(childDoc).toContain("Ingestion Field Contract");
    expect(childDoc).toContain("MARKET_BREADTH_MINIMUM");
    expect(childDoc).toContain("No numerical publication gate remains open for launch");
    expect(childDoc).toContain("host-memory floor of 80 GB per accelerator");
    expect(childDoc).toContain("canonical-quantity selection");
    expect(childDoc).toContain("no price or availability evidence is carried across calculation dates at launch");
    expect(childDoc).not.toContain("Four numerical publication gates");
    expect(childDoc).toContain("**Requires a parent decision**: none.");
    expect(read(ucpi!.file)).toContain("version 0.1.2-draft");
  });

  it("routed methodology pages contain no markdown tables, which the renderer does not support", () => {
    for (const page of docPages) {
      const doc = readFileSync(path.join(process.cwd(), "docs", page.file), "utf8");
      expect(doc.split("\n").filter((line) => line.trimStart().startsWith("|"))).toEqual([]);
    }
  });
});

describe("compute price sibling specifications", () => {
  const listed = findDoc("methodology/ucpi-h100-sxm-listed");
  const child = findDoc("methodology/ucpi-h100-sxm");
  const ucpi = findDoc("methodology/ucpi");

  it("registers UCPI-H100-SXM-LISTED under Methodology, directly after the child it is a sibling of", () => {
    expect(listed).toMatchObject({ section: "Methodology", file: "methodology/ucpi-h100-sxm-listed.md" });
    expect(docPages[docPages.indexOf(child!) + 1]).toBe(listed);
  });

  it("links to the parent and the child, states it is a different economic object, and is approved at 1.0.0", () => {
    const doc = readFileSync(path.join(process.cwd(), "docs", listed!.file), "utf8");
    expect(doc).toContain(`](${docHref(ucpi!.slug)})`);
    expect(doc).toContain(`](${docHref(child!.slug)})`);
    expect(doc.match(/^# /gm)).toHaveLength(1);
    expect(doc).toContain("version 1.0.0, effective 15 September 2026");
    // The drafts stay in the version history as lineage.
    expect(doc).toContain("0.1.2-draft, 14 September 2026");
    expect(doc).toContain("SELLER_LEGAL_IDENTITY_UNRESOLVED");
    expect(doc).toContain("different economic object");
    expect(doc).toContain("listed prices, not guaranteed availability");
    expect(doc).toContain("never a participant");
    expect(doc).toContain("listed, provider-wide");
  });
});

describe("listed GPU family specifications", () => {
  const family = findDoc("methodology/ucpi-listed-gpu");
  const h100Listed = findDoc("methodology/ucpi-h100-sxm-listed");
  const children = [
    "methodology/ucpi-h200-sxm-listed",
    "methodology/ucpi-b200-listed",
    "methodology/ucpi-a100-sxm4-80gb-listed",
    "methodology/ucpi-rtx-5090-listed",
  ] as const;

  it("registers the reusable listed-GPU specification after the H100 listed sibling, then the four new children", () => {
    expect(family).toMatchObject({ section: "Methodology", file: "methodology/ucpi-listed-gpu.md" });
    expect(docPages[docPages.indexOf(h100Listed!) + 1]).toBe(family);
    for (const [i, slug] of children.entries()) {
      expect(findDoc(slug)).toMatchObject({ section: "Methodology", file: `${slug}.md` });
      expect(docPages[docPages.indexOf(family!) + 1 + i]?.slug).toBe(slug);
    }
  });

  it("each listed GPU child cites the family specification and is approved at 1.0.0, with its draft lineage retained", () => {
    const familyDoc = readFileSync(path.join(process.cwd(), "docs", family!.file), "utf8");
    expect(familyDoc).toContain("version 1.0.0, effective 15 September 2026");
    expect(familyDoc).toContain("0.1.0-draft, 14 September 2026");
    expect(familyDoc).toContain("listed on-demand");
    expect(familyDoc).toContain("never a participant");
    for (const slug of children) {
      const doc = readFileSync(path.join(process.cwd(), "docs", findDoc(slug)!.file), "utf8");
      expect(doc).toContain(`](${docHref(family!.slug)})`);
      expect(doc).toContain("version 1.0.0, effective 15 September 2026");
      expect(doc).toContain("0.1.0-draft, 14 September 2026");
      expect(doc.match(/^# /gm)).toHaveLength(1);
    }
  });

  it("the family specification carries the seller-refusal rule, and the accessible child is untouched by it", () => {
    const familyDoc = readFileSync(path.join(process.cwd(), "docs", family!.file), "utf8");
    expect(familyDoc).toContain("SELLER_USE_REFUSED");
    // The point of the rule: an intermediary does not launder a refusal of the use.
    expect(familyDoc).toContain("does not cure such a refusal");
    // The accessible-price child is a different track and stays blocked.
    const accessible = readFileSync(path.join(process.cwd(), "docs", findDoc("methodology/ucpi-h100-sxm")!.file), "utf8");
    expect(accessible).toContain("Launch blocked");
    expect(accessible).not.toContain("version 1.0.0");
  });
});

describe("Bitcoin wealth index methodology", () => {
  const ubwi = findDoc("methodology/ubwi");
  const tokenPrice = findDoc("methodology/token-price");

  it("registers UBWI under Methodology, after the token price benchmark", () => {
    expect(ubwi).toMatchObject({ section: "Methodology", file: "methodology/ubwi.md" });
    expect(docPages[docPages.indexOf(tokenPrice!) + 1]).toBe(ubwi);
    expect(docHref(ubwi!.slug)).toBe("/docs/methodology/ubwi");
  });

  it("links to the framework and is linked from the methodology overview", () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), "docs", file), "utf8");
    const doc = read(ubwi!.file);
    expect(doc).toContain("](/docs/methodology)");
    expect(doc.match(/^# /gm)).toHaveLength(1);
    expect(read("methodology.md")).toContain(`](${docHref(ubwi!.slug)})`);
  });

  it("states its unit, its exclusions, its modelled share and its publication gate", () => {
    const doc = readFileSync(path.join(process.cwd(), "docs", ubwi!.file), "utf8");
    expect(doc).toContain("Version 1.0.0");
    expect(doc).toContain("Total Global Wealth");
    // The term is named once, only to prohibit it, and never used as a label.
    expect(doc.match(/global wealth supply/gi)).toHaveLength(1);
    expect(doc).toContain('"Global wealth supply" is not used anywhere in Urdais');
    expect(doc).toContain("Human capital is excluded");
    expect(doc).toContain("Asset-class market values are never summed");
    // The modelled share is never hidden, and the document says so in those words.
    expect(doc).toContain("Modelled wealth is never described as observed");
    expect(doc).toContain("estimate calibrated to observed economies, not a census of world wealth");
    expect(doc).toContain("Publication Gates");
    // The gate is stated as a refusal that is not relaxed to produce a number.
    expect(doc).toContain("The gate is never relaxed to make a calculation pass");
  });
});

describe("internal research and architecture artifacts", () => {
  const internalDirs = ["research", "architecture"] as const;

  /** Every markdown file under `dir`, recursively, as a docs-relative path. */
  const markdownUnder = (dir: string): string[] => {
    const walk = (relative: string): string[] =>
      readdirSync(path.join(process.cwd(), "docs", relative), { withFileTypes: true }).flatMap((entry) => {
        const child = `${relative}/${entry.name}`;
        if (entry.isDirectory()) return walk(child);
        return entry.name.endsWith(".md") ? [child] : [];
      });
    return walk(dir);
  };

  it("are never registered in the public docs catalog, at any depth", () => {
    const routed = docPages.map((page) => page.file);
    for (const dir of internalDirs) {
      expect(routed.some((file) => file.startsWith(`${dir}/`))).toBe(false);
      for (const file of markdownUnder(dir)) {
        expect(routed).not.toContain(file);
      }
    }
  });

  it("exist, are markdown, and each carries a single title marking it unrouted", () => {
    for (const dir of internalDirs) {
      const files = markdownUnder(dir);
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const doc = readFileSync(path.join(process.cwd(), "docs", file), "utf8");
        expect(doc.match(/^# /gm)).toHaveLength(1);
        expect(doc).toContain("not registered in the docs catalog");
      }
    }
  });

  it("covers nested internal documents, not only top-level files", () => {
    const all = internalDirs.flatMap((dir) => markdownUnder(dir));
    expect(all).toContain("architecture/sources/terms-review.md");
    expect(all.some((file) => file.split("/").length > 2)).toBe(true);
  });
});

describe("supabase configuration", () => {
  const config = readFileSync(path.join(process.cwd(), "supabase", "config.toml"), "utf8");

  it("keeps the internal reference and pipeline schemas out of the exposed API schemas", () => {
    const match = config.match(/^schemas = \[(.*)\]$/m);
    expect(match).not.toBeNull();
    const exposed = (match?.[1] ?? "").split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean);
    expect(exposed).toEqual(["public", "graphql_public"]);
    expect(exposed).not.toContain("reference");
    expect(exposed).not.toContain("pipeline");
  });

  it("targets the same PostgreSQL major version as the hosted development project", () => {
    expect(config).toMatch(/^major_version = 17$/m);
  });

  it("commits no credential", () => {
    expect(config).not.toMatch(/service_role|password\s*=\s*"[^"]+"|eyJ[A-Za-z0-9_-]{20,}/);
  });
});

describe("output methodology pages", () => {
  const ugai = findDoc("methodology/ugai");
  const uavi = findDoc("methodology/uavi");
  const universe = findDoc("methodology/ai-equity-universe");

  it("registers UGAI under Methodology, directly after its parent universe", () => {
    expect(ugai).toMatchObject({ section: "Methodology", file: "methodology/ugai.md" });
    expect(docPages[docPages.indexOf(universe!) + 1]).toBe(ugai);
    expect(docHref(ugai!.slug)).toBe("/docs/methodology/ugai");
  });

  it("links UGAI to and from the parent universe and the framework", () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), "docs", file), "utf8");
    const ugaiDoc = read(ugai!.file);
    expect(ugaiDoc).toContain(`](${docHref(universe!.slug)})`);
    expect(ugaiDoc).toContain("](/docs/methodology)");
    expect(ugaiDoc.match(/^# /gm)).toHaveLength(1);
    expect(read(universe!.file)).toContain(`](${docHref(ugai!.slug)})`);
    expect(read("methodology.md")).toContain(`](${docHref(ugai!.slug)})`);
  });

  it("registers UAVI under Methodology, directly after its sibling UGAI", () => {
    expect(uavi).toMatchObject({ section: "Methodology", file: "methodology/uavi.md" });
    expect(docPages[docPages.indexOf(ugai!) + 1]).toBe(uavi);
    expect(docHref(uavi!.slug)).toBe("/docs/methodology/uavi");
  });

  it("links UAVI to its parent universe, its sibling, and the framework", () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), "docs", file), "utf8");
    const uaviDoc = read(uavi!.file);
    expect(uaviDoc).toContain(`](${docHref(universe!.slug)})`);
    expect(uaviDoc).toContain(`](${docHref(ugai!.slug)})`);
    expect(uaviDoc).toContain("](/docs/methodology)");
    expect(uaviDoc.match(/^# /gm)).toHaveLength(1);
    expect(read(universe!.file)).toContain(`](${docHref(uavi!.slug)})`);
    expect(read(ugai!.file)).toContain(`](${docHref(uavi!.slug)})`);
    expect(read("methodology.md")).toContain(`](${docHref(uavi!.slug)})`);
  });
});
