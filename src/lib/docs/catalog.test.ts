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
    expect(ucpiDoc).toContain("0.1.0-draft");
    expect(ucpiDoc).not.toMatch(/^#+ .*UCPI-H100/m);
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
    expect(childDoc).toContain("version 0.1.1-draft");
    expect(childDoc).toContain("Launch blocked");
    expect(childDoc).toContain("Research snapshot only");
    expect(childDoc).toContain("0.1.0-draft, 12 September 2026");
  });

  it("keeps parameter decisions in the child and leaves the parent family unedited", () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), "docs", file), "utf8");
    const childDoc = read(child!.file);
    expect(childDoc).toContain("Stage Criteria: P0, P1, and P2");
    expect(childDoc).toContain("Ingestion Field Contract");
    expect(read(ucpi!.file)).toContain("0.1.0-draft");
  });
});

describe("internal research and architecture artifacts", () => {
  const internalDirs = ["research", "architecture"] as const;

  it("are never registered in the public docs catalog", () => {
    const routed = docPages.map((page) => page.file);
    for (const dir of internalDirs) {
      expect(routed.some((file) => file.startsWith(`${dir}/`))).toBe(false);
      for (const file of readdirSync(path.join(process.cwd(), "docs", dir))) {
        expect(routed).not.toContain(`${dir}/${file}`);
      }
    }
  });

  it("exist, are markdown, and each carries a single title marking it unrouted", () => {
    for (const dir of internalDirs) {
      const absolute = path.join(process.cwd(), "docs", dir);
      const files = readdirSync(absolute).filter((file) => file.endsWith(".md"));
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const doc = readFileSync(path.join(absolute, file), "utf8");
        expect(doc.match(/^# /gm)).toHaveLength(1);
        expect(doc).toContain("not registered in the docs catalog");
      }
    }
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
