/**
 * Resolution and persistence for UGAI end-of-day closes.
 *
 * Two jobs, and the first is the one that carries the risk. Resolution turns a venue code into a
 * listing, and it will refuse rather than guess: a code that matches no listing on that venue, or
 * more than one, is an error and not a row. The pipeline never resolves on ticker alone, because
 * a ticker is reassigned over time and repeats across venues — "2330" means nothing without
 * "XTAI", and even then it means nothing without a date.
 *
 * Persistence is append-only. A repeat of the same observed fact is a no-op keyed on content, a
 * changed official close is a correction that supersedes its predecessor, and nothing is ever
 * edited in place. The database enforces all of that independently; this module's job is to make
 * the common path do the right thing without relying on a constraint to catch it.
 */

import { TWSE_ATTRIBUTION } from "@/lib/ugai/prices/attribution";
import {
  PriceContractError,
  idempotencyKeyFor,
  type CanonicalClose,
  type ObservationPurpose,
  type ParsedClose,
} from "@/lib/ugai/prices/types";

export interface SqlExecutor {
  query(text: string, params: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** Registry identifiers resolved at run time. Never hardcoded: rights move, and ids are facts. */
export type PriceSourceLineage = {
  sourceInterfaceId: string;
  permissionGrantId: string;
  attributionRequired: boolean;
  attributionText: string | null;
  productionApproved: boolean;
};

export async function loadSourceLineage(
  sql: SqlExecutor,
  sourceSlug: string,
): Promise<PriceSourceLineage> {
  const { rows } = await sql.query(
    `select s.id as interface_id,
            s.production_access_state,
            g.id as grant_id,
            g.attribution_required,
            g.attribution_text
       from reference.source_interfaces s
       join reference.permission_grants g on g.source_interface_id = s.id
      where s.slug = $1
        and g.effective_from <= now()
        and (g.effective_to is null or g.effective_to > now())
      order by g.effective_from desc
      limit 2`,
    [sourceSlug],
  );
  if (rows.length === 0) {
    throw new PriceContractError(`source interface '${sourceSlug}' has no permission grant in force`);
  }
  if (rows.length > 1) {
    throw new PriceContractError(
      `source interface '${sourceSlug}' has more than one grant in force; which one admitted an observation must not be ambiguous`,
    );
  }
  const row = rows[0];
  if (!row) throw new PriceContractError(`source interface '${sourceSlug}' returned no grant row`);
  return {
    sourceInterfaceId: String(row.interface_id),
    permissionGrantId: String(row.grant_id),
    attributionRequired: row.attribution_required === true,
    attributionText: row.attribution_text == null ? null : String(row.attribution_text),
    productionApproved: row.production_access_state === "production_approved",
  };
}

/**
 * Resolve a venue code to exactly one listing that was effective on the trading date.
 *
 * The date is part of the lookup, not a filter applied afterwards. A code reassigned from one
 * company to another has two listing rows, and only the interval decides which one a price for a
 * given day belongs to.
 */
export async function resolveListing(
  sql: SqlExecutor,
  venueMic: string,
  localCode: string,
  tradingDate: string,
): Promise<string | null> {
  const { rows } = await sql.query(
    `select l.id
       from reference.listings l
       join reference.venues v on v.id = l.venue_id
      where v.mic = $1
        and l.ticker = $2
        and l.effective_from <= $3::date
        and (l.effective_to is null or l.effective_to >= $3::date)`,
    [venueMic, localCode, tradingDate],
  );
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new PriceContractError(
      `code '${localCode}' on ${venueMic} resolves to ${rows.length} listings on ${tradingDate}; identity must be unambiguous`,
    );
  }
  const only = rows[0];
  if (!only) throw new PriceContractError(`listing lookup for '${localCode}' returned no row`);
  return String(only.id);
}

/** Attach identity, provenance and rights to a parsed close. */
export function canonicalise(
  parsed: ParsedClose,
  listingId: string,
  lineage: PriceSourceLineage,
  sourceSlug: string,
  retrievedAt: string,
  purpose: ObservationPurpose,
): CanonicalClose {
  if (lineage.attributionRequired && !lineage.attributionText) {
    throw new PriceContractError(
      `the grant for '${sourceSlug}' makes attribution a condition but records no attribution text`,
    );
  }
  if (purpose === "production" && !lineage.productionApproved) {
    throw new PriceContractError(
      `source '${sourceSlug}' is not production-approved and cannot produce a production observation`,
    );
  }
  return {
    ...parsed,
    listingId,
    retrievedAt,
    sourceInterfaceId: lineage.sourceInterfaceId,
    permissionGrantId: lineage.permissionGrantId,
    attribution: lineage.attributionRequired ? lineage.attributionText : null,
    observationPurpose: purpose,
    idempotencyKey: idempotencyKeyFor(
      sourceSlug,
      parsed.listingRef.venueMic,
      parsed.listingRef.localCode,
      parsed.tradingDate,
      purpose,
    ),
  };
}

export type WriteOutcome = "inserted" | "unchanged" | "corrected";

/**
 * Persist one close.
 *
 * Three outcomes, decided by what is already stored rather than by whether the collector has run
 * before. An identical fact is `unchanged` and writes nothing — the retrieval still happened and
 * is recorded elsewhere, but re-reading a settled close is not a new observation. A different
 * close for a date already observed is a `corrected` one: the new row is inserted and the old is
 * superseded, so the value Urdais believed on the day stays readable.
 */
export async function writeClose(sql: SqlExecutor, close: CanonicalClose): Promise<WriteOutcome> {
  const { rows: current } = await sql.query(
    `select id, close_price::text as close_price, session_status
       from pipeline.price_observations
      where listing_id = $1 and trading_date = $2::date and observation_purpose = $3
        and superseded_by_id is null`,
    [close.listingId, close.tradingDate, close.observationPurpose],
  );

  const existing = current[0];
  if (existing) {
    const samePrice =
      (existing.close_price == null ? null : String(existing.close_price)) ===
        (close.closePrice == null ? null : String(close.closePrice)) &&
      String(existing.session_status) === close.sessionStatus;
    if (samePrice) return "unchanged";
  }

  const { rows: inserted } = await sql.query(
    `insert into pipeline.price_observations
       (listing_id, trading_date, session_status, close_price, price_currency, price_unit,
        source_interface_id, permission_grant_id, source_reported_at, retrieved_at,
        source_payload, attribution, observation_purpose, observation_kind,
        idempotency_key, supersession_reason)
     values ($1, $2::date, $3, $4::numeric, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz,
             $11::jsonb, $12, $13, $14, $15, $16)
     on conflict (idempotency_key) do nothing
     returning id`,
    [
      close.listingId,
      close.tradingDate,
      close.sessionStatus,
      close.closePrice,
      close.priceCurrency,
      close.priceUnit,
      close.sourceInterfaceId,
      close.permissionGrantId,
      close.sourceReportedAt,
      close.retrievedAt,
      JSON.stringify(close.sourcePayload ?? null),
      close.attribution,
      close.observationPurpose,
      existing ? "correction" : "original",
      // A correction is a distinct observed fact and needs its own key, or the conflict clause
      // would swallow it.
      existing ? `${close.idempotencyKey}:correction:${close.retrievedAt}` : close.idempotencyKey,
      existing
        ? `the venue published a different official close for ${close.tradingDate} on re-read`
        : null,
    ],
  );

  const insertedRow = inserted[0];
  if (!insertedRow) return "unchanged";

  if (existing) {
    await sql.query(
      `update pipeline.price_observations
          set superseded_by_id = $1, superseded_at = now(),
              supersession_reason = $2
        where id = $3`,
      [
        String(insertedRow.id),
        `corrected by a later observation of ${close.tradingDate}`,
        String(existing.id),
      ],
    );
    return "corrected";
  }
  return "inserted";
}

/** The required credit for a source, where its licence makes attribution a condition. */
export function requiredAttributionFor(sourceSlug: string): string | null {
  if (sourceSlug.startsWith("tw-twse-openapi")) return TWSE_ATTRIBUTION;
  return null;
}
