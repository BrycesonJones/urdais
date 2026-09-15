/**
 * Manually verified production acquisition.
 *
 * A person reads a provider's own published pricing page, retains the exact
 * artifact, and records what they checked. That artifact then goes through the
 * same parser, the same normalization and the same identity resolution as any
 * other ingestion, producing canonical observations that are publishable
 * because the price was verified, not because a scraper was authorised.
 *
 * The distinction is deliberate and is never blurred here: this path writes no
 * registry column, grants no collection right, and leaves automated production
 * retrieval exactly as blocked as it was.
 *
 * Nothing is seeded. The prices come from parsing the retained artifact; a
 * caller that states an expectation gets it checked against what the parser
 * actually found, and a mismatch stops the run.
 */

import { WAVE1_SOURCE_INTERFACES } from "@/lib/tokens/catalog";
import { loadPricingFixture } from "@/lib/tokens/fixtures";
import { ingestTokenPricing } from "@/lib/tokens/ingest";
import { constituentInForce, isEligibleLeg, methodologyInForce, tokenBenchmarkPrice, withholdingFor } from "@/lib/tokens/read/benchmark";
import { persistProviderBenchmarks } from "@/lib/tokens/read/benchmark-store";
import { tokenReadCatalogFromStore } from "@/lib/tokens/read/load";
import { listVisibleTokenSeries } from "@/lib/tokens/read/series";
import { loadTokenReadCatalogFromSql, persistTokenReadCatalog, type TokenSqlExecutor } from "@/lib/tokens/read/sql";
import { InMemoryTokenPricingStore } from "@/lib/tokens/store";
import { WAVE1_PROVIDERS, type ManualVerification, type TokenIngestReport, type Wave1Provider } from "@/lib/tokens/types";

export type VerifiedLegs = { input: number; output: number; benchmark: number; providerModelId: string };

export type ProductionVerificationInput = {
  provider: Wave1Provider;
  /** The retained first-party artifact. Defaults to the reviewed Wave-1 fixture. */
  artifact?: { body: string; contentType: string; url: string; retrievedAt: string };
  verification: ManualVerification;
  store: InMemoryTokenPricingStore;
  /** Optional expectation, checked against the parsed artifact rather than assumed. */
  expect?: { input: number; output: number };
  onDate?: string;
};

export class VerificationMismatchError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "VerificationMismatchError";
  }
}

/**
 * Ingests one provider's retained artifact as a manually verified production
 * acquisition, then reads back the legs the methodology's designated model
 * actually requires.
 */
export function verifyProviderProduction(input: ProductionVerificationInput): { report: TokenIngestReport; legs: VerifiedLegs } {
  const onDate = input.onDate ?? input.verification.verifiedAt.slice(0, 10);
  const constituent = constituentInForce(input.provider, onDate);
  if (!constituent) throw new VerificationMismatchError(`${input.provider}: no benchmark model is designated on ${onDate}`);
  const methodology = methodologyInForce(onDate);
  if (!methodology) throw new VerificationMismatchError(`no methodology version is in force on ${onDate}`);

  const fixture = loadPricingFixture(input.provider);
  const artifact = input.artifact ?? {
    body: fixture.body,
    contentType: fixture.contentType,
    url: fixture.sourceUrl,
    retrievedAt: fixture.retrievedAt,
  };
  if (artifact.url !== WAVE1_SOURCE_INTERFACES[input.provider].canonicalUrl && artifact.url !== fixture.sourceUrl) {
    throw new VerificationMismatchError(`${input.provider}: artifact url ${artifact.url} is not the first-party pricing surface`);
  }

  const report = ingestTokenPricing({
    provider: input.provider,
    mode: "production",
    artifact: { ...artifact, method: "manual_read", requestedAt: input.verification.verifiedAt, retrievedAt: input.verification.verifiedAt },
    store: input.store,
    verification: input.verification,
  });

  // Read the legs back through the ordinary read model, so what is verified is what will publish.
  const series = listVisibleTokenSeries(tokenReadCatalogFromStore(input.store), "production");
  const eligible = series.filter((row) => isEligibleLeg(row, constituent));
  const inputLeg = eligible.find((row) => row.pricingDimension === "input");
  const outputLeg = eligible.find((row) => row.pricingDimension === "output");
  if (!inputLeg) throw new VerificationMismatchError(`${input.provider}: the artifact carries no standard input rate for ${constituent.providerModelId}`);
  if (!outputLeg) throw new VerificationMismatchError(`${input.provider}: the artifact carries no standard output rate for ${constituent.providerModelId}`);

  if (input.expect) {
    if (inputLeg.priceUsdPer1m !== input.expect.input) {
      throw new VerificationMismatchError(
        `${input.provider}: the artifact says input ${inputLeg.priceUsdPer1m}, the expectation was ${input.expect.input}; stopping rather than forcing the expected number`,
      );
    }
    if (outputLeg.priceUsdPer1m !== input.expect.output) {
      throw new VerificationMismatchError(
        `${input.provider}: the artifact says output ${outputLeg.priceUsdPer1m}, the expectation was ${input.expect.output}; stopping rather than forcing the expected number`,
      );
    }
  }

  return {
    report,
    legs: {
      input: inputLeg.priceUsdPer1m,
      output: outputLeg.priceUsdPer1m,
      benchmark: tokenBenchmarkPrice(inputLeg.priceUsdPer1m, outputLeg.priceUsdPer1m, methodology),
      providerModelId: constituent.providerModelId,
    },
  };
}

