/**
 * Writing a planned batch, once, in one transaction.
 *
 * The properties this module exists to hold:
 *
 * **Nothing partial.** One `begin`, one `commit`, and any failure anywhere
 * rolls the whole batch back. Half-written provenance is worse than none: a
 * facility whose evidence insert failed is a published claim with no source
 * behind it, and it looks exactly like a correct row.
 *
 * **Idempotent.** A facility is addressed by its research key and its
 * dependants are replaced wholesale, so importing the same file twice leaves
 * the same database and the second run reports zero changes. Nothing matches on
 * name or position, so a re-import can never fork one facility into two or
 * merge two into one.
 *
 * **The database has the last word.** Every rule checked in the plan is also a
 * constraint or a deferred trigger. The plan checks them first because it can
 * say which record is wrong and why; the database checks them because it is the
 * thing that cannot be bypassed.
 */

import type { ContractFacility } from "@/lib/facilities/contract";
import type { ImportPlan } from "@/lib/facilities/import/plan";

export type SqlExecutor = {
  query(text: string, values: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

export type ImportWriteResult = {
  inserted: readonly string[];
  updated: readonly string[];
  unchanged: readonly string[];
  relationships: number;
  evidence: number;
  claims: number;
  facts: number;
  aliases: number;
};

/** The columns whose values decide whether an existing row needed updating at all. */
type FacilityRow = {
  id: string;
  fingerprint: string;
};

function facilityValues(facility: ContractFacility, publicationState: string): readonly unknown[] {
  const location = facility.location;
  const lifecycle = facility.lifecycle ?? {};
  return [
    facility.researchKey,
    facility.canonicalName,
    facility.category,
    facility.ownerName ?? null,
    facility.operatorName ?? null,
    lifecycle.status ?? null,
    location.streetAddress ?? null,
    location.locality ?? null,
    location.adminArea ?? null,
    location.countryName ?? null,
    location.countryCode ?? null,
    location.latitude ?? null,
    location.longitude ?? null,
    location.coordinatePrecision ?? null,
    location.coordinateMethod ?? null,
    location.coordinateNotes ?? null,
    lifecycle.announcedDate ?? null,
    lifecycle.constructionStartDate ?? null,
    lifecycle.operationalDate ?? null,
    publicationState,
    facility.quality.confidence,
    facility.quality.reviewNotes ?? [],
    facility.quality.lastVerifiedDate ?? null,
  ];
}

/**
 * The fingerprint SQL. Every column the importer writes, concatenated, so a
 * re-import can tell "unchanged" from "updated" without reading each column
 * back into TypeScript and comparing it there.
 */
const FACILITY_FINGERPRINT = `
  md5(concat_ws(chr(31),
    canonical_name, category, owner_name, operator_name, lifecycle_status,
    street_address, locality, admin_area, country_name, country_code,
    latitude::text, longitude::text, coordinate_precision, coordinate_method, coordinate_notes,
    announced_date::text, construction_start_date::text, operational_date::text,
    publication_state, confidence, array_to_string(review_notes, chr(30)), last_verified_date::text
  ))`;

/**
 * Applies the plan. The caller must have established that the plan carries no
 * errors; this function refuses a plan that does rather than writing part of it.
 */
export async function applyImportPlan(sql: SqlExecutor, plan: ImportPlan): Promise<ImportWriteResult> {
  if (plan.errors.length > 0) {
    throw new Error(`refusing to write a plan with ${plan.errors.length} error(s); nothing was written`);
  }

  const inserted: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];
  let evidenceCount = 0;
  let claimCount = 0;
  let factCount = 0;
  let aliasCount = 0;

  await sql.query("begin", []);
  try {
    // The publication triggers are already DEFERRABLE INITIALLY DEFERRED, so a
    // facility may be written before the evidence and edges that justify it and
    // the rules are judged once, at commit, on the finished picture.
    const idByKey = new Map<string, string>();
    const evidenceIdByKey = new Map<string, string>();

    for (const entry of plan.facilities) {
      const facility = entry.facility;
      const before = await sql.query(
        `select id::text as id, ${FACILITY_FINGERPRINT} as fingerprint
           from reference.facilities where research_key = $1`,
        [facility.researchKey],
      );
      const existing = (before.rows[0] as FacilityRow | undefined) ?? null;

      const { rows } = await sql.query(
        `insert into reference.facilities (
           research_key, canonical_name, category, owner_name, operator_name, lifecycle_status,
           street_address, locality, admin_area, country_name, country_code,
           latitude, longitude, coordinate_precision, coordinate_method, coordinate_notes,
           announced_date, construction_start_date, operational_date,
           publication_state, confidence, review_notes, last_verified_date
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         on conflict (research_key) do update set
           canonical_name = excluded.canonical_name,
           category = excluded.category,
           owner_name = excluded.owner_name,
           operator_name = excluded.operator_name,
           lifecycle_status = excluded.lifecycle_status,
           street_address = excluded.street_address,
           locality = excluded.locality,
           admin_area = excluded.admin_area,
           country_name = excluded.country_name,
           country_code = excluded.country_code,
           latitude = excluded.latitude,
           longitude = excluded.longitude,
           coordinate_precision = excluded.coordinate_precision,
           coordinate_method = excluded.coordinate_method,
           coordinate_notes = excluded.coordinate_notes,
           announced_date = excluded.announced_date,
           construction_start_date = excluded.construction_start_date,
           operational_date = excluded.operational_date,
           publication_state = excluded.publication_state,
           confidence = excluded.confidence,
           review_notes = excluded.review_notes,
           last_verified_date = excluded.last_verified_date
         returning id::text as id, ${FACILITY_FINGERPRINT} as fingerprint`,
        facilityValues(facility, entry.publicationState),
      );
      const row = rows[0] as FacilityRow;
      idByKey.set(facility.researchKey, row.id);
      if (!existing) inserted.push(facility.researchKey);
      else if (existing.fingerprint !== row.fingerprint) updated.push(facility.researchKey);
      else unchanged.push(facility.researchKey);

      // Dependants are replaced rather than merged: the dataset file is the
      // whole truth about a facility's aliases, evidence and facts, so a source
      // removed from the file is removed from the database. Facts go first
      // because they reference evidence.
      await sql.query(`delete from reference.facility_facts where facility_id = $1`, [row.id]);
      await sql.query(`delete from reference.facility_aliases where facility_id = $1`, [row.id]);
      // Relationships reference evidence with ON DELETE RESTRICT, so they are
      // cleared before the evidence they point at.
      await sql.query(`delete from reference.facility_relationships where from_facility_id = $1`, [row.id]);
      await sql.query(`delete from reference.facility_evidence where facility_id = $1`, [row.id]);

      for (const alias of facility.aliases ?? []) {
        await sql.query(
          `insert into reference.facility_aliases (facility_id, alias, alias_kind, alias_authority)
           values ($1, $2, $3, $4)
           on conflict (facility_id, alias_kind, alias) do nothing`,
          [row.id, alias.alias, alias.kind ?? "alias", alias.authority ?? null],
        );
        aliasCount += 1;
      }

      for (const evidence of facility.evidence) {
        const { rows: evidenceRows } = await sql.query(
          `insert into reference.facility_evidence (
             facility_id, publisher, title, document_url, document_type, published_on,
             verification_state, verified_at, verification_notes
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           returning id::text as id`,
          [
            row.id,
            evidence.publisher,
            evidence.title,
            evidence.url,
            evidence.documentType,
            evidence.publishedOn ?? null,
            evidence.verificationState ?? "unverified",
            evidence.verifiedAt ?? null,
            evidence.verificationNotes ?? null,
          ],
        );
        const evidenceId = String((evidenceRows[0] as { id: string }).id);
        evidenceIdByKey.set(`${facility.researchKey} ${evidence.url}`, evidenceId);
        evidenceCount += 1;

        for (const claim of evidence.claims) {
          await sql.query(
            `insert into reference.facility_evidence_claims (evidence_id, claim_field, statement)
             values ($1, $2, $3)
             on conflict (evidence_id, claim_field, statement) do nothing`,
            [evidenceId, claim.field, claim.statement],
          );
          claimCount += 1;
        }
      }

      for (const fact of facility.facts ?? []) {
        const evidenceId = evidenceIdByKey.get(`${facility.researchKey} ${fact.evidenceUrl}`);
        if (!evidenceId) {
          throw new Error(`fact ${fact.key} on ${facility.researchKey} cites evidence that was not written`);
        }
        await sql.query(
          `insert into reference.facility_facts (facility_id, fact_key, numeric_value, text_value, unit, evidence_id, notes)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [row.id, fact.key, fact.numericValue ?? null, fact.textValue ?? null, fact.unit ?? null, evidenceId, fact.notes ?? null],
        );
        factCount += 1;
      }
    }

    let relationshipCount = 0;
    for (const entry of plan.relationships) {
      const relationship = entry.relationship;
      const fromId = idByKey.get(relationship.fromResearchKey) ?? (await facilityIdByKey(sql, relationship.fromResearchKey));
      const toId = idByKey.get(relationship.toResearchKey) ?? (await facilityIdByKey(sql, relationship.toResearchKey));
      if (!fromId || !toId) {
        throw new Error(`relationship ${relationship.fromResearchKey} -> ${relationship.toResearchKey} has no persisted endpoint`);
      }
      const evidenceId = relationship.evidenceUrl
        ? (evidenceIdByKey.get(`${relationship.fromResearchKey} ${relationship.evidenceUrl}`) ??
           (await evidenceIdByUrl(sql, fromId, relationship.evidenceUrl)))
        : null;
      if (relationship.evidenceUrl && !evidenceId) {
        throw new Error(`relationship ${relationship.fromResearchKey} -> ${relationship.toResearchKey} cites evidence that was not written`);
      }
      await sql.query(
        `insert into reference.facility_relationships (from_facility_id, to_facility_id, relationship_type, evidence_id, notes)
         values ($1,$2,$3,$4,$5)
         on conflict (from_facility_id, to_facility_id, relationship_type) do update set
           evidence_id = excluded.evidence_id,
           notes = excluded.notes`,
        [fromId, toId, relationship.type, evidenceId, relationship.notes ?? null],
      );
      relationshipCount += 1;
    }

    await sql.query("commit", []);
    return {
      inserted,
      updated,
      unchanged,
      relationships: relationshipCount,
      evidence: evidenceCount,
      claims: claimCount,
      facts: factCount,
      aliases: aliasCount,
    };
  } catch (error) {
    await sql.query("rollback", []);
    throw error;
  }
}

async function facilityIdByKey(sql: SqlExecutor, researchKey: string): Promise<string | null> {
  const { rows } = await sql.query(`select id::text as id from reference.facilities where research_key = $1`, [researchKey]);
  return rows.length > 0 ? String((rows[0] as { id: string }).id) : null;
}

async function evidenceIdByUrl(sql: SqlExecutor, facilityId: string, url: string): Promise<string | null> {
  const { rows } = await sql.query(
    `select id::text as id from reference.facility_evidence where facility_id = $1 and document_url = $2`,
    [facilityId, url],
  );
  return rows.length > 0 ? String((rows[0] as { id: string }).id) : null;
}

/** Research keys the database already holds, so relationships may point outside a batch. */
export async function loadExistingResearchKeys(sql: SqlExecutor): Promise<readonly string[]> {
  const { rows } = await sql.query(`select research_key from reference.facilities`, []);
  return rows.map((row) => String(row.research_key));
}
