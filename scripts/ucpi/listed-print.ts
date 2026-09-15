/**
 * The UCPI LISTED GPU collection and calculation runner. One script for every
 * listed GPU instrument in the registry; the instrument supplies its SKU,
 * identity and specification version, so adding a GPU adds no code here.
 *
 * Phases, because the family calendar separates them:
 *
 *   collect    one keyless GET per instrument, inside the calculation date's
 *              window. Emits the retrieval, raw offer, observation and
 *              assessment rows as SQL and reports the in-process candidate.
 *   emit       re-renders that SQL from the saved retrieval, without a second
 *              request; parsing and assessment are deterministic.
 *   calculate  after the date's cutoff only. Rebuilds the calculation from the
 *              saved collection and emits the run, seller, capacity-source and
 *              regional rows. Never a publication: that needs approved versions.
 *
 * Usage:  npx tsx scripts/ucpi/listed-print.ts collect   --instrument UCPI-B200-LISTED --date 2026-09-14 --out <dir>
 *         npx tsx scripts/ucpi/listed-print.ts emit      --instrument <symbol> --date <date> --out <dir>
 *         npx tsx scripts/ucpi/listed-print.ts calculate --instrument <symbol> --date <date> --out <dir> [--run-kind simulation]
 *
 * `--all` runs every registry instrument in turn, one request each. No
 * credential is read or needed. Nothing is written to a database by this
 * script; it emits SQL for an operator to apply with the project's tooling.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { LISTED_SCOPE_KEY } from "@/lib/ucpi/aggregation";
import { PRICE_OF_COMPUTE_SLUG, priceOfComputeAdapter, type PocPricesResponse } from "@/lib/ucpi/adapters/price-of-compute";
import { POC_SELLER_EVIDENCE_2026_09_15, pocSellerProfiles } from "@/lib/ucpi/adapters/price-of-compute-profiles";
import { toSeriesPoint } from "@/lib/ucpi/api-contract";
import { calculationWindow } from "@/lib/ucpi/calculation-window";
import { runPipeline } from "@/lib/ucpi/collector";
import type { EligibilityAssessment, MarketEntity, NormalizedObservation, RawOffer, Retrieval } from "@/lib/ucpi/domain";
import { assessEligibility } from "@/lib/ucpi/eligibility";
import { LISTED_FAMILY, LISTED_GPU_INSTRUMENTS, listedInstrument, type ListedGpuInstrument } from "@/lib/ucpi/listed/instruments";
import type { SourceRegistryState } from "@/lib/ucpi/permission-gate";
import { collectSource, type PermissionGrant } from "@/lib/ucpi/runtime/collector-runtime";
import { CollectingSink } from "@/lib/ucpi/runtime/events";
import { fetchHttpClient } from "@/lib/ucpi/runtime/http";
import { InMemoryPersistence, SqlPersistence, type RetrievalRow, type SqlStatement, type StoredRegionalObservation } from "@/lib/ucpi/runtime/persistence";
import { validatePocPrices } from "@/lib/ucpi/runtime/schema-validation";

// Identifiers as seeded by the UCPI listed migrations.
const SOURCE = { interface: "55555555-0000-4000-8000-000000000007", grant: "77777777-0000-4000-8000-000000000101" } as const;
const METHODOLOGY_VERSION_ID = "11111111-0000-4000-8000-000000000112";
const METHODOLOGY_VERSION = "0.1.2-draft";

/** Instrument id and spec version id per symbol, matching the migrations. */
const INSTRUMENT_IDS: Readonly<Record<string, { instrumentId: string; specVersionId: string }>> = {
  "UCPI-H100-SXM-LISTED": { instrumentId: "22222222-0000-4000-8000-000000000002", specVersionId: "22222222-0000-4000-8000-000000000203" },
  "UCPI-H200-SXM-LISTED": { instrumentId: "22222222-0000-4000-8000-000000000003", specVersionId: "22222222-0000-4000-8000-000000000301" },
  "UCPI-B200-LISTED": { instrumentId: "22222222-0000-4000-8000-000000000004", specVersionId: "22222222-0000-4000-8000-000000000401" },
  "UCPI-A100-SXM4-80GB-LISTED": { instrumentId: "22222222-0000-4000-8000-000000000005", specVersionId: "22222222-0000-4000-8000-000000000501" },
  "UCPI-RTX-5090-LISTED": { instrumentId: "22222222-0000-4000-8000-000000000006", specVersionId: "22222222-0000-4000-8000-000000000601" },
};