export type ProductionVerificationRun = {
  verifications: { provider: Wave1Provider; legs: VerifiedLegs }[];
  /** Providers collected in full but deliberately not published, with the reason. */
  withheld: { provider: Wave1Provider; reason: string; detail: string; observations: number }[];
  written: { retrievalsInserted: number; observationsInserted: number };
  benchmarks: { inserted: number; conflicts: string[] };
};

/**
 * Verifies every provider from its retained artifact and freezes the resulting
 * production benchmarks. Idempotent: re-running writes nothing new.
 *
 * A provider with no designation is still collected. Its observations are
 * ingested and retained exactly like any other, and only the headline value is
 * withheld. That distinction is the point: "we have not looked" and "we looked
 * and the price cannot be expressed under this methodology" are different
 * states, and the second is reported rather than left as an absence.
 */
export async function runProductionVerification(
  sql: TokenSqlExecutor,
  verification: Omit<ManualVerification, "sourceUrl">,
  expectations: Partial<Record<Wave1Provider, { input: number; output: number }>> = {},
): Promise<ProductionVerificationRun> {
  const existing = await loadTokenReadCatalogFromSql(sql);
  const store = new InMemoryTokenPricingStore([...WAVE1_PROVIDERS], {}, {
    retrievals: existing.retrievals,
    observations: existing.observations,
  });

  const onDate = verification.verifiedAt.slice(0, 10);
  const verifications: { provider: Wave1Provider; legs: VerifiedLegs }[] = [];
  const withheld: ProductionVerificationRun["withheld"] = [];
  for (const provider of WAVE1_PROVIDERS) {
    const fixture = loadPricingFixture(provider);
    const constituent = constituentInForce(provider, onDate);
    const withholding = withholdingFor(provider, onDate);

    if (!constituent) {
      // No designation. Ingest the artifact anyway, so the canonical record is
      // complete, then report why no value is published.
      if (!withholding) {
        throw new VerificationMismatchError(
          `${provider}: no benchmark model is designated on ${onDate}, and no withholding is recorded either. A provider must be designated or deliberately withheld, never silently absent.`,
        );
      }
      const before = store.allObservations().length;
      ingestTokenPricing({
        provider,
        mode: "production",
        artifact: {
          body: fixture.body,
          contentType: fixture.contentType,
          url: fixture.sourceUrl,
          method: "manual_read",
          requestedAt: verification.verifiedAt,
          retrievedAt: verification.verifiedAt,
        },
        store,
        verification: { ...verification, sourceUrl: fixture.sourceUrl },
      });
      withheld.push({
        provider,
        reason: withholding.reason,
        detail: withholding.detail,
        observations: store.allObservations().length - before,
      });
      continue;
    }

    const { legs } = verifyProviderProduction({
      provider,
      verification: { ...verification, sourceUrl: fixture.sourceUrl },
      store,
      expect: expectations[provider],
    });
    verifications.push({ provider, legs });
  }

  const catalog = tokenReadCatalogFromStore(store);
  const written = await persistTokenReadCatalog(sql, catalog);
  const benchmarks = await persistProviderBenchmarks(sql, catalog, "production", onDate, "urdais-token-price/manual-verification");
  return { verifications, withheld, written, benchmarks: { inserted: benchmarks.inserted, conflicts: benchmarks.conflicts } };
}
