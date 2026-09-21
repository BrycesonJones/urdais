/**
 * PJM Planning Queues.
 *
 * The whole serial queue as one XML document: every request from A01 onward, with withdrawn and
 * in-service projects retained rather than dropped. That retention is why PJM supports cohort
 * analysis from a single retrieval — entry, exit and outcome are all dated in the same feed.
 *
 * Four MW fields per project, and they are not alternatives to one another. MaximumFacilityOutput
 * is what the plant could produce, MWEnergy and MWCapacity are two different interconnection
 * service rights, and MWInService is what is actually connected. In aggregate they span 17.8x.
 * All four are kept under their own names; none is promoted to "the" MW.
 */

import { childText, parseXml, type XmlElement } from "@/lib/interconnection-queue/xml/document";
import { isoDate, numeric, operationalStage, requestClassFor, technologyFor, trimmed }
  from "@/lib/interconnection-queue/ingest/normalize";
import { QueueSourceFormatError, type NormalizedQuantity, type NormalizedQueueRecord,
  type NormalizedResource, type QueueAdapter, type QueueDeferral, type QueueExtraction }
  from "@/lib/interconnection-queue/ingest/types";
import type { LifecycleStage, QuantityKind, Technology } from "@/lib/interconnection-queue/types";

const ARTIFACT = "planning-queues";

/** PJM's own status words, mapped from the twelve values the feed actually contains. */
const STAGE_BY_STATUS: ReadonlyMap<string, LifecycleStage> = new Map([
  ["active", "study"],
  ["withdrawn", "withdrawn"],
  ["retracted", "withdrawn"],
  ["annulled", "withdrawn"],
  ["canceled", "withdrawn"],
  ["cancelled", "withdrawn"],
  ["deactivated", "withdrawn"],
  ["in service", "operational"],
  ["partially in service - under construction", "under_construction"],
  ["under construction", "under_construction"],
  ["engineering and procurement", "under_construction"],
  ["confirmed", "agreement_executed"],
  ["suspended", "suspended"],
]);

/** The four MW elements, each under its own meaning. */
const QUANTITY_FIELDS: readonly (readonly [string, QuantityKind])[] = [
  ["MaximumFacilityOutput", "maximum_facility_output"],
  ["MWEnergy", "energy_service_mw"],
  ["MWCapacity", "capacity_service_mw"],
  ["MWInService", "in_service_mw"],
];