const ENTITY_ID_BY_SLUG = new Map<string, string>([
  ["runpod", "66666666-0000-4000-8000-000000000001"],
  ["lambda", "66666666-0000-4000-8000-000000000002"],
  ["hyperstack", "66666666-0000-4000-8000-000000000003"],
  ["nebius", "66666666-0000-4000-8000-000000000004"],
  ["voltagepark", "66666666-0000-4000-8000-000000000005"],
  ["denvr", "66666666-0000-4000-8000-000000000006"],
  ["datacrunch", "66666666-0000-4000-8000-000000000007"],
  ["massedcompute", "66666666-0000-4000-8000-000000000008"],
  ["coreweave", "66666666-0000-4000-8000-000000000009"],
  ["azure", "66666666-0000-4000-8000-000000000010"],
  ["vast", "66666666-0000-4000-8000-000000000011"],
]);
/** Legal names as evidenced in the sellers' own terms and recorded in the migrations. */
const LEGAL_NAMES = new Map<string, string>([
  ["runpod", "Runpod, Inc."],
  ["lambda", "Lambda, Inc."],
  ["hyperstack", "NexGen Cloud Limited"],
  ["voltagepark", "Voltage Park, Inc."],
  ["datacrunch", "DataCrunch Oy"],
]);

const REGISTRY: SourceRegistryState = { slug: PRICE_OF_COMPUTE_SLUG, termsReviewState: "permitted", dataUseTermsState: "permitted", productionAccessState: "production_approved", writtenAgreementRequired: false };
const GRANT: PermissionGrant = { id: SOURCE.grant, sourceInterfaceSlug: PRICE_OF_COMPUTE_SLUG, grantKind: "provider_terms", reference: "https://www.priceofcompute.com/api", coversCollection: true, coversIndexUse: true, effectiveFrom: "2026-09-14T00:00:00Z", effectiveTo: null };

const profileEvidence = POC_SELLER_EVIDENCE_2026_09_15;
const profileUseRefused = (slug: string): string | null => profileEvidence.find((e) => e.slug === slug)?.useRefused ?? null;
const entities: MarketEntity[] = [...ENTITY_ID_BY_SLUG].map(([slug, id]) => ({ id, slug, name: slug, legalName: LEGAL_NAMES.get(slug) ?? null, legalIdentifier: null, controllingEntityId: null, useRefusedEvidence: profileUseRefused(slug) }));
const entityMap: ReadonlyMap<string, MarketEntity> = new Map(entities.map((e) => [e.id, e]));
const profiles = pocSellerProfiles(ENTITY_ID_BY_SLUG, POC_SELLER_EVIDENCE_2026_09_15);
const entityIdFor = (domainId: string): string | null => ([...ENTITY_ID_BY_SLUG.values()].includes(domainId) ? domainId : null);

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]!;
  if (fallback !== undefined) return fallback;
  throw new Error(`--${name} is required`);
}

function sqlFor(symbol: string): SqlPersistence {
  const ids = INSTRUMENT_IDS[symbol];
  if (!ids) throw new Error(`no database identifiers known for ${symbol}`);
  return new SqlPersistence({ query: async () => ({ rows: [] }) }, { instrumentId: ids.instrumentId, instrumentSpecVersionId: ids.specVersionId, methodologyVersionId: METHODOLOGY_VERSION_ID, sourceInterfaceIdBySlug: new Map([[PRICE_OF_COMPUTE_SLUG, SOURCE.interface]]) });
}

/** The upstream SKU path segment for an instrument on the Price of Compute interface. */
function skuOf(instrument: ListedGpuInstrument): string {
  const sku = (instrument.upstreamSkus[PRICE_OF_COMPUTE_SLUG] ?? [])[0];
  if (!sku) throw new Error(`${instrument.symbol} declares no Price of Compute SKU`);
  return sku.toLowerCase();
}

/**
 * Renders a parameterized statement as literal SQL. Raw offers and observations
 * carry derived string ids in the domain; `idMap` gives each a uuid for the
 * database, so lineage between the rows is preserved exactly.
 */
