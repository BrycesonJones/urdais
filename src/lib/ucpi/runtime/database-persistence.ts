/**
 * The executing persistence: the same statements SqlPersistence builds, run
 * against a real database, plus the four reads the production job needs.
 *
 * SqlPersistence exists to render SQL for an operator to apply, and it stays
 * that way -- the listed-print script depends on it. This class composes it
 * rather than replacing it, so there is exactly one place where a row's columns
 * are decided and no chance of the emitted SQL and the executed SQL drifting.
 *
 * Domain identifiers are database identifiers here. The runner loads market
 * entities from reference.market_entities and hands the pipeline their real
 * uuids, so `entityIdFor` is the identity function and no mapping layer can
 * silently drop a seller. An id that is not a uuid is a bug in the caller, not
 * something to paper over, so it is refused rather than nulled.
 *
 * Every insert still meets the database's own triggers and constraints. This
 * class enforces nothing on its own: the publication guard, the append-only
 * triggers, the lineage checks and the approved-version rule all live in the
 * schema and all still apply to these statements.
 */

import { randomUUID } from "node:crypto";

import type { PriorObservation } from "@/lib/ucpi/calculation-window";
import type { CapacitySourceObservation, SellerObservation } from "@/lib/ucpi/aggregation";
import type { EligibilityAssessment, NormalizedObservation, RawOffer, Retrieval } from "@/lib/ucpi/domain";
import {
  DuplicateRetrievalError,
  PersistenceGateError,
  SqlPersistence,
  type CalculationRunRow,
  type Persistence,
  type PublicationRow,
  type RetrievalRow,
  type SqlExecutor,
  type SqlLineage,
  type StoredRegionalObservation,
} from "@/lib/ucpi/runtime/persistence";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Domain ids are database ids on this path; anything else is a caller bug. */
function requireUuid(id: string): string {
  if (!UUID.test(id)) throw new PersistenceGateError(`expected a database uuid, got ${id}`);
  return id;
}

const IDS = { entityIdFor: (domainId: string): string | null => (domainId === "" ? null : requireUuid(domainId)) };

function str(v: unknown): string {
  return String(v);
}
function nullableStr(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}
function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}
function nullableNum(v: unknown): number | null {
  return v === null || v === undefined ? null : num(v);
}
/** Postgres renders timestamptz as a Date through pg; the domain speaks ISO-8601. */
function instant(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}
function nullableInstant(v: unknown): string | null {
  return v === null || v === undefined ? null : instant(v);
}
/** A date column is a calendar date and must not acquire a timezone on the way out. */
function calendarDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

/**
 * The half-open UTC window of a calculation date, as explicit instants.
 *
 * Never `$1::date` against a timestamptz column: that cast resolves in the *session's*
 * timezone, so the same query windows different rows on a connection set to UTC and one set
 * to America/New_York. A retrieval made at 01:00 UTC on the 16th reads as the 15th under a
 * -04 session, which silently admits a later day's input to an earlier day's calculation.
 * The bounds are computed here so the answer does not depend on how the connection was made.
 */
