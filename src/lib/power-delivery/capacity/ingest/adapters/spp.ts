/**
 * SPP — Summer Season Resource Adequacy Report, East Balancing Authority Area.
 *
 * SPP East only. The Western Energy Imbalance Service area is a different footprint with a
 * different adequacy construct, and this adapter refuses an artifact that is about it.
 *
 * Almost everything quantitative in this report is a picture. The five-year outlook, the reserve
 * margin distributions and the fuel-type projections are all raster images with no text behind
 * them, so the accredited capacity totals and the aggregate Resource Adequacy Requirement cannot
 * be read at all. What the report states in prose — the planning reserve margins, the margin the
 * area achieved and the megawatts by which it exceeded its requirement — is what is ingested, and
 * the rest is recorded as deferred rather than approximated from the surrounding sentences.
 *
 * One term needs care. SPP's tariff uses **Deliverable Capacity** for accredited megawatts that a
 * transmission study found deliverable to the East Balancing Authority Area. It is not the Urdais
 * product concept of the same name, which is a market's maximum load-serving capability, and
 * nothing here may turn one into the other. The term is carried through verbatim, as evidence, and
 * a regression test exists to keep it out of `deliverable_capacity_results`.
 *
 * Demand response is already subtracted. SPP defines Net Peak Demand as forecast peak less
 * controllable and dispatchable demand response, so a reader who later adds demand response back
 * on the capacity side would count it twice; the report's own definition is stored beside the
 * values to make that visible.
 */

import {
  CapacitySourceFormatError,
  type CapacityAdapter, type CapacityExtraction, type CapacityTargetPeriod,
  type NormalizedCapacityRecord,
} from "@/lib/power-delivery/capacity/ingest/types";
import { PdfDocument, squeeze } from "@/lib/power-delivery/pdf/document";

const SEASON_YEAR = 2026;
const ARTIFACT = {
  label: "summer-resource-adequacy-2026",
  url: "https://spp.org/documents/76932/2026%20spp%20summer%20resource%20adequacy%20report.pdf",
} as const;

/** The area this source is about, and the one it must never be confused with. */
const EAST_BAA = "SPP-EAST-BAA";
const WEIS = /WesternEnergyImbalanceService|WEISMarket/;

const SEASON_SCOPE = /(\d{4})SummerSeasonResource\s*Adequacy|2026SummerSeason/;

type Statement = {
  key: string;
  pattern: RegExp;
  what: string;
};

/** The sentences this adapter reads, each anchored on wording rather than on position. */
const STATEMENTS: Statement[] = [
  { key: "acap_prm", what: "the accredited capacity planning reserve margin", pattern: /ACAPPRMwasestablishedat([\d.]+)%/ },
  {
    key: "achieved", what: "the reserve margin the area achieved and the megawatts of excess",
    pattern: /EastBAAmaintainsareservemarginof([\d.]+)%,representingapproximately([\d,]+)MWofexcessaccreditedcapacity/,
  },
];

/** Statements kept as evidence: history, projections and definitions, none of them this season's. */
const EVIDENCE: (Statement & { term: string; unit: string; reason: string })[] = [
  {
    key: "base_prm_history", term: "Base Planning Reserve Margin (PRM), earlier planning years", what: "the base planning reserve margin history", unit: "percent",
    pattern: /BasePlanningReserveMargin\(PRM\)requirementwas([\d.]+)%from(\d{4})through(\d{4})/,
    reason: "This is the base planning reserve margin in force for earlier planning years, not for the season this release is about. It is kept so the framework change is visible, and it is not a requirement for 2026.",
  },
  {
    key: "base_prm_future", term: "Base Planning Reserve Margin (PRM), scheduled", what: "the scheduled base planning reserve margin", unit: "percent",
    pattern: /BasePRMrequirementisscheduledtoincreaseto([\d.]+)%beginningin(\d{4})/,
    reason: "This is a scheduled future value, not a requirement SPP has set for a season. A requirement that is scheduled to change is not the same as one that has, and storing it as current would misdate it.",
  },
  {
    key: "deficit_2031", term: "Projected capacity deficit", what: "the projected deficit in the final forecast year", unit: "MW",
    pattern: /By(\d{4}),theEastBAAisprojectedtoexperienceacapacitydeficitof([\d,]+)MW/,
    reason: "A projection for a year beyond this season, computed on existing resources only and excluding the anticipated additions the same report describes. It is a scenario outcome rather than a stated capacity, and it is kept as evidence of what SPP projects.",
  },
  {
    key: "anticipated_additions", term: "Anticipated new accredited capacity", what: "the anticipated new accredited capacity", unit: "MW",
    pattern: /submittednearly([\d,]+)MWofaccreditedcapacityfromanticipatednewresource/,
    reason: "Capacity from resources that do not yet exist, submitted by participants across five planning years. It is an expectation, not an accreditation, and it is never counted as capability.",
  },
];