function render(s: SqlStatement, idMap: ReadonlyMap<string, string>): string {
  const lit = (v: unknown): string => {
    if (v === null || v === undefined) return "null";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (Array.isArray(v)) return `array[${v.map(lit).join(", ")}]::text[]`;
    const str = String(v);
    return `'${(idMap.get(str) ?? str).replace(/'/g, "''")}'`;
  };
  return s.text.replace(/\$(\d+)/g, (_, n: string) => lit(s.params[Number(n) - 1])) + ";";
}

/** A uuid per derived domain id, deterministic within one run of the script. */
function idMapFor(rawOffers: readonly RawOffer[], observations: readonly NormalizedObservation[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of rawOffers) map.set(raw.id, randomUUID());
  for (const o of observations) map.set(o.id, randomUUID());
  return map;
}

/** Consecutive statements with identical text become one multi-row insert; the database checks each row the same way. */
function renderBatched(statements: readonly SqlStatement[], idMap: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < statements.length) {
    const head = statements[i]!;
    const split = head.text.indexOf(" values (");
    if (split < 0) {
      out.push(render(head, idMap));
      i += 1;
      continue;
    }
    const tuples: string[] = [];
    while (i < statements.length && statements[i]!.text === head.text) {
      tuples.push(render(statements[i]!, idMap).slice(split + " values ".length, -1));
      i += 1;
    }
    out.push(`${head.text.slice(0, split)} values\n  ${tuples.join(",\n  ")};`);
  }
  return out;
}

type SavedCollection = { symbol: string; retrieval: RetrievalRow; rawOffers: RawOffer[]; observations: NormalizedObservation[]; assessments: EligibilityAssessment[] };

function normalizationContextFor(instrument: ListedGpuInstrument) {
  return { instrumentSpecVersion: instrument.specVersion, methodologyVersion: METHODOLOGY_VERSION, sellerEntityIdByProvider: new Map<string, string>(), regionMappings: new Map(), tenancyEvidence: new Map(), entities: entityMap, sellerProfiles: profiles };
}

function candidateFor(instrument: ListedGpuInstrument, calculationDate: string, retrieval: Retrieval, observations: readonly NormalizedObservation[]) {
  return runPipeline({
    instrument: instrument.symbol,
    calculationDate,
    methodologyVersion: METHODOLOGY_VERSION,
    instrumentSpecVersion: instrument.specVersion,
    observations,
    retrievals: [retrieval],
    entities,
    registry: [REGISTRY],
    spec: LISTED_FAMILY.spec,
    regionScope: LISTED_FAMILY.regionScope,
    identity: instrument.identity,
  });
}

function collectionSql(symbol: string, retrieval: RetrievalRow, rawOffers: readonly RawOffer[], observations: readonly NormalizedObservation[], assessments: readonly EligibilityAssessment[]): string[] {
  const sql = sqlFor(symbol);
  const idMap = idMapFor(rawOffers, observations);
  const statements: SqlStatement[] = [sql.retrievalStatement(retrieval)];
  for (const raw of rawOffers) statements.push(sql.rawOfferStatement(raw));
  for (const o of observations) statements.push(sql.normalizedObservationStatement(o, { entityIdFor }));
  const heads: SqlStatement[] = [];
  const codes: SqlStatement[] = [];
  for (const a of assessments) {
    const [head, ...rest] = sql.assessmentStatements(a, randomUUID());
    heads.push(head!);
    codes.push(...rest);
  }
  statements.push(...heads, ...codes.filter((c) => c.text.includes("eligibility_exclusions")), ...codes.filter((c) => c.text.includes("eligibility_diagnostics")));
  return ["begin;", ...renderBatched(statements, idMap), "commit;"];
}

