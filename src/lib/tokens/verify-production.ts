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
import { loadPersistedBenchmarks, persistProviderBenchmarks, type PersistedBenchmarkRow } from "@/lib/tokens/read/benchmark-store";
import { persistVerificationEvents, type PersistableVerificationEvent } from "@/lib/tokens/read/verification-events";
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
  benchmarks: { inserted: number; withheld: number; conflicts: string[] };
  /**
   * The attestations this run recorded.
   *
   * Separate from everything above, and the only part of a run that is
   * guaranteed to write something. An unchanged review inserts no observation
   * (no price moved), freezes no benchmark (nothing was recalculated) and
   * records no second retrieval (the artifact is byte-identical) -- all
   * correct, and together they used to leave a completed human review
   * indistinguishable from one that never happened.
   */
  attestations: { inserted: number; recorded: number; skipped: string[] };
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
  const methodology = methodologyInForce(onDate);
  if (!methodology) throw new VerificationMismatchError(`no methodology version is in force on ${onDate}`);
  const verifications: { provider: Wave1Provider; legs: VerifiedLegs }[] = [];
  const withheld: ProductionVerificationRun["withheld"] = [];
  // The retained artifact each attestation was made against, so the event that
  // records "a person checked" also records exactly what they were looking at.
  const artifacts = new Map<Wave1Provider, { retrievalId: string; sha256: string }>();
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
      const report = ingestTokenPricing({
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
      artifacts.set(provider, { retrievalId: report.retrievalId, sha256: report.responseHash });
      withheld.push({
        provider,
        reason: withholding.reason,
        detail: withholding.detail,
        observations: store.allObservations().length - before,
      });
      continue;
    }

    const { legs, report } = verifyProviderProduction({
      provider,
      verification: { ...verification, sourceUrl: fixture.sourceUrl },
      store,
      expect: expectations[provider],
    });
    artifacts.set(provider, { retrievalId: report.retrievalId, sha256: report.responseHash });
    verifications.push({ provider, legs });
  }

  const catalog = tokenReadCatalogFromStore(store);
  const written = await persistTokenReadCatalog(sql, catalog);
  const benchmarks = await persistProviderBenchmarks(sql, catalog, "production", onDate, "urdais-token-price/manual-verification");

  // Record the attestation last, against the state that now stands.
  //
  // Order matters, and not for convenience: an attestation names the frozen
  // value or recorded withholding it was made about, so it can only be written
  // once that state exists. Writing it first would either name the previous
  // run's state or name nothing at all, and an attestation that names nothing
  // is exactly the stray evidence the freshness rule refuses to count.
  const frozen = await loadPersistedBenchmarks(sql);
  const attestations = await recordAttestations(sql, {
    frozen,
    verification,
    artifacts,
    methodologyVersion: methodology.version,
  });

  return {
    verifications,
    withheld,
    written,
    benchmarks: { inserted: benchmarks.inserted, withheld: benchmarks.withheld, conflicts: benchmarks.conflicts },
    attestations,
  };
}

/** The newest frozen row per provider: the state an attestation is made about. */
function activeBenchmarkFor(frozen: readonly PersistedBenchmarkRow[], providerSlug: string): PersistedBenchmarkRow | undefined {
  return frozen
    .filter((row) => row.providerSlug === providerSlug)
    .sort((a, b) => b.calculatedAt.localeCompare(a.calculatedAt) || b.id.localeCompare(a.id))[0];
}

/**
 * Writes one attestation per provider the run actually looked at.
 *
 * A provider with no frozen state behind it is skipped and named, rather than
 * given an event pointing at nothing. That case is unreachable through the loop
 * above -- a provider is either calculated or deliberately withheld, and both
 * write a row -- but the alternative to skipping is manufacturing the very
 * thing the freshness rule exists to reject, so it is refused explicitly.
 */
async function recordAttestations(
  sql: TokenSqlExecutor,
  input: {
    frozen: readonly PersistedBenchmarkRow[];
    verification: Omit<ManualVerification, "sourceUrl">;
    artifacts: ReadonlyMap<Wave1Provider, { retrievalId: string; sha256: string }>;
    methodologyVersion: string;
  },
): Promise<{ inserted: number; recorded: number; skipped: string[] }> {
  const events: PersistableVerificationEvent[] = [];
  const skipped: string[] = [];
  for (const [provider, artifact] of input.artifacts) {
    const active = activeBenchmarkFor(input.frozen, provider);
    if (!active) {
      skipped.push(`${provider}: no frozen value or recorded withholding stands, so there is nothing for an attestation to be about`);
      continue;
    }
    events.push({
      providerSlug: provider,
      sourceInterfaceId: WAVE1_SOURCE_INTERFACES[provider].id,
      verifiedBy: input.verification.verifiedBy,
      verifiedAt: input.verification.verifiedAt,
      evidence: input.verification.evidence,
      verificationPurpose: "production",
      sourceRetrievalId: artifact.retrievalId,
      artifactSha256: artifact.sha256,
      observedState: active.calculationStatus,
      benchmarkId: active.id,
      // The designated model as the frozen row itself names it, never as the
      // registry says it should be: the attestation describes what stands.
      providerModelId: active.calculationStatus === "value" ? active.benchmarkModelId : null,
      methodologyVersion: input.methodologyVersion,
    });
  }

  await sql.query("begin", []);
  try {
    const { inserted } = await persistVerificationEvents(sql, events);
    await sql.query("commit", []);
    return { inserted, recorded: events.length, skipped };
  } catch (error) {
    await sql.query("rollback", []);
    throw error;
  }
}
