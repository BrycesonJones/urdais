/**
 * In-memory token-pricing store for tests and the research CLI. Mirrors the
 * append-only unique index on pipeline.token_price_observations. There is no
 * update path.
 */

import { aliasesFor, modelsFor, WAVE1_SOURCE_INTERFACES, type Wave1ModelSeed } from "@/lib/tokens/catalog";
import type { Wave1Provider } from "@/lib/tokens/types";
import type { TokenPriceObservationRow, TokenSourceInterface, TokenSourceRetrieval } from "@/lib/tokens/types";

export class DuplicateTokenObservationError extends Error {
  constructor(key: string) {
    super(`duplicate token price observation for ${key}`);
    this.name = "DuplicateTokenObservationError";
  }
}

export class AppendOnlyViolationError extends Error {
  constructor() {
    super("token_price_observations is append-only; updates and deletes are forbidden");
    this.name = "AppendOnlyViolationError";
  }
}

export interface TokenPricingStore {
  sourceInterface(provider: Wave1Provider): TokenSourceInterface;
  model(providerSlug: string, providerModelId: string): Wave1ModelSeed | undefined;
  insertRetrieval(row: TokenSourceRetrieval): TokenSourceRetrieval;
  findRetrieval(id: string): TokenSourceRetrieval | undefined;
  observationsForRetrieval(retrievalId: string): TokenPriceObservationRow[];
  latestByObservationKey(providerSlug: string): Map<string, TokenPriceObservationRow>;
  insertObservations(rows: readonly TokenPriceObservationRow[]): void;
  allObservations(): TokenPriceObservationRow[];
}

function facetKey(row: Pick<TokenPriceObservationRow, "retrievalId" | "modelId" | "pricingDimension" | "region" | "serviceTier" | "contextTier" | "cacheTtl">): string {
  return [
    row.retrievalId,
    row.modelId,
    row.pricingDimension,
    row.region ?? "",
    row.serviceTier,
    row.contextTier ?? "",
    row.cacheTtl ?? "",
  ].join("|");
}

export class InMemoryTokenPricingStore implements TokenPricingStore {
  readonly retrievals: TokenSourceRetrieval[] = [];
  readonly observations: TokenPriceObservationRow[] = [];
  private readonly models: Wave1ModelSeed[];
  private readonly interfaces: Record<Wave1Provider, TokenSourceInterface>;

  constructor(
    private readonly providers: readonly Wave1Provider[] = ["anthropic", "xai", "openai"],
    interfaceOverrides: Partial<Record<Wave1Provider, TokenSourceInterface>> = {},
    initial: { retrievals?: readonly TokenSourceRetrieval[]; observations?: readonly TokenPriceObservationRow[] } = {},
  ) {
    this.models = this.providers.flatMap((provider) => modelsFor(provider));
    this.interfaces = { ...WAVE1_SOURCE_INTERFACES };
    for (const provider of this.providers) {
      const override = interfaceOverrides[provider];
      if (override) this.interfaces[provider] = override;
    }
    if (initial.retrievals) this.retrievals.push(...initial.retrievals);
    if (initial.observations) this.observations.push(...initial.observations);
  }

  sourceInterface(provider: Wave1Provider): TokenSourceInterface {
    return this.interfaces[provider];
  }

  sourceInterfaces(): TokenSourceInterface[] {
    return this.providers.map((provider) => this.interfaces[provider]);
  }

  allModels(): Wave1ModelSeed[] {
    return [...this.models];
  }

  model(providerSlug: string, providerModelId: string): Wave1ModelSeed | undefined {
    return this.models.find((row) => row.providerSlug === providerSlug && row.providerModelId === providerModelId);
  }

  aliases(provider: Wave1Provider) {
    return aliasesFor(provider);
  }

  insertRetrieval(row: TokenSourceRetrieval): TokenSourceRetrieval {
    const existing = this.retrievals.find((r) => r.idempotencyKey === row.idempotencyKey);
    if (existing) return existing;
    this.retrievals.push(row);
    return row;
  }

  findRetrieval(id: string): TokenSourceRetrieval | undefined {
    return this.retrievals.find((row) => row.id === id);
  }

  observationsForRetrieval(retrievalId: string): TokenPriceObservationRow[] {
    return this.observations.filter((row) => row.retrievalId === retrievalId);
  }

  latestByObservationKey(providerSlug: string): Map<string, TokenPriceObservationRow> {
    const latest = new Map<string, TokenPriceObservationRow>();
    for (const row of this.observations) {
      if (row.providerSlug !== providerSlug) continue;
      const prev = latest.get(row.observationKey);
      if (!prev || prev.retrievedAt < row.retrievedAt) latest.set(row.observationKey, row);
    }
    return latest;
  }

  insertObservations(rows: readonly TokenPriceObservationRow[]): void {
    const seen = new Set(this.observations.map(facetKey));
    for (const row of rows) {
      const key = facetKey(row);
      if (seen.has(key)) throw new DuplicateTokenObservationError(key);
      seen.add(key);
      this.observations.push(row);
    }
  }

  allObservations(): TokenPriceObservationRow[] {
    return [...this.observations];
  }

  /** Tests use this to prove there is no mutation API. */
  updateObservation(): never {
    throw new AppendOnlyViolationError();
  }

  deleteObservation(): never {
    throw new AppendOnlyViolationError();
  }
}
