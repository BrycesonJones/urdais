/**
 * ISO-NE Interconnection Request Queue.
 *
 * Two thirds of this queue is not new generation, and that is the single most important thing
 * about ingesting it.
 *
 * 740 of the 1,751 published rows request Capacity Network Resource or Capacity Network Import
 * capability. ISO-NE defines that as an interconnection *service right*: it settles "whether an
 * initial interconnection analysis is required under FCM qualification for a proposed increase in
 * output from an existing generating capacity resource". Those rows carry 161,736 MW of summer
 * capability against 78,899 MW on every other row, and 89 of them report zero net MW to the grid
 * against a large summer figure — a facility that already exists, asking for the right to sell its
 * capacity. Summing the column reports a New England generation queue about three times real size.
 *
 * So a CNR or CNI request is recorded as `capacity_rights`, and its MW goes under
 * `capacity_service_mw`. A database trigger refuses to let a capacity-rights request carry a
 * new-generation quantity at all, which makes the mistake impossible rather than discouraged.
 *
 * ISO-NE also flags administrative rows — "Kingdom Community Wind Increase (see Q311)" — in free
 * text inside the project name, and publishes no relationship field. The reference is preserved
 * in native status and deferred rather than turned into a canonical relationship, because a
 * relationship parsed out of a name is a judgement this pipeline does not get to make.
 */

import { decodeEntities, resolveColumns, tableById, type HtmlTable }
  from "@/lib/interconnection-queue/html/table";
import { isoDate, numeric, requestClassFor, technologyFor, trimmed }
  from "@/lib/interconnection-queue/ingest/normalize";
import { QueueSourceFormatError, type NormalizedQuantity, type NormalizedQueueRecord,
  type NormalizedResource, type QueueAdapter, type QueueDeferral, type QueueExtraction }
  from "@/lib/interconnection-queue/ingest/types";
import type { LifecycleStage, Technology } from "@/lib/interconnection-queue/types";

const ARTIFACT = "public-queue";
const TABLE_ID = "publicqueue";

/**
 * The queue sits behind an ASP.NET cookie-detection redirect that loops unless the client
 * presents the cookie the server is testing for. Sending it once avoids the round trip entirely.
 */
const URL = "https://irtt.iso-ne.com/reports/external?AspxAutoDetectCookieSupport=1";
const HEADERS = { cookie: "AspxAutoDetectCookieSupport=1" };

/** Columns the adapter cannot work without. Losing any of them fails the run loudly. */
const REQUIRED = ["QP", "Type", "Requested", "Alternative Name", "Serv", "Status"] as const;

/** ISO-NE's interconnection service codes, and whether each proposes new capability. */
const CAPACITY_RIGHTS_SERVICE = new Set(["CNR", "CNI"]);

const TECHNOLOGY_BY_CODE: ReadonlyMap<string, Technology> = new Map([
  ["sun", "solar"], ["bat", "battery_storage"], ["wnd", "wind"], ["ng", "natural_gas"],
  ["wat", "hydro"], ["wds", "biomass"], ["nuc", "nuclear"], ["ref", "biomass"],
  ["dfo", "other_generation"], ["ker", "other_generation"], ["jf", "other_generation"],
  ["bit", "coal"], ["sub", "coal"], ["lig", "coal"], ["geo", "geothermal"],
  ["lfg", "biomass"], ["obg", "biomass"], ["msw", "biomass"], ["wo", "other_generation"],
  ["blq", "biomass"], ["pur", "other_generation"], ["oth", "other_generation"],
]);

/**
 * A compound fuel label is not a hybrid.
 *
 * `SUN BAT` is a real co-located pair; `DFO NG` is one dual-fuel machine that can burn oil or
 * gas, and `DFO KER NG` is one machine with three. Reading fuel count as resource count would
 * invent batteries that do not exist, so a compound label becomes several resources only when
 * storage is one of its parts, and otherwise stays a single dual-fuel resource.
 */
