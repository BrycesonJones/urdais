/**
 * Server-only loading of the public facility set.
 *
 * Four conditions decide what the public map shows, and all four are in the one
 * query rather than spread between SQL and TypeScript:
 *
 *   1. the record is verified (`published`) or a public research record,
 *   2. it has a position better than a city centroid — through the same
 *      `reference.facility_is_map_eligible` the write-side constraint uses, so
 *      the read filter and the write gate cannot drift,
 *   3. its verification is inside the horizon,
 *   4. and if it is power infrastructure, an evidenced `supplies_power_to` edge
 *      reaches a data center, GPU cluster or fab.
 *
 * The fourth is a deferred trigger at write time. It is repeated here because a
 * power station that lost its compute link — the relationship deleted, the
 * target recategorised — would otherwise keep drawing on a public map on the
 * strength of a decision that no longer holds.
 */

import { FACILITY_VERIFICATION_HORIZON_DAYS, isFacilityCategory, type FacilityCategory } from "@/lib/facilities/domain";
import {
  composeAddress,
  emptyFacilityReadModel,
  type FacilityCoverage,
  type FacilityMapReadModel,
  type PublicFacility,
  type PublicFacilitySource,
} from "@/lib/facilities/read/read-model";

export type SqlExecutor = {
  query(text: string, values: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

const PUBLISHED_FACILITIES_SQL = `
  select f.research_key                     as id,
         f.canonical_name                   as name,
         f.category                         as category,
         f.owner_name                       as owner_name,
         f.operator_name                    as operator_name,
         f.lifecycle_status                 as lifecycle_status,
         f.street_address                   as street_address,
         f.locality                         as locality,
         f.admin_area                       as admin_area,
         f.country_name                     as country_name,
         f.country_code                     as country_code,
         f.latitude                         as latitude,
         f.longitude                        as longitude,
         f.coordinate_precision             as coordinate_precision,
         f.publication_state                as publication_state,
         to_char(f.last_verified_date, 'YYYY-MM-DD') as last_verified_date,
         coalesce(
           (select json_agg(json_build_object('publisher', e.publisher, 'title', e.title, 'url', e.document_url)
                            order by e.publisher, e.document_url)
              from reference.facility_evidence e
             where e.facility_id = f.id),
           '[]'::json
         )                                  as sources
    from reference.facilities f
   where f.publication_state in ('published', 'research')
     and reference.facility_is_map_eligible(f.latitude, f.longitude, f.coordinate_precision)
     and (f.lifecycle_status is null or f.lifecycle_status not in ('cancelled', 'retired'))
     and f.last_verified_date is not null
     and f.last_verified_date >= (current_date - ($1::integer))
     and exists (select 1 from reference.facility_evidence e where e.facility_id = f.id)
     and (
       exists (
         select 1 from reference.facility_evidence e
         join reference.facility_evidence_claims c on c.evidence_id = e.id
         where e.facility_id = f.id and c.claim_field in ('location', 'coordinates')
           and reference.facility_evidence_source_tier(e.document_type) <= 2
       )
       or 2 <= (
         select count(distinct lower(btrim(e.publisher)))
         from reference.facility_evidence e
         join reference.facility_evidence_claims c on c.evidence_id = e.id
         where e.facility_id = f.id and c.claim_field in ('location', 'coordinates')
           and reference.facility_evidence_source_tier(e.document_type) = 3
       )
     )
     and (
       f.category <> 'power_infrastructure'
       or exists (
         select 1
           from reference.facility_relationships r
           join reference.facilities t on t.id = r.to_facility_id
          where r.from_facility_id = f.id
            and r.relationship_type = 'supplies_power_to'
            and r.evidence_id is not null
            and reference.facility_is_compute_category(t.category)
       )
     )
   order by f.research_key`;

function readSources(value: unknown): readonly PublicFacilitySource[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) return null;
      const record = entry as Record<string, unknown>;
      const publisher = typeof record.publisher === "string" ? record.publisher : "";
      const title = typeof record.title === "string" ? record.title : "";
      const url = typeof record.url === "string" ? record.url : "";
      if (publisher === "" || url === "") return null;
      return { publisher, title, url };
    })
    .filter((entry): entry is PublicFacilitySource => entry !== null);
}

function toPublicFacility(row: Record<string, unknown>): PublicFacility | null {
  const category = String(row.category);
  if (!isFacilityCategory(category)) return null;
  const precision = String(row.coordinate_precision);
  if (precision !== "building" && precision !== "campus" && precision !== "street") return null;
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

  return {
    id: String(row.id),
    name: String(row.name),
    category,
    latitude,
    longitude,
    coordinatePrecision: precision,
    address: composeAddress({
      streetAddress: text(row.street_address),
      locality: text(row.locality),
      adminArea: text(row.admin_area),
      countryName: text(row.country_name),
    }),
    ownerName: text(row.owner_name),
    operatorName: text(row.operator_name),
    lifecycleStatus: (text(row.lifecycle_status) as PublicFacility["lifecycleStatus"]) ?? null,
    verificationStatus: row.publication_state === "published" ? "verified" : "research",
    lastVerifiedDate: String(row.last_verified_date),
    sources: readSources(row.sources),
  };
}

/** How many facilities are candidates for a public map, before map-safety filters. */
async function countPublicCandidates(sql: SqlExecutor): Promise<number> {
  const { rows } = await sql.query(`select count(*)::int as n from reference.facilities where publication_state in ('published', 'research')`, []);
  return Number(rows[0]?.n ?? 0);
}

export async function loadFacilityReadModel(sql: SqlExecutor): Promise<FacilityMapReadModel> {
  const [{ rows }, published] = await Promise.all([
    sql.query(PUBLISHED_FACILITIES_SQL, [FACILITY_VERIFICATION_HORIZON_DAYS]),
    countPublicCandidates(sql),
  ]);

  const byCategory: Record<FacilityCategory, number> = {
    data_center: 0,
    gpu_compute_cluster: 0,
    semiconductor_fab: 0,
    power_infrastructure: 0,
  };
  const countries = new Set<string>();
  const facilities: PublicFacility[] = [];
  for (const row of rows) {
    // A row this code cannot read is dropped rather than half-rendered: a dot
    // with an unreadable position is worse than a missing one.
    const facility = toPublicFacility(row);
    if (!facility) continue;
    facilities.push(facility);
    byCategory[facility.category] += 1;
    const code = row.country_code;
    if (typeof code === "string" && code.trim() !== "") countries.add(code);
  }

  const coverage: FacilityCoverage = {
    published,
    served: facilities.length,
    byCategory,
    countries: countries.size,
  };

  if (facilities.length === 0) {
    return { ...emptyFacilityReadModel("no_public_facilities"), coverage };
  }

  return {
    dataset: "urdais-map-facilities",
    verificationHorizonDays: FACILITY_VERIFICATION_HORIZON_DAYS,
    facilities,
    coverage,
    unavailableReason: null,
  };
}
