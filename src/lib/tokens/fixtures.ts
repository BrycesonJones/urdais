/**
 * Load a reviewed first-party pricing fixture. The HTML file is the retained
 * retrieval artifact; the META table below records its URL, retrieval time,
 * hash and provenance, and loading re-hashes the file and refuses a mismatch.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sha256Hex } from "@/lib/tokens/hash";
import type { Wave1Provider } from "@/lib/tokens/types";

export type PricingFixture = {
  provider: Wave1Provider;
  sourceUrl: string;
  retrievedAt: string;
  contentType: string;
  bodyFile: string;
  sha256: string;
  provenance: string;
  body: string;
};

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

const META: Record<Wave1Provider, Omit<PricingFixture, "body">> = {
  anthropic: {
    provider: "anthropic",
    sourceUrl: "https://docs.anthropic.com/en/docs/about-claude/pricing",
    retrievedAt: "2026-09-14T03:10:00Z",
    contentType: "text/html; charset=utf-8",
    bodyFile: "anthropic-pricing.html",
    sha256: "27c0a283fa729f4bc7404c3983201790240809e953ba5dbaa3c82e4c3402facb",
    provenance:
      "Structural HTML excerpt of the first-party Claude API pricing, batch, and fast-mode tables retrieved 2026-09-14 from docs.anthropic.com/en/docs/about-claude/pricing. Not a full page snapshot. No secrets.",
  },
  xai: {
    provider: "xai",
    sourceUrl: "https://docs.x.ai/docs/models",
    retrievedAt: "2026-09-14T03:10:00Z",
    contentType: "text/html; charset=utf-8",
    bodyFile: "xai-pricing.html",
    sha256: "7f13f36394f39b9aef4b9e52218d22633ce94ab33aa0f8483d87dcad72e42a5b",
    provenance:
      "Structural HTML excerpt of the first-party xAI text API pricing table retrieved 2026-09-14 from docs.x.ai/docs/models, plus the published Imagine per-image row (out of unit) and the Batch API note with no rates. Not a full page snapshot. No secrets.",
  },
  openai: {
    provider: "openai",
    sourceUrl: "https://platform.openai.com/docs/pricing",
    retrievedAt: "2026-09-14T03:10:00Z",
    contentType: "text/html; charset=utf-8",
    bodyFile: "openai-pricing.html",
    sha256: "f39d07dd4893d3fd6eb7fc15434555f499b49037ac6b04d809508bd1c551a031",
    provenance:
      "Structural HTML excerpt of the first-party OpenAI API Standard, Batch, and Fast-mode token tables retrieved 2026-09-14 from platform.openai.com/docs/pricing. Short vs long context columns are preserved; the token cutoff is not invented. Alias text is from the same page. No secrets.",
  },
};

export function loadPricingFixture(provider: Wave1Provider): PricingFixture {
  const meta = META[provider];
  const body = readFileSync(path.join(FIXTURE_DIR, meta.bodyFile), "utf8");
  const sha256 = sha256Hex(body);
  if (meta.sha256 !== "pending" && meta.sha256 !== sha256) {
    throw new Error(`${meta.bodyFile} hash ${sha256} does not match recorded provenance ${meta.sha256}`);
  }
  return { ...meta, sha256, body };
}

export function fixtureMeta(provider: Wave1Provider): Omit<PricingFixture, "body"> {
  return META[provider];
}
