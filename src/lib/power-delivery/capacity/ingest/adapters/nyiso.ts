/**
 * NYISO — Locational Minimum Installed Capacity Requirements study.
 *
 * NYISO states its requirements as percentages of a locality's forecast peak, and never as
 * megawatts. That is not a rounding of some underlying MW figure; the requirement is the rate, and
 * the megawatt obligation falls out of it only once a peak forecast is chosen. So the rates are
 * stored as rates. Multiplying them by a peak load found elsewhere would be Urdais arithmetic
 * filed under NYISO's name, and it would silently pick a forecast vintage nobody asked for.
 *
 * The study's tables are raster images. Every number in this adapter comes instead from the
 * report's own prose, which is a real text layer, matched against the exact sentences that state
 * the results — so a rewording fails loudly rather than yielding a plausible wrong number. What
 * the tables alone contain, and the Gold Book with them, is deferred and recorded as deferred.
 *
 * A Triggering Resource splits the study in two. For this capability year the Champlain Hudson
 * Power Express changes which contingency binds Load Zone J, so NYISO publishes one set of
 * requirements assuming it participates and another assuming it does not. They are two answers,
 * not a range, and they are kept as two scenarios.
 */

import {
  CapacitySourceFormatError,
  type CapacityAdapter, type CapacityExtraction, type CapacityTargetPeriod,
  type NormalizedCapacityRecord,
} from "@/lib/power-delivery/capacity/ingest/types";
import { PdfDocument, squeeze } from "@/lib/power-delivery/pdf/document";

const ARTIFACT = {
  label: "lcr-study-2026-2027",
  url: "https://www.nyiso.com/documents/20142/56359673/06b_2026-2027%20LCR%20Report%20Final.pdf/fe183032-fd3d-7495-4d6f-25e3fa4170f2",
} as const;

const LOCALITIES = [
  { key: "NYC", label: "New York City (Load Zone J)", phrase: "forNewYorkCity" },
  { key: "LONG-ISLAND", label: "Long Island (Load Zone K)", phrase: "forLongIsland" },
  { key: "G-J", label: "G-J Locality (Load Zones G, H, I and J)", phrase: "fortheG-JLocality" },
] as const;

/** Each auction case, and the sentence that states its three results. */
const CASES = [
  {
    key: "chpe_in", label: "CHPE-In",
    lcr: /CHPE-Incase,theLCRsare([\d.]+)%forNewYorkCity,([\d.]+)%forLongIsland,and([\d.]+)%fortheG-JLocality/,
    floor: /bindingTSLfloorvaluesforLoadZoneJare([\d.]+)%\(CHPE-In\)/,
    assumption: "The Triggering Resource is assumed to participate in the capacity market.",
  },
  {
    key: "chpe_out", label: "CHPE-Out",
    lcr: /CHPE-Outcase,theLCRsare([\d.]+)%forNewYorkCity,([\d.]+)%forLongIsland,and([\d.]+)%fortheG-JLocality/,
    floor: /and([\d.]+)%\(CHPE-Out\)/,
    assumption: "The Triggering Resource is assumed not to participate in the capacity market.",
  },
] as const;

const IRM = /InstalledReserveMargin\(IRM\)valueof([\d.]+)%/;
const CAPABILITY_YEAR = /forthe(\d{4})-(\d{4})CapabilityYearbeginningMay1,(\d{4})/;

/** The import interface each locality's transmission security floor is derived from. */
const NYC_IMPORT = "NYC-IMPORT";

type Found = { page: number; match: RegExpExecArray };

