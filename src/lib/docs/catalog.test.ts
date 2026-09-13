import { readFileSync } from "node:fs";
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
