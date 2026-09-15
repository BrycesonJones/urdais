/**
 * The scheduled UCPI listed-GPU run: collect, then calculate and publish.
 *
 * Nothing here is new machinery. `runCollectionPhase` and `runCalculationPhase`
 * already implement the family calendar; this module supplies them with a real
 * database, real lineage and a real clock, and decides what a single scheduled
 * invocation should do with a day that is or is not finished.
 *
 * Lineage is read from the database, never hardcoded. The instrument, its
 * approved specification version, the methodology version that version binds to,
 * the source interface and its permission grant, and every market entity are
 * resolved by lookup at run time. A promotion that changes which version is
 * approved therefore changes what the job calculates under, with no code change
 * and no possibility of the two disagreeing.
 *
 * Only approved versions are resolved at all. The query asks for the instrument's
 * `approved` specification version; an instrument with none is reported as
 * `not_approved` and is not collected from, which is the same answer the
 * publication guard would give later and is cheaper to give first.
 *
 * One invocation does both phases where the calendar allows it. The collection
 * phase belongs inside the calculation date's window and the calculation phase
 * at or after its cutoff, so a run at 01:00 UTC collects for today and calculates
 * and publishes yesterday. That is the whole of the cadence decision, and it is
 * why a single daily job is enough.
 */

import { LISTED_SCOPE_KEY } from "@/lib/ucpi/aggregation";
import { PRICE_OF_COMPUTE_SLUG, priceOfComputeAdapter, type PocPricesResponse } from "@/lib/ucpi/adapters/price-of-compute";
import { POC_SELLER_EVIDENCE_2026_09_15, pocSellerProfiles } from "@/lib/ucpi/adapters/price-of-compute-profiles";
import { calculationWindow } from "@/lib/ucpi/calculation-window";
import type { NormalizationContext } from "@/lib/ucpi/collector";
import type { MarketEntity } from "@/lib/ucpi/domain";
import { LISTED_FAMILY, LISTED_GPU_INSTRUMENTS, type ListedGpuInstrument } from "@/lib/ucpi/listed/instruments";
import type { SourceRegistryState } from "@/lib/ucpi/permission-gate";
import { DatabasePersistence } from "@/lib/ucpi/runtime/database-persistence";
import type { PermissionGrant } from "@/lib/ucpi/runtime/collector-runtime";
import { collectSource } from "@/lib/ucpi/runtime/collector-runtime";
import { DuplicateRetrievalError } from "@/lib/ucpi/runtime/persistence";
import { CollectingSink } from "@/lib/ucpi/runtime/events";
import { fetchHttpClient, type HttpClient } from "@/lib/ucpi/runtime/http";
import { previousDate, type SqlExecutor } from "@/lib/ucpi/runtime/persistence";
import { runCalculationPhase } from "@/lib/ucpi/runtime/production-job";
import { validatePocPrices } from "@/lib/ucpi/runtime/schema-validation";

export type InstrumentOutcome = {
  instrument: string;
  collection: "collected" | "duplicate" | "failed" | "skipped";
  collectionDetail?: string;
  calculation: "published" | "delayed" | "unavailable" | "blocked" | "not_approved" | "no_observations" | "already_calculated" | "failed";
  calculationDetail?: string;
  priceLevel?: number | null;
  participantCount?: number;
  marketBreadth?: string | null;
};

export type DailyRunResult = {
  collectionDate: string;
  calculationDate: string;
  instruments: InstrumentOutcome[];
};

/** What the database says about one instrument's approved lineage. */
type Lineage = {
  instrumentId: string;
  instrumentSpecVersionId: string;
  instrumentSpecVersion: string;
  methodologyVersionId: string;
  methodologyVersion: string;
};

type Registry = {
  sourceInterfaceId: string;
  registry: SourceRegistryState;
  grant: PermissionGrant | null;
  entities: MarketEntity[];
  entityIdBySlug: Map<string, string>;
};

/**
 * The approved lineage per listed instrument. An instrument whose specification version is
 * not approved is simply absent, and the caller reports it rather than collecting for it.
 */