export const nyisoCapacityAdapter: CapacityAdapter = {
  key: "nyiso",
  marketSlug: "nyiso",
  sourceInterfaceSlug: "nyiso-lcr-study",
  retrievalPurpose: "production",
  artifacts: [ARTIFACT],

  parse(artifacts): CapacityExtraction {
    const artifact = artifacts.get(ARTIFACT.label);
    if (artifact === undefined) {
      throw new CapacitySourceFormatError("nyiso", `artifact ${ARTIFACT.label} was not retrieved`);
    }
    const document = PdfDocument.open(artifact.body);
    const pages = Array.from({ length: document.pageCount }, (_, index) => squeeze(document.pageText(index + 1)));

    /** Find one statement, or say which one is missing. Nothing here guesses. */
    const find = (pattern: RegExp, what: string): Found => {
      for (let page = 0; page < pages.length; page += 1) {
        const match = pattern.exec(pages[page]!);
        if (match !== null) return { page: page + 1, match };
      }
      throw new CapacitySourceFormatError(
        "nyiso", `the study no longer states ${what}; its wording has changed and the values must be re-read before they are trusted`,
      );
    };

    const year = find(CAPABILITY_YEAR, "the capability year it covers");
    const startYear = Number(year.match[1]);
    if (Number(year.match[3]) !== startYear) {
      throw new CapacitySourceFormatError(
        "nyiso", `the capability year ${year.match[1]}-${year.match[2]} does not begin in ${year.match[3]}`,
      );
    }
    const period: CapacityTargetPeriod = {
      periodBasis: "capability_year",
      targetYear: startYear,
      targetSeason: null,
      // A NYISO capability year runs from the first of May to the last of April.
      periodStart: `${startYear}-05-01`,
      periodEnd: `${startYear + 1}-04-30`,
    };
    const periodLabel = `${year.match[1]}-${year.match[2]} Capability Year`;

    const records: NormalizedCapacityRecord[] = [];
    const locate = (page: number, section: string) => ({
      extractionMethod: "pdf_table" as const,
      pdfPage: page,
      documentSection: section,
      archiveRef: `${artifact.label} (sha256 ${artifact.sha256})`,
    });

    const emit = (
      page: number, section: string, term: string, geography: string, scenarioKey: string,
      nativeValue: string, target: NormalizedCapacityRecord["target"],
      payload: Record<string, unknown> = {},
    ): void => {
      records.push({
        artifactLabel: artifact.label, nativeGeography: geography, nativePeriod: periodLabel,
        nativeScenario: scenarioKey, nativeTerm: term, nativeValue, nativeUnit: "percent",
        rawPayload: { capabilityYear: periodLabel, statedIn: "report narrative", ...payload },
        locator: locate(page, section), target,
      });
    };

    // ------------------------------------------------------------------------------ the IRM
    //
    // One value, set by the New York State Reliability Council for the whole control area. It
    // applies to both cases rather than being determined per case, and is recorded under each so
    // that a reader of either case sees the margin that case was solved against.
    const irm = find(IRM, "the NYCA installed reserve margin");
    for (const auctionCase of CASES) {
      emit(irm.page, "Recommendation", "NYCA Installed Reserve Margin (IRM)", "NYCA", auctionCase.key,
        irm.match[1]!, {
          kind: "component", scenarioKey: auctionCase.key, quantityKind: "requirement",
          componentKind: "reserve_requirement",
          // An installed reserve margin is a proportion of forecast peak in installed terms.
          capacityBasis: "icap",
          subareaNativeKey: null, interfaceNativeKey: null,
          period, value: Number(irm.match[1]), unit: "percent",
        }, { setBy: "New York State Reliability Council", appliesToBothCases: true });
    }

    // --------------------------------------------------------- locational capacity requirements
    for (const auctionCase of CASES) {
      const found = find(auctionCase.lcr, `the ${auctionCase.label} locational capacity requirements`);
      LOCALITIES.forEach((locality, index) => {
        const raw = found.match[index + 1]!;
        emit(found.page, "Summary of Study", "Locational Minimum Installed Capacity Requirement",
          locality.key, auctionCase.key, raw, {
            kind: "component", scenarioKey: auctionCase.key, quantityKind: "requirement",
            componentKind: "local_reliability_requirement", capacityBasis: "icap",
            subareaNativeKey: locality.key, interfaceNativeKey: null,
            period, value: Number(raw), unit: "percent",
          }, { locality: locality.label, case: auctionCase.label });
      });

      // The transmission security floor the requirement may not fall below. NYISO publishes it
      // only for Load Zone J, whose binding contingency is what the Triggering Resource changes.
      const floor = find(auctionCase.floor, `the ${auctionCase.label} transmission security floor for Load Zone J`);
      emit(floor.page, "LCR Determination Process", "Transmission Security Limit (TSL) floor value",
        "NYC", auctionCase.key, floor.match[1]!, {
          kind: "constraint", scenarioKey: auctionCase.key, constraintKind: "tsl",
          direction: "import", interfaceNativeKey: NYC_IMPORT, subareaNativeKey: "NYC",
          period, value: Number(floor.match[1]), unit: "percent",
        }, { locality: "New York City (Load Zone J)", case: auctionCase.label });
    }

    return {
      vintage: {
        nativeVintageKey: `lcr-study-${year.match[1]}-${year.match[2]}`,
        nativeReportId: `${periodLabel} LCR Study`,
        reportTitle: `NYISO Locational Minimum Installed Capacity Requirements Study for the ${periodLabel}`,
        releaseKind: "study",
        // The study is adopted before the capability year opens; it states no date of its own in
        // text, so it is dated to the year it governs at year precision rather than invented.
        publishedAt: `${startYear}-01-01T00:00:00Z`,
        publishedAtPrecision: "year",
        sourceMethodologyName: "NYISO Locational Minimum Installed Capacity Requirements",
        sourceMethodologyVersion: periodLabel,
        publicationState: "internal_only",
        qualityStatus: "accepted",
      },
      scenarios: CASES.map((auctionCase) => ({
        nativeScenarioKey: auctionCase.key,
        nativeScenarioLabel: `${auctionCase.label} case`,
        canonicalClass: "other" as const,
        isReference: false,
        assumptions: { triggeringResource: "Champlain Hudson Power Express", case: auctionCase.label },
        assumptionsText:
          `${auctionCase.assumption} Which set applies to a given obligation procurement period is `
          + "settled by the Services Tariff, so neither case is the reference one.",
      })),
      subareas: LOCALITIES.map((locality) => ({
        nativeKey: locality.key,
        nativeLabel: locality.label,
        subareaKind: "locality" as const,
        notes:
          "A NYISO Locality. The G-J Locality contains Load Zone J, so its requirement and New "
          + "York City's describe overlapping territory and are never added together.",
      })),
      interfaces: [{
        nativeKey: NYC_IMPORT,
        nativeLabel: "New York City (Load Zone J) import interface",
        interfaceKind: "import",
        fromSubareaNativeKey: null,
        toSubareaNativeKey: "NYC",
        externalCounterparty: null,
        notes: "The boundary whose transmission security analysis sets the floor under the locality's requirement.",
      }],
      records,
    };
  },
};
