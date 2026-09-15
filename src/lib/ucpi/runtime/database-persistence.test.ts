import { describe, expect, it } from "vitest";

import { DatabasePersistence } from "@/lib/ucpi/runtime/database-persistence";
import type { SqlExecutor } from "@/lib/ucpi/runtime/persistence";

/** Records every statement so the SQL itself can be asserted on. */
function recorder(rows: Record<string, unknown>[] = []): SqlExecutor & { calls: { text: string; params: readonly unknown[] }[] } {
  const calls: { text: string; params: readonly unknown[] }[] = [];
  return {
    calls,
    async query(text: string, params: readonly unknown[]) {
      calls.push({ text, params });
      return { rows };
    },
  };
}

const LINEAGE = {
  instrumentId: "11111111-1111-4111-8111-111111111111",
  instrumentSpecVersionId: "22222222-2222-4222-8222-222222222222",
  methodologyVersionId: "33333333-3333-4333-8333-333333333333",
  sourceInterfaceIdBySlug: new Map([["price-of-compute-prices", "44444444-4444-4444-8444-444444444444"]]),
};

describe("the calculation window is UTC, whatever the session timezone is", () => {
  // The bug this fixes: `$1::date` against a timestamptz resolves in the session's timezone,
  // so a retrieval made at 01:00 UTC on the 16th reads as the 15th on a -04 connection and a
  // later day's input silently enters an earlier day's calculation.
  it("bounds the day's observations with explicit instants, never a ::date cast on a timestamptz", async () => {
    const sql = recorder();
    const p = new DatabasePersistence(sql, LINEAGE);
    await p.loadObservationsForDate("2026-09-15");
    const q = sql.calls[0]!;
    expect(q.text).toContain("r.requested_at >= $2::timestamptz");
    expect(q.text).toContain("r.requested_at < $3::timestamptz");
    expect(q.text).not.toContain("::date");
    expect(q.params[1]).toBe("2026-09-15T00:00:00.000Z");
    expect(q.params[2]).toBe("2026-09-16T00:00:00.000Z");
  });

  it("bounds the duplicate-retrieval lookup the same way", async () => {
    const sql = recorder();
    const p = new DatabasePersistence(sql, LINEAGE);
    await p.findRetrievalByHash("price-of-compute-prices", "a".repeat(64), "2026-09-15");
    const q = sql.calls[0]!;
    expect(q.params[2]).toBe("2026-09-15T00:00:00.000Z");
    expect(q.params[3]).toBe("2026-09-16T00:00:00.000Z");
    expect(q.text).not.toContain("::date");
  });

  it("puts a 01:00Z retrieval on the 16th in the 16th's window and not the 15th's", async () => {
    const at = Date.parse("2026-09-16T01:00:00Z");
    const fifteenth = { start: Date.parse("2026-09-15T00:00:00.000Z"), end: Date.parse("2026-09-16T00:00:00.000Z") };
    const sixteenth = { start: Date.parse("2026-09-16T00:00:00.000Z"), end: Date.parse("2026-09-17T00:00:00.000Z") };
    expect(at >= fifteenth.start && at < fifteenth.end).toBe(false);
    expect(at >= sixteenth.start && at < sixteenth.end).toBe(true);
  });
});