export async function loadApprovedLineage(sql: SqlExecutor): Promise<Map<string, Lineage>> {
  const { rows } = await sql.query(
    "select i.symbol, i.id as instrument_id, sv.id as spec_version_id, sv.version as spec_version, mv.id as methodology_version_id, mv.version as methodology_version " +
      "from reference.instruments i " +
      "join reference.instrument_spec_versions sv on sv.instrument_id = i.id and sv.status = 'approved' " +
      "join reference.methodology_versions mv on mv.id = sv.methodology_version_id and mv.status = 'approved' " +
      "where i.symbol = any($1::text[]) and sv.effective_from <= current_date " +
      "order by sv.effective_from desc",
    [LISTED_GPU_INSTRUMENTS.map((i) => i.symbol)],
  );
  const out = new Map<string, Lineage>();
  for (const r of rows) {
    const symbol = String(r.symbol);
    // Ordered by effective date descending, so the first row for a symbol is the current one.
    if (out.has(symbol)) continue;
    out.set(symbol, {
      instrumentId: String(r.instrument_id),
      instrumentSpecVersionId: String(r.spec_version_id),
      instrumentSpecVersion: String(r.spec_version),
      methodologyVersionId: String(r.methodology_version_id),
      methodologyVersion: String(r.methodology_version),
    });
  }
  return out;
}

/** The source interface, its grant in force, and the market entities the profiles name. */
export async function loadRegistry(sql: SqlExecutor, now: Date): Promise<Registry> {
  const iface = await sql.query(
    "select id, slug, terms_review_state, data_use_terms_state, production_access_state, written_agreement_required from reference.source_interfaces where slug = $1",
    [PRICE_OF_COMPUTE_SLUG],
  );
  if (iface.rows.length === 0) throw new Error(`source interface ${PRICE_OF_COMPUTE_SLUG} is not registered`);
  const row = iface.rows[0]!;

  const grants = await sql.query(
    "select id, grant_kind, reference, covers_collection, covers_index_use, effective_from, effective_to from reference.permission_grants " +
      "where source_interface_id = $1 and effective_from <= $2 and (effective_to is null or effective_to > $2) order by effective_from desc limit 1",
    [String(row.id), now.toISOString()],
  );

  const entityRows = await sql.query(
    "select id, slug, name, legal_name, legal_identifier, controlling_entity_id, use_refused_evidence from reference.market_entities",
    [],
  );
  const entities: MarketEntity[] = entityRows.rows.map((e) => ({
    id: String(e.id),
    slug: String(e.slug),
    name: String(e.name),
    legalName: e.legal_name === null || e.legal_name === undefined ? null : String(e.legal_name),
    legalIdentifier: e.legal_identifier === null || e.legal_identifier === undefined ? null : String(e.legal_identifier),
    controllingEntityId: e.controlling_entity_id === null || e.controlling_entity_id === undefined ? null : String(e.controlling_entity_id),
    useRefusedEvidence: e.use_refused_evidence === null || e.use_refused_evidence === undefined ? null : String(e.use_refused_evidence),
  }));

  const g = grants.rows[0];
  return {
    sourceInterfaceId: String(row.id),
    registry: {
      slug: String(row.slug),
      termsReviewState: String(row.terms_review_state) as SourceRegistryState["termsReviewState"],
      dataUseTermsState: String(row.data_use_terms_state) as SourceRegistryState["dataUseTermsState"],
      productionAccessState: String(row.production_access_state) as SourceRegistryState["productionAccessState"],
      writtenAgreementRequired: Boolean(row.written_agreement_required),
    },
    grant:
      g === undefined
        ? null
        : {
            id: String(g.id),
            sourceInterfaceSlug: PRICE_OF_COMPUTE_SLUG,
            grantKind: String(g.grant_kind) as PermissionGrant["grantKind"],
            reference: String(g.reference),
            coversCollection: Boolean(g.covers_collection),
            coversIndexUse: Boolean(g.covers_index_use),
            effectiveFrom: g.effective_from instanceof Date ? g.effective_from.toISOString() : String(g.effective_from),
            effectiveTo: g.effective_to === null || g.effective_to === undefined ? null : g.effective_to instanceof Date ? g.effective_to.toISOString() : String(g.effective_to),
          },
    entities,
    entityIdBySlug: new Map(entities.map((e) => [e.slug, e.id])),
  };
}

