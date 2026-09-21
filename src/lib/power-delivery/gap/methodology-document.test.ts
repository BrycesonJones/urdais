import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { APPROVED_VERSION, EXCLUDED_GAP_MARKETS, GAP_PAIRINGS } from "@/lib/power-delivery/gap/eligibility";

const ROOT = resolve(__dirname, "../../../..");
const DOCUMENT = resolve(ROOT, "docs/methodology/power-delivery-gap.md");
const MIGRATION = resolve(ROOT, "supabase/migrations/20260928100000_delivery_gap.sql");

describe("the delivery gap methodology document", () => {
  const text = readFileSync(DOCUMENT, "utf8");
  const migration = readFileSync(MIGRATION, "utf8");

  it("is the document the approved version hashed", () => {
    const digest = createHash("sha256").update(readFileSync(DOCUMENT)).digest("hex");
    expect(migration).toContain(digest);
  });

  it("declares the version the code calculates under", () => {
    expect(text).toContain(`# Urdais Power Delivery Gap — ${APPROVED_VERSION}`);
    expect(migration).toContain("'1.0.0', 'approved'");
  });

  it("states the sign convention, which a reader will assume either way", () => {
    expect(text).toMatch(/Positive means forecast demand exceeds approved planning capacity/);
  });

  it("says what it is not", () => {
    for (const phrase of ["Not transmission headroom", "Not a resource adequacy surplus", "Not operational headroom"]) {
      expect(text).toContain(phrase);
    }
  });

  it("names every approved pairing and every excluded market", () => {
    for (const pairing of GAP_PAIRINGS) expect(text.toLowerCase()).toContain(pairing.marketSlug);
    for (const market of EXCLUDED_GAP_MARKETS) expect(text.toLowerCase()).toContain(market.marketSlug);
  });

  it("discloses that the ERCOT gap will not reproduce ERCOT's own reserve margin", () => {
    // The forecast peak is larger than ERCOT's firm peak load, so this gap is the more
    // conservative question and a reader comparing the two numbers deserves to know why.
    expect(text).toMatch(/will not reproduce ERCOT.s published reserve margin/);
  });
});
