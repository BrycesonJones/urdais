/**
 * UCPI-H100-SXM-LISTED: collect the Price of Compute H100 SXM payload as a
 * production retrieval, run the sibling's gates, and emit the SQL that records
 * the result. Two phases, because the family calendar separates them:
 *
 *   collect    one keyless GET, inside the calculation date's window. Persists
 *              retrieval, raw offers, normalized observations and assessments
 *              (as SQL to apply) and reports the in-process candidate value.
 *   emit       re-renders the collection SQL from the saved retrieval, without
 *              a second request; parsing and assessment are deterministic.
 *              With --reinterpret, re-normalizes the saved raw offers under the
 *              current specification version as new observations (the earlier
 *              interpretation stays current under its own version) and emits
 *              only the observation and assessment rows.
 *   calculate  after the date's cutoff only. Rebuilds the calculation from the
 *              saved collection and emits the run, seller, capacity-source and
 *              regional rows. Never a publication: that needs approved versions.
 *
 * Usage:  npx tsx scripts/ucpi/first-print.ts collect   --date 2026-09-14 --out <dir>
 *         npx tsx scripts/ucpi/first-print.ts calculate --date 2026-09-14 --out <dir> [--run-kind simulation]
 *
 * No credential is read or needed. Nothing is written to a database by this
 * script; it emits SQL for an operator to apply with the project's tooling.
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { LISTED_SCOPE_KEY } from "@/lib/ucpi/aggregation";
import { PRICE_OF_COMPUTE_SLUG, priceOfComputeAdapter, type PocPricesResponse } from "@/lib/ucpi/adapters/price-of-compute";
import { POC_SELLER_EVIDENCE_2026_09_14, pocSellerProfiles } from "@/lib/ucpi/adapters/price-of-compute-profiles";
import { toSeriesPoint } from "@/lib/ucpi/api-contract";
import { calculationWindow } from "@/lib/ucpi/calculation-window";
import { runPipeline } from "@/lib/ucpi/collector";
import type { EligibilityAssessment, MarketEntity, NormalizedObservation, RawOffer, Retrieval } from "@/lib/ucpi/domain";
import { assessEligibility } from "@/lib/ucpi/eligibility";
import type { SourceRegistryState } from "@/lib/ucpi/permission-gate";
import { collectSource, type PermissionGrant } from "@/lib/ucpi/runtime/collector-runtime";
import { CollectingSink } from "@/lib/ucpi/runtime/events";
import { fetchHttpClient } from "@/lib/ucpi/runtime/http";
import { InMemoryPersistence, SqlPersistence, type RetrievalRow, type SqlStatement, type StoredRegionalObservation } from "@/lib/ucpi/runtime/persistence";
import { validatePocPrices } from "@/lib/ucpi/runtime/schema-validation";

// Identifiers as seeded by supabase/migrations/20260914000100_price_of_compute_source.sql.
const IDS = {
  instrument: "22222222-0000-4000-8000-000000000002",
  instrumentSpecVersion: "22222222-0000-4000-8000-000000000202",
  methodologyVersion: "11111111-0000-4000-8000-000000000112",
  sourceInterface: "55555555-0000-4000-8000-000000000007",
  grant: "77777777-0000-4000-8000-000000000101",
} as const;
const VERSIONS = { instrument: "UCPI-H100-SXM-LISTED", methodologyVersion: "0.1.2-draft", instrumentSpecVersion: "0.1.1-draft" } as const;
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
const LEGAL_NAMES = new Map<string, string>([
  ["runpod", "Runpod, Inc."],
  ["lambda", "Lambda, Inc."],
  ["hyperstack", "NexGen Cloud Limited"],
  ["voltagepark", "Voltage Park, Inc."],
]);
/** Mirrors the registry row the migration writes; the runtime re-checks it, the database enforces it. */
const REGISTRY: SourceRegistryState = { slug: PRICE_OF_COMPUTE_SLUG, termsReviewState: "permitted", dataUseTermsState: "permitted", productionAccessState: "production_approved", writtenAgreementRequired: false };
const GRANT: PermissionGrant = { id: IDS.grant, sourceInterfaceSlug: PRICE_OF_COMPUTE_SLUG, grantKind: "provider_terms", reference: "https://www.priceofcompute.com/api", coversCollection: true, coversIndexUse: true, effectiveFrom: "2026-09-14T00:00:00Z", effectiveTo: null };

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]!;
  if (fallback !== undefined) return fallback;
  throw new Error(`--${name} is required`);
}

/** Renders a parameterized statement as literal SQL; ids that the domain keeps as strings are mapped to uuids first. */
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