function contextFor(instrument: ListedGpuInstrument, lineage: Lineage, reg: Registry): NormalizationContext {
  const profiles = pocSellerProfiles(reg.entityIdBySlug, POC_SELLER_EVIDENCE_2026_09_15);
  return {
    instrumentSpecVersion: lineage.instrumentSpecVersion,
    methodologyVersion: lineage.methodologyVersion,
    sellerEntityIdByProvider: reg.entityIdBySlug,
    // The listed sibling publishes one provider-wide series and never places an observation in
    // a country, so no region mapping is consulted and none is supplied.
    regionMappings: new Map(),
    tenancyEvidence: new Map(),
    entities: new Map(reg.entities.map((e) => [e.id, e])),
    sellerProfiles: profiles,
  };
}

export type DailyRunOptions = {
  now?: Date;
  http?: HttpClient;
  baseUrl?: string;
  /** Restricts the run to these symbols; every registry instrument by default. */
  only?: readonly string[];
  collectorIdentity?: string;
};

/**
 * One scheduled invocation.
 *
 * Collection is for the UTC date the run falls in; calculation is for the previous date,
 * whose window has closed. A retrieval whose bytes already exist for the collection date is
 * a duplicate and is recorded as such rather than written twice, which is what makes a
 * retry or a double-fire harmless.
 */
