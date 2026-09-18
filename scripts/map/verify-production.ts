/** Read-only production verification for the canonical facility import. */

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { parseFacilityImportDocument } from "@/lib/facilities/contract";
import { loadFacilityReadModel } from "@/lib/facilities/read/load";
import { validatePublicFacilities, type FacilityMapReadModel } from "@/lib/facilities/read/read-model";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";

const EXPECTED_PROJECT_REF = "cyqtaydtfuwaexjkuynq";
const EXPECTED_METHODOLOGY = "2.1.0";

function databaseUrl(): string {
  const value = (process.env.DATABASE_URL ?? "").trim();
  if (!value) throw new Error("production database secret is unavailable");
  const parsed = new URL(value);
  const identity = `${parsed.hostname}/${decodeURIComponent(parsed.username)}`;
  if (!identity.includes(EXPECTED_PROJECT_REF)) throw new Error("DATABASE_URL does not identify the expected UrdaisProd project");
  return value;
}

function latestRepositoryMigration(): string {
  return readdirSync(resolve(process.cwd(), "supabase/migrations"))
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort()
    .at(-1)!
    .slice(0, 14);
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.length === sortedRight.length && sortedLeft.every((value, index) => value === sortedRight[index]);
}

function sameCounts(actual: unknown, expected: Record<string, number>): boolean {
  if (typeof actual !== "object" || actual === null || Array.isArray(actual)) return false;
  const record = actual as Record<string, unknown>;
  return Object.keys(record).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => record[key] === value);
}

