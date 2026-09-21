/**
 * SPP Generator Interconnection Active Request Listing.
 *
 * Collected and retained; never published. SPP's terms permit copying and distribution with
 * citation "EXCEPT when such materials will be used in commercial publication", and Urdais is a
 * commercial publication. That is a stated exclusion rather than an open question, so the source
 * is registered `unsuitable_without_permission` with every public purpose prohibited, and the
 * existing publication gate blocks it. Nothing here creates an override.
 *
 * Two things about the file itself.
 *
 * It does not start with its header. The first line is `"Last Updated On",9/21/2026,` — the only
 * freshness stamp SPP publishes — and a reader that takes line one as the header names every
 * column after a date.
 *
 * And its "active" listing is not a backlog. A third of the rows carry a status of
 * `IA FULLY EXECUTED/COMMERCIAL OPERATION`, so the report's name says nothing about lifecycle and
 * the status field decides. Six MW columns disagree by roughly four times, and all six are kept
 * under their own names.
 */

import { parsePreambleCsv, preambleValue, rowRecord } from "@/lib/interconnection-queue/csv/preamble";
import { isoDate, numeric, requestClassFor, technologyFor, trimmed }
  from "@/lib/interconnection-queue/ingest/normalize";
import { QueueSourceFormatError, type NormalizedQuantity, type NormalizedQueueRecord,
  type NormalizedResource, type QueueAdapter, type QueueDeferral, type QueueExtraction }
  from "@/lib/interconnection-queue/ingest/types";
import type { LifecycleStage, QuantityKind, Technology } from "@/lib/interconnection-queue/types";

const ARTIFACT = "active-requests";
const URL = "https://opsportal.spp.org/Studies/GenerateActiveCSV";

const ID_COLUMN = "Generation Interconnection Number";

/**
 * The six MW columns, each under its own meaning.
 *
 * `Capacity`, `MAX Summer MW` and `MAX Winter MW` are the facility's rated output. The two
 * `Requested …` columns are interconnection service amounts — what the customer asked to be able
 * to inject and to have deliverable — and `Nameplate Capacity` is the manufacturer's rating.
 * Their totals differ by about four times, which is exactly why none of them is promoted.
 */
const QUANTITY_FIELDS: readonly (readonly [string, QuantityKind])[] = [
  ["Capacity", "maximum_facility_output"],
  ["MAX Summer MW", "summer_mw"],
  ["MAX Winter MW", "winter_mw"],
  ["Requested Maximum Injection Capability (MW)", "energy_service_mw"],
  ["Requested Network Resource Deliverability (MW)", "capacity_service_mw"],
  ["Nameplate Capacity", "other_mw"],
];

const TECHNOLOGY_BY_TYPE: ReadonlyMap<string, Technology> = new Map([
  ["wind", "wind"], ["solar", "solar"], ["battery/storage", "battery_storage"],
  ["storage", "battery_storage"], ["thermal", "natural_gas"], ["hydro", "hydro"],
  ["hybrid", "unknown"],
]);

/**
 * Lifecycle from the status field, never from the report's name.
 *
 * SPP writes a compound status that fuses the agreement with what happened afterwards, so
 * `IA FULLY EXECUTED/COMMERCIAL OPERATION` is operating and `IA FULLY EXECUTED/ON SCHEDULE` is
 * not. The operating half is the only operational evidence in the file, and a commercial
 * operation date alone is not taken as one: SPP populates that column with planned dates too.
 */
