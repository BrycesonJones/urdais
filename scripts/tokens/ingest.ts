/**
 * Developer path for wave-1 token-pricing adapters.
 *
 *   npm run tokens:ingest -- --provider anthropic --mode research
 *   npm run tokens:ingest -- --provider xai --mode research
 *   npm run tokens:ingest -- --provider openai --mode research
 *
 * Research mode reads the reviewed fixture by default (no network).
 * `--from-file` replays a retained artifact. `--live` performs an explicit
 * research GET of the canonical docs URL and still cannot mark the source
 * production-approved. `--mode production` is refused while the registry
 * remains research_usable / under_review.
 */

import { readFileSync } from "node:fs";

import { WAVE1_PROVIDERS, type Wave1Provider } from "@/lib/tokens/types";
import { WAVE1_SOURCE_INTERFACES } from "@/lib/tokens/catalog";
import { loadPricingFixture } from "@/lib/tokens/fixtures";
import { ingestTokenPricing, retrieveLivePricing, type RetrievedArtifact } from "@/lib/tokens/ingest";
import { InMemoryTokenPricingStore } from "@/lib/tokens/store";

function arg(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || !process.argv[index + 1]) {
    if (fallback !== undefined) return fallback;
    throw new Error(`--${name} is required`);
  }
  return process.argv[index + 1]!;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseProvider(raw: string): Wave1Provider {
  if ((WAVE1_PROVIDERS as readonly string[]).includes(raw)) return raw as Wave1Provider;
  throw new Error(`--provider must be ${WAVE1_PROVIDERS.join(", ")}`);
}

function loadFileArtifact(path: string, url: string, retrievedAt: string): RetrievedArtifact {
  const raw = readFileSync(path, "utf8");
  if (path.endsWith(".json")) {
    const parsed = JSON.parse(raw) as { body?: string; contentType?: string; sourceUrl?: string; retrievedAt?: string };
    if (!parsed.body) throw new Error(`${path} JSON must include a body string`);
    return {
      body: parsed.body,
      contentType: parsed.contentType ?? "text/html",
      url: parsed.sourceUrl ?? url,
      retrievedAt: parsed.retrievedAt ?? retrievedAt,
      method: "manual_read",
      status: 200,
    };
  }
  return { body: raw, contentType: "text/html; charset=utf-8", url, retrievedAt, method: "manual_read", status: 200 };
}

async function main(): Promise<void> {
  const provider = parseProvider(arg("provider"));
  const modeRaw = arg("mode", "research");
  if (modeRaw !== "research" && modeRaw !== "production") throw new Error("--mode must be research or production");
  const live = hasFlag("live");
  const fromFile = process.argv.includes("--from-file") ? arg("from-file") : null;
  if (live && fromFile) throw new Error("--live and --from-file cannot be combined");

  const source = WAVE1_SOURCE_INTERFACES[provider];
  let artifact: RetrievedArtifact;
  if (live) {
    artifact = await retrieveLivePricing(source.canonicalUrl, new Date());
  } else if (fromFile) {
    artifact = loadFileArtifact(fromFile, source.canonicalUrl, new Date().toISOString());
  } else {
    const fixture = loadPricingFixture(provider);
    artifact = {
      body: fixture.body,
      contentType: fixture.contentType,
      url: fixture.sourceUrl,
      retrievedAt: fixture.retrievedAt,
      requestedAt: fixture.retrievedAt,
      method: "manual_read",
      status: 200,
    };
  }

  const report = ingestTokenPricing({
    provider,
    mode: modeRaw,
    artifact,
    store: new InMemoryTokenPricingStore(),
  });
  console.log(JSON.stringify({ ...report, decisions: report.decisions.map((d) => ({ kind: d.kind, observationKey: d.observationKey, previousCanonicalUsdPer1m: d.previousCanonicalUsdPer1m })) }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