function project(element: XmlElement, ordinal: number, deferrals: QueueDeferral[]): NormalizedQueueRecord | null {
  const locator = { extractionMethod: "xml_element" as const, elementPath: "Projects/Project", ordinal };
  const nativeQueueId = trimmed(childText(element, "ProjectNumber"));
  if (nativeQueueId === null) {
    deferrals.push({
      nativeQueueId: null, deferralKind: "unsupported_row", nativeValue: null,
      detail: "a Project element with no ProjectNumber; identity would have to be invented", locator,
    });
    return null;
  }

  const nativeStatusValue = trimmed(childText(element, "Status")) ?? "";
  const mapped = STAGE_BY_STATUS.get(nativeStatusValue.toLowerCase());
  if (mapped === undefined && nativeStatusValue !== "") {
    deferrals.push({
      nativeQueueId, deferralKind: "unmapped_status", nativeValue: nativeStatusValue,
      detail: "PJM published a status this adapter does not map; the request is kept as unknown", locator,
    });
  }

  const actualInServiceOn = isoDate(childText(element, "ActualInServiceDate"));
  const withdrawnOn = isoDate(childText(element, "WithdrawalDate"));

  // Operational only on PJM's own word or an actual date. A projected date never reaches here.
  const operational = operationalStage({
    nativeSaysOperational: mapped === "operational",
    actualInServiceOn,
  });
  let lifecycleStage: LifecycleStage = operational ?? mapped ?? "unknown";
  // A withdrawal date is PJM stating the request left the queue, and it outranks a stale status.
  if (withdrawnOn !== null && lifecycleStage !== "operational") lifecycleStage = "withdrawn";

  const projectType = trimmed(childText(element, "ProjectType"));
  const fuel = trimmed(childText(element, "Fuel"));

  // PJM writes a compound label — "Solar; Storage" — and publishes no component MW. The parts are
  // recorded as resources so the technology mix is right, and no MW is attributed to any of them.
  const parts = fuel === null ? [] : fuel.split(/[;,]/).map((part) => part.trim()).filter((part) => part !== "");
  const resources: NormalizedResource[] = [];
  const families: Technology[] = [];
  parts.forEach((part, index) => {
    if (/^hybrid$/i.test(part)) return; // A summary word, not a resource.
    const technology = technologyFor(part);
    if (technology === null) {
      deferrals.push({
        nativeQueueId, deferralKind: "unmapped_technology", nativeValue: part,
        detail: "PJM published a fuel label this adapter does not map", locator,
      });
    }
    families.push(technology ?? "unknown");
    resources.push({
      componentOrdinal: index + 1,
      nativeTechnology: null,
      nativeFuel: part,
      technology: technology ?? "unknown",
      // PJM publishes no per-component MW, so these are labels rather than separated components.
      isSourceSeparated: false,
    });
  });
  if (projectType !== null && /transmission/i.test(projectType)) {
    resources.push({
      componentOrdinal: resources.length + 1, nativeTechnology: projectType, nativeFuel: null,
      technology: "transmission", isSourceSeparated: false,
    });
    families.push("transmission");
  }
  if (resources.length === 0) {
    resources.push({
      componentOrdinal: 1, nativeTechnology: projectType, nativeFuel: fuel,
      technology: "unknown", isSourceSeparated: false,
    });
  }

  const quantities: NormalizedQuantity[] = [];
  for (const [field, quantityKind] of QUANTITY_FIELDS) {
    const raw = childText(element, field);
    if (raw === null) continue;
    const value = numeric(raw);
    if (value === null) {
      deferrals.push({
        nativeQueueId, deferralKind: "unparseable_value", nativeValue: raw,
        detail: `PJM ${field} is not a number`, locator: { ...locator, field },
      });
      continue;
    }
    quantities.push({
      nativeField: field, quantityKind, value, unit: "MW", resourceOrdinal: null,
      direction: quantityKind === "in_service_mw" ? null : "injection",
    });
  }

  const payload: Record<string, unknown> = {};
  for (const child of element.children) {
    if (child.text !== "") payload[child.name] = child.text;
  }

  return {
    nativeQueueId,
    nativeProjectName: trimmed(childText(element, "CommercialName")) ?? trimmed(childText(element, "Name")),
    nativeCustomer: null,
    nativeStatus: {
      Status: nativeStatusValue,
      ...(trimmed(childText(element, "CapacityorEnergy")) === null
        ? {} : { CapacityorEnergy: trimmed(childText(element, "CapacityorEnergy"))! }),
      ...(trimmed(childText(element, "ProjectType")) === null
        ? {} : { ProjectType: projectType! }),
    },
    nativeStatusDisplay: nativeStatusValue === "" ? null : nativeStatusValue,
    lifecycleStage,
    requestClass: requestClassFor(families),
    requestedOn: isoDate(childText(element, "SubmittedDate")),
    proposedInServiceOn: isoDate(childText(element, "ProjectedInServiceDate")),
    revisedInServiceOn: isoDate(childText(element, "RevisedInServiceDate")),
    actualInServiceOn,
    agreementExecutedOn: null,
    withdrawnOn: lifecycleStage === "withdrawn" ? withdrawnOn : null,
    nativeState: trimmed(childText(element, "State")),
    nativeCounty: trimmed(childText(element, "County")),
    nativeZone: null,
    nativePoi: null,
    nativeSubstation: trimmed(childText(element, "Name")),
    nativeTransmissionOwner: trimmed(childText(element, "TransmissionOwner")),
    sourcePartition: "serial",
    quantities,
    resources,
    locator,
    payload,
    canonical: true,
  };
}

export const pjmQueueAdapter: QueueAdapter = {
  key: "pjm",
  marketSlug: "pjm",
  sourceInterfaceSlug: "pjm-planning-queues",
  retrievalPurpose: "research",
  artifacts: [{ label: ARTIFACT, url: "https://www.pjm.com/pub/planning/downloads/xml/PlanningQueues.xml" }],

  parse(artifacts): QueueExtraction {
    const artifact = artifacts.get(ARTIFACT);
    if (artifact === undefined) throw new QueueSourceFormatError("pjm", `artifact ${ARTIFACT} was not retrieved`);

    const root = parseXml(artifact.body.toString("utf8"));
    if (root.name !== "Projects") {
      throw new QueueSourceFormatError("pjm", `expected a <Projects> root, found <${root.name}>`);
    }
    const elements = root.children.filter((child) => child.name === "Project");
    if (elements.length === 0) {
      throw new QueueSourceFormatError("pjm", "the feed contains no <Project> elements");
    }

    const deferrals: QueueDeferral[] = [];
    const records: NormalizedQueueRecord[] = [];
    elements.forEach((element, index) => {
      const record = project(element, index + 1, deferrals);
      if (record !== null) records.push(record);
    });

    return {
      // PJM versions nothing: no release key, no document timestamp. Content identity is the
      // only honest snapshot key, and the framework derives it from the artifact hash.
      snapshot: { nativeSnapshotKey: null, sourcePublishedAt: null },
      records,
      deferrals,
    };
  },
};
