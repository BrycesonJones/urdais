/**
 * Manually verified production acquisition: publishing a verified fact without
 * claiming automated collection permission, and without touching the registry.
 */

import { describe, expect, it } from "vitest";

import { WAVE1_SOURCE_INTERFACES } from "@/lib/tokens/catalog";
import { sha256Hex } from "@/lib/tokens/hash";
import { ingestTokenPricing } from "@/lib/tokens/ingest";
import { assertTokenIngestPermitted } from "@/lib/tokens/permission";
import { publishableBenchmarks } from "@/lib/tokens/read/benchmark-series";
import { tokenReadCatalogFromStore } from "@/lib/tokens/read/load";
import { observationIsPublicable, observationIsVisible } from "@/lib/tokens/read/publication";
import { listVisibleTokenSeries } from "@/lib/tokens/read/series";
import { InMemoryTokenPricingStore } from "@/lib/tokens/store";
import { TokenPermissionError, WAVE1_PROVIDERS, type ManualVerification, type Wave1Provider } from "@/lib/tokens/types";
import { loadPricingFixture } from "@/lib/tokens/fixtures";
import { seedWave1ResearchPreview } from "@/lib/tokens/preview-seed";
import { VerificationMismatchError, verifyProviderProduction } from "@/lib/tokens/verify-production";

const VERIFICATION: Omit<ManualVerification, "sourceUrl"> = {
  verifiedBy: "Urdais operator",
  verifiedAt: "2026-09-14T06:00:00Z",
  evidence: "Read the provider's published API pricing page and confirmed the standard input and output rates for the designated model.",
};

function verifyAll(expectations: Partial<Record<Wave1Provider, { input: number; output: number }>> = {}) {
  const store = new InMemoryTokenPricingStore();
  const legs = WAVE1_PROVIDERS.map((provider) => {
    const source = WAVE1_SOURCE_INTERFACES[provider];
    return {
      provider,
      ...verifyProviderProduction({
        provider,
        verification: { ...VERIFICATION, sourceUrl: source.canonicalUrl },
        store,
        expect: expectations[provider],
      }).legs,
    };
  });
  return { store, legs };
}