const entities: MarketEntity[] = [...ENTITY_ID_BY_SLUG].map(([slug, id]) => ({ id, slug, name: slug, legalName: LEGAL_NAMES.get(slug) ?? null, legalIdentifier: null, controllingEntityId: null }));
const entityMap: ReadonlyMap<string, MarketEntity> = new Map(entities.map((e) => [e.id, e]));
const sql = new SqlPersistence({ query: async () => ({ rows: [] }) }, { instrumentId: IDS.instrument, instrumentSpecVersionId: IDS.instrumentSpecVersion, methodologyVersionId: IDS.methodologyVersion, sourceInterfaceIdBySlug: new Map([[PRICE_OF_COMPUTE_SLUG, IDS.sourceInterface]]) });
const entityIdFor = (domainId: string): string | null => (ENTITY_ID_BY_SLUG.has(domainId) ? domainId : [...ENTITY_ID_BY_SLUG.values()].includes(domainId) ? domainId : null);

type SavedCollection = { retrieval: RetrievalRow; rawOffers: RawOffer[]; observations: NormalizedObservation[]; assessments: EligibilityAssessment[]; idMap: Record<string, string> };

function collectionSql(retrieval: RetrievalRow, rawOffers: readonly RawOffer[], observations: readonly NormalizedObservation[], assessments: readonly EligibilityAssessment[], idMap: ReadonlyMap<string, string>): string[] {
  const statements: SqlStatement[] = [sql.retrievalStatement(retrieval)];
  for (const raw of rawOffers) statements.push(sql.rawOfferStatement(raw));
  for (const o of observations) statements.push(sql.normalizedObservationStatement(o, { entityIdFor }));
  const assessmentRows: SqlStatement[] = [];
  const codeRows: SqlStatement[] = [];
  for (const a of assessments) {
    const [head, ...codes] = sql.assessmentStatements(a, randomUUID());
    assessmentRows.push(head!);
    codeRows.push(...codes);
  }
  // Exclusions before diagnostics so each table gets one multi-row insert.
  statements.push(...assessmentRows, ...codeRows.filter((c) => c.text.includes("eligibility_exclusions")), ...codeRows.filter((c) => c.text.includes("eligibility_diagnostics")));
  return ["begin;", ...renderBatched(statements, idMap), "commit;"];
}

/** Re-renders the collection SQL from the saved retrieval. Parsing and assessment are pure, so the rows are the ones the runtime produced. */
function emit(calculationDate: string, out: string, reinterpret: boolean): void {
  const saved = JSON.parse(readFileSync(path.join(out, "collection.json"), "utf8")) as SavedCollection;
  const idMap = new Map(Object.entries(saved.idMap));
  if (reinterpret) {
    // A new interpretation of the same raw offers under the current specification version. Raw never changes;
    // the earlier observations stay current under their own version, as the reprocessing rules require.
    const profiles = pocSellerProfiles(ENTITY_ID_BY_SLUG, POC_SELLER_EVIDENCE_2026_09_14);
    const rawOffers = saved.rawOffers ?? priceOfComputeAdapter.parse(saved.retrieval as Retrieval, saved.retrieval.responseBody as PocPricesResponse, profiles);
    const context = { instrumentSpecVersion: VERSIONS.instrumentSpecVersion, methodologyVersion: VERSIONS.methodologyVersion, sellerEntityIdByProvider: new Map<string, string>(), regionMappings: new Map(), tenancyEvidence: new Map(), entities: entityMap, sellerProfiles: profiles };
    const observations = rawOffers.map((raw) => priceOfComputeAdapter.normalize(raw, saved.retrieval as Retrieval, context));
    for (const o of observations) idMap.set(o.id, randomUUID());
    const assessments = observations.map((o) => assessEligibility(o, { calculationDate, registry: new Map([[PRICE_OF_COMPUTE_SLUG, REGISTRY]]), entities: entityMap, spec: "listed" }));
    const statements: SqlStatement[] = observations.map((o) => sql.normalizedObservationStatement(o, { entityIdFor }));
    const heads: SqlStatement[] = [];
    const codes: SqlStatement[] = [];
    for (const a of assessments) {
      const [head, ...rest] = sql.assessmentStatements(a, randomUUID());
      heads.push(head!);
      codes.push(...rest);
    }
    statements.push(...heads, ...codes.filter((c) => c.text.includes("eligibility_exclusions")), ...codes.filter((c) => c.text.includes("eligibility_diagnostics")));
    writeFileSync(path.join(out, `reinterpret.${VERSIONS.instrumentSpecVersion}.sql`), ["begin;", ...renderBatched(statements, idMap), "commit;"].join("\n") + "\n");
    const updated: SavedCollection = { retrieval: saved.retrieval, rawOffers, observations, assessments, idMap: Object.fromEntries(idMap) };
    writeFileSync(path.join(out, "collection.json"), JSON.stringify(updated));
    const regional = candidate(calculationDate, saved.retrieval as Retrieval, observations).regional[0]!;
    console.log(JSON.stringify({ spec: VERSIONS.instrumentSpecVersion, observations: observations.length, eligible: assessments.filter((a) => a.p2).length, excluded: assessments.filter((a) => !a.p2).map((a) => ({ seller: [...ENTITY_ID_BY_SLUG].find(([, id]) => id === observations.find((o) => o.id === a.observationId)!.sellerEntityId)?.[0], codes: a.exclusions })), candidate: { outcome: regional.outcome, priceLevel: regional.priceLevel, participantCount: regional.participantCount, marketBreadth: regional.marketBreadth } }, null, 2));
    return;
  }
  if (saved.rawOffers === undefined || saved.assessments === undefined) {
    // A collection saved before raw offers and assessments were persisted: rebuild them deterministically.
    const profiles = pocSellerProfiles(ENTITY_ID_BY_SLUG, POC_SELLER_EVIDENCE_2026_09_14);
    saved.rawOffers = priceOfComputeAdapter.parse(saved.retrieval as Retrieval, saved.retrieval.responseBody as PocPricesResponse, profiles);
    saved.assessments = saved.observations.map((o) => assessEligibility(o, { calculationDate, registry: new Map([[PRICE_OF_COMPUTE_SLUG, REGISTRY]]), entities: entityMap, spec: "listed" }));
  }
  writeFileSync(path.join(out, "collect.sql"), collectionSql(saved.retrieval, saved.rawOffers, saved.observations, saved.assessments, idMap).join("\n") + "\n");
  console.log(JSON.stringify({ retrieval: saved.retrieval.id, rawOffers: saved.rawOffers.length, observations: saved.observations.length, eligible: saved.assessments.filter((a) => a.p2).length }));
}

