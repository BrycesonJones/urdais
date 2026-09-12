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