/** What an operator and a reviewer need to see for one instrument on one date. */
function report(instrument: ListedGpuInstrument, calculationDate: string, retrieval: RetrievalRow, observations: readonly NormalizedObservation[], assessments: readonly EligibilityAssessment[]) {
  const pipeline = candidateFor(instrument, calculationDate, retrieval as Retrieval, observations);
  const regional = pipeline.regional[0]!;
  const response = retrieval.responseBody as PocPricesResponse | undefined;
  const slugOf = (entityId: string) => [...ENTITY_ID_BY_SLUG].find(([, id]) => id === entityId)?.[0] ?? entityId;
  return {
    instrument: instrument.symbol,
    specVersion: instrument.specVersion,
    sku: response?.sku ?? null,
    calculationDate,
    vendorHeadline: response?.prices ?? null,
    providerRows: response?.providers.length ?? 0,
    onDemandRows: response?.providers.filter((p) => p.pricing_type === "on_demand").length ?? 0,
    rows: assessments.map((a) => {
      const o = observations.find((x) => x.id === a.observationId)!;
      return { seller: slugOf(o.sellerEntityId), pricingType: o.serviceTier?.tier_label ?? null, price: o.normalizedPrice, eligible: a.p2, exclusions: a.exclusions, diagnostics: a.diagnostics };
    }),
    candidate: {
      outcome: regional.outcome,
      structuralCondition: regional.structuralCondition,
      priceLevel: regional.priceLevel,
      participantCount: regional.participantCount,
      participants: pipeline.sellerObservations.map((s) => ({ seller: slugOf(s.sellerEntityId), price: s.representativePrice })),
      marketBreadth: regional.marketBreadth,
      contributingSourceCount: regional.contributingSourceCount,
      largestSourceParticipantShare: regional.largestSourceParticipantShare,
      dispersion: regional.dispersion,
      attributions: regional.sourceAttributions,
      publicSeriesPoint: toSeriesPoint(regional, { calculatedAt: new Date().toISOString(), publishedAt: null }),
    },
  };
}

async function collect(symbol: string, calculationDate: string, out: string): Promise<void> {
  const instrument = listedInstrument(symbol);
  if (!instrument) throw new Error(`${symbol} is not a listed GPU instrument`);
  const events = new CollectingSink();
  const result = await collectSource<{ baseUrl: string; sku: string }, PocPricesResponse, typeof profiles>({
    adapter: priceOfComputeAdapter,
    providerSlug: "price-of-compute",
    params: { baseUrl: process.env.UCPI_PRICE_OF_COMPUTE_BASE_URL ?? "https://priceofcompute.com", sku: skuOf(instrument) },
    companion: profiles,
    mode: "production",
    calculationDate,
    registry: REGISTRY,
    grant: GRANT,
    env: process.env as Record<string, string | undefined>,
    http: fetchHttpClient,
    clock: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    persistence: new InMemoryPersistence(),
    events,
    context: normalizationContextFor(instrument),
    validateResponse: validatePocPrices,
    collectorIdentity: `ucpi-listed-print/collect/${instrument.symbol}`,
    idFactory: randomUUID,
    spec: LISTED_FAMILY.spec,
    identity: instrument.identity,
  });

  const dir = path.join(out, instrument.symbol);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "collect.sql"), collectionSql(symbol, result.retrieval, result.rawOffers, result.observations, result.assessments).join("\n") + "\n");
  const saved: SavedCollection = { symbol, retrieval: result.retrieval, rawOffers: result.rawOffers, observations: result.observations, assessments: result.assessments };
  writeFileSync(path.join(dir, "collection.json"), JSON.stringify(saved));
  const r = report(instrument, calculationDate, result.retrieval, result.observations, result.assessments);
  writeFileSync(path.join(dir, "collect.report.json"), JSON.stringify({ ...r, retrieval: { id: result.retrieval.id, requestedAt: result.retrieval.requestedAt, completedAt: result.retrieval.completedAt, status: result.retrieval.responseStatus, responseHash: result.retrieval.responseHash, bytes: result.retrieval.responseByteLength, records: result.retrieval.recordCount, purpose: result.retrieval.retrievalPurpose }, events: events.events }, null, 2));
  console.log(JSON.stringify({ instrument: symbol, sku: r.sku, providerRows: r.providerRows, onDemandRows: r.onDemandRows, eligible: r.candidate.participants, candidate: { outcome: r.candidate.outcome, structuralCondition: r.candidate.structuralCondition, priceLevel: r.candidate.priceLevel, participantCount: r.candidate.participantCount, marketBreadth: r.candidate.marketBreadth }, vendorHeadline: r.vendorHeadline, note: "CANDIDATE: not a run and not a publication" }, null, 2));
}

function load(symbol: string, out: string): SavedCollection {
  return JSON.parse(readFileSync(path.join(out, symbol, "collection.json"), "utf8")) as SavedCollection;
}