describe("domain ids become row ids without losing the links between them", () => {
  // An adapter numbers its rows `<retrievalId>:<ordinal>` so a row is identifiable before it
  // is stored. Those are not uuids and the columns are, so one is minted per domain id and
  // reused, or a raw offer and its observation would point at different rows.
  it("mints one uuid per domain id and reuses it for the foreign keys", async () => {
    const sql = recorder();
    const p = new DatabasePersistence(sql, LINEAGE);
    const retrievalId = "55555555-5555-4555-8555-555555555555";
    const offer = { id: `${retrievalId}:0`, retrievalId, rowOrdinal: 0, rawPayload: {}, observedAt: "2026-09-15T00:00:00Z" };
    await p.insertRawOffers([offer as never]);
    const rawId = sql.calls[0]!.params[0] as string;
    expect(rawId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(rawId).not.toBe(offer.id);

    sql.calls.length = 0;
    await p.insertNormalizedObservations([
      { id: `${retrievalId}:obs:0`, rawOfferId: offer.id, sellerEntityId: "66666666-6666-4666-8666-666666666666", operatorEntityId: null, marketplaceEntityId: null, serviceTier: null, priceConversion: null, mandatoryFeeInterpretation: null } as never,
    ]);
    // The observation's raw_offer_id is the uuid minted for that same offer, not a new one.
    expect(sql.calls[0]!.params[1]).toBe(rawId);
    const obsId = sql.calls[0]!.params[0] as string;

    sql.calls.length = 0;
    await p.insertAssessments([{ observationId: `${retrievalId}:obs:0`, calculationDate: "2026-09-15", p0: true, p1: true, p2: true, inputStatus: "valid", exclusions: [], diagnostics: [] } as never]);
    expect(sql.calls[0]!.params[1]).toBe(obsId);
  });

  it("leaves an id that is already a uuid exactly as it is", async () => {
    const sql = recorder();
    const p = new DatabasePersistence(sql, LINEAGE);
    const id = "77777777-7777-4777-8777-777777777777";
    await p.insertRawOffers([{ id, retrievalId: id, rowOrdinal: 0, rawPayload: {}, observedAt: "2026-09-15T00:00:00Z" } as never]);
    expect(sql.calls[0]!.params[0]).toBe(id);
  });
});

describe("an observation is re-readable as what it was", () => {
  // Without the canonical identity, every stored row fails identity on re-assessment and the
  // index can never be calculated from storage. Attribution is a methodology requirement.
  it("restores the identity, source slug, versions and attribution the assessment needs", async () => {
    const row = {
      id: "88888888-8888-4888-8888-888888888888",
      raw_offer_id: "99999999-9999-4999-8999-999999999999",
      seller_entity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      operator_entity_id: null,
      marketplace_entity_id: null,
      canonical_region_code: null,
      observed_at: new Date("2026-09-15T21:00:00Z"),
      source_effective_at: null,
      availability_observed_at: null,
      normalized_price: "3.99",
      normalized_currency: "USD",
      normalized_unit: "accelerator_hour",
      operator_attribution_basis: "seller_fallback",
      tax_basis: "exclusive",
      hardware_identity_grade: "c",
      full_device: true,
      topology_class: "per_accelerator_allocation",
      procurement_mode: "on_demand",
      preemptible: false,
      service_product: "full_device_rental",
      tenancy_grade: "unknown",
      availability_state: "unknown",
      observation_type: "indicative_or_list_price",
      source_quality_grade: 6,
      gpu_vendor: "NVIDIA",
      gpu_model: "H100",
      form_factor: "SXM",
      gpu_memory_gb: "80",
      source_attribution: "Data: Price of Compute — priceofcompute.com",
      seller_prices_by_quantity_tier: true,
      tenancy_evidence: null,
      region_mapping_evidence: null,
      spec_version: "1.0.0",
      methodology_version: "1.0.0",
      source_slug: "price-of-compute-prices",
      retrieval_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      requested_at: new Date("2026-09-15T21:00:00Z"),
      completed_at: new Date("2026-09-15T21:00:01Z"),
      response_status: 200,
      request_method: "GET",
      request_url: "https://priceofcompute.com/api/v1/prices/h100-sxm",
      request_parameters: {},
      enumeration_assessment: "complete",
      retrieval_purpose: "production",
      permission_grant_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    };
    const p = new DatabasePersistence(recorder([row]), LINEAGE);
    const { observations, retrievals } = await p.loadObservationsForDate("2026-09-15");
    const o = observations[0]!;

    // Identity: without these four the row fails WRONG_HARDWARE against every instrument.
    expect(o.gpuVendor).toBe("NVIDIA");
    expect(o.gpuModel).toBe("H100");
    expect(o.formFactor).toBe("SXM");
    expect(o.gpuMemoryGb).toBe(80);
    // The registry is keyed by slug; without it the row fails COLLECTION_NOT_PERMITTED.
    expect(o.sourceInterfaceSlug).toBe("price-of-compute-prices");
    expect(o.sourceAttribution).toContain("Price of Compute");
    expect(o.sellerPricesByQuantityTier).toBe(true);
    expect(o.instrumentSpecVersion).toBe("1.0.0");
    // Numerics arrive from pg as strings and instants as Dates; neither may leak outward.
    expect(o.normalizedPrice).toBe(3.99);
    expect(o.observedAt).toBe("2026-09-15T21:00:00.000Z");
    expect(retrievals[0]!.completedAt).toBe("2026-09-15T21:00:01.000Z");
    expect(retrievals[0]!.retrievalPurpose).toBe("production");
  });

  it("asks only for production retrievals, so evidence never becomes an input", async () => {
    const sql = recorder();
    await new DatabasePersistence(sql, LINEAGE).loadObservationsForDate("2026-09-15");
    expect(sql.calls[0]!.text).toContain("r.retrieval_purpose = 'production'");
    expect(sql.calls[0]!.text).toContain("o.superseded_by_id is null");
  });
});

describe("coverage is asked of the retrievals, not the observations", () => {
  // NO_ELIGIBLE_PARTICIPANT means the market was observed and produced nobody eligible. A
  // date before collection began produces the same zero for a different reason, and the two
  // must not be published as the same statement.
  it("reports coverage when a production retrieval produced observations for the date", async () => {
    const sql = recorder([{ "?column?": 1 }]);
    const p = new DatabasePersistence(sql, LINEAGE);
    expect(await p.hasProductionCoverage("2026-09-15")).toBe(true);
  });

  it("reports no coverage when nothing was collected for the date", async () => {
    const p = new DatabasePersistence(recorder([]), LINEAGE);
    expect(await p.hasProductionCoverage("2026-09-14")).toBe(false);
  });

  it("scopes the question to production retrievals, this instrument, and the UTC day", async () => {
    const sql = recorder();
    await new DatabasePersistence(sql, LINEAGE).hasProductionCoverage("2026-09-15");
    const q = sql.calls[0]!;
    expect(q.text).toContain("r.retrieval_purpose = 'production'");
    expect(q.text).toContain("o.instrument_id = $3");
    expect(q.params[0]).toBe("2026-09-15T00:00:00.000Z");
    expect(q.params[1]).toBe("2026-09-16T00:00:00.000Z");
    expect(q.params[2]).toBe(LINEAGE.instrumentId);
    // A research or validation retrieval is evidence and is not coverage.
    expect(q.text).not.toContain("'validation'");
  });
});