function utcWindow(calculationDate: string): { start: string; end: string } {
  const start = new Date(`${calculationDate}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export class DatabasePersistence implements Persistence {
  private readonly statements: SqlPersistence;

  constructor(
    private readonly sql: SqlExecutor,
    private readonly lineage: SqlLineage,
  ) {
    this.statements = new SqlPersistence(sql, lineage);
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

  private async run(statements: readonly { text: string; params: readonly unknown[] }[]): Promise<void> {
    for (const s of statements) await this.sql.query(s.text, s.params);
  }

  async insertRetrieval(row: RetrievalRow): Promise<void> {
    const existing = row.responseHash === null ? null : await this.findRetrievalByHash(row.sourceInterfaceSlug, row.responseHash, row.calculationDate);
    // The same bytes inside the same window are the same observation. The collector decides
    // what to do about it; the store's job is to say so rather than to write a second copy.
    if (existing !== null) throw new DuplicateRetrievalError(existing);
    await this.statements.insertRetrieval(row);
  }

  async findRetrievalByHash(sourceInterfaceSlug: string, responseHash: string, calculationDate: string): Promise<string | null> {
    const interfaceId = this.lineage.sourceInterfaceIdBySlug.get(sourceInterfaceSlug);
    if (interfaceId === undefined) throw new PersistenceGateError(`no source interface id known for ${sourceInterfaceSlug}`);
    const w = utcWindow(calculationDate);
    const { rows } = await this.sql.query(
      "select id from pipeline.source_retrievals where source_interface_id = $1 and response_hash = $2 and requested_at >= $3::timestamptz and requested_at < $4::timestamptz order by requested_at limit 1",
      [interfaceId, responseHash, w.start, w.end],
    );
    return rows.length === 0 ? null : str(rows[0]!.id);
  }

  /**
   * Raw offers and observations carry composite domain ids -- an adapter numbers its rows
   * `<retrievalId>:<ordinal>` so that a row is identifiable before anything is stored -- and
   * the columns they land in are uuid. A uuid is minted on first sight of a domain id and
   * reused wherever that id appears again, so the foreign keys between a raw offer, its
   * observation and that observation's assessment all resolve to the same rows.
   *
   * The map lives for the life of this instance, which is one instrument's run. Reading the
   * day's observations back returns the database's uuids, so everything downstream of a read
   * is already speaking uuids and needs no mapping at all.
   */
  private readonly rowIds = new Map<string, string>();

  private rowId(domainId: string): string {
    const existing = this.rowIds.get(domainId);
    if (existing !== undefined) return existing;
    const minted = UUID.test(domainId) ? domainId : randomUUID();
    this.rowIds.set(domainId, minted);
    return minted;
  }

  async insertRawOffers(rows: readonly RawOffer[]): Promise<void> {
    await this.statements.insertRawOffers(rows.map((r) => ({ ...r, id: this.rowId(r.id) })));
  }

  async insertNormalizedObservations(rows: readonly NormalizedObservation[]): Promise<void> {
    const mapped = rows.map((o) => ({ ...o, id: this.rowId(o.id), rawOfferId: this.rowId(o.rawOfferId) }));
    await this.run(mapped.map((o) => this.statements.normalizedObservationStatement(o, IDS)));
  }

  async insertAssessments(rows: readonly EligibilityAssessment[]): Promise<void> {
    for (const a of rows) {
      await this.run(this.statements.assessmentStatements({ ...a, observationId: this.rowId(a.observationId) }, randomUUID()));
    }
  }

  /**
   * The date's production observations, and the retrievals behind them.
   *
   * Scoped to this instrument and to production retrievals inside the date's window: a
   * research or validation retrieval is evidence and never an input to a value, and the
   * publication gate checks the same thing again on the way out.
   */
  async loadObservationsForDate(calculationDate: string): Promise<{ observations: NormalizedObservation[]; retrievals: Retrieval[] }> {
    const { rows } = await this.sql.query(
      "select o.*, sv.version as spec_version, mv.version as methodology_version, r.id as retrieval_id, r.source_interface_id, r.requested_at, r.completed_at, r.response_status, r.request_method, r.request_url, r.request_parameters, r.enumeration_assessment, r.retrieval_purpose, r.permission_grant_id, si.slug as source_slug " +
        "from pipeline.normalized_observations o " +
        "join pipeline.raw_offers ro on ro.id = o.raw_offer_id " +
        "join pipeline.source_retrievals r on r.id = ro.retrieval_id " +
        "join reference.source_interfaces si on si.id = r.source_interface_id " +
        "join reference.instrument_spec_versions sv on sv.id = o.instrument_spec_version_id " +
        "join reference.methodology_versions mv on mv.id = o.methodology_version_id " +
        "where o.instrument_id = $1 and o.superseded_by_id is null and r.retrieval_purpose = 'production' " +
        "and r.requested_at >= $2::timestamptz and r.requested_at < $3::timestamptz " +
        "order by o.observed_at, o.id",
      [this.lineage.instrumentId, utcWindow(calculationDate).start, utcWindow(calculationDate).end],
    );

    const retrievals = new Map<string, Retrieval>();
    const observations: NormalizedObservation[] = [];
    for (const row of rows) {
      const retrievalId = str(row.retrieval_id);
      if (!retrievals.has(retrievalId)) {
        retrievals.set(retrievalId, {
          id: retrievalId,
          sourceInterfaceSlug: str(row.source_slug),
          requestedAt: instant(row.requested_at),
          completedAt: nullableInstant(row.completed_at),
          responseStatus: nullableNum(row.response_status),
          request: {
            method: str(row.request_method) as Retrieval["request"]["method"],
            url: str(row.request_url),
            parameters: (row.request_parameters ?? {}) as Record<string, string>,
            requiredHeaders: [],
          },
          enumerationAssessment: str(row.enumeration_assessment) as Retrieval["enumerationAssessment"],
          retrievalPurpose: str(row.retrieval_purpose) as Retrieval["retrievalPurpose"],
          permissionGrantId: nullableStr(row.permission_grant_id),
        });
      }
      observations.push(rowToObservation(row, retrievalId));
    }
    return { observations, retrievals: [...retrievals.values()] };
  }

  async insertCalculationRun(run: CalculationRunRow): Promise<void> {
    const s = this.statements.runStatement(run);
    await this.sql.query(s.text, s.params);
  }

  /**
   * Seller and capacity-source observations carry no id of their own: they are values the
   * aggregation computed, and the row id is minted here. Membership is by (seller, region),
   * which is exactly the cell the reduction produced, so the ids are remembered for the
   * capacity-source and participant links that follow within the same run.
   */
  private readonly sellerRowIds = new Map<string, string>();
  private readonly capacityRowIds = new Map<string, string>();

  private static cell(entityId: string, region: string): string {
    return `${entityId}|${region}`;
  }

  async insertSellerObservations(runId: string, rows: readonly SellerObservation[]): Promise<void> {
    for (const s of rows) {
      const id = randomUUID();
      this.sellerRowIds.set(DatabasePersistence.cell(s.sellerEntityId, s.canonicalRegionCode), id);
      await this.run(this.statements.sellerObservationStatements(runId, s, id, IDS));
    }
  }

  async insertCapacitySources(runId: string, rows: readonly CapacitySourceObservation[]): Promise<void> {
    for (const c of rows) {
      const id = randomUUID();
      this.capacityRowIds.set(DatabasePersistence.cell(c.capacitySourceEntityId, c.canonicalRegionCode), id);
      const members = c.memberSellerEntityIds.map((sellerId) => {
        const memberId = this.sellerRowIds.get(DatabasePersistence.cell(sellerId, c.canonicalRegionCode));
        if (memberId === undefined) throw new PersistenceGateError(`capacity source ${c.capacitySourceEntityId} names seller ${sellerId}, which was not written`);
        return memberId;
      });
      await this.run(this.statements.capacitySourceStatements(runId, c, id, IDS, members));
    }
  }

  async insertRegionalObservation(row: StoredRegionalObservation): Promise<void> {
    const s = this.statements.regionalStatement(row);
    await this.sql.query(s.text, s.params);
    const participantIds = row.participants.map((p) => {
      const id = this.capacityRowIds.get(DatabasePersistence.cell(p.capacitySourceEntityId, p.canonicalRegionCode));
      if (id === undefined) throw new PersistenceGateError(`regional observation names capacity source ${p.capacitySourceEntityId}, which was not written`);
      return id;
    });
    await this.run(this.statements.regionalParticipantStatements(row.id, participantIds));
  }

  async supersedeRegionalObservation(id: string, byId: string, reason: string, at: string): Promise<void> {
    const s = this.statements.supersessionStatement(id, byId, reason, at);
    await this.sql.query(s.text, s.params);
  }

  async insertPublication(row: PublicationRow): Promise<void> {
    const s = this.statements.publicationStatement(row);
    await this.sql.query(s.text, s.params);
  }

  async loadPriorRegional(instrument: string, region: string, calculationDate: string) {
    void instrument;
    const { rows } = await this.sql.query(
      "select o.id, o.outcome, o.market_breadth, o.price_level, p.publication_status, " +
        "coalesce(array_agg(cs.capacity_source_entity_id::text) filter (where cs.capacity_source_entity_id is not null), '{}') as participant_ids " +
        "from pipeline.regional_observations o " +
        "left join pipeline.regional_publications p on p.regional_observation_id = o.id " +
        "left join pipeline.regional_observation_participants rp on rp.regional_observation_id = o.id " +
        "left join pipeline.capacity_source_observations cs on cs.id = rp.capacity_source_observation_id " +
        "where o.instrument_id = $1 and o.superseded_by_id is null " +
        "and (case when $2 = 'LISTED' then o.region_scope = 'listed_provider_wide' else o.canonical_region_code = $2 end) " +
        "and o.calculation_date = ($3::date - 1) " +
        "group by o.id, o.outcome, o.market_breadth, o.price_level, p.publication_status limit 1",
      [this.lineage.instrumentId, region, calculationDate],
    );
    if (rows.length === 0) return null;
    const row = rows[0]!;
    const participantIds = ((row.participant_ids ?? []) as unknown[]).map(str);
    if (str(row.outcome) === "unavailable") {
      return { status: "unavailable" as const, priceLevel: null, participantIds: [] };
    }
    // A calculated but unreleased prior is not a Published level, so a change against it is
    // withheld. "delayed" is the vocabulary's word for that and the gate agrees with it.
    if (row.publication_status !== "published") {
      return { status: "delayed" as const, priceLevel: nullableNum(row.price_level), participantIds };
    }
    return {
      status: "published" as const,
      breadth: str(row.market_breadth) as "minimum" | "normal",
      participantSetChanged: false,
      priceLevel: nullableNum(row.price_level),
      participantIds,
    } satisfies PriorObservation & { priceLevel: number | null; participantIds: string[] };
  }

  async loadRegionalSeries(filter: { instrument: string; country?: string; from?: string; to?: string }) {
    const q = SqlPersistence.seriesQuery({ instrumentId: this.lineage.instrumentId, country: filter.country, from: filter.from, to: filter.to });
    const { rows } = await this.sql.query(q.text, q.params);
    return rows.map((row) => {
      const outcome = str(row.outcome) as StoredRegionalObservation["outcome"];
      const publishedAt = nullableInstant(row.published_at);
      return {
        id: str(row.id),
        runId: "",
        runKind: str(row.run_kind) as StoredRegionalObservation["runKind"],
        calculatedAt: instant(row.calculated_at),
        supersededById: null,
        instrument: filter.instrument,
        calculationDate: calendarDate(row.calculation_date),
        canonicalRegionCode: nullableStr(row.canonical_region_code) ?? "LISTED",
        regionScope: (nullableStr(row.canonical_region_code) === null ? "listed_provider_wide" : "country") as StoredRegionalObservation["regionScope"],
        outcome,
        structuralCondition: nullableStr(row.structural_condition) as StoredRegionalObservation["structuralCondition"],
        marketBreadth: nullableStr(row.market_breadth) as StoredRegionalObservation["marketBreadth"],
        priceLevel: nullableNum(row.price_level),
        currency: str(row.currency),
        unit: str(row.unit),
        participantCount: num(row.participant_count),
        contributingSourceCount: num(row.contributing_source_count),
        largestSourceParticipantShare: nullableNum(row.largest_source_participant_share),
        dispersionPublished: Boolean(row.dispersion_published),
        dispersion:
          row.p50 === null || row.p50 === undefined
            ? null
            : { p10: num(row.p10), p50: num(row.p50), p90: num(row.p90), iqr: num(row.iqr) },
        percentageChange1d: nullableNum(row.percentage_change_1d),
        changeDisposition: nullableStr(row.change_disposition) as StoredRegionalObservation["changeDisposition"],
        windowStart: instant(row.window_start),
        cutoff: instant(row.cutoff),
        publicationDeadline: instant(row.publication_deadline),
        methodologyVersion: this.lineageVersions().methodologyVersion,
        instrumentSpecVersion: this.lineageVersions().instrumentSpecVersion,
        participants: [],
        diagnostics: [],
        sourceAttributions: [],
        publication:
          publishedAt === null
            ? null
            : { id: "", regionalObservationId: str(row.id), publishedAt, publicationStatus: str(row.publication_status) as PublicationRow["publicationStatus"], publisherIdentity: "" },
      } as StoredRegionalObservation & { publication: PublicationRow | null };
    });
  }

  /** The versions this persistence was constructed for; the series read does not re-derive them. */
  private lineageVersions(): { methodologyVersion: string; instrumentSpecVersion: string } {
    return this.versions;
  }

  /** Set by the runner, which knows the version strings the ids stand for. */
  versions: { methodologyVersion: string; instrumentSpecVersion: string } = { methodologyVersion: "", instrumentSpecVersion: "" };
}

function rowToObservation(row: Record<string, unknown>, retrievalId: string): NormalizedObservation {
  const serviceTier = (row.service_tier ?? null) as NormalizedObservation["serviceTier"];
  const promotional = ((row.promotional_indicators ?? {}) as { promotional?: boolean }).promotional === true;
  return {
    id: str(row.id),
    rawOfferId: str(row.raw_offer_id),
    retrievalId,
    // The slug comes from the retrieval's interface, which is the only place it is true.
    sourceInterfaceSlug: str(row.source_slug),
    instrumentSpecVersion: str(row.spec_version),
    methodologyVersion: str(row.methodology_version),
    enumerationAssessment: str(row.enumeration_assessment) as NormalizedObservation["enumerationAssessment"],
    gpuVendor: nullableStr(row.gpu_vendor),
    gpuModel: nullableStr(row.gpu_model),
    formFactor: nullableStr(row.form_factor),
    gpuMemoryGb: nullableNum(row.gpu_memory_gb),
    tenancyEvidence: nullableStr(row.tenancy_evidence),
    regionMappingEvidence: nullableStr(row.region_mapping_evidence),
    sourceAttribution: nullableStr(row.source_attribution),
    sellerPricesByQuantityTier: row.seller_prices_by_quantity_tier === null || row.seller_prices_by_quantity_tier === undefined ? null : Boolean(row.seller_prices_by_quantity_tier),
    sellerEntityId: str(row.seller_entity_id),
    operatorEntityId: nullableStr(row.operator_entity_id),
    operatorAttributionBasis: str(row.operator_attribution_basis) as NormalizedObservation["operatorAttributionBasis"],
    marketplaceEntityId: nullableStr(row.marketplace_entity_id),
    canonicalRegionCode: nullableStr(row.canonical_region_code),
    observedAt: instant(row.observed_at),
    sourceEffectiveAt: nullableInstant(row.source_effective_at),
    availabilityObservedAt: nullableInstant(row.availability_observed_at),
    normalizedPrice: num(row.normalized_price),
    normalizedCurrency: str(row.normalized_currency),
    normalizedUnit: str(row.normalized_unit) as NormalizedObservation["normalizedUnit"],
    priceConversion: (row.price_conversion ?? {}) as NormalizedObservation["priceConversion"],
    taxBasis: str(row.tax_basis) as NormalizedObservation["taxBasis"],
    mandatoryFeeInterpretation: (row.mandatory_fee_interpretation ?? {}) as NormalizedObservation["mandatoryFeeInterpretation"],
    promotional,
    hardwareIdentityGrade: str(row.hardware_identity_grade) as NormalizedObservation["hardwareIdentityGrade"],
    fullDevice: Boolean(row.full_device),
    gpuCount: nullableNum(row.gpu_count),
    minimumGpuCount: nullableNum(row.minimum_gpu_count),
    minimumTopologySourceField: nullableStr(row.minimum_topology_source_field),
    wholeNodeRequired: Boolean(row.whole_node_required),
    topologyClass: nullableStr(row.topology_class) as NormalizedObservation["topologyClass"],
    procurementMode: str(row.procurement_mode) as NormalizedObservation["procurementMode"],
    preemptible: Boolean(row.preemptible),
    serviceProduct: str(row.service_product) as NormalizedObservation["serviceProduct"],
    tenancyGrade: str(row.tenancy_grade) as NormalizedObservation["tenancyGrade"],
    availabilityState: str(row.availability_state) as NormalizedObservation["availabilityState"],
    availabilityEvidenceGrade: nullableNum(row.availability_evidence_grade) as NormalizedObservation["availabilityEvidenceGrade"],
    availabilityQuantity: nullableNum(row.availability_quantity),
    vcpuPerAccelerator: nullableNum(row.vcpu_per_accelerator),
    hostMemoryGbPerAccelerator: nullableNum(row.host_memory_gb_per_accelerator),
    storageGbPerAccelerator: nullableNum(row.storage_gb_per_accelerator),
    serviceTier,
    observationType: str(row.observation_type) as NormalizedObservation["observationType"],
    sourceQualityGrade: num(row.source_quality_grade) as NormalizedObservation["sourceQualityGrade"],
  } as NormalizedObservation;
}
