/**
 * Persistence for the collector runtime and the production job.
 *
 * `Persistence` is the contract; `InMemoryPersistence` backs tests and
 * simulation; `SqlPersistence` emits parameterized statements against the
 * pipeline schema through an injected `SqlExecutor`, so the production wiring
 * is a database client, not new logic. The in-memory implementation mirrors the
 * database's hard gates (production retrieval needs a grant; idempotency keys
 * are unique) so the job's behaviour is the same under both.
 */

import type { CapacitySourceObservation, RegionalObservation, SellerObservation } from "@/lib/ucpi/aggregation";
import type { PriorObservation } from "@/lib/ucpi/calculation-window";
import type { EligibilityAssessment, NormalizedObservation, RawOffer, Retrieval } from "@/lib/ucpi/domain";

export type RetrievalRow = Retrieval & {
  responseHash: string | null;
  responseBody: unknown;
  responseByteLength: number | null;
  recordCount: number | null;
  collectorIdentity: string;
  calculationDate: string;
};

export type CalculationRunRow = {
  id: string;
  instrument: string;
  instrumentSpecVersion: string;
  methodologyVersion: string;
  calculationDate: string;
  windowStart: string;
  cutoff: string;
  publicationDeadline: string;
  calculatedAt: string;
  calculatorIdentity: string;
  runKind: "production" | "simulation" | "correction";
  notes: string | null;
};

export type StoredRegionalObservation = RegionalObservation & {
  id: string;
  runId: string;
  runKind: CalculationRunRow["runKind"];
  calculatedAt: string;
  supersededById: string | null;
};

export type PublicationRow = {
  id: string;
  regionalObservationId: string;
  publishedAt: string;
  publicationStatus: "published" | "delayed";
  publisherIdentity: string;
};

export interface Persistence {
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  insertRetrieval(row: RetrievalRow): Promise<void>;
  findRetrievalByHash(sourceInterfaceSlug: string, responseHash: string, calculationDate: string): Promise<string | null>;
  insertRawOffers(rows: readonly RawOffer[]): Promise<void>;
  insertNormalizedObservations(rows: readonly NormalizedObservation[]): Promise<void>;
  insertAssessments(rows: readonly EligibilityAssessment[]): Promise<void>;
  loadObservationsForDate(calculationDate: string): Promise<{ observations: NormalizedObservation[]; retrievals: Retrieval[] }>;
  insertCalculationRun(run: CalculationRunRow): Promise<void>;
  insertSellerObservations(runId: string, rows: readonly SellerObservation[]): Promise<void>;
  insertCapacitySources(runId: string, rows: readonly CapacitySourceObservation[]): Promise<void>;
  insertRegionalObservation(row: StoredRegionalObservation): Promise<void>;
  /** Marks a current regional observation as superseded by a new one; the only permitted mutation. */
  supersedeRegionalObservation(id: string, byId: string, reason: string, at: string): Promise<void>;
  insertPublication(row: PublicationRow): Promise<void>;
  loadPriorRegional(instrument: string, region: string, calculationDate: string): Promise<(PriorObservation & { priceLevel: number | null; participantIds: string[] }) | null>;
  loadRegionalSeries(filter: { instrument: string; country?: string; from?: string; to?: string }): Promise<(StoredRegionalObservation & { publication: PublicationRow | null })[]>;
}

export class DuplicateRetrievalError extends Error {
  constructor(key: string) {
    super(`a retrieval with idempotency key ${key} already exists`);
    this.name = "DuplicateRetrievalError";
  }
}

export class PersistenceGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceGateError";
  }
}

