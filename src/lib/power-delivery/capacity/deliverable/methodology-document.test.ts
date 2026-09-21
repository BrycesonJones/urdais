import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { APPROVED_VERSION, EXCLUDED_MARKETS, RESULT_RULES } from "@/lib/power-delivery/capacity/deliverable/methodology";

const ROOT = resolve(__dirname, "../../../../..");
const DOCUMENT = resolve(ROOT, "docs/methodology/deliverable-capacity.md");
const MIGRATION = resolve(ROOT, "supabase/migrations/20260927100000_deliverable_capacity_methodology_1_0_0.sql");

describe("the approved methodology document", () => {
  const text = readFileSync(DOCUMENT, "utf8");
  const migration = readFileSync(MIGRATION, "utf8");

  it("is the document the approved version hashed", () => {
    // An approved methodology version records the hash of what it approved. If the document is
    // edited without a new version, the recorded hash stops describing it and the audit trail
    // silently breaks -- so editing this document is meant to require a new version.
    const digest = createHash("sha256").update(readFileSync(DOCUMENT)).digest("hex");
    expect(migration).toContain(digest);
  });

  it("declares itself approved at the version the code calculates under", () => {
    expect(text).toContain(`# Urdais Deliverable Capacity — ${APPROVED_VERSION}`);
    expect(text).toMatch(/\*\*Status: approved, version 1\.0\.0/);
    expect(migration).toContain("'1.0.0', 'approved'");
  });

  it("names every market the code produces a result for", () => {
    for (const rule of RESULT_RULES) {
      expect(text.toLowerCase()).toContain(rule.marketSlug === "iso-ne" ? "iso-ne" : rule.marketSlug);
      expect(text).toContain(rule.sourceTerm);
    }
  });

  it("names every market the code excludes, and says it produces nothing", () => {
    for (const market of EXCLUDED_MARKETS) {
      expect(text.toLowerCase()).toContain(market.marketSlug);
    }
    expect(text).toContain("component only");
  });

  it("states that no arithmetic is approved", () => {
    expect(text).toMatch(/approves no arithmetic/);
  });

  it("keeps the draft as a superseded record rather than editing it", () => {
    expect(migration).toContain("status = 'superseded'");
    expect(migration).toContain("0.1.0-draft");
  });
});