describe("manual verification publishes a verified fact", () => {
  it("produces production-visible observations for every Wave-1 provider", () => {
    const { store } = verifyAll();
    const catalog = tokenReadCatalogFromStore(store);
    const production = listVisibleTokenSeries(catalog, "production");
    expect(production.length).toBeGreaterThan(0);
    expect(new Set(production.map((row) => row.providerSlug))).toEqual(new Set(["anthropic", "openai", "xai"]));
  });

  it("reads the benchmark legs from the artifact rather than seeding them", () => {
    const { legs } = verifyAll();
    const byProvider = new Map(legs.map((row) => [row.provider, row]));
    expect(byProvider.get("anthropic")).toMatchObject({ providerModelId: "claude-fable-5-1", input: 10, output: 50, benchmark: 30 });
    expect(byProvider.get("openai")).toMatchObject({ providerModelId: "gpt-6-astra", input: 10, output: 50, benchmark: 30 });
    expect(byProvider.get("xai")).toMatchObject({ providerModelId: "grok-4.6", input: 2, output: 6, benchmark: 4 });
  });

  it("stops rather than forcing an expected number that the artifact does not support", () => {
    expect(() => verifyAll({ anthropic: { input: 99, output: 50 } })).toThrow(VerificationMismatchError);
    expect(() => verifyAll({ xai: { input: 2, output: 99 } })).toThrow(VerificationMismatchError);
  });

  it("freezes the production benchmarks at the verified values", () => {
    const { store } = verifyAll();
    const rows = publishableBenchmarks(listVisibleTokenSeries(tokenReadCatalogFromStore(store), "production"), "2026-09-14");
    expect(rows.map((row) => [row.providerSlug, row.priceUsdPer1m])).toEqual([
      ["anthropic", 30],
      ["openai", 30],
      ["xai", 4],
    ]);
    // A single verification means no history and no fabricated change.
    for (const row of rows) {
      expect(row.history).toHaveLength(1);
      expect(row.percentageChange).toBeNull();
      expect(row.updatedAt).toBe(VERIFICATION.verifiedAt);
    }
  });

  it("retains the artifact with its hash and the verifier's statement", () => {
    const { store } = verifyAll();
    const catalog = tokenReadCatalogFromStore(store);
    for (const retrieval of catalog.retrievals) {
      expect(retrieval.acquisitionMode).toBe("manual_verified");
      expect(retrieval.requestMethod).toBe("manual_read");
      expect(retrieval.retrievalPurpose).toBe("production");
      expect(retrieval.responseBody.body.length).toBeGreaterThan(100);
      expect(sha256Hex(retrieval.responseBody.body)).toBe(retrieval.responseHash);
      expect(retrieval.verificationEvidence).toContain("Urdais operator");
      expect(retrieval.verificationEvidence).toContain(retrieval.requestUrl);
      expect(retrieval.permissionGrantId).toBeNull();
    }
  });

  it("is idempotent across time: re-verifying the same artifact later writes no retrieval either", () => {
    // The failure this covers reached a real production database. The retrieval's
    // idempotency key carried the moment the operator ran the command, so a second
    // verification of a byte-identical page looked like a new retrieval, wrote an
    // empty row into an append-only table, and still reported "nothing inserted".
    const store = new InMemoryTokenPricingStore();
    const verifyAt = (verifiedAt: string) =>
      WAVE1_PROVIDERS.map((provider) =>
        verifyProviderProduction({
          provider,
          verification: { ...VERIFICATION, verifiedAt, sourceUrl: WAVE1_SOURCE_INTERFACES[provider].canonicalUrl },
          store,
        }).report,
      );

    const first = verifyAt("2026-09-14T06:00:00Z");
    expect(store.retrievals).toHaveLength(WAVE1_PROVIDERS.length);
    expect(first.reduce((total, row) => total + row.observationsInserted, 0)).toBeGreaterThan(0);

    const later = verifyAt("2026-09-15T09:30:00Z");
    expect(later.reduce((total, row) => total + row.observationsInserted, 0)).toBe(0);
    expect(later.every((row) => row.alreadyPresentForRetrieval)).toBe(true);
    // The point of the test: no second retrieval, a day later, for the same artifact.
    expect(store.retrievals).toHaveLength(WAVE1_PROVIDERS.length);
  });

  it("still records a separate retrieval when the artifact itself changed", () => {
    const store = new InMemoryTokenPricingStore();
    const provider: Wave1Provider = "anthropic";
    const fixture = loadPricingFixture(provider);
    const base = {
      provider,
      verification: { ...VERIFICATION, sourceUrl: fixture.sourceUrl },
      store,
    };
    verifyProviderProduction(base);
    expect(store.retrievals).toHaveLength(1);

    // A changed page is a different artifact and must be its own retrieval, even
    // though the content addressing above makes an unchanged one a no-op.
    verifyProviderProduction({
      ...base,
      verification: { ...VERIFICATION, verifiedAt: "2026-09-20T06:00:00Z", sourceUrl: fixture.sourceUrl },
      artifact: {
        body: fixture.body.replace("<td>$10 / MTok</td>", "<td>$11 / MTok</td>"),
        contentType: fixture.contentType,
        url: fixture.sourceUrl,
        retrievedAt: "2026-09-20T06:00:00Z",
      },
    });
    expect(store.retrievals).toHaveLength(2);
  });

  it("is idempotent: verifying the same artifact again adds no observation", () => {
    const store = new InMemoryTokenPricingStore();
    const run = () =>
      WAVE1_PROVIDERS.map((provider) =>
        verifyProviderProduction({
          provider,
          verification: { ...VERIFICATION, sourceUrl: WAVE1_SOURCE_INTERFACES[provider].canonicalUrl },
          store,
        }).report,
      );
    const first = run();
    const second = run();
    expect(first.reduce((total, row) => total + row.observationsInserted, 0)).toBeGreaterThan(0);
    expect(second.reduce((total, row) => total + row.observationsInserted, 0)).toBe(0);
  });
});

describe("manual verification is not a collection permission", () => {
  it("leaves every Wave-1 registry row exactly as it was", () => {
    const before = WAVE1_PROVIDERS.map((provider) => ({ ...WAVE1_SOURCE_INTERFACES[provider].registry }));
    verifyAll();
    const after = WAVE1_PROVIDERS.map((provider) => WAVE1_SOURCE_INTERFACES[provider].registry);
    expect(after).toEqual(before);
    for (const registry of after) {
      expect(registry.productionAccessState).toBe("research_usable");
      expect(registry.termsReviewState).toBe("under_review");
      expect(registry.dataUseTermsState).toBe("under_review");
    }
  });

  it("still refuses an automated production retrieval from an unresolved source", () => {
    for (const provider of WAVE1_PROVIDERS) {
      const registry = WAVE1_SOURCE_INTERFACES[provider].registry;
      expect(() => assertTokenIngestPermitted("production", registry)).toThrow(TokenPermissionError);
      expect(() => assertTokenIngestPermitted("production", registry, "automated")).toThrow(TokenPermissionError);
      // And the ingest entry point refuses it too, with no verification supplied.
      expect(() =>
        ingestTokenPricing({
          provider,
          mode: "production",
          artifact: { body: "<html></html>", contentType: "text/html", url: WAVE1_SOURCE_INTERFACES[provider].canonicalUrl, retrievedAt: "2026-09-14T06:00:00Z", method: "GET" },
          store: new InMemoryTokenPricingStore(),
        }),
      ).toThrow(TokenPermissionError);
    }
  });

  it("refuses a verification that was fetched rather than read, or that nobody signed", () => {
    const provider: Wave1Provider = "anthropic";
    const source = WAVE1_SOURCE_INTERFACES[provider];
    const base = { provider, mode: "production" as const, store: new InMemoryTokenPricingStore() };
    expect(() =>
      ingestTokenPricing({
        ...base,
        artifact: { body: "<html></html>", contentType: "text/html", url: source.canonicalUrl, retrievedAt: "2026-09-14T06:00:00Z", method: "GET" },
        verification: { ...VERIFICATION, sourceUrl: source.canonicalUrl },
      }),
    ).toThrow(/read by a person/);
    expect(() =>
      ingestTokenPricing({
        ...base,
        artifact: { body: "<html></html>", contentType: "text/html", url: source.canonicalUrl, retrievedAt: "2026-09-14T06:00:00Z" },
        verification: { ...VERIFICATION, sourceUrl: source.canonicalUrl, evidence: "  " },
      }),
    ).toThrow(/what was verified/);
  });

  it("does not make an unverified production observation publicable", () => {
    const { store } = verifyAll();
    const catalog = tokenReadCatalogFromStore(store);
    const observation = catalog.observations[0]!;
    const retrieval = catalog.retrievals.find((row) => row.id === observation.retrievalId)!;
    const source = catalog.sourceInterfaces.find((row) => row.id === observation.sourceInterfaceId)!;
    expect(observationIsPublicable(observation, retrieval, source)).toBe(true);
    // Strip the verifier statement and the same row is no longer publishable.
    expect(observationIsPublicable(observation, { ...retrieval, verificationEvidence: null }, source)).toBe(false);
    expect(observationIsPublicable(observation, { ...retrieval, acquisitionMode: "automated" }, source)).toBe(false);
  });

  it("keeps research observations invisible in production", () => {
    const store = new InMemoryTokenPricingStore();
    // The same reviewed artifact, ingested as research rather than verified.
    seedWave1ResearchPreview(store);
    const catalog = tokenReadCatalogFromStore(store);
    expect(catalog.observations.length).toBeGreaterThan(0);
    for (const observation of catalog.observations) {
      const retrieval = catalog.retrievals.find((row) => row.id === observation.retrievalId);
      const iface = catalog.sourceInterfaces.find((row) => row.id === observation.sourceInterfaceId);
      expect(observationIsVisible(observation, retrieval, iface, "production")).toBe(false);
    }
  });
});

