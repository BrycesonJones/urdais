/**
 * MISO Generator Interconnection Queue.
 *
 * A JSON endpoint returning the whole queue, withdrawn and completed requests included.
 *
 * MISO's status is three independent fields, not one, and that is the interesting thing about
 * this adapter. `applicationStatus` says whether the request is live, `studyPhase` says how far
 * through the study process it got, and `postGIAStatus` says what happened after the agreement.
 * A single project is routinely Active / GIA / Under Construction at the same time. Flattening
 * that to one stage would lose which of the three moved, so all three are preserved verbatim and
 * the normalized stage is derived under a stated precedence.
 *
 * Six MW fields: a summer and winter net rating, and ERIS and NRIS service amounts across two
 * definitive planning phases. ERIS and NRIS are different service rights, not restatements.
 */

import { isoDate, numeric, operationalStage, requestClassFor, technologyFor, trimmed }
  from "@/lib/interconnection-queue/ingest/normalize";
import { QueueSourceFormatError, type NormalizedQuantity, type NormalizedQueueRecord,
  type NormalizedResource, type QueueAdapter, type QueueDeferral, type QueueExtraction }
  from "@/lib/interconnection-queue/ingest/types";
import type { LifecycleStage, QuantityKind, Technology } from "@/lib/interconnection-queue/types";

const ARTIFACT = "gi-queue";

/** Phase within the study process, used only when the application is still live. */
const STAGE_BY_PHASE: ReadonlyMap<string, LifecycleStage> = new Map([
  ["study not started", "requested"],
  ["phase 1", "study"],
  ["phase 2", "study"],
  ["phase 3", "study"],
  ["gia", "agreement_executed"],
]);

/** What happened after the agreement. Outranks the study phase when present. */
const STAGE_BY_POST_GIA: ReadonlyMap<string, LifecycleStage> = new Map([
  ["not started", "agreement_executed"],
  ["under construction", "under_construction"],
  ["in service", "operational"],
  ["in service (with provisional gia)", "operational"],
  ["withdrawn", "withdrawn"],
]);

const QUANTITY_FIELDS: readonly (readonly [string, QuantityKind, "injection" | null])[] = [
  ["summerNetMW", "summer_mw", "injection"],
  ["winterNetMW", "winter_mw", "injection"],
  ["dp1ErisMw", "energy_service_mw", "injection"],
  ["dp2ErisMw", "energy_service_mw", "injection"],
  ["dp1NrisMw", "capacity_service_mw", "injection"],
  ["dp2NrisMw", "capacity_service_mw", "injection"],
];

type MisoProject = Record<string, unknown>;

const str = (project: MisoProject, key: string): string | null => {
  const value = project[key];
  return typeof value === "string" ? trimmed(value) : null;
};

export function misoLifecycle(input: {
  applicationStatus: string | null;
  studyPhase: string | null;
  postGiaStatus: string | null;
  withdrawnOn: string | null;
}): { stage: LifecycleStage; unmapped: string | null } {
  const application = (input.applicationStatus ?? "").toLowerCase();
  const postGia = STAGE_BY_POST_GIA.get((input.postGiaStatus ?? "").toLowerCase());

  // Precedence, derived from the combinations MISO actually publishes:
  //
  // 1. A withdrawal wins outright. MISO carries 2,148 withdrawn requests that still show the
  //    study phase they reached, so a phase must never outrank the outcome.
  // 2. Then postGIAStatus, which is the only field that says where the plant actually got to —
  //    including the one value that means operating.
  // 3. Otherwise the study phase.
  //
  // `doneDate` is deliberately absent from this. It dates the completion of the *interconnection
  // request process*, not the start of operation, and MISO's own data proves the difference: of
  // 269 requests carrying a doneDate, 201 have a postGIAStatus that is not in service — 104 are
  // under construction, 62 have not started, and 32 are withdrawn. Reading it as a commercial
  // operation date would have declared 250 MISO projects operating when MISO says 92 are.
  if (application === "withdrawn" || input.withdrawnOn !== null) {
    return { stage: "withdrawn", unmapped: null };
  }
  const operational = operationalStage({
    nativeSaysOperational: postGia === "operational",
    actualInServiceOn: null,
  });
  if (operational !== null) return { stage: operational, unmapped: null };
  if (postGia !== undefined && postGia !== "withdrawn") return { stage: postGia, unmapped: null };

  const phaseValue = (input.studyPhase ?? "").toLowerCase();
  const phase = STAGE_BY_PHASE.get(phaseValue);
  if (phase !== undefined) return { stage: phase, unmapped: null };
  if (phaseValue !== "") return { stage: "unknown", unmapped: input.studyPhase };
  // An application that is live with no phase yet is a request and nothing more.
  if (application === "active" || application === "pending revision approval" || application === "pending transfer") {
    return { stage: "requested", unmapped: null };
  }
  return { stage: "unknown", unmapped: input.applicationStatus };
}

