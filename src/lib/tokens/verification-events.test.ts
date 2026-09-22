/**
 * The verification event: what an unchanged human review leaves behind.
 *
 * These tests exist because of a bug whose shape is easy to miss. Every rule
 * Token Price follows is designed to stop Urdais manufacturing history: an
 * observation is written only when a price changes, a benchmark point exists
 * only at a real calculation, and a manually verified retrieval is keyed by
 * artifact hash so re-reading an identical page records nothing. Individually
 * correct; together they meant a completed review of seven pages wrote nothing
 * at all, and the watchdog -- which read freshness from the newest frozen
 * calculation -- reported the reviewer as absent.
 *
 * So the fix must be provable in both directions. An unchanged review has to
 * refresh freshness *without* inventing a price, a point, or a retrieval. And
 * an attestation on its own must never make a provider look healthy.
 */

import { describe, expect, it } from "vitest";

import { WAVE1_MODELS, WAVE1_SOURCE_INTERFACES } from "@/lib/tokens/catalog";
import { loadPricingFixture } from "@/lib/tokens/fixtures";
import { ingestTokenPricing } from "@/lib/tokens/ingest";
import { benchmarkProviders, constituentInForce, withholdingFor } from "@/lib/tokens/read/benchmark";
import { loadPersistedBenchmarks, persistProviderBenchmarks } from "@/lib/tokens/read/benchmark-store";
import { tokenReadCatalogFromStore } from "@/lib/tokens/read/load";
import { persistTokenReadCatalog } from "@/lib/tokens/read/sql";
import {
  loadVerificationEvents,
  persistVerificationEvents,
  verificationIdempotencyKey,
} from "@/lib/tokens/read/verification-events";
import { InMemoryTokenPricingStore } from "@/lib/tokens/store";
import { WAVE1_PROVIDERS, type ManualVerification, type Wave1Provider } from "@/lib/tokens/types";
import { verificationFreshness } from "@/lib/tokens/verification-freshness";
import { runProductionVerification, verifyProviderProduction } from "@/lib/tokens/verify-production";

const DESIGNATED = benchmarkProviders() as Wave1Provider[];

const SEP_14 = "2026-09-14T12:03:02.002Z";
const SEP_22 = "2026-09-22T09:15:00.000Z";
const SEP_29 = "2026-09-29T09:15:00.000Z";

const SEP_14_REVIEW: Omit<ManualVerification, "sourceUrl"> = {
  verifiedBy: "Bryceson",
  verifiedAt: SEP_14,
  evidence: "Read each provider's first-party pricing page and confirmed the standard input and output rates for the designated model.",
};

const SEP_22_REVIEW: Omit<ManualVerification, "sourceUrl"> = {
  verifiedBy: "Bryceson",
  verifiedAt: SEP_22,
  evidence:
    "Re-read all seven first-party pricing surfaces. Anthropic, OpenAI, Google, Alibaba Cloud and Moonshot unchanged; DeepSeek still publishes peak and off-peak only; xAI now publishes Grok 4.7 as the current general-purpose model at the same $2 / $6 under 200k prompt tokens.",
};

/**
 * The xAI artifact as it stood on 14 September, before Grok 4.7 was published.
 *
 * Reconstructed from the retained artifact by removing the row the 22 September
 * review added, which is the one difference between the two. Without this the
 * baseline would collect Grok 4.7 prices a week before anyone saw them, and the
 * constituent change would have nothing to actually change.
 */
function xaiArtifactBefore47() {
  const fixture = loadPricingFixture("xai");
  const body = fixture.body
    .replace(/\s*<tr>\s*<td>grok-4\.7[\s\S]*?<\/tr>/, "")
    .replace(/\s*<p>Excerpt note, 22 September 2026:[\s\S]*?<\/p>/, "");
  expect(body).not.toContain("grok-4.7");
  expect(body).toContain("grok-4.6");
  return { body, contentType: fixture.contentType, url: fixture.sourceUrl, retrievedAt: SEP_14 };
}

/* ------------------------------------------------------------------ *
 * A database faithful enough to test write semantics against.
 *
 * It enforces the things the schema enforces and this suite depends on:
 * retrievals unique by idempotency key, benchmarks unique by lineage, one
 * active withholding per provider and reason, and one verification per key.
 * ------------------------------------------------------------------ */