export async function runDailyUcpi(sql: SqlExecutor, options: DailyRunOptions = {}): Promise<DailyRunResult> {
  const now = options.now ?? new Date();
  // One instant anchors the run, and the clock advances from it with real elapsed time. In
  // production `now` is the wall clock and this is indistinguishable from `new Date()`; given
  // an explicit instant, the window checks, the retrieval timestamps and the date arithmetic
  // all agree about which day the run is in, instead of the dates coming from one clock and
  // the gates from another.
  const startedAt = Date.now();
  const clock = () => new Date(now.getTime() + (Date.now() - startedAt));
  const collectionDate = now.toISOString().slice(0, 10);
  const calculationDate = previousDate(collectionDate);
  const http = options.http ?? fetchHttpClient;
  const baseUrl = options.baseUrl ?? process.env.UCPI_PRICE_OF_COMPUTE_BASE_URL ?? "https://priceofcompute.com";

  const [lineages, reg] = await Promise.all([loadApprovedLineage(sql), loadRegistry(sql, now)]);
  const wanted = options.only ? LISTED_GPU_INSTRUMENTS.filter((i) => options.only!.includes(i.symbol)) : LISTED_GPU_INSTRUMENTS;

  const instruments: InstrumentOutcome[] = [];
  for (const instrument of wanted) {
    const lineage = lineages.get(instrument.symbol);
    if (lineage === undefined) {
      instruments.push({ instrument: instrument.symbol, collection: "skipped", calculation: "not_approved", calculationDetail: "no approved specification version is in effect" });
      continue;
    }

    const persistence = new DatabasePersistence(sql, {
      instrumentId: lineage.instrumentId,
      instrumentSpecVersionId: lineage.instrumentSpecVersionId,
      methodologyVersionId: lineage.methodologyVersionId,
      sourceInterfaceIdBySlug: new Map([[PRICE_OF_COMPUTE_SLUG, reg.sourceInterfaceId]]),
    });
    persistence.versions = { methodologyVersion: lineage.methodologyVersion, instrumentSpecVersion: lineage.instrumentSpecVersion };

    const events = new CollectingSink();
    const outcome: InstrumentOutcome = { instrument: instrument.symbol, collection: "failed", calculation: "failed" };

    // Collection phase, inside today's window.
    try {
      const result = await collectSource<{ baseUrl: string; sku: string }, PocPricesResponse, ReturnType<typeof pocSellerProfiles>>({
        adapter: priceOfComputeAdapter,
        providerSlug: "price-of-compute",
        params: { baseUrl, sku: instrument.upstreamSkus[PRICE_OF_COMPUTE_SLUG]![0]! },
        companion: pocSellerProfiles(reg.entityIdBySlug, POC_SELLER_EVIDENCE_2026_09_15),
        mode: "production",
        calculationDate: collectionDate,
        registry: reg.registry,
        grant: reg.grant,
        env: process.env as Record<string, string | undefined>,
        http,
        clock,
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        persistence,
        events,
        context: contextFor(instrument, lineage, reg),
        validateResponse: validatePocPrices,
        collectorIdentity: options.collectorIdentity ?? `ucpi-cron/${instrument.symbol}`,
        idFactory: () => crypto.randomUUID(),
        spec: LISTED_FAMILY.spec,
        identity: instrument.identity,
      });
      outcome.collection = result.duplicateOfRetrievalId === null ? "collected" : "duplicate";
      if (result.duplicateOfRetrievalId !== null) outcome.collectionDetail = `same bytes as retrieval ${result.duplicateOfRetrievalId}`;
    } catch (error) {
      // The same bytes already stored for this window is the cadence working, not an outage:
      // a retry, a double-fire or a source that has not moved since the last run all land
      // here, and none of them should read as a failure in a log someone is scanning.
      const duplicate = error instanceof DuplicateRetrievalError;
      outcome.collection = duplicate ? "duplicate" : "failed";
      outcome.collectionDetail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      // A source failure is not a reason to skip the calculation either: yesterday's
      // observations are already stored, and whether they are enough is the methodology's
      // question rather than today's network's.
    }

    // Calculation phase, for the date whose window has closed.
    try {
      const calculation = await runCalculationPhase({
        calculationDate,
        instrument: instrument.symbol,
        versions: {
          methodologyVersion: lineage.methodologyVersion,
          instrumentSpecVersion: lineage.instrumentSpecVersion,
          methodologyVersionStatus: "approved",
          instrumentSpecVersionStatus: "approved",
        },
        entities: reg.entities,
        registry: [reg.registry],
        persistence,
        events,
        clock,
        idFactory: () => crypto.randomUUID(),
        spec: LISTED_FAMILY.spec,
        regionScope: LISTED_FAMILY.regionScope,
        identity: instrument.identity,
      });
      const row = calculation.regional.find((r) => r.observation.canonicalRegionCode === LISTED_SCOPE_KEY) ?? calculation.regional[0];
      if (row === undefined) {
        outcome.calculation = "no_observations";
        outcome.calculationDetail = `no eligible observation was stored for ${calculationDate}`;
      } else {
        outcome.calculation = row.status;
        outcome.priceLevel = row.observation.priceLevel;
        outcome.participantCount = row.observation.participantCount;
        outcome.marketBreadth = row.observation.marketBreadth;
        if (!row.gate.ok) outcome.calculationDetail = row.gate.reasons.join(", ");
        else if (row.observation.outcome === "unavailable") outcome.calculationDetail = row.observation.structuralCondition ?? "unavailable";
      }
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      // A day already calculated is the cadence working, not an outage. The database refuses
      // a second current regional observation for the same instrument, region and date.
      outcome.calculation = /already exists|duplicate key/i.test(detail) ? "already_calculated" : "failed";
      outcome.calculationDetail = detail;
    }

    instruments.push(outcome);
  }

  return { collectionDate, calculationDate, instruments };
}

/** A compact summary for a log line and an HTTP response. */
export function ucpiRunSummary(result: DailyRunResult): Record<string, unknown> {
  return {
    collectionDate: result.collectionDate,
    calculationDate: result.calculationDate,
    published: result.instruments.filter((i) => i.calculation === "published").map((i) => i.instrument),
    instruments: result.instruments.map((i) => ({
      instrument: i.instrument,
      collection: i.collection,
      calculation: i.calculation,
      ...(i.priceLevel !== undefined && i.priceLevel !== null ? { priceLevel: i.priceLevel, participantCount: i.participantCount, marketBreadth: i.marketBreadth } : {}),
      ...(i.calculationDetail ? { detail: i.calculationDetail } : {}),
    })),
  };
}

export { calculationWindow };