function candidate(calculationDate: string, retrieval: Retrieval, observations: NormalizedObservation[]) {
  return runPipeline({ ...VERSIONS, calculationDate, observations, retrievals: [retrieval], entities, registry: [REGISTRY], spec: "listed", regionScope: "listed_provider_wide" });
}

async function collect(calculationDate: string, out: string): Promise<void> {
  const profiles = pocSellerProfiles(ENTITY_ID_BY_SLUG, POC_SELLER_EVIDENCE_2026_09_14);
  const persistence = new InMemoryPersistence();
  const events = new CollectingSink();
  const result = await collectSource<{ baseUrl: string; sku: string }, PocPricesResponse, typeof profiles>({
    adapter: priceOfComputeAdapter,
    providerSlug: "price-of-compute",
    params: { baseUrl: process.env.UCPI_PRICE_OF_COMPUTE_BASE_URL ?? "https://priceofcompute.com", sku: "h100-sxm" },
    companion: profiles,
    mode: "production",
    calculationDate,
    registry: REGISTRY,
    grant: GRANT,
    env: process.env as Record<string, string | undefined>,
    http: fetchHttpClient,
    clock: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    persistence,
    events,
    context: { instrumentSpecVersion: VERSIONS.instrumentSpecVersion, methodologyVersion: VERSIONS.methodologyVersion, sellerEntityIdByProvider: new Map(), regionMappings: new Map(), tenancyEvidence: new Map(), entities: entityMap, sellerProfiles: profiles },
    validateResponse: validatePocPrices,
    collectorIdentity: "ucpi-first-print/collect",
    idFactory: randomUUID,
    spec: "listed",
  });

  // Domain ids for raw offers and observations are derived strings; give each a uuid for the database.
  const idMap = new Map<string, string>();
  for (const raw of result.rawOffers) idMap.set(raw.id, randomUUID());
  for (const o of result.observations) idMap.set(o.id, randomUUID());

  const statements = collectionSql(result.retrieval, result.rawOffers, result.observations, result.assessments, idMap);

  const pipeline = candidate(calculationDate, result.retrieval as Retrieval, result.observations);
  const regional = pipeline.regional[0]!;
  const window = calculationWindow(calculationDate);
  const report = {
    phase: "collect",
    calculationDate,
    window,
    retrieval: { id: result.retrieval.id, requestedAt: result.retrieval.requestedAt, completedAt: result.retrieval.completedAt, status: result.retrieval.responseStatus, responseHash: result.retrieval.responseHash, bytes: result.retrieval.responseByteLength, records: result.retrieval.recordCount, purpose: result.retrieval.retrievalPurpose, grant: result.retrieval.permissionGrantId, attempts: result.attempts, duplicateOf: result.duplicateOfRetrievalId },
    payload: { sku: (result.retrieval.responseBody as PocPricesResponse).sku, day: (result.retrieval.responseBody as PocPricesResponse).day, updatedAt: (result.retrieval.responseBody as PocPricesResponse).updated_at, vendorHeadline: (result.retrieval.responseBody as PocPricesResponse).prices },
    assessments: result.assessments.map((a) => {
      const o = result.observations.find((x) => x.id === a.observationId)!;
      return { seller: o.sellerEntityId, entity: [...ENTITY_ID_BY_SLUG].find(([, id]) => id === o.sellerEntityId)?.[0] ?? o.sellerEntityId, pricingType: o.serviceTier?.tier_label, price: o.normalizedPrice, eligible: a.p2, exclusions: a.exclusions, diagnostics: a.diagnostics };
    }),
    candidate: {
      label: Date.now() < Date.parse(window.cutoff) ? "CANDIDATE: computed before the cutoff; not a run, not a publication" : "post-cutoff candidate; run not yet recorded",
      regional: { ...regional, participants: regional.participants.map((p) => ({ entity: [...ENTITY_ID_BY_SLUG].find(([, id]) => id === p.capacitySourceEntityId)?.[0], price: p.representativePrice, sources: p.sourceInterfaceSlugs })) },
      publicSeriesPoint: toSeriesPoint(regional, { calculatedAt: new Date().toISOString(), publishedAt: null }),
    },
    events: events.events,
  };

  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "collect.sql"), statements.join("\n") + "\n");
  writeFileSync(path.join(out, "collect.report.json"), JSON.stringify(report, null, 2));
  const saved: SavedCollection = { retrieval: result.retrieval, rawOffers: result.rawOffers, observations: result.observations, assessments: result.assessments, idMap: Object.fromEntries(idMap) };
  writeFileSync(path.join(out, "collection.json"), JSON.stringify(saved));
  console.log(JSON.stringify({ retrieval: report.retrieval, candidate: { outcome: regional.outcome, priceLevel: regional.priceLevel, participantCount: regional.participantCount, marketBreadth: regional.marketBreadth, contributingSourceCount: regional.contributingSourceCount, attributions: regional.sourceAttributions, label: report.candidate.label } }, null, 2));
}

