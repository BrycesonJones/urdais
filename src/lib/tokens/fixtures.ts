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
    retrievedAt: "2026-09-22T00:00:00Z",
    contentType: "text/html; charset=utf-8",
    bodyFile: "xai-pricing.html",
    sha256: "f7d6ef59ad64776c0c22ce094ea0eb5c1984a4947eb329a09f34020e5a1e6aee",
    provenance:
      "Structural HTML excerpt of the first-party xAI text API pricing table from docs.x.ai/docs/models, plus the published Imagine per-image row (out of unit) and the Batch API note with no rates. Not a full page snapshot. No secrets. Supersedes the 2026-09-14 excerpt, sha256 7f13f36394f39b9aef4b9e52218d22633ce94ab33aa0f8483d87dcad72e42a5b, which remains retrievable from this file's git history and from the response body retained on its own production retrieval. The single change is the grok-4.7 row, recording the two rates the operator attested on 2026-09-22: input 2.00 and output 6.00 USD per 1M tokens under 200k prompt tokens. This is not a fresh byte-level capture of the page -- automated retrieval of this surface is not permitted -- and the fields the attestation did not cover (grok-4.7's context window, its cached-input rate, and its rates above the 200k threshold) are left explicitly unrecorded rather than carried over from another row.",
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
  google: {
    provider: "google",
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    retrievedAt: "2026-09-14T17:05:51Z",
    contentType: "text/html; charset=utf-8",
    bodyFile: "google-pricing.html",
    sha256: "396c4d604aab57a2e1553e446117079364761927b159ad0eb68bd1277947bb53",
    provenance:
      "Structural HTML excerpt of the first-party Gemini Developer API standard paid-tier token prices, retrieved 2026-09-14 from ai.google.dev/gemini-api/docs/pricing (HTTP 200, 241803 bytes, sha256 edcf4dea36eab8666aae1d3a5326e65d47a44db8b769d9ebe6013d1f01e451a5). Not a full page snapshot. Rows priced per modality or per minute of audio are named and omitted rather than collapsed. Vertex AI is a separate surface and is not included. No secrets.",
  },
  deepseek: {
    provider: "deepseek",
    sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing",
    retrievedAt: "2026-09-14T17:05:51Z",
    contentType: "text/html; charset=utf-8",
    bodyFile: "deepseek-pricing.html",
    sha256: "059153c7f67a18c32b7a8e9e06dfd2d25cd8ab7ae2afdc14c9f375bb8d127afa",
    provenance:
      "Structural HTML excerpt of the first-party DeepSeek models and pricing table, retrieved 2026-09-14 from api-docs.deepseek.com/quick_start/pricing (HTTP 200, 23359 bytes, sha256 755aa9b488d1185cba016ca4de3b3b6b8f593f5e13e5f9f961305289a5c8d242). The source table is transposed with models as columns; this excerpt presents the same values as rows and preserves every published figure, label and the peak-hours definition. No secrets.",
  },
  alibaba: {
    provider: "alibaba",
    sourceUrl: "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
    retrievedAt: "2026-09-14T17:05:51Z",
    contentType: "text/html; charset=utf-8",
    bodyFile: "alibaba-pricing.html",
    sha256: "cb97d7ab35b70a250513509774607c92a57fbfd247659d285c0d8af98b65baa5",
    provenance:
      "Structural HTML excerpt of the first-party Alibaba Cloud Model Studio commercial Qwen text rows under the International deployment scope, retrieved 2026-09-14 from alibabacloud.com/help/en/model-studio/model-pricing (HTTP 200, 437525 bytes, sha256 3c837f3653c3e792a6bae5d6f53d0961c6cb4494d48f9bbd544c8a39503b7a0d). Not a full page snapshot. Other deployment scopes are named for comparison and not reproduced as rows. The qwen-plus, omni, vl and realtime families carry extra published columns and are omitted. No secrets.",
  },
  moonshot: {
    provider: "moonshot",
    sourceUrl: "https://platform.moonshot.ai/docs/pricing",
    retrievedAt: "2026-09-14T22:02:42Z",
    contentType: "text/html; charset=utf-8",
    bodyFile: "moonshot-pricing.html",
    sha256: "73c54b7c7e32ded5c6b75b43c25f3c51980b9eff6a3a78cf1e563f869dcce480",
    provenance:
      "Structural HTML excerpt of the first-party Kimi API Platform model pricing table, retrieved 2026-09-14 from platform.moonshot.ai/docs/pricing, which serves platform.kimi.ai/docs/pricing/chat (HTTP 200, 240449 bytes, sha256 8ac1ff56855668e820b2030487aa4e81fc251267a06fd535c6bd1f8ff973c532). The page renders its table client-side; the values here are those the platform also publishes as first-party markdown at the same path with a .md suffix (3243 bytes). Not a full page snapshot. The China list is named for comparison and not reproduced as rows. No secrets.",
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