async function main(): Promise<void> {
  const stage = process.argv.includes("--post-write") ? "post-write" : "pre-import";
  const sql = await createTokenSqlExecutor(databaseUrl());
  try {
    const latest = latestRepositoryMigration();
    const { rows: gateRows } = await sql.query(
      `select current_database() as database_name,
              (select max(version) from supabase_migrations.schema_migrations) as latest_migration,
              to_regclass('reference.facilities')::text as facilities_table,
              to_regclass('reference.facility_evidence')::text as evidence_table,
              (select mv.version
                 from reference.methodology_versions mv
                 join reference.methodologies m on m.id = mv.methodology_id
                where m.slug = 'map-facilities' and mv.status = 'approved' and mv.effective_from is not null
                order by mv.effective_from desc, mv.version desc limit 1) as methodology_version`,
      [],
    );
    const gate = gateRows[0] ?? {};
    const failures: string[] = [];
    if (gate.database_name !== "postgres") failures.push("database name is not postgres");
    if (gate.latest_migration !== latest) failures.push(`latest production migration is ${String(gate.latest_migration)}, expected ${latest}`);
    if (gate.facilities_table !== "reference.facilities") failures.push("reference.facilities is absent");
    if (gate.evidence_table !== "reference.facility_evidence") failures.push("reference.facility_evidence is absent");
    if (gate.methodology_version !== EXPECTED_METHODOLOGY) {
      failures.push(`approved map methodology is ${String(gate.methodology_version)}, expected ${EXPECTED_METHODOLOGY}`);
    }

    if (stage === "pre-import") {
      const { rows } = await sql.query(`select count(*)::int as facilities from reference.facilities`, []);
      if (failures.length > 0) throw new Error(failures.join("; "));
      console.log(JSON.stringify({ stage, projectRef: EXPECTED_PROJECT_REF, latestMigration: latest, methodology: EXPECTED_METHODOLOGY, facilities: rows[0]?.facilities }));
      return;
    }

    const raw = JSON.parse(readFileSync(resolve(process.cwd(), "data/map/facilities.v1.json"), "utf8")) as unknown;
    const parsed = parseFacilityImportDocument(raw);
    if (!parsed.document) throw new Error(`canonical dataset failed its contract: ${JSON.stringify(parsed.issues)}`);
    const expectedKeys = parsed.document.facilities.map((facility) => facility.researchKey);

    const { rows: countRows } = await sql.query(
      `select
         (select count(*)::int from reference.facilities) as facilities,
         (select jsonb_object_agg(category, n) from (select category, count(*)::int n from reference.facilities group by category) c) as canonical_categories,
         (select jsonb_object_agg(publication_state, n) from (select publication_state, count(*)::int n from reference.facilities group by publication_state) p) as publication_states,
         (select count(*)::int from reference.facility_evidence) as evidence,
         (select count(*)::int from reference.facility_evidence_claims) as claims,
         (select count(*)::int from reference.facility_aliases) as aliases,
         (select count(*)::int from reference.facility_facts) as facts,
         (select count(*)::int from reference.facility_relationships) as relationships,
         (select count(*)::int from reference.facilities where publication_state = 'published' and coordinate_precision = 'city') as published_city,
         (select count(*)::int from reference.facilities where publication_state = 'published' and (latitude is null or longitude is null)) as published_null_coordinates,
         (select count(*)::int from (select research_key from reference.facilities group by research_key having count(*) > 1) d) as duplicate_keys,
         (select count(*)::int from reference.facilities f where f.category = 'power_infrastructure' and f.publication_state = 'published' and not exists (
            select 1 from reference.facility_relationships r join reference.facilities t on t.id = r.to_facility_id
             where r.from_facility_id = f.id and r.relationship_type = 'supplies_power_to' and r.evidence_id is not null
               and reference.facility_is_compute_category(t.category))) as invalid_published_power,
         (select count(*)::int from reference.facilities where research_key = 'qts-vimercate' and country_code = 'IT' and country_name = 'Italy') as qts_vimercate_italy,
         (select count(*)::int from reference.facilities where research_key in ('equinix-ty6','equinix-ty7')) as ty6_ty7,
         (select count(*)::int from reference.facilities where research_key in ('equinix-ld4','equinix-ld5','equinix-ld6')) as ld4_ld5_ld6`,
      [],
    );
    const counts = countRows[0] ?? {};
    const expectedCanonicalCategories = { data_center: 144, gpu_compute_cluster: 18, semiconductor_fab: 20, power_infrastructure: 5 };
    const expectedStates = { published: 29, research: 138, review_required: 20 };
    if (counts.facilities !== 187) failures.push(`canonical facility count is ${String(counts.facilities)}, expected 187`);
    if (!sameCounts(counts.canonical_categories, expectedCanonicalCategories)) failures.push("canonical category counts do not match");
    if (!sameCounts(counts.publication_states, expectedStates)) failures.push("publication-state counts do not match");
    for (const [field, expected] of Object.entries({ evidence: 416, claims: 1146, aliases: 135, facts: 91, relationships: 20 })) {
      if (counts[field] !== expected) failures.push(`${field} count is ${String(counts[field])}, expected ${expected}`);
    }
    for (const field of ["published_city", "published_null_coordinates", "duplicate_keys", "invalid_published_power"]) {
      if (counts[field] !== 0) failures.push(`${field} is ${String(counts[field])}, expected 0`);
    }
    if (counts.qts_vimercate_italy !== 1) failures.push("QTS Vimercate is not uniquely recorded in Italy");
    if (counts.ty6_ty7 !== 2) failures.push("TY6 and TY7 are not both distinct canonical records");
    if (counts.ld4_ld5_ld6 !== 3) failures.push("LD4, LD5 and LD6 are not all distinct canonical records");

    const { rows: keyRows } = await sql.query(`select research_key from reference.facilities order by research_key`, []);
    const databaseKeys = keyRows.map((row) => String(row.research_key));
    if (!sameMembers(databaseKeys, expectedKeys)) failures.push("production research keys do not exactly match the canonical dataset");

    const model = await loadFacilityReadModel(sql);
    const modelReasons = validatePublicFacilities(JSON.parse(JSON.stringify(model)) as unknown);
    if (modelReasons.length > 0) failures.push(`database public model failed: ${modelReasons.join("; ")}`);
    const expectedPublicCategories = { data_center: 112, gpu_compute_cluster: 11, semiconductor_fab: 12, power_infrastructure: 1 };
    if (model.facilities.length !== 136) failures.push(`database public count is ${model.facilities.length}, expected 136`);
    if (!sameCounts(model.coverage.byCategory, expectedPublicCategories)) failures.push("public category counts do not match");
    const publicVerified = model.facilities.filter((facility) => facility.verificationStatus === "verified").length;
    const publicResearch = model.facilities.filter((facility) => facility.verificationStatus === "research").length;
    if (publicVerified !== 29 || publicResearch !== 107) failures.push(`public composition is ${publicVerified} verified / ${publicResearch} research`);

    const apiResponse = await fetch("https://urdais.com/api/map/facilities", { cache: "no-store" });
    if (!apiResponse.ok) failures.push(`production API returned HTTP ${apiResponse.status}`);
    const apiModel = (await apiResponse.json()) as FacilityMapReadModel;
    const apiReasons = validatePublicFacilities(apiModel);
    if (apiReasons.length > 0) failures.push(`production API failed: ${apiReasons.join("; ")}`);
    if (!sameMembers(apiModel.facilities.map((facility) => facility.id), model.facilities.map((facility) => facility.id))) {
      failures.push("production DB and API facility IDs do not reconcile");
    }

    const mapResponse = await fetch("https://urdais.com/map", { cache: "no-store" });
    if (!mapResponse.ok) failures.push(`production map returned HTTP ${mapResponse.status}`);

    if (failures.length > 0) throw new Error(failures.join("; "));
    console.log(
      JSON.stringify({
        stage,
        canonical: counts.facilities,
        public: model.facilities.length,
        publicVerified,
        publicResearch,
        categories: model.coverage.byCategory,
        evidence: counts.evidence,
        claims: counts.claims,
        aliases: counts.aliases,
        facts: counts.facts,
        relationships: counts.relationships,
        apiStatus: apiResponse.status,
        apiFacilities: apiModel.facilities.length,
        mapStatus: mapResponse.status,
        idsReconciled: true,
      }),
    );
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