export function isoneResources(fuel: string | null, unit: string | null): {
  resources: NormalizedResource[]; families: Technology[]; unmapped: string[];
} {
  const parts = (fuel ?? "").trim().split(/\s+/).filter((part) => part !== "" && part !== "N/A");
  const unmapped: string[] = [];
  if (parts.length === 0) {
    return {
      resources: [{ componentOrdinal: 1, nativeTechnology: unit, nativeFuel: fuel,
        technology: technologyFor(unit) ?? "unknown", isSourceSeparated: false }],
      families: [technologyFor(unit) ?? "unknown"], unmapped,
    };
  }

  const mapped = parts.map((part) => {
    const family = TECHNOLOGY_BY_CODE.get(part.toLowerCase()) ?? technologyFor(part);
    if (family === null) unmapped.push(part);
    return { part, family: family ?? ("unknown" as Technology) };
  });
  const hasStorage = mapped.some((entry) => entry.family === "battery_storage");

  if (!hasStorage) {
    // One machine, however many fuels it can burn. The label is kept whole.
    const primary = mapped[0]!;
    return {
      resources: [{ componentOrdinal: 1, nativeTechnology: unit, nativeFuel: fuel,
        technology: primary.family, isSourceSeparated: false }],
      families: [primary.family], unmapped,
    };
  }

  // Co-located. ISO-NE states the parts and states that it does not publish their MW split, so
  // the parts are recorded and no MW is attributed to any of them.
  return {
    resources: mapped.map((entry, index) => ({
      componentOrdinal: index + 1, nativeTechnology: index === 0 ? unit : null, nativeFuel: entry.part,
      technology: entry.family, isSourceSeparated: false,
    })),
    families: mapped.map((entry) => entry.family), unmapped,
  };
}

/** `A` active, `C` commercial, `W` withdrawn. Sheet-level status, and the only one published. */
export function isoneLifecycle(status: string | null): { stage: LifecycleStage; unmapped: string | null } {
  switch ((status ?? "").trim().toUpperCase()) {
    case "A": return { stage: "study", unmapped: null };
    case "C": return { stage: "operational", unmapped: null };
    case "W": return { stage: "withdrawn", unmapped: null };
    case "": return { stage: "unknown", unmapped: null };
    default: return { stage: "unknown", unmapped: status };
  }
}

/** The queue position this row's name points at, where ISO-NE wrote one. */
export function referencedQueuePosition(name: string | null): string | null {
  if (name === null) return null;
  // ISO-NE writes the reference three ways: "see 243", "see Q311", "see QP1089".
  const match = /\bsee\s*(?:QP|Q)?\.?\s*(\d{1,5})/i.exec(name);
  return match === null ? null : match[1]!;
}