export function sppLifecycle(status: string | null): { stage: LifecycleStage; unmapped: string | null } {
  const value = (status ?? "").trim().toUpperCase();
  if (value === "") return { stage: "unknown", unmapped: null };
  if (value.includes("COMMERCIAL OPERATION")) return { stage: "operational", unmapped: null };
  if (value.includes("WITHDRAWN") || value.includes("TERMINATED")) return { stage: "withdrawn", unmapped: null };
  if (value.includes("SUSPENSION")) return { stage: "suspended", unmapped: null };
  if (value.includes("IA FULLY EXECUTED")) return { stage: "agreement_executed", unmapped: null };
  if (value.includes("IA PENDING")) return { stage: "agreement_pending", unmapped: null };
  if (value.includes("DISIS") || value.includes("FACILITY STUDY") || value.includes("SPECIAL STUDY")
      || value.includes("ERAS") || value.includes("ICS")) {
    return { stage: "study", unmapped: null };
  }
  return { stage: "unknown", unmapped: status };
}

export const sppQueueAdapter: QueueAdapter = {
  key: "spp",
  marketSlug: "spp",
  sourceInterfaceSlug: "spp-generator-interconnection-queue",
  // Research purpose: SPP's terms exclude commercial publication, so nothing here is collected
  // under a production permission.
  retrievalPurpose: "research",
  artifacts: [{ label: ARTIFACT, url: URL }],

  parse(artifacts): QueueExtraction {
    const artifact = artifacts.get(ARTIFACT) ?? [...artifacts.values()][0];
    if (artifact === undefined) throw new QueueSourceFormatError("spp", `artifact ${ARTIFACT} was not retrieved`);

    let parsed;
    try {
      parsed = parsePreambleCsv(
        artifact.body.toString("utf8"),
        // The header is the line that carries the identifier column, not the first line.
        (values) => values.some((value) => value.trim() === ID_COLUMN),
      );
    } catch (error) {
      throw new QueueSourceFormatError("spp", `the CSV could not be read: ${(error as Error).message}`);
    }

    const updatedOn = isoDate(preambleValue(parsed.preamble, /last\s*updated\s*on/i));
    const deferrals: QueueDeferral[] = [];
    if (updatedOn === null) {
      deferrals.push({
        nativeQueueId: null, deferralKind: "unsupported_row", nativeValue: null,
        detail: "the CSV preamble carries no readable Last Updated On date, which is the only "
          + "freshness stamp SPP publishes",
        locator: { extractionMethod: "csv_row", container: "preamble" },
      });
    }

    for (const required of [ID_COLUMN, "Status", "Request Received"]) {
      if (!parsed.header.includes(required)) {
        throw new QueueSourceFormatError("spp",
          `the CSV no longer has a ${required} column; it offers ${parsed.header.join(" | ")}`);
      }
    }
    if (parsed.rows.length < 100) {
      throw new QueueSourceFormatError("spp",
        `the listing holds only ${parsed.rows.length} rows, which is far below any plausible queue`);
    }

    const records: NormalizedQueueRecord[] = [];

    for (const row of parsed.rows) {
      const record = rowRecord(parsed.header, row);
      const locator = { extractionMethod: "csv_row" as const, container: ARTIFACT,
        csvRowNumber: row.line, ordinal: row.line - parsed.headerLine };
      const nativeQueueId = trimmed(record[ID_COLUMN] ?? null);
      if (nativeQueueId === null) {
        deferrals.push({ nativeQueueId: null, deferralKind: "unsupported_row", nativeValue: null,
          detail: "a row with no interconnection number; identity would have to be invented", locator });
        continue;
      }

      const status = trimmed(record.Status ?? null);
      const { stage, unmapped } = sppLifecycle(status);
      if (unmapped !== null) {
        deferrals.push({ nativeQueueId, deferralKind: "unmapped_status", nativeValue: unmapped,
          detail: "SPP published a status this adapter does not map", locator });
      }

      const generationType = trimmed(record["Generation Type"] ?? null);
      const fuelType = trimmed(record["Fuel Type"] ?? null);
      // Generation Type is the reliable field: Fuel Type is blank on roughly two thirds of rows,
      // and its casing is inconsistent.
      const key = (generationType ?? "").trim().toLowerCase();
      let family = TECHNOLOGY_BY_TYPE.get(key) ?? technologyFor(generationType) ?? technologyFor(fuelType);
      if (key === "hybrid") {
        // SPP labels a co-located project Hybrid and publishes no component split, so the label
        // is kept whole and no components are invented.
        family = "unknown";
      }
      if (family === null && (generationType !== null || fuelType !== null)) {
        deferrals.push({ nativeQueueId, deferralKind: "unmapped_technology",
          nativeValue: generationType ?? fuelType,
          detail: "SPP published a generation type this adapter does not map", locator });
      }
      const resources: NormalizedResource[] = [{
        componentOrdinal: 1, nativeTechnology: generationType, nativeFuel: fuelType,
        technology: family ?? "unknown", isSourceSeparated: false,
      }];
      const families: Technology[] = [family ?? "unknown"];

      const quantities: NormalizedQuantity[] = [];
      for (const [field, quantityKind] of QUANTITY_FIELDS) {
        const raw = trimmed(record[field] ?? null);
        if (raw === null) continue;
        const value = numeric(raw);
        if (value === null) {
          deferrals.push({ nativeQueueId, deferralKind: "unparseable_value", nativeValue: raw,
            detail: `SPP ${field} is not a number`, locator: { ...locator, field } });
          continue;
        }
        quantities.push({ nativeField: field, quantityKind, value, unit: "MW",
          resourceOrdinal: null, direction: "injection" });
      }

      const nativeStatus: Record<string, string> = { status: status ?? "" };
      for (const field of ["Service Type", "Current Cluster", "Cluster Group", "IFS Queue Number",
        "JTIQ Participant", "Cause of Delay"]) {
        const value = trimmed(record[field] ?? null);
        if (value !== null) nativeStatus[field] = value;
      }

      // Every date SPP publishes, kept apart. Its Commercial Operation Date is populated on rows
      // that are not operating, so it is evidence only where the status agrees.
      const withdrawnOn = isoDate(record["Date Withdrawn"] ?? null) ?? isoDate(record["Cessation Date"] ?? null);
      const commercialOn = isoDate(record["Commercial Operation Date"] ?? null);

      records.push({
        nativeQueueId,
        nativeProjectName: null,
        nativeCustomer: null,
        nativeStatus,
        nativeStatusDisplay: status,
        lifecycleStage: stage,
        requestClass: requestClassFor(families),
        requestSubtype: "not_distinguished",
        nativeRequestType: trimmed(record["Service Type"] ?? null),
        requestedOn: isoDate(record["Request Received"] ?? null),
        proposedInServiceOn: isoDate(record["In-Service Date"] ?? null),
        revisedInServiceOn: null,
        actualInServiceOn: stage === "operational" ? commercialOn : null,
        agreementExecutedOn: null,
        withdrawnOn: stage === "withdrawn" ? withdrawnOn : null,
        nativeState: trimmed(record.State ?? null),
        nativeCounty: trimmed(record[" Nearest Town or County"] ?? record["Nearest Town or County"] ?? null),
        nativeZone: trimmed(record["Cluster Group"] ?? null),
        nativePoi: trimmed(record["Substation or Line"] ?? null),
        nativeSubstation: trimmed(record["Substation or Line"] ?? null),
        nativeTransmissionOwner: trimmed(record["TO at POI"] ?? null),
        sourcePartition: "active_listing",
        quantities,
        resources,
        locator,
        payload: record,
        canonical: true,
      });
    }

    if (records.length === 0) throw new QueueSourceFormatError("spp", "the listing produced no rows");

    return {
      snapshot: {
        // SPP's own update date is a real release key, so a week with no change resolves to the
        // snapshot already recorded rather than looking like a new observed state.
        nativeSnapshotKey: updatedOn === null ? null : `active-${updatedOn}`,
        sourcePublishedAt: updatedOn === null ? null : `${updatedOn}T00:00:00.000Z`,
      },
      records,
      deferrals,
    };
  },
};