/** The definition that keeps demand response from being counted twice. */
const NET_PEAK_DEFINITION =
  /TotalLREForecastedNetPeakDemandisasfollows:ForecastedLREPeakDemand[–-]ControllableandDispatchableDemandResponse/;

/** The sentence in which SPP uses its tariff term for deliverable capacity. */
const TARIFF_TERM = /containtheFirmCapacityandDeliverableCapacityfromLREsandGOs/;

export const sppCapacityAdapter: CapacityAdapter = {
  key: "spp",
  marketSlug: "spp",
  sourceInterfaceSlug: "spp-summer-resource-adequacy",
  // Internal only. SPP's terms were reviewed and refused, so this is never a production retrieval.
  retrievalPurpose: "research",
  artifacts: [ARTIFACT],

  parse(artifacts): CapacityExtraction {
    const artifact = artifacts.get(ARTIFACT.label);
    if (artifact === undefined) {
      throw new CapacitySourceFormatError("spp", `artifact ${ARTIFACT.label} was not retrieved`);
    }
    const document = PdfDocument.open(artifact.body);
    const pages = Array.from({ length: document.pageCount }, (_, index) => squeeze(document.pageText(index + 1)));
    const whole = pages.join(" ");

    // A document SPP has marked as not for distribution is not collected, even internally.
    if (/SPPInternalOnly/.test(whole)) {
      throw new CapacitySourceFormatError(
        "spp",
        "the artifact is stamped \"SPP Internal Only\"; a document its publisher marks as not for "
        + "distribution is not retained, and the rights policy has no override for that",
      );
    }
    if (WEIS.test(whole)) {
      throw new CapacitySourceFormatError(
        "spp",
        "the artifact describes the Western Energy Imbalance Service area; this source is the East "
        + "Balancing Authority Area, whose adequacy construct is a different one",
      );
    }
    if (!SEASON_SCOPE.test(whole)) {
      throw new CapacitySourceFormatError("spp", `the artifact does not identify itself as a ${SEASON_YEAR} summer season report`);
    }

    const find = (pattern: RegExp, what: string): { page: number; match: RegExpExecArray } => {
      for (let page = 0; page < pages.length; page += 1) {
        const match = pattern.exec(pages[page]!);
        if (match !== null) return { page: page + 1, match };
      }
      throw new CapacitySourceFormatError(
        "spp", `the report no longer states ${what}; its wording has changed and the values must be re-read before they are trusted`,
      );
    };

    const period: CapacityTargetPeriod = {
      periodBasis: "seasonal", targetYear: SEASON_YEAR, targetSeason: "summer",
      periodStart: null, periodEnd: null,
    };

    const netPeak = pages.findIndex((page) => NET_PEAK_DEFINITION.test(page));
    const records: NormalizedCapacityRecord[] = [];

    const emit = (
      page: number, section: string, term: string, nativeValue: string, nativeUnit: string,
      target: NormalizedCapacityRecord["target"], payload: Record<string, unknown> = {},
    ): void => {
      records.push({
        artifactLabel: artifact.label, nativeGeography: EAST_BAA,
        nativePeriod: `Summer Season ${SEASON_YEAR}`,
        nativeScenario: "Accredited capacity framework", nativeTerm: term, nativeValue, nativeUnit,
        rawPayload: {
          season: `Summer ${SEASON_YEAR}`, balancingAuthorityArea: "SPP East",
          // Carried on every record: the demand side already nets demand response out, so adding
          // it back on the capacity side would count it twice.
          netPeakDemandExcludesDemandResponse: netPeak !== -1,
          ...payload,
        },
        locator: {
          extractionMethod: "pdf_table", pdfPage: page, documentSection: section,
          archiveRef: `${artifact.label} (sha256 ${artifact.sha256})`,
        },
        target,
      });
    };

    // ------------------------------------------------------------- the requirement of record
    const prm = find(STATEMENTS[0]!.pattern, STATEMENTS[0]!.what);
    emit(prm.page, "Background", "Accredited Capacity Planning Reserve Margin (ACAP PRM)",
      prm.match[1]!, "percent", {
        kind: "component", scenarioKey: "acap", quantityKind: "requirement",
        componentKind: "reserve_requirement",
        // SPP's accredited capacity framework is its own basis; it is neither ICAP nor UCAP.
        capacityBasis: "accredited",
        subareaNativeKey: null, interfaceNativeKey: null,
        period, value: Number(prm.match[1]), unit: "percent",
      }, { appliedUniformlyToAllLoadResponsibleEntities: true });

    // ----------------------------------------------------- what the area achieved against it
    const achieved = find(STATEMENTS[1]!.pattern, STATEMENTS[1]!.what);
    emit(achieved.page, "Executive Summary", "East BAA ACAP reserve margin",
      achieved.match[1]!, "percent", {
        kind: "component", scenarioKey: "acap", quantityKind: "diagnostic_only",
        componentKind: "other", capacityBasis: "accredited",
        subareaNativeKey: null, interfaceNativeKey: null,
        period, value: Number(achieved.match[1]), unit: "percent",
      }, { note: "An outcome of capacity against requirement, not a requirement itself." });

    emit(achieved.page, "Executive Summary", "Excess accredited capacity above the Resource Adequacy Requirement",
      achieved.match[2]!, "MW", {
        kind: "component", scenarioKey: "acap", quantityKind: "diagnostic_only",
        componentKind: "other", capacityBasis: "accredited",
        subareaNativeKey: null, interfaceNativeKey: null,
        period, value: Number(achieved.match[2]!.replace(/,/g, "")), unit: "MW",
      }, { note: "The margin by which accredited capacity exceeded the requirement. It is a difference SPP published, not a capacity." });

    // ------------------------------------------------------------------ statements kept whole
    for (const statement of EVIDENCE) {
      let found: { page: number; match: RegExpExecArray };
      try { found = find(statement.pattern, statement.what); } catch { continue; }
      const value = found.match[statement.key === "base_prm_history" || statement.key === "base_prm_future"
        ? 1 : 2] ?? found.match[1]!;
      emit(found.page, "Resource Adequacy outlook", statement.term, value, statement.unit,
        { kind: "evidence_only", reason: statement.reason },
        { statedFor: found.match.slice(1).join(" ") });
    }

    const tariff = pages.findIndex((page) => TARIFF_TERM.test(page));
    if (tariff !== -1) {
      emit(tariff + 1, "Table 1 footnotes", "Deliverable Capacity (SPP tariff term)", "stated without a value", "text", {
        kind: "evidence_only",
        reason:
          "SPP's tariff uses \"Deliverable Capacity\" for accredited megawatts a transmission study "
          + "found deliverable to the East Balancing Authority Area. It is a component of the "
          + "report's capacity total, not a market's load-serving capability, and it is not the "
          + "Urdais quantity of the same name. It is recorded here as a term the source uses so "
          + "that the collision is visible; no value of it is published in machine-readable form.",
      }, { tariffReference: "Attachment AA" });
    }

    return {
      vintage: {
        nativeVintageKey: `summer-resource-adequacy-${SEASON_YEAR}`,
        nativeReportId: `${SEASON_YEAR} SPP Summer Season Resource Adequacy Report`,
        reportTitle: `SPP ${SEASON_YEAR} Summer Season Resource Adequacy Report`,
        releaseKind: "adequacy_report",
        publishedAt: `${SEASON_YEAR}-06-15T00:00:00Z`,
        publishedAtPrecision: "day",
        sourceMethodologyName: "SPP Accredited Capacity resource adequacy framework",
        sourceMethodologyVersion: `Summer Season ${SEASON_YEAR}`,
        publicationState: "internal_only",
        qualityStatus: "accepted",
      },
      scenarios: [{
        nativeScenarioKey: "acap",
        nativeScenarioLabel: `Accredited capacity framework, summer ${SEASON_YEAR}`,
        canonicalClass: "reference",
        isReference: true,
        assumptions: { framework: "Accredited Capacity", balancingAuthorityArea: "SPP East" },
        assumptionsText:
          "Summer 2026 is the first season of SPP's accredited capacity framework. SPP states that "
          + "the accredited and base reserve margin frameworks are separate and are not to be "
          + "blended, so the base margin values this report also mentions are kept as evidence "
          + "rather than as this season's requirement.",
      }],
      // BA level only. SPP's own deliverability study states that specific delivery points and
      // zones within SPP are not studied, so there is no locality to model and none is invented.
      subareas: [],
      interfaces: [],
      records,
    };
  },
};