function calculate(calculationDate: string, out: string, runKind: "simulation" | "production"): void {
  const window = calculationWindow(calculationDate);
  const now = new Date();
  if (now.getTime() < Date.parse(window.cutoff)) throw new Error(`calculation for ${calculationDate} cannot begin before the cutoff ${window.cutoff}; now ${now.toISOString()}`);
  const saved = JSON.parse(readFileSync(path.join(out, "collection.json"), "utf8")) as SavedCollection;
  const idMap = new Map(Object.entries(saved.idMap));
  const pipeline = candidate(calculationDate, saved.retrieval as Retrieval, saved.observations);
  const runId = randomUUID();
  const run = { id: runId, instrument: VERSIONS.instrument, instrumentSpecVersion: VERSIONS.instrumentSpecVersion, methodologyVersion: VERSIONS.methodologyVersion, calculationDate, windowStart: window.windowStart, cutoff: window.cutoff, publicationDeadline: window.publicationDeadline, calculatedAt: now.toISOString(), calculatorIdentity: "ucpi-first-print/calculate", runKind, notes: runKind === "simulation" ? "Candidate under draft versions; not publishable." : null };
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
  writeFileSync(path.join(out, `calculate.${runKind}.sql`), ["begin;", ...renderBatched(statements, idMap), "commit;"].join("\n") + "\n");
  const regional = pipeline.regional[0]!;
  writeFileSync(path.join(out, `calculate.${runKind}.report.json`), JSON.stringify({ phase: "calculate", runKind, run, regional, note: "No regional_publications row is emitted: publication requires approved versions of the family methodology and the sibling specification." }, null, 2));
  console.log(JSON.stringify({ runId, runKind, outcome: regional.outcome, priceLevel: regional.priceLevel, participantCount: regional.participantCount, marketBreadth: regional.marketBreadth, scope: regional.canonicalRegionCode === LISTED_SCOPE_KEY ? regional.regionScope : regional.canonicalRegionCode }, null, 2));
}

async function main(): Promise<void> {
  const phase = process.argv[2];
  const date = arg("date");
  const out = arg("out");
  if (phase === "collect") await collect(date, out);
  else if (phase === "emit") emit(date, out, process.argv.includes("--reinterpret"));
  else if (phase === "calculate") calculate(date, out, arg("run-kind", "simulation") as "simulation" | "production");
  else throw new Error("phase must be collect or calculate");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