export const isoneQueueAdapter: QueueAdapter = {
  key: "iso-ne",
  marketSlug: "iso-ne",
  sourceInterfaceSlug: "iso-ne-interconnection-queue",
  retrievalPurpose: "research",
  artifacts: [{ label: ARTIFACT, url: URL, headers: HEADERS }],

  parse(artifacts): QueueExtraction {
    const artifact = artifacts.get(ARTIFACT) ?? [...artifacts.values()][0];
    if (artifact === undefined) throw new QueueSourceFormatError("iso-ne", `artifact ${ARTIFACT} was not retrieved`);

    const html = artifact.body.toString("utf8");
    const table: HtmlTable | null = tableById(html, TABLE_ID);
    if (table === null) {
      throw new QueueSourceFormatError("iso-ne", `the page has no table with id "${TABLE_ID}"`);
    }
    const { index, missing } = resolveColumns(table, [...REQUIRED, "Unit", "Fuel Type", "Net MW",
      "Summer MW", "Winter MW", "County", "ST", "Op Date", "Sync Date", "W/D Date", "POI", "Zone",
      "Dev", "Cluster", "Updated", "IA", "Jurisdiction"]);
    if (missing.some((name) => (REQUIRED as readonly string[]).includes(name))) {
      throw new QueueSourceFormatError("iso-ne",
        `the queue table no longer exposes ${missing.join(", ")}; it offers ${table.headers.join(" | ")}`);
    }
    // A catastrophic shrink means the page changed shape, not that New England emptied out.
    if (table.rows.length < 100) {
      throw new QueueSourceFormatError("iso-ne",
        `the queue table holds only ${table.rows.length} rows, which is far below any plausible queue`);
    }

    const at = (row: string[], name: string): string | null => {
      const position = index.get(name);
      if (position === undefined) return null;
      return trimmed(decodeEntities(row[position] ?? ""));
    };

    const deferrals: QueueDeferral[] = [];
    const records: NormalizedQueueRecord[] = [];

    table.rows.forEach((row, rowIndex) => {
      const nativeQueueId = at(row, "QP");
      const locator = { extractionMethod: "html_row" as const, container: TABLE_ID,
        ordinal: rowIndex + 1, htmlSelector: `table#${TABLE_ID} tr:nth-of-type(${rowIndex + 1})` };
      if (nativeQueueId === null) {
        deferrals.push({ nativeQueueId: null, deferralKind: "unsupported_row", nativeValue: null,
          detail: "a queue row with no queue position; identity would have to be invented", locator });
        return;
      }

      const type = at(row, "Type");
      const service = at(row, "Serv");
      const serviceCode = (service ?? "").toUpperCase();
      const name = at(row, "Alternative Name");

      // The request kind. ISO-NE is the first market that publishes one, and it decides both the
      // subtype and which quantity kind this row's MW is allowed to occupy.
      let requestSubtype: string;
      if (type === "ETU") requestSubtype = "elective_transmission_upgrade";
      else if (type === "TS") requestSubtype = "transmission_service";
      else if (CAPACITY_RIGHTS_SERVICE.has(serviceCode)) requestSubtype = "capacity_rights";
      else if (type === "G") requestSubtype = "new_generation";
      else {
        requestSubtype = "unknown";
        deferrals.push({ nativeQueueId, deferralKind: "unmapped_status", nativeValue: type,
          detail: "ISO-NE published a request type this adapter does not map; the request is held "
            + "as unknown and counted as no new capability", locator });
      }
      const isNewCapability = requestSubtype === "new_generation";

      const { stage, unmapped } = isoneLifecycle(at(row, "Status"));
      if (unmapped !== null) {
        deferrals.push({ nativeQueueId, deferralKind: "unmapped_status", nativeValue: unmapped,
          detail: "ISO-NE published a status this adapter does not map", locator });
      }

      const unit = at(row, "Unit");
      const fuel = at(row, "Fuel Type");
      const { resources, families, unmapped: unmappedFuels } =
        requestSubtype === "elective_transmission_upgrade" || requestSubtype === "transmission_service"
          // An elective upgrade or transmission service row often carries no unit or fuel at
          // all; its request type is then the only thing the publisher named for it.
          ? { resources: [{ componentOrdinal: 1, nativeTechnology: unit ?? type, nativeFuel: fuel,
              technology: "transmission" as Technology, isSourceSeparated: false }],
              families: ["transmission" as Technology], unmapped: [] as string[] }
          : isoneResources(fuel, unit);
      for (const value of unmappedFuels) {
        deferrals.push({ nativeQueueId, deferralKind: "unmapped_technology", nativeValue: value,
          detail: "ISO-NE published a fuel code this adapter does not map", locator });
      }

      const quantities: NormalizedQuantity[] = [];
      const push = (name: string, kind: NormalizedQuantity["quantityKind"]) => {
        const raw = at(row, name);
        if (raw === null || raw.toUpperCase() === "N/A") return;
        const value = numeric(raw);
        if (value === null) {
          deferrals.push({ nativeQueueId, deferralKind: "unparseable_value", nativeValue: raw,
            detail: `ISO-NE ${name} is not a number`, locator: { ...locator, field: name } });
          return;
        }
        quantities.push({ nativeField: name, quantityKind: kind, value, unit: "MW",
          resourceOrdinal: null, direction: "injection" });
      };

      if (isNewCapability) {
        // A real request to add generation: its seasonal capability and its net addition.
        push("Net MW", "net_mw_to_grid");
        push("Summer MW", "summer_mw");
        push("Winter MW", "winter_mw");
      } else {
        // Capacity rights, an elective upgrade or a transmission service request. The MW
        // describes capability that already exists or is already queued elsewhere, so it is
        // recorded under the service-right kind and can never reach a new-generation total. The
        // database refuses the alternative outright.
        push("Net MW", "capacity_service_mw");
        push("Summer MW", "other_mw");
        push("Winter MW", "other_mw");
      }

      const nativeStatus: Record<string, string> = { status: at(row, "Status") ?? "" };
      if (type !== null) nativeStatus.type = type;
      if (service !== null) nativeStatus.serv = service;
      const cluster = at(row, "Cluster");
      if (cluster !== null) nativeStatus.cluster = cluster;
      const agreement = at(row, "IA");
      if (agreement !== null) nativeStatus.ia = agreement;
      const jurisdiction = at(row, "Jurisdiction");
      if (jurisdiction !== null) nativeStatus.jurisdiction = jurisdiction;
      const updated = at(row, "Updated");
      if (updated !== null) nativeStatus.updated = updated;

      // ISO-NE's own guidance is to disregard these rows when counting projects. It publishes no
      // relationship field, so the reference is kept as the publisher's own words and deferred
      // rather than promoted to a canonical relationship parsed out of a name.
      const referenced = referencedQueuePosition(name);
      if (referenced !== null) {
        nativeStatus.referencesQueuePosition = referenced;
        nativeStatus.administrativeRelation = "named_in_project_title";
        deferrals.push({
          nativeQueueId, deferralKind: "unsupported_row", nativeValue: name,
          detail: `ISO-NE names queue position ${referenced} inside this row's project title, which `
            + "its guidance says to disregard when counting projects. No canonical relationship is "
            + "created: the source publishes no relationship field and one parsed from a title "
            + "would be an inference. no canonical relationship is created from a project title",
          locator,
        });
      }

      const payload: Record<string, unknown> = {};
      table.headers.forEach((header, position) => {
        const value = row[position];
        if (value !== undefined && value.trim() !== "") payload[`${position}:${header}`] = value;
      });

      records.push({
        nativeQueueId,
        nativeProjectName: name,
        nativeCustomer: at(row, "Dev"),
        nativeStatus,
        nativeStatusDisplay: [type, service, at(row, "Status")].filter((part) => part !== null).join(" / ") || null,
        lifecycleStage: stage,
        requestClass: requestSubtype === "elective_transmission_upgrade"
          || requestSubtype === "transmission_service" ? "transmission" : requestClassFor(families),
        requestSubtype,
        nativeRequestType: [type, service].filter((part) => part !== null).join(" ") || null,
        requestedOn: isoDate(at(row, "Requested")),
        proposedInServiceOn: isoDate(at(row, "Op Date")),
        revisedInServiceOn: isoDate(at(row, "Sync Date")),
        // ISO-NE publishes an operating date but not an actual commercial operation date; status
        // C is the operational signal and the date beside it is the planned one.
        actualInServiceOn: null,
        agreementExecutedOn: null,
        // Withdrawn with no date published is common here; the date is never invented.
        withdrawnOn: stage === "withdrawn" ? isoDate(at(row, "W/D Date")) : null,
        nativeState: at(row, "ST"),
        nativeCounty: at(row, "County"),
        nativeZone: at(row, "Zone"),
        nativePoi: at(row, "POI"),
        nativeSubstation: at(row, "POI"),
        nativeTransmissionOwner: null,
        sourcePartition: requestSubtype,
        quantities,
        resources,
        locator,
        payload,
        canonical: true,
      });
    });

    if (records.length === 0) throw new QueueSourceFormatError("iso-ne", "the queue table produced no rows");

    return {
      // ISO-NE publishes no release key and describes the queue as changing day to day, so
      // content identity is the only honest snapshot key.
      snapshot: { nativeSnapshotKey: null, sourcePublishedAt: null },
      records,
      deferrals,
    };
  },
};