function emit(symbol: string, calculationDate: string, out: string): void {
  const instrument = listedInstrument(symbol)!;
  const saved = load(symbol, out);
  const assessments = saved.assessments ?? saved.observations.map((o) => assessEligibility(o, { calculationDate, registry: new Map([[PRICE_OF_COMPUTE_SLUG, REGISTRY]]), entities: entityMap, spec: LISTED_FAMILY.spec, identity: instrument.identity }));
  writeFileSync(path.join(out, symbol, "collect.sql"), collectionSql(symbol, saved.retrieval, saved.rawOffers, saved.observations, assessments).join("\n") + "\n");
  console.log(JSON.stringify({ instrument: symbol, retrieval: saved.retrieval.id, rawOffers: saved.rawOffers.length, observations: saved.observations.length, eligible: assessments.filter((a) => a.p2).length }));
}

function calculate(symbol: string, calculationDate: string, out: string, runKind: "simulation" | "production"): void {
  const instrument = listedInstrument(symbol)!;
  const window = calculationWindow(calculationDate);
  const now = new Date();
  if (now.getTime() < Date.parse(window.cutoff)) throw new Error(`calculation for ${calculationDate} cannot begin before the cutoff ${window.cutoff}; now ${now.toISOString()}`);
  const saved = load(symbol, out);
  const pipeline = candidateFor(instrument, calculationDate, saved.retrieval as Retrieval, saved.observations);
  const sql = sqlFor(symbol);
  const runId = randomUUID();
  const run = { id: runId, instrument: symbol, instrumentSpecVersion: instrument.specVersion, methodologyVersion: METHODOLOGY_VERSION, calculationDate, windowStart: window.windowStart, cutoff: window.cutoff, publicationDeadline: window.publicationDeadline, calculatedAt: now.toISOString(), calculatorIdentity: `ucpi-listed-print/calculate/${symbol}`, runKind, notes: runKind === "simulation" ? "Candidate under draft versions; not publishable." : null };
  const statements: SqlStatement[] = [sql.runStatement(run)];
  const sellerObsIdBySeller = new Map<string, string>();
  for (const s of pipeline.sellerObservations) {
    const id = randomUUID();
    sellerObsIdBySeller.set(s.sellerEntityId, id);
    statements.push(...sql.sellerObservationStatements(runId, s, id, { entityIdFor }));
  }
  const capacityIds: string[] = [];
  for (const c of pipeline.capacitySources) {
    const id = randomUUID();
    capacityIds.push(id);
    statements.push(...sql.capacitySourceStatements(runId, c, id, { entityIdFor }, c.memberSellerEntityIds.map((m) => sellerObsIdBySeller.get(m)!)));
  }
  for (const r of pipeline.regional) {
    const stored: StoredRegionalObservation = { ...r, id: randomUUID(), runId, runKind, calculatedAt: run.calculatedAt, supersededById: null };
    statements.push(sql.regionalStatement(stored));
    if (r.outcome === "value") statements.push(...sql.regionalParticipantStatements(stored.id, capacityIds));
  }
  writeFileSync(path.join(out, symbol, `calculate.${runKind}.sql`), ["begin;", ...renderBatched(statements, new Map()), "commit;"].join("\n") + "\n");
  const regional = pipeline.regional[0]!;
  console.log(JSON.stringify({ instrument: symbol, runId, runKind, outcome: regional.outcome, priceLevel: regional.priceLevel, participantCount: regional.participantCount, marketBreadth: regional.marketBreadth, scope: regional.canonicalRegionCode === LISTED_SCOPE_KEY ? regional.regionScope : regional.canonicalRegionCode, note: "no publication row is emitted: publication requires approved versions" }, null, 2));
}

async function main(): Promise<void> {
  const phase = process.argv[2];
  const date = arg("date");
  const out = arg("out");
  const symbols = process.argv.includes("--all") ? LISTED_GPU_INSTRUMENTS.map((i) => i.symbol) : [arg("instrument")];
  for (const symbol of symbols) {
    if (phase === "collect") await collect(symbol, date, out);
    else if (phase === "emit") emit(symbol, date, out);
    else if (phase === "calculate") calculate(symbol, date, out, arg("run-kind", "simulation") as "simulation" | "production");
    else throw new Error("phase must be collect, emit or calculate");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