function memoryDb() {
  const statements: string[] = [];
  const retrievals = new Map<string, Record<string, unknown>>();
  const observations: Record<string, unknown>[] = [];
  const benchmarks: Record<string, unknown>[] = [];
  const verifications: Record<string, unknown>[] = [];
  let id = 0;
  const nextId = (prefix: string) => `${prefix}-${++id}`;

  const modelById = new Map(WAVE1_MODELS.map((model) => [model.id, model]));
  const modelByNative = new Map(WAVE1_MODELS.map((model) => [`${model.providerSlug}::${model.providerModelId}`, model]));
  const interfaceById = new Map(Object.values(WAVE1_SOURCE_INTERFACES).map((row) => [row.id, row]));

  return {
    statements,
    retrievals,
    observations,
    benchmarks,
    verifications,
    async query(text: string, params: readonly unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> {
      const sql = text.trim();
      statements.push(sql.split("\n")[0]!);
      if (/^(begin|commit|rollback)$/i.test(sql)) return { rows: [] };

      if (sql.includes("FROM reference.models m")) return { rows: [] };
      if (sql.includes("FROM reference.source_interfaces si")) return { rows: [] };

      if (sql.startsWith("SELECT o.id") || sql.includes("FROM pipeline.token_price_observations o")) {
        return { rows: [...observations].sort((a, b) => String(a.retrieved_at).localeCompare(String(b.retrieved_at))) };
      }

      if (sql.includes("FROM pipeline.source_retrievals r")) {
        const wanted = new Set((params[0] as string[]) ?? []);
        return { rows: [...retrievals.values()].filter((row) => wanted.has(String(row.id))) };
      }

      if (sql.startsWith("INSERT INTO pipeline.source_retrievals")) {
        const key = String(params[2]);
        if (retrievals.has(key)) return { rows: [] };
        const source = interfaceById.get(String(params[1]));
        retrievals.set(key, {
          id: params[0],
          source_interface_id: params[1],
          idempotency_key: params[2],
          requested_at: params[3],
          completed_at: params[4],
          request_method: params[5],
          request_url: params[6],
          request_parameters: params[7],
          response_status: params[8],
          response_content_type: params[9],
          response_hash: params[10],
          response_byte_length: params[11],
          response_body: params[12],
          record_count: params[13],
          enumeration_assessment: params[14],
          enumeration_evidence: params[15],
          collector_identity: params[16],
          retrieval_purpose: params[17],
          acquisition_mode: params[18],
          verification_evidence: params[19],
          permission_grant_id: params[20],
          source_interface_slug: source?.slug ?? "unknown",
        });
        return { rows: [{ id: params[0] }] };
      }

      if (sql.startsWith("INSERT INTO pipeline.token_price_observations")) {
        const model = modelById.get(String(params[1]));
        const row = {
          id: params[0],
          model_id: params[1],
          pricing_dimension: params[2],
          source_native_price: params[3],
          source_native_currency: params[4],
          source_native_denominator_tokens: params[5],
          canonical_price_usd_per_1m: params[6],
          region: params[7],
          service_tier: params[8],
          context_tier: params[9],
          cache_ttl: params[10],
          source_interface_id: params[11],
          source_retrieval_id: params[12],
          source_effective_at: params[13],
          retrieved_at: params[14],
          provider_model_id: model?.providerModelId ?? "unknown",
          provider_slug: model?.providerSlug ?? "unknown",
        };
        const identity = [row.model_id, row.pricing_dimension, row.region, row.service_tier, row.context_tier, row.cache_ttl, row.retrieved_at].join("|");
        if (observations.some((existing) => [existing.model_id, existing.pricing_dimension, existing.region, existing.service_tier, existing.context_tier, existing.cache_ttl, existing.retrieved_at].join("|") === identity)) {
          return { rows: [] };
        }
        observations.push(row);
        return { rows: [{ id: params[0] }] };
      }

      if (sql.includes("FROM pipeline.token_price_benchmarks b")) {
        return { rows: [...benchmarks].sort((a, b) => String(a.provider_slug).localeCompare(String(b.provider_slug)) || String(a.calculated_at).localeCompare(String(b.calculated_at))) };
      }

      if (sql.startsWith("INSERT INTO pipeline.token_price_benchmarks") && sql.includes("'withheld'")) {
        // Partial unique index: one active withholding per provider, reason and version.
        const clash = benchmarks.some(
          (row) => row.calculation_status === "withheld" && row.provider_slug === params[0] && row.withheld_reason === params[2] && row.methodology_version === params[1],
        );
        if (clash) return { rows: [] };
        const row = {
          id: nextId("withholding"),
          provider_slug: params[0],
          methodology_version: params[1],
          provider_model_id: null,
          display_name: null,
          calculation_status: "withheld",
          withheld_reason: params[2],
          price_usd_per_1m: null,
          input_observation_id: null,
          output_observation_id: null,
          input_price_usd_per_1m: null,
          output_price_usd_per_1m: null,
          input_observed_at: null,
          output_observed_at: null,
          calculated_at: params[3],
          calculator_identity: params[4],
        };
        benchmarks.push(row);
        return { rows: [{ id: row.id }] };
      }

      if (sql.startsWith("INSERT INTO pipeline.token_price_benchmarks")) {
        const lineage = [params[0], params[1], params[2], params[6], params[7]].join("|");
        if (benchmarks.some((row) => [row.provider_slug, row.methodology_version, row.provider_model_id, row.input_observation_id, row.output_observation_id].join("|") === lineage)) {
          return { rows: [] };
        }
        const model = modelByNative.get(`${String(params[0])}::${String(params[2])}`);
        const row = {
          id: nextId("benchmark"),
          provider_slug: params[0],
          methodology_version: params[1],
          provider_model_id: params[2],
          display_name: model?.displayName ?? null,
          calculation_status: params[3],
          withheld_reason: params[4],
          price_usd_per_1m: params[5],
          input_observation_id: params[6],
          output_observation_id: params[7],
          input_price_usd_per_1m: params[8],
          output_price_usd_per_1m: params[9],
          input_observed_at: params[10],
          output_observed_at: params[11],
          calculated_at: params[12],
          calculator_identity: params[13],
        };
        benchmarks.push(row);
        return { rows: [{ id: row.id }] };
      }

      if (sql.includes("FROM pipeline.token_price_verifications v")) {
        return {
          rows: verifications
            .filter((row) => row.verification_purpose === "production")
            .sort((a, b) => String(a.provider_slug).localeCompare(String(b.provider_slug)) || String(a.verified_at).localeCompare(String(b.verified_at))),
        };
      }

      if (sql.startsWith("INSERT INTO pipeline.token_price_verifications")) {
        const key = String(params[2]);
        if (verifications.some((row) => row.idempotency_key === key)) return { rows: [] };
        const row = {
          id: nextId("verification"),
          provider_slug: params[0],
          source_interface_id: params[1],
          idempotency_key: key,
          verified_by: params[3],
          verified_at: params[4],
          evidence: params[5],
          verification_purpose: params[6],
          source_retrieval_id: params[7],
          artifact_sha256: params[8],
          observed_state: params[9],
          benchmark_id: params[10],
          benchmark_model_id: params[11],
          methodology_version: params[12],
        };
        verifications.push(row);
        return { rows: [{ id: row.id }] };
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}

type MemoryDb = ReturnType<typeof memoryDb>;

/**
 * Production as it stood after the 14 September run: Grok 4.6 designated and
 * frozen, DeepSeek withheld, and one attestation per provider.
 *
 * Built through the ordinary write path rather than by inserting rows, so the
 * baseline is what the operator command actually produces.
 */
async function seedSeptember14(db: MemoryDb): Promise<void> {
  const store = new InMemoryTokenPricingStore([...WAVE1_PROVIDERS]);
  for (const provider of WAVE1_PROVIDERS) {
    const fixture = loadPricingFixture(provider);
    const artifact = provider === "xai" ? xaiArtifactBefore47() : { body: fixture.body, contentType: fixture.contentType, url: fixture.sourceUrl, retrievedAt: SEP_14 };
    const verification = { ...SEP_14_REVIEW, sourceUrl: fixture.sourceUrl };
    if (!constituentInForce(provider, "2026-09-14")) {
      ingestTokenPricing({
        provider,
        mode: "production",
        artifact: { ...artifact, method: "manual_read", requestedAt: SEP_14, retrievedAt: SEP_14 },
        store,
        verification,
      });
      continue;
    }
    verifyProviderProduction({ provider, artifact, verification, store, onDate: "2026-09-14" });
  }

  const catalog = tokenReadCatalogFromStore(store);
  await persistTokenReadCatalog(db, catalog);
  await persistProviderBenchmarks(db, catalog, "production", "2026-09-14", "urdais-token-price/manual-verification");

  const frozen = await loadPersistedBenchmarks(db);
  await persistVerificationEvents(
    db,
    WAVE1_PROVIDERS.map((provider) => {
      const active = frozen.filter((row) => row.providerSlug === provider).sort((a, b) => b.calculatedAt.localeCompare(a.calculatedAt))[0]!;
      return {
        providerSlug: provider,
        sourceInterfaceId: WAVE1_SOURCE_INTERFACES[provider].id,
        verifiedBy: SEP_14_REVIEW.verifiedBy,
        verifiedAt: SEP_14,
        evidence: SEP_14_REVIEW.evidence,
        verificationPurpose: "production" as const,
        sourceRetrievalId: null,
        artifactSha256: null,
        observedState: active.calculationStatus,
        benchmarkId: active.id,
        providerModelId: active.calculationStatus === "value" ? active.benchmarkModelId : null,
        methodologyVersion: active.methodologyVersion,
      };
    }),
  );
}

async function freshnessAt(db: MemoryDb, now: string) {
  return verificationFreshness(await loadPersistedBenchmarks(db), await loadVerificationEvents(db), new Date(now));
}

describe("an unchanged review refreshes freshness and invents nothing", () => {
  it("records one attestation per provider while writing no price data at all", async () => {
    const db = memoryDb();
    await seedSeptember14(db);
    const observationsBefore = db.observations.length;
    const benchmarksBefore = db.benchmarks.length;
    const retrievalsBefore = db.retrievals.size;

    // The 22 September review, with every price unchanged except xAI's new
    // designation, which is exercised separately below.
    const run = await runProductionVerification(db, SEP_22_REVIEW);

    expect(run.attestations.inserted).toBe(WAVE1_PROVIDERS.length);
    expect(run.attestations.skipped).toEqual([]);

    // Anthropic is the pure unchanged case: same page, same prices, same model.
    const anthropicObservations = db.observations.filter((row) => row.provider_slug === "anthropic");
    expect(anthropicObservations.every((row) => row.retrieved_at === SEP_14)).toBe(true);
    const anthropicBenchmarks = db.benchmarks.filter((row) => row.provider_slug === "anthropic");
    expect(anthropicBenchmarks).toHaveLength(1);
    expect(anthropicBenchmarks[0]!.calculated_at).toBe(SEP_14);

    // No new retrieval for an unchanged artifact: a manual retrieval is keyed by
    // hash, so re-reading a byte-identical page is the same retrieval. Exactly one
    // is added, xAI's, because that page genuinely changed.
    expect(db.retrievals.size).toBe(retrievalsBefore + 1);
    const byInterface = (slug: string) => [...db.retrievals.values()].filter((row) => row.source_interface_slug === slug);
    expect(byInterface("anthropic-api-pricing-docs")).toHaveLength(1);
    expect(byInterface("openai-api-pricing-docs")).toHaveLength(1);
    expect(byInterface("deepseek-api-pricing-docs")).toHaveLength(1);
    const xaiRetrievals = byInterface("xai-models-docs");
    expect(xaiRetrievals).toHaveLength(2);
    expect(new Set(xaiRetrievals.map((row) => row.response_hash)).size).toBe(2);

    // The only new price rows in the whole run belong to xAI's newly published model.
    expect(db.observations.slice(observationsBefore).every((row) => row.provider_model_id === "grok-4.7")).toBe(true);
    expect(db.observations.length).toBeGreaterThan(observationsBefore);
    // And the only new benchmark is xAI's successor point.
    expect(db.benchmarks.length - benchmarksBefore).toBe(1);
  });

  it("turns the watchdog green on the day of the review, with an age of zero", async () => {
    const db = memoryDb();
    await seedSeptember14(db);

    // Before: seven days on, nobody has looked since the 14th.
    const before = await freshnessAt(db, SEP_22);
    expect(before.ok).toBe(false);
    expect(before.reviewDue).toEqual([...WAVE1_PROVIDERS]);

    await runProductionVerification(db, SEP_22_REVIEW);

    const after = await freshnessAt(db, SEP_22);
    expect(after.ok).toBe(true);
    expect(after.reviewDue).toEqual([]);
    expect(after.neverVerified).toEqual([]);
    for (const provider of after.providers) {
      expect(provider.state).toBe("current");
      expect(provider.ageDays).toBe(0);
      expect(provider.lastVerifiedAt).toBe(SEP_22);
      expect(provider.lastVerifiedBy).toBe("Bryceson");
    }
  });

  it("keeps the frozen calculation instants exactly where they were", async () => {
    const db = memoryDb();
    await seedSeptember14(db);
    const before = db.benchmarks.map((row) => [row.provider_slug, row.provider_model_id, row.calculated_at, row.price_usd_per_1m]);

    await runProductionVerification(db, SEP_22_REVIEW);

    // Freshness moved without a single stored timestamp being rewritten, which is
    // the whole point: the alternative fix was to touch calculated_at, and that
    // would have put a lie into the published history to quiet a warning.
    for (const row of before) {
      expect(db.benchmarks.some((after) => after.provider_slug === row[0] && after.provider_model_id === row[1] && after.calculated_at === row[2] && after.price_usd_per_1m === row[3])).toBe(true);
    }
    expect(db.statements.some((sql) => /^\s*(UPDATE|DELETE)/i.test(sql))).toBe(false);
  });
});

describe("idempotence is defined on the attestation, not on the clock", () => {
  it("replaying the same review writes nothing the second time", async () => {
    const db = memoryDb();
    await seedSeptember14(db);
    const first = await runProductionVerification(db, SEP_22_REVIEW);
    const observations = db.observations.length;
    const benchmarks = db.benchmarks.length;
    const verifications = db.verifications.length;

    const second = await runProductionVerification(db, SEP_22_REVIEW);

    expect(first.attestations.inserted).toBe(WAVE1_PROVIDERS.length);
    expect(second.attestations.inserted).toBe(0);
    expect(second.written.observationsInserted).toBe(0);
    expect(second.written.retrievalsInserted).toBe(0);
    expect(second.benchmarks.inserted).toBe(0);
    expect(second.benchmarks.withheld).toBe(0);
    expect(db.observations.length).toBe(observations);
    expect(db.benchmarks.length).toBe(benchmarks);
    expect(db.verifications.length).toBe(verifications);
  });

  it("keys an attestation by provider, instant, verifier and statement", () => {
    const base = { providerSlug: "anthropic", verifiedAt: SEP_22, verifiedBy: "Bryceson", evidence: "read the page" };
    expect(verificationIdempotencyKey(base)).toBe(verificationIdempotencyKey({ ...base }));
    expect(verificationIdempotencyKey(base)).not.toBe(verificationIdempotencyKey({ ...base, verifiedAt: SEP_29 }));
    expect(verificationIdempotencyKey(base)).not.toBe(verificationIdempotencyKey({ ...base, verifiedBy: "someone else" }));
    expect(verificationIdempotencyKey(base)).not.toBe(verificationIdempotencyKey({ ...base, evidence: "read a different page" }));
    expect(verificationIdempotencyKey(base)).not.toBe(verificationIdempotencyKey({ ...base, providerSlug: "openai" }));
  });

  it("lets a genuinely later review record itself even though no price moved", async () => {
    const db = memoryDb();
    await seedSeptember14(db);
    await runProductionVerification(db, SEP_22_REVIEW);
    const observations = db.observations.length;
    const benchmarks = db.benchmarks.length;

    const later = await runProductionVerification(db, {
      verifiedBy: "Bryceson",
      verifiedAt: SEP_29,
      evidence: "Weekly re-read of all seven first-party pricing surfaces; every published rate unchanged since 22 September.",
    });

    // A new event, and nothing else: this is the case the whole design exists for.
    expect(later.attestations.inserted).toBe(WAVE1_PROVIDERS.length);
    expect(db.observations.length).toBe(observations);
    expect(db.benchmarks.length).toBe(benchmarks);

    const report = await freshnessAt(db, SEP_29);
    expect(report.ok).toBe(true);
    for (const provider of report.providers) {
      expect(provider.ageDays).toBe(0);
      expect(provider.lastVerifiedAt).toBe(SEP_29);
    }
  });
});

describe("xAI moves to Grok 4.7 without rewriting Grok 4.6", () => {
  it("freezes a successor point on the new model at the same $2 / $6", async () => {
    const db = memoryDb();
    await seedSeptember14(db);
    const before = db.benchmarks.filter((row) => row.provider_slug === "xai");
    expect(before).toHaveLength(1);
    expect(before[0]!.provider_model_id).toBe("grok-4.6");

    await runProductionVerification(db, SEP_22_REVIEW);

    const after = db.benchmarks.filter((row) => row.provider_slug === "xai");
    expect(after).toHaveLength(2);

    const legacy = after.find((row) => row.provider_model_id === "grok-4.6")!;
    const successor = after.find((row) => row.provider_model_id === "grok-4.7")!;

    // The predecessor is byte-for-byte what it was. A designation change never
    // reaches back into the value it succeeds.
    expect(legacy).toEqual(before[0]);
    expect(legacy.calculated_at).toBe(SEP_14);
    // Whatever version produced it, 1.3 is not it: the successor's version never
    // reaches back and relabels the point it succeeds.
    expect(legacy.methodology_version).not.toBe("1.3");

    // The successor is real new lineage, on the new model, under the version that
    // introduced the designation.
    expect(successor.calculated_at).toBe(SEP_22);
    expect(successor.methodology_version).toBe("1.3");
    expect(successor.input_price_usd_per_1m).toBe(2);
    expect(successor.output_price_usd_per_1m).toBe(6);
    expect(successor.price_usd_per_1m).toBe(4);
    // Its legs are its own observations, not the predecessor's.
    expect(successor.input_observation_id).not.toBe(legacy.input_observation_id);
    expect(successor.output_observation_id).not.toBe(legacy.output_observation_id);
  });

  it("does not let an unchanged value suppress the constituent transition", async () => {
    // Both points are $4.00. The engine drops a repeated value *within* one
    // designation, and must not drop this one: the two points measure different
    // economic objects, and collapsing them would hide the change entirely.
    const db = memoryDb();
    await seedSeptember14(db);
    await runProductionVerification(db, SEP_22_REVIEW);
    const xai = db.benchmarks.filter((row) => row.provider_slug === "xai");
    expect(xai.map((row) => row.price_usd_per_1m)).toEqual([4, 4]);
    expect(new Set(xai.map((row) => row.provider_model_id))).toEqual(new Set(["grok-4.6", "grok-4.7"]));
  });

  it("leaves every Grok 4.6 observation exactly as it was", async () => {
    const db = memoryDb();
    await seedSeptember14(db);
    const before = db.observations.filter((row) => row.provider_model_id === "grok-4.6").map((row) => JSON.stringify(row));
    expect(before.length).toBeGreaterThan(0);

    await runProductionVerification(db, SEP_22_REVIEW);

    const after = db.observations.filter((row) => row.provider_model_id === "grok-4.6").map((row) => JSON.stringify(row));
    expect(after).toEqual(before);
  });

  it("records the attestation against the designation that now stands", async () => {
    const db = memoryDb();
    await seedSeptember14(db);
    await runProductionVerification(db, SEP_22_REVIEW);
    const events = db.verifications.filter((row) => row.provider_slug === "xai");
    const newest = events.sort((a, b) => String(a.verified_at).localeCompare(String(b.verified_at))).at(-1)!;
    expect(newest.verified_at).toBe(SEP_22);
    expect(newest.benchmark_model_id).toBe("grok-4.7");
    expect(newest.observed_state).toBe("value");
  });
});

describe("DeepSeek stays withheld and still counts as verified", () => {
  it("refreshes the withholding without emitting any numerical benchmark", async () => {
    const db = memoryDb();
    await seedSeptember14(db);
    await runProductionVerification(db, SEP_22_REVIEW);

    const rows = db.benchmarks.filter((row) => row.provider_slug === "deepseek");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.calculation_status).toBe("withheld");
    expect(rows[0]!.withheld_reason).toBe("NO_STANDARD_SERVICE_TIER");
    expect(rows[0]!.price_usd_per_1m).toBeNull();
    expect(rows[0]!.provider_model_id).toBeNull();

    const report = await freshnessAt(db, SEP_22);
    const deepseek = report.providers.find((p) => p.provider === "deepseek")!;
    expect(deepseek.state).toBe("current");
    expect(deepseek.ageDays).toBe(0);
    expect(deepseek.latestStatus).toBe("withheld");
    expect(withholdingFor("deepseek", "2026-09-22")?.reason).toBe("NO_STANDARD_SERVICE_TIER");
  });

  it("names no model on the attestation, because none is designated", async () => {
    const db = memoryDb();
    await seedSeptember14(db);
    await runProductionVerification(db, SEP_22_REVIEW);
    for (const row of db.verifications.filter((row) => row.provider_slug === "deepseek")) {
      expect(row.observed_state).toBe("withheld");
      expect(row.benchmark_model_id).toBeNull();
    }
  });

  it("keeps the V4.1-Flash identity it already carries, under the published api name", async () => {
    // The 22 September review found the API model named deepseek-flash, serving
    // DeepSeek-V4.1-Flash. That is what the catalog already records, so there is
    // nothing to correct -- and the prior observations stay attached to it rather
    // than being re-pointed at a renamed identity.
    const flash = WAVE1_MODELS.find((model) => model.providerSlug === "deepseek" && model.providerModelId === "deepseek-flash")!;
    expect(flash.version).toBe("V4.1-Flash");
    expect(flash.lifecycleStatus).toBe("current");

    const db = memoryDb();
    await seedSeptember14(db);
    const before = db.observations.filter((row) => row.provider_slug === "deepseek").map((row) => JSON.stringify(row));
    await runProductionVerification(db, SEP_22_REVIEW);
    expect(db.observations.filter((row) => row.provider_slug === "deepseek").map((row) => JSON.stringify(row))).toEqual(before);
  });

  it("does not stack a second withholding when the methodology version moves", async () => {
    // 1.3 took effect on 22 September. A withholding is a decision about what the
    // provider publishes, not about which edition of the rulebook was open, so a
    // new version must not add a second active decision for the same reason.
    const db = memoryDb();
    await seedSeptember14(db);
    const run = await runProductionVerification(db, SEP_22_REVIEW);
    expect(run.benchmarks.withheld).toBe(0);
    expect(db.benchmarks.filter((row) => row.calculation_status === "withheld")).toHaveLength(1);
    expect(db.benchmarks.find((row) => row.calculation_status === "withheld")!.methodology_version).toBe("1.2");
  });
});

describe("the run writes no rights and claims no collection permission", () => {
  it("issues no statement that touches a source registry column", async () => {
    const db = memoryDb();
    await seedSeptember14(db);
    await runProductionVerification(db, SEP_22_REVIEW);
    // Reading a rights column is how the gate stays closed; writing one is the
    // thing that must never happen, so the assertion is about writes.
    for (const sql of db.statements) {
      expect(sql).not.toMatch(/^\s*(UPDATE|INSERT INTO|DELETE FROM)\s+reference\./i);
      expect(sql).not.toMatch(/^\s*(UPDATE|DELETE)/i);
    }
    // Every Wave-1 source is still research-only, which is what blocks a collector.
    for (const provider of WAVE1_PROVIDERS) {
      expect(WAVE1_SOURCE_INTERFACES[provider].registry.productionAccessState).toBe("research_usable");
      expect(WAVE1_SOURCE_INTERFACES[provider].registry.termsReviewState).toBe("under_review");
    }
  });

  it("covers every designated provider and the withheld one", async () => {
    const db = memoryDb();
    await seedSeptember14(db);
    const run = await runProductionVerification(db, SEP_22_REVIEW);
    expect(run.verifications.map((row) => row.provider).sort()).toEqual([...DESIGNATED].sort());
    expect(run.withheld.map((row) => row.provider)).toEqual(["deepseek"]);
    expect(run.attestations.recorded).toBe(WAVE1_PROVIDERS.length);
  });
});
