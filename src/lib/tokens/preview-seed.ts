/**
 * Deterministic Wave-1 research-preview bootstrap.
 *
 * fixture → research retrieval → provider parser → normalization →
 * model identity → token_price_observations. Does not change registry rights.
 */

import { WAVE1_PROVIDERS } from "@/lib/tokens/types";
import { loadPricingFixture } from "@/lib/tokens/fixtures";
import { ingestTokenPricing } from "@/lib/tokens/ingest";
import { tokenReadCatalogFromStore } from "@/lib/tokens/read/load";
import { persistTokenReadCatalog, loadTokenReadCatalogFromSql, type TokenSqlExecutor } from "@/lib/tokens/read/sql";
import { InMemoryTokenPricingStore, type TokenPricingStore } from "@/lib/tokens/store";
import type { TokenIngestReport } from "@/lib/tokens/types";
import type { TokenReadCatalog } from "@/lib/tokens/read/series";

export function seedWave1ResearchPreview(store: TokenPricingStore): TokenIngestReport[] {
  return WAVE1_PROVIDERS.map((provider) => {
    const fixture = loadPricingFixture(provider);
    return ingestTokenPricing({
      provider,
      mode: "research",
      artifact: {
        body: fixture.body,
        contentType: fixture.contentType,
        url: fixture.sourceUrl,
        retrievedAt: fixture.retrievedAt,
        requestedAt: fixture.retrievedAt,
        method: "manual_read",
        status: 200,
      },
      store,
    });
  });
}

export async function seedWave1ResearchPreviewDatabase(sql: TokenSqlExecutor): Promise<{
  reports: TokenIngestReport[];
  written: { retrievalsInserted: number; observationsInserted: number };
  catalog: TokenReadCatalog;
}> {
  const existing = await loadTokenReadCatalogFromSql(sql);
  const store = new InMemoryTokenPricingStore(["anthropic", "xai", "openai"], {}, {
    retrievals: existing.retrievals,
    observations: existing.observations,
  });
  const reports = seedWave1ResearchPreview(store);
  const catalog = tokenReadCatalogFromStore(store);
  const written = await persistTokenReadCatalog(sql, catalog);
  return { reports, written, catalog };
}