describe("a verified price is recorded even when research saw the same number first", () => {
  function anthropicStore() {
    const store = new InMemoryTokenPricingStore();
    seedWave1ResearchPreview(store);
    return store;
  }

  function verifyAnthropic(store: InMemoryTokenPricingStore) {
    return verifyProviderProduction({
      provider: "anthropic",
      verification: { ...VERIFICATION, sourceUrl: WAVE1_SOURCE_INTERFACES.anthropic.canonicalUrl },
      store,
    });
  }

  it("inserts a production observation for an unchanged price and leaves the research row alone", () => {
    const store = anthropicStore();
    const researchRows = tokenReadCatalogFromStore(store).observations.filter((row) => row.providerSlug === "anthropic");
    expect(researchRows.length).toBeGreaterThan(0);
    const researchSnapshot = JSON.stringify(researchRows);

    const { report } = verifyAnthropic(store);
    expect(report.observationsInserted).toBeGreaterThan(0);
    expect(report.decisions.some((row) => row.kind === "provenance_promoted")).toBe(true);

    const after = tokenReadCatalogFromStore(store).observations.filter((row) => row.providerSlug === "anthropic");
    // Append-only: the research rows are untouched and the production rows are additional.
    expect(after.length).toBeGreaterThan(researchRows.length);
    expect(JSON.stringify(after.filter((row) => researchRows.some((old) => old.id === row.id)))).toBe(researchSnapshot);
  });

  it("makes the provider production-publishable, at the same number", () => {
    const store = anthropicStore();
    expect(listVisibleTokenSeries(tokenReadCatalogFromStore(store), "production")).toEqual([]);

    const { legs } = verifyAnthropic(store);
    expect(legs).toMatchObject({ providerModelId: "claude-fable-5-1", input: 10, output: 50, benchmark: 30 });

    const production = publishableBenchmarks(listVisibleTokenSeries(tokenReadCatalogFromStore(store), "production"), "2026-09-14");
    expect(production.map((row) => [row.providerSlug, row.priceUsdPer1m])).toEqual([["anthropic", 30]]);
  });

  it("stays idempotent: a second identical verification inserts nothing", () => {
    const store = anthropicStore();
    const first = verifyAnthropic(store).report;
    const second = verifyAnthropic(store).report;
    const third = verifyAnthropic(store).report;
    expect(first.observationsInserted).toBeGreaterThan(0);
    expect(second.observationsInserted).toBe(0);
    expect(third.observationsInserted).toBe(0);
    expect(second.decisions.some((row) => row.kind === "provenance_promoted")).toBe(false);
  });

  it("does not promote anything on an ordinary research ingestion", () => {
    const store = anthropicStore();
    const report = ingestTokenPricing({
      provider: "anthropic",
      mode: "research",
      artifact: {
        body: loadPricingFixture("anthropic").body,
        contentType: "text/html",
        url: WAVE1_SOURCE_INTERFACES.anthropic.canonicalUrl,
        retrievedAt: "2026-09-15T06:00:00Z",
      },
      store,
    });
    expect(report.decisions.some((row) => row.kind === "provenance_promoted")).toBe(false);
    expect(report.observationsInserted).toBe(0);
  });
});