export function previousDate(calculationDate: string): string {
  return new Date(Date.parse(`${calculationDate}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

export class InMemoryPersistence implements Persistence {
  readonly retrievals: RetrievalRow[] = [];
  readonly rawOffers: RawOffer[] = [];
  readonly observations: NormalizedObservation[] = [];
  readonly assessments: EligibilityAssessment[] = [];
  readonly runs: CalculationRunRow[] = [];
  readonly sellerObservations: { runId: string; row: SellerObservation }[] = [];
  readonly capacitySources: { runId: string; row: CapacitySourceObservation }[] = [];
  readonly regional: StoredRegionalObservation[] = [];
  readonly publications: PublicationRow[] = [];

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  async insertRetrieval(row: RetrievalRow): Promise<void> {
    if (this.retrievals.some((r) => r.id === row.id || (r.request.url === row.request.url && r.requestedAt === row.requestedAt && r.sourceInterfaceSlug === row.sourceInterfaceSlug))) {
      throw new DuplicateRetrievalError(`${row.sourceInterfaceSlug}|${row.requestedAt}`);
    }
    // Mirrors source_retrievals_production_requires_grant and the permission trigger.
    if (row.retrievalPurpose !== "research" && row.permissionGrantId === null) {
      throw new PersistenceGateError(`a ${row.retrievalPurpose} retrieval requires a permission grant`);
    }
    this.retrievals.push(row);
  }

  async findRetrievalByHash(slug: string, hash: string, calculationDate: string): Promise<string | null> {
    return this.retrievals.find((r) => r.sourceInterfaceSlug === slug && r.responseHash === hash && r.calculationDate === calculationDate)?.id ?? null;
  }

  async insertRawOffers(rows: readonly RawOffer[]): Promise<void> {
    this.rawOffers.push(...rows);
  }

  async insertNormalizedObservations(rows: readonly NormalizedObservation[]): Promise<void> {
    this.observations.push(...rows);
  }

  async insertAssessments(rows: readonly EligibilityAssessment[]): Promise<void> {
    this.assessments.push(...rows);
  }

  async loadObservationsForDate(calculationDate: string): Promise<{ observations: NormalizedObservation[]; retrievals: Retrieval[] }> {
    // Only production retrievals feed a production calculation; validation and research data never do.
    const retrievals = this.retrievals.filter((r) => r.calculationDate === calculationDate && r.retrievalPurpose === "production");
    const ids = new Set(retrievals.map((r) => r.id));
    return { observations: this.observations.filter((o) => ids.has(o.retrievalId)), retrievals };
  }

  async insertCalculationRun(run: CalculationRunRow): Promise<void> {
    this.runs.push(run);
  }

  async insertSellerObservations(runId: string, rows: readonly SellerObservation[]): Promise<void> {
    for (const row of rows) this.sellerObservations.push({ runId, row });
  }

  async insertCapacitySources(runId: string, rows: readonly CapacitySourceObservation[]): Promise<void> {
    for (const row of rows) this.capacitySources.push({ runId, row });
  }

  async insertRegionalObservation(row: StoredRegionalObservation): Promise<void> {
    const current = this.regional.find((r) => r.instrument === row.instrument && r.canonicalRegionCode === row.canonicalRegionCode && r.calculationDate === row.calculationDate && r.supersededById === null);
    if (current) throw new PersistenceGateError(`a current regional observation already exists for ${row.canonicalRegionCode} ${row.calculationDate}; supersede it first`);
    this.regional.push(row);
  }

  readonly supersessions: { id: string; byId: string; reason: string; at: string }[] = [];

  async supersedeRegionalObservation(id: string, byId: string, reason: string, at: string): Promise<void> {
    const row = this.regional.find((r) => r.id === id);
    if (!row) throw new PersistenceGateError(`no regional observation ${id}`);
    if (row.supersededById !== null) throw new PersistenceGateError(`regional observation ${id} is already superseded`);
    row.supersededById = byId;
    this.supersessions.push({ id, byId, reason, at });
  }

  async insertPublication(row: PublicationRow): Promise<void> {
    const obs = this.regional.find((r) => r.id === row.regionalObservationId);
    if (!obs) throw new PersistenceGateError(`no regional observation ${row.regionalObservationId}`);
    if (obs.runKind === "simulation") throw new PersistenceGateError("a simulation run is never published");
    if (this.publications.some((p) => p.regionalObservationId === row.regionalObservationId)) throw new PersistenceGateError("already published");
    const timely = Date.parse(row.publishedAt) < Date.parse(obs.publicationDeadline);
    if ((timely && row.publicationStatus !== "published") || (!timely && row.publicationStatus !== "delayed")) {
      throw new PersistenceGateError(`publication status ${row.publicationStatus} disagrees with the deadline ${obs.publicationDeadline}`);
    }
    this.publications.push(row);
  }

  async loadPriorRegional(instrument: string, region: string, calculationDate: string) {
    const prev = previousDate(calculationDate);
    const row = this.regional.find((r) => r.instrument === instrument && r.canonicalRegionCode === region && r.calculationDate === prev && r.supersededById === null);
    if (!row) return null;
    const published = this.publications.find((p) => p.regionalObservationId === row.id);
    if (row.outcome === "unavailable") return { status: "unavailable" as const, priceLevel: null, participantIds: [] };
    if (!published || published.publicationStatus === "delayed") return { status: "delayed" as const, priceLevel: row.priceLevel, participantIds: row.participants.map((p) => p.capacitySourceEntityId) };
    return { status: "published" as const, breadth: row.marketBreadth!, participantSetChanged: false, priceLevel: row.priceLevel, participantIds: row.participants.map((p) => p.capacitySourceEntityId) };
  }

  async loadRegionalSeries(filter: { instrument: string; country?: string; from?: string; to?: string }) {
    return this.regional
      .filter((r) => r.instrument === filter.instrument && r.supersededById === null)
      .filter((r) => (filter.country ? r.canonicalRegionCode === filter.country : true))
      .filter((r) => (filter.from ? r.calculationDate >= filter.from : true))
      .filter((r) => (filter.to ? r.calculationDate <= filter.to : true))
      .sort((a, b) => a.calculationDate.localeCompare(b.calculationDate) || a.canonicalRegionCode.localeCompare(b.canonicalRegionCode))
      .map((r) => ({ ...r, publication: this.publications.find((p) => p.regionalObservationId === r.id) ?? null }));
  }
}

// SQL-emitting persistence ----------------------------------------------------------

export type SqlStatement = { text: string; params: readonly unknown[] };

export interface SqlExecutor {
  query(text: string, params: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** Identifiers the SQL layer needs that the domain carries as slugs or versions. */
export type SqlLineage = {
  instrumentId: string;
  instrumentSpecVersionId: string;
  methodologyVersionId: string;
  sourceInterfaceIdBySlug: ReadonlyMap<string, string>;
};

/**
 * Emits inserts against the pipeline schema. Rows are inserted exactly as the
 * domain computed them; every constraint and trigger in the database still
 * applies, so a gate the runtime missed is still refused here.
 */
export class SqlPersistence {
  constructor(
    private readonly sql: SqlExecutor,
    private readonly lineage: SqlLineage,
  ) {}

  private interfaceId(slug: string): string {
    const id = this.lineage.sourceInterfaceIdBySlug.get(slug);
    if (!id) throw new PersistenceGateError(`no source interface id known for ${slug}`);
    return id;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.sql.query("begin", []);
    try {
      const out = await fn();
      await this.sql.query("commit", []);
      return out;
    } catch (error) {
      await this.sql.query("rollback", []);
      throw error;
    }
  }

  retrievalStatement(row: RetrievalRow): SqlStatement {
    return {
      text:
        "insert into pipeline.source_retrievals (id, source_interface_id, idempotency_key, requested_at, completed_at, request_method, request_url, request_parameters, response_status, response_hash, response_byte_length, response_body, record_count, enumeration_assessment, collector_identity, retrieval_purpose, permission_grant_id) " +
        "values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17)",
      params: [
        row.id,
        this.interfaceId(row.sourceInterfaceSlug),
        `${row.sourceInterfaceSlug}|${row.calculationDate}|${row.requestedAt}`,
        row.requestedAt,
        row.completedAt,
        row.request.method,
        row.request.url,
        JSON.stringify(row.request.parameters),
        row.responseStatus,
        row.responseHash,
        row.responseByteLength,
        row.responseBody === undefined ? null : JSON.stringify(row.responseBody),
        row.recordCount,
        row.enumerationAssessment,
        row.collectorIdentity,
        row.retrievalPurpose,
        row.permissionGrantId,
      ],
    };
  }

  async insertRetrieval(row: RetrievalRow): Promise<void> {
    const s = this.retrievalStatement(row);
    await this.sql.query(s.text, s.params);
  }

  rawOfferStatement(row: RawOffer): SqlStatement {
    return {
      text:
        "insert into pipeline.raw_offers (id, retrieval_id, row_ordinal, source_native_offer_id, source_native_product_id, record_hash, raw_payload, observed_at, source_effective_at, availability_observed_at, native_product_label, native_gpu_model, native_form_factor, native_gpu_memory_mb, native_seller_id, native_operator_id, native_price, native_currency, native_billing_unit, native_price_components, native_procurement_mode, native_preemptible, native_tenancy_fields, native_gpu_count, native_minimum_gpu_count, native_region, native_geolocation, native_availability_value, native_vcpu, native_host_memory_mb, native_storage_gb, native_service_tier, native_service_fields) " +
        "values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21, $22, $23::jsonb, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33::jsonb)",
      params: [
        row.id,
        row.retrievalId,
        row.rowOrdinal,
        row.sourceNativeOfferId,
        row.sourceNativeProductId,
        sha256Hex(JSON.stringify(row.rawPayload)),
        JSON.stringify(row.rawPayload),
        row.observedAt,
        row.sourceEffectiveAt,
        row.availabilityObservedAt,
        row.nativeProductLabel,
        row.nativeGpuModel,
        row.nativeFormFactor,
        row.nativeGpuMemoryMb,
        row.nativeSellerId,
        row.nativeOperatorId,
        row.nativePrice,
        row.nativeCurrency,
        row.nativeBillingUnit,
        JSON.stringify(row.nativePriceComponents ?? null),
        row.nativeProcurementMode,
        row.nativePreemptible,
        JSON.stringify(row.nativeTenancyFields ?? null),
        row.nativeGpuCount,
        row.nativeMinimumGpuCount,
        row.nativeRegion,
        row.nativeGeolocation,
        row.nativeAvailabilityValue,
        row.nativeVcpu,
        row.nativeHostMemoryMb,
        row.nativeStorageGb,
        row.nativeServiceTier,
        JSON.stringify(row.nativeServiceFields ?? null),
      ],
    };
  }

  async insertRawOffers(rows: readonly RawOffer[]): Promise<void> {
    for (const row of rows) {
      const s = this.rawOfferStatement(row);
      await this.sql.query(s.text, s.params);
    }
  }

  runStatement(run: CalculationRunRow): SqlStatement {
    return {
      text:
        "insert into pipeline.calculation_runs (id, instrument_id, instrument_spec_version_id, methodology_version_id, calculation_date, window_start, cutoff, publication_deadline, calculated_at, calculator_identity, run_kind, notes) " +
        "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
      params: [run.id, this.lineage.instrumentId, this.lineage.instrumentSpecVersionId, this.lineage.methodologyVersionId, run.calculationDate, run.windowStart, run.cutoff, run.publicationDeadline, run.calculatedAt, run.calculatorIdentity, run.runKind, run.notes],
    };
  }

  normalizedObservationStatement(o: NormalizedObservation, ids: { entityIdFor: (domainId: string) => string | null }): SqlStatement {
    return {
      text:
        "insert into pipeline.normalized_observations (id, raw_offer_id, instrument_id, instrument_spec_version_id, methodology_version_id, seller_entity_id, operator_entity_id, operator_attribution_basis, marketplace_entity_id, canonical_region_code, observed_at, source_effective_at, availability_observed_at, normalized_price, normalized_currency, normalized_unit, price_conversion, tax_basis, mandatory_fee_interpretation, promotional_indicators, hardware_identity_grade, full_device, gpu_count, minimum_gpu_count, minimum_topology_source_field, whole_node_required, topology_class, procurement_mode, preemptible, service_product, tenancy_grade, availability_state, availability_evidence_grade, availability_quantity, vcpu_per_accelerator, host_memory_gb_per_accelerator, storage_gb_per_accelerator, service_tier, observation_type, source_quality_grade, gpu_vendor, gpu_model, form_factor, gpu_memory_gb, tenancy_evidence, region_mapping_evidence, source_attribution, seller_prices_by_quantity_tier) " +
        "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19::jsonb, $20::jsonb, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38::jsonb, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48)",
      params: [
        o.id, o.rawOfferId, this.lineage.instrumentId, this.lineage.instrumentSpecVersionId, this.lineage.methodologyVersionId,
        ids.entityIdFor(o.sellerEntityId), o.operatorEntityId === null ? null : ids.entityIdFor(o.operatorEntityId), o.operatorAttributionBasis, o.marketplaceEntityId === null ? null : ids.entityIdFor(o.marketplaceEntityId),
        o.canonicalRegionCode, o.observedAt, o.sourceEffectiveAt, o.availabilityObservedAt,
        o.normalizedPrice, o.normalizedCurrency, o.normalizedUnit, JSON.stringify(o.priceConversion), o.taxBasis, JSON.stringify(o.mandatoryFeeInterpretation), JSON.stringify({ promotional: o.promotional }),
        o.hardwareIdentityGrade, o.fullDevice, o.gpuCount, o.minimumGpuCount, o.minimumTopologySourceField, o.wholeNodeRequired, o.topologyClass,
        o.procurementMode, o.preemptible, o.serviceProduct, o.tenancyGrade, o.availabilityState, o.availabilityEvidenceGrade, o.availabilityQuantity,
        o.vcpuPerAccelerator, o.hostMemoryGbPerAccelerator, o.storageGbPerAccelerator, JSON.stringify(o.serviceTier), o.observationType, o.sourceQualityGrade,
        o.gpuVendor, o.gpuModel, o.formFactor, o.gpuMemoryGb, o.tenancyEvidence, o.regionMappingEvidence, o.sourceAttribution ?? null, o.sellerPricesByQuantityTier ?? null,
      ],
    };
  }

  assessmentStatements(a: EligibilityAssessment, id: string): SqlStatement[] {
    const out: SqlStatement[] = [
      {
        text: "insert into pipeline.eligibility_assessments (id, normalized_observation_id, instrument_spec_version_id, methodology_version_id, evaluator_identity, assessed_at, calculation_date, p0, p1, p2, input_status) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        params: [id, a.observationId, this.lineage.instrumentSpecVersionId, this.lineage.methodologyVersionId, "ucpi-eligibility", new Date().toISOString(), a.calculationDate, a.p0, a.p1, a.p2, a.inputStatus],
      },
    ];
    for (const code of a.exclusions) out.push({ text: "insert into pipeline.eligibility_exclusions (assessment_id, reason_code) values ($1, $2)", params: [id, code] });
    for (const code of a.diagnostics) out.push({ text: "insert into pipeline.eligibility_diagnostics (assessment_id, diagnostic_code) values ($1, $2)", params: [id, code] });
    return out;
  }

  sellerObservationStatements(runId: string, s: SellerObservation, id: string, ids: { entityIdFor: (domainId: string) => string | null }): SqlStatement[] {
    const scope = s.canonicalRegionCode === "LISTED" ? "listed_provider_wide" : "country";
    const out: SqlStatement[] = [
      {
        text: "insert into pipeline.seller_observations (id, run_id, seller_entity_id, canonical_region_code, region_scope, canonical_quantity, representative_price, selected_normalized_observation_id, considered_count, canonical_count) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        params: [id, runId, ids.entityIdFor(s.sellerEntityId), scope === "country" ? s.canonicalRegionCode : null, scope, s.canonicalQuantity, s.representativePrice, s.selectedObservationId, s.consideredCount, s.canonicalCount],
      },
    ];
    for (const c of s.candidates) out.push({ text: "insert into pipeline.seller_observation_candidates (seller_observation_id, normalized_observation_id, at_canonical_quantity, selected) values ($1, $2, $3, $4)", params: [id, c.observationId, c.atCanonicalQuantity, c.selected] });
    return out;
  }

  capacitySourceStatements(runId: string, c: CapacitySourceObservation, id: string, ids: { entityIdFor: (domainId: string) => string | null }, memberSellerObservationIds: readonly string[]): SqlStatement[] {
    const scope = c.canonicalRegionCode === "LISTED" ? "listed_provider_wide" : "country";
    const out: SqlStatement[] = [
      {
        text: "insert into pipeline.capacity_source_observations (id, run_id, capacity_source_entity_id, canonical_region_code, region_scope, representative_price, attribution_status, source_interface_count) values ($1, $2, $3, $4, $5, $6, $7, $8)",
        params: [id, runId, ids.entityIdFor(c.capacitySourceEntityId), scope === "country" ? c.canonicalRegionCode : null, scope, c.representativePrice, c.attributionStatus, c.sourceInterfaceCount],
      },
    ];
    for (const m of memberSellerObservationIds) out.push({ text: "insert into pipeline.capacity_source_members (capacity_source_observation_id, seller_observation_id) values ($1, $2)", params: [id, m] });
    return out;
  }

  regionalParticipantStatements(regionalObservationId: string, capacitySourceObservationIds: readonly string[]): SqlStatement[] {
    return capacitySourceObservationIds.map((c) => ({ text: "insert into pipeline.regional_observation_participants (regional_observation_id, capacity_source_observation_id) values ($1, $2)", params: [regionalObservationId, c] }));
  }

  regionalStatement(row: StoredRegionalObservation): SqlStatement {
    const scope = row.regionScope;
    return {
      text:
        "insert into pipeline.regional_observations (id, run_id, instrument_id, calculation_date, canonical_region_code, region_scope, source_attributions, outcome, structural_condition, market_breadth, price_level, currency, unit, participant_count, contributing_source_count, largest_source_participant_share, dispersion_published, p10, p50, p90, iqr, percentage_change_1d, change_disposition) " +
        "values ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)",
      params: [
        row.id,
        row.runId,
        this.lineage.instrumentId,
        row.calculationDate,
        scope === "country" ? row.canonicalRegionCode : null,
        scope,
        row.sourceAttributions,
        row.outcome,
        row.structuralCondition,
        row.marketBreadth,
        row.priceLevel,
        row.currency,
        row.unit,
        row.participantCount,
        row.contributingSourceCount,
        row.largestSourceParticipantShare,
        row.dispersionPublished,
        row.dispersion?.p10 ?? null,
        row.dispersion?.p50 ?? null,
        row.dispersion?.p90 ?? null,
        row.dispersion?.iqr ?? null,
        row.percentageChange1d,
        row.changeDisposition,
      ],
    };
  }

  supersessionStatement(id: string, byId: string, reason: string, at: string): SqlStatement {
    return {
      text: "update pipeline.regional_observations set superseded_by_id = $2, superseded_at = $3, supersession_reason = $4 where id = $1 and superseded_by_id is null",
      params: [id, byId, at, reason],
    };
  }

  publicationStatement(row: PublicationRow): SqlStatement {
    return {
      text: "insert into pipeline.regional_publications (id, regional_observation_id, published_at, publication_status, publisher_identity) values ($1, $2, $3, $4, $5)",
      params: [row.id, row.regionalObservationId, row.publishedAt, row.publicationStatus, row.publisherIdentity],
    };
  }

  /** The series read query; the API path never selects participant prices or raw payloads. */
  static seriesQuery(filter: { instrumentId: string; country?: string; from?: string; to?: string }): SqlStatement {
    const params: unknown[] = [filter.instrumentId];
    const where = ["o.instrument_id = $1", "o.superseded_by_id is null"];
    if (filter.country) {
      params.push(filter.country);
      where.push(`o.canonical_region_code = $${params.length}`);
    }
    if (filter.from) {
      params.push(filter.from);
      where.push(`o.calculation_date >= $${params.length}`);
    }
    if (filter.to) {
      params.push(filter.to);
      where.push(`o.calculation_date <= $${params.length}`);
    }
    return {
      text:
        "select o.id, o.calculation_date, o.canonical_region_code, o.source_attributions, o.outcome, o.structural_condition, o.market_breadth, o.price_level, o.currency, o.unit, o.participant_count, o.contributing_source_count, o.largest_source_participant_share, o.dispersion_published, o.p10, o.p50, o.p90, o.iqr, o.percentage_change_1d, o.change_disposition, r.window_start, r.cutoff, r.publication_deadline, r.calculated_at, r.run_kind, p.published_at, p.publication_status " +
        "from pipeline.regional_observations o join pipeline.calculation_runs r on r.id = o.run_id left join pipeline.regional_publications p on p.regional_observation_id = o.id " +
        `where ${where.join(" and ")} order by o.calculation_date, o.canonical_region_code`,
      params,
    };
  }
}

import { createHash } from "node:crypto";

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