export const misoQueueAdapter: QueueAdapter = {
  key: "miso",
  marketSlug: "miso",
  sourceInterfaceSlug: "miso-generator-interconnection-queue",
  retrievalPurpose: "research",
  artifacts: [{ label: ARTIFACT, url: "https://www.misoenergy.org/api/giqueue/getprojects" }],

  parse(artifacts): QueueExtraction {
    const artifact = artifacts.get(ARTIFACT);
    if (artifact === undefined) throw new QueueSourceFormatError("miso", `artifact ${ARTIFACT} was not retrieved`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(artifact.body.toString("utf8"));
    } catch (error) {
      throw new QueueSourceFormatError("miso", `the response is not JSON: ${(error as Error).message}`);
    }
    if (!Array.isArray(parsed)) {
      throw new QueueSourceFormatError("miso", "the response is not an array of projects");
    }
    if (parsed.length === 0) throw new QueueSourceFormatError("miso", "the response contains no projects");

    const deferrals: QueueDeferral[] = [];
    const records: NormalizedQueueRecord[] = [];

    parsed.forEach((entry, index) => {
      const locator = { extractionMethod: "json_object" as const, container: "projects", ordinal: index + 1,
        jsonPath: `$[${index}]` };
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        deferrals.push({ nativeQueueId: null, deferralKind: "unsupported_row", nativeValue: null,
          detail: "a queue entry that is not an object", locator });
        return;
      }
      const project = entry as MisoProject;
      const nativeQueueId = str(project, "projectNumber");
      if (nativeQueueId === null) {
        deferrals.push({ nativeQueueId: null, deferralKind: "unsupported_row", nativeValue: null,
          detail: "a project with no projectNumber; identity would have to be invented", locator });
        return;
      }

      const withdrawnOn = isoDate(str(project, "withdrawnDate"));
      const doneOn = isoDate(str(project, "doneDate"));
      const applicationStatus = str(project, "applicationStatus");
      const studyPhase = str(project, "studyPhase");
      const postGiaStatus = str(project, "postGIAStatus");

      const { stage, unmapped } = misoLifecycle({
        applicationStatus, studyPhase, postGiaStatus, withdrawnOn,
      });
      if (unmapped !== null) {
        deferrals.push({ nativeQueueId, deferralKind: "unmapped_status", nativeValue: unmapped,
          detail: "MISO published a status combination this adapter does not map", locator });
      }

      // MISO labels a co-located project "Hybrid" or "Solar/Battery" and publishes one MW for the
      // whole thing. The parts are recorded so the technology mix is right; no MW is split across
      // them, because MISO never published a split to recover.
      const fuelType = str(project, "fuelType");
      const facilityType = str(project, "facilityType");
      const label = facilityType ?? fuelType;
      const parts = label === null ? [] : label.split(/[/+]/).map((part) => part.trim()).filter((part) => part !== "");
      const resources: NormalizedResource[] = [];
      const families: Technology[] = [];
      parts.forEach((part, ordinal) => {
        if (/^hybrid$/i.test(part)) return;
        const technology = technologyFor(part);
        if (technology === null) {
          deferrals.push({ nativeQueueId, deferralKind: "unmapped_technology", nativeValue: part,
            detail: "MISO published a technology label this adapter does not map", locator });
        }
        families.push(technology ?? "unknown");
        resources.push({
          componentOrdinal: ordinal + 1,
          nativeTechnology: facilityType, nativeFuel: fuelType,
          technology: technology ?? "unknown",
          isSourceSeparated: false,
        });
      });
      if (resources.length === 0) {
        resources.push({ componentOrdinal: 1, nativeTechnology: facilityType, nativeFuel: fuelType,
          technology: technologyFor(fuelType) ?? "unknown", isSourceSeparated: false });
        families.push(technologyFor(fuelType) ?? "unknown");
      }

      const quantities: NormalizedQuantity[] = [];
      for (const [field, quantityKind, direction] of QUANTITY_FIELDS) {
        const raw = project[field];
        if (raw === null || raw === undefined) continue;
        const value = numeric(raw as string | number);
        if (value === null) {
          deferrals.push({ nativeQueueId, deferralKind: "unparseable_value", nativeValue: String(raw),
            detail: `MISO ${field} is not a number`, locator: { ...locator, field } });
          continue;
        }
        quantities.push({ nativeField: field, quantityKind, value, unit: "MW", resourceOrdinal: null, direction });
      }

      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(project)) {
        if (value !== null && value !== undefined && value !== "") payload[key] = value;
      }

      const nativeStatus: Record<string, string> = {};
      if (applicationStatus !== null) nativeStatus.applicationStatus = applicationStatus;
      if (studyPhase !== null) nativeStatus.studyPhase = studyPhase;
      if (postGiaStatus !== null) nativeStatus.postGIAStatus = postGiaStatus;
      const svcType = str(project, "svcType");
      if (svcType !== null) nativeStatus.svcType = svcType;
      // Retained as the publisher's own field, never as a commercial operation date.
      if (doneOn !== null) nativeStatus.doneDate = doneOn;
      if (Object.keys(nativeStatus).length === 0) nativeStatus.applicationStatus = "";

      records.push({
        nativeQueueId,
        nativeProjectName: null,
        nativeCustomer: null,
        nativeStatus,
        nativeStatusDisplay: [applicationStatus, studyPhase, postGiaStatus]
          .filter((part) => part !== null && part !== "").join(" / ") || null,
        lifecycleStage: stage,
        requestClass: requestClassFor(families),
        requestedOn: isoDate(str(project, "queueDate")),
        proposedInServiceOn: isoDate(str(project, "inService")),
        revisedInServiceOn: isoDate(str(project, "negInService")),
        // MISO publishes no actual in-service date. postGIAStatus says a plant is in service; it
        // never says when, and doneDate answers a different question.
        actualInServiceOn: null,
        agreementExecutedOn: isoDate(str(project, "giaToExec")),
        withdrawnOn: stage === "withdrawn" ? withdrawnOn : null,
        nativeState: str(project, "state"),
        nativeCounty: str(project, "county"),
        nativeZone: str(project, "studyGroup"),
        nativePoi: str(project, "poiName"),
        nativeSubstation: null,
        nativeTransmissionOwner: str(project, "transmissionOwner"),
        sourcePartition: str(project, "studyCycle"),
        quantities,
        resources,
        locator,
        payload,
        canonical: true,
      });
    });

    return {
      // No release key and no payload timestamp: MISO refreshes continuously. Content identity it is.
      snapshot: { nativeSnapshotKey: null, sourcePublishedAt: null },
      records,
      deferrals,
    };
  },
};
