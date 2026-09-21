/**
 * MISO — Planning Year Loss of Load Expectation study report.
 *
 * The study that sets what MISO must hold: a system reserve margin requirement for each of four
 * seasons, and a Local Reliability Requirement for each of ten Local Resource Zones, alongside the
 * installed and unforced capacity those requirements were measured against.
 *
 * This is **not** the Planning Resource Auction. The auction's committed Seasonal Accredited
 * Capacity, its final reserve margin requirement and its zonal Local Clearing Requirements are a
 * different release, and MISO's posting of the 2026 results is not publicly retrievable — its
 * content delivery network answers the posted address with an access denial. So the accreditation
 * basis stored here is what this study states, unforced and installed capacity, and nothing is
 * relabelled as accredited capacity to fill the gap.
 *
 * The report states the relationship the auction uses — a zone's Local Clearing Requirement is its
 * Local Reliability Requirement less its Capacity Import Limit — and this adapter deliberately
 * does not evaluate it. The two inputs come from two different releases, and PD-4A left the
 * locational arithmetic unapproved.
 */

import {
  CapacitySourceFormatError,
  type CapacityAdapter, type CapacityExtraction, type CapacityTargetPeriod,
  type NormalizedCapacityRecord,
} from "@/lib/power-delivery/capacity/ingest/types";
import { PdfDocument } from "@/lib/power-delivery/pdf/document";
import { PdfTableError, flatten, readNumbers, readRow } from "@/lib/power-delivery/pdf/tables";
import { MISO_LRZS, misoSeason, type MisoSeason } from "@/lib/power-delivery/capacity/ingest/adapters/miso-zones";

const PLANNING_YEAR = "2026-2027";
const ARTIFACT = {
  label: "lole-study-2026-2027",
  url: "https://cdn.misoenergy.org/PY%202026-2027%20LOLE%20Study%20Report728909.pdf",
} as const;

/** The system table's rows, in the order the report lists them, with what each one is. */
const SYSTEM_ROWS = [
  {
    label: "MISO System Peak Demand (MW)", term: "MISO System Peak Demand",
    kind: "diagnostic_only" as const, componentKind: "other" as const,
    basis: "unspecified" as const, unit: "MW" as const,
  },
  {
    label: "Unforced Capacity (MW)", term: "Unforced Capacity",
    kind: "capability" as const, componentKind: "accredited_resource_capacity" as const,
    basis: "ucap" as const, unit: "MW" as const,
  },
  {
    label: "Firm External Support UCAP (MW)", term: "Firm External Support UCAP",
    kind: "capability" as const, componentKind: "firm_capacity" as const,
    basis: "ucap" as const, unit: "MW" as const,
  },
  {
    label: "Adjustment to UCAP (MW)", term: "Adjustment to UCAP",
    kind: "diagnostic_only" as const, componentKind: "other" as const,
    basis: "ucap" as const, unit: "MW" as const,
  },
  {
    label: "UCAP PRM Requirement (PRMR) (MW)", term: "UCAP PRM Requirement (PRMR)",
    kind: "requirement" as const, componentKind: "reserve_requirement" as const,
    basis: "ucap" as const, unit: "MW" as const,
  },
  {
    label: "MISO PRM", term: "MISO PRM",
    kind: "requirement" as const, componentKind: "reserve_requirement" as const,
    basis: "ucap" as const, unit: "percent" as const,
  },
] as const;

/**
 * The decomposition of unforced capacity by resource class. Kept as evidence rather than as
 * components: the schema has no resource-class dimension, so ten rows about one system, one
 * season and one quantity kind would all claim the same canonical identity.
 */
const UCAP_COMPONENTS = [
  "Thermal", "Run of River/Biomass", "Wind", "Solar", "Battery Storage",
  "Demand Response", "BTMG", "New Thermal", "New Wind and Solar", "Cold Weather Outage Impacts",
] as const;

const UCAP_COMPONENT_REASON =
  "This is one resource class's share of the season's unforced capacity. The capacity schema has no "
  + "resource-class dimension, so all ten shares would claim the same canonical identity as each "
  + "other and as the total. The total is stored as the capability and the decomposition is kept "
  + "here, with its cell reference, rather than being flattened into rows that collide.";

/** The zonal table's rows, which repeat once per season. */
const ZONAL_ROWS = [
  {
    label: "Installed Capacity (MW)", term: "Installed Capacity", key: "A",
    kind: "capability" as const, componentKind: "installed_capacity" as const, basis: "icap" as const,
  },
  {
    label: "Unforced Capacity (MW)", term: "Unforced Capacity", key: "B",
    kind: "capability" as const, componentKind: "accredited_resource_capacity" as const, basis: "ucap" as const,
  },
  {
    label: "Adjustment to UCAP (MW)", term: "Adjustment to UCAP", key: "C",
    kind: "diagnostic_only" as const, componentKind: "other" as const, basis: "ucap" as const,
  },
  {
    label: "Local Reliability Requirement (LRR) UCAP (MW)", term: "Local Reliability Requirement (LRR) UCAP", key: "D",
    kind: "requirement" as const, componentKind: "local_reliability_requirement" as const, basis: "ucap" as const,
  },
  {
    label: "Peak Demand (MW)", term: "Peak Demand", key: "E",
    kind: "diagnostic_only" as const, componentKind: "other" as const, basis: "unspecified" as const,
  },
] as const;

export const misoLoleAdapter: CapacityAdapter = {
  key: "miso-lole",
  marketSlug: "miso",
  sourceInterfaceSlug: "miso-lole-study",
  // Internal only. MISO's terms were reviewed and refused, so this is never a production retrieval.
  retrievalPurpose: "research",
  artifacts: [ARTIFACT],

  parse(artifacts): CapacityExtraction {
    const artifact = artifacts.get(ARTIFACT.label);
    if (artifact === undefined) {
      throw new CapacitySourceFormatError("miso-lole", `artifact ${ARTIFACT.label} was not retrieved`);
    }
    const document = PdfDocument.open(artifact.body);
    const pages = Array.from({ length: document.pageCount }, (_, index) => flatten(document.pageText(index + 1)));

    // The study must still be about the planning year this source is registered for.
    const declared = /Planning\s*Year\s*(\d[\d\s]*\d)\s*[-–]\s*(\d[\d\s]*\d)/.exec(pages.join(" "));
    const planningYear = declared === null ? null
      : `${declared[1]!.replace(/\s/g, "")}-${declared[2]!.replace(/\s/g, "")}`;
    if (planningYear !== PLANNING_YEAR) {
      throw new CapacitySourceFormatError(
        "miso-lole",
        `the study is for planning year ${planningYear ?? "an unreadable year"}, not the ${PLANNING_YEAR} this source is registered for`,
      );
    }
    const startYear = Number(PLANNING_YEAR.slice(0, 4));

    const records: NormalizedCapacityRecord[] = [];
    const scenarioKey = "lole_study";

    const locate = (page: number, section: string, table: string) => ({
      extractionMethod: "pdf_table" as const,
      pdfPage: page, pdfTable: table, documentSection: section,
      archiveRef: `${artifact.label} (sha256 ${artifact.sha256})`,
    });

    const emit = (
      page: number, section: string, table: string, term: string, geography: string,
      season: MisoSeason, nativeValue: string, nativeUnit: string,
      target: NormalizedCapacityRecord["target"], payload: Record<string, unknown> = {},
    ): void => {
      records.push({
        artifactLabel: artifact.label, nativeGeography: geography,
        nativePeriod: `${season.label}, planning year ${PLANNING_YEAR}`,
        nativeScenario: "LOLE study", nativeTerm: term, nativeValue, nativeUnit,
        rawPayload: { planningYear: PLANNING_YEAR, season: season.label, ...payload },
        locator: locate(page, section, table), target,
      });
    };

    const periodOf = (season: MisoSeason): CapacityTargetPeriod => ({
      // One planning year, four seasons within it; the season is what tells them apart.
      periodBasis: "planning_year",
      targetYear: startYear,
      targetSeason: season.season,
      // MISO's seasonal month ranges live in its tariff, not in this artifact. A period this
      // pipeline did not read is a period it does not assert; the year and season identify it.
      periodStart: null,
      periodEnd: null,
    });

    // -------------------------------------------------------------------- the system table
    const systemPage = pages.findIndex((page) => /MISO\s*System\s*Peak\s*Demand/.test(page));
    if (systemPage === -1) {
      throw new CapacitySourceFormatError("miso-lole", "the report states no MISO system planning reserve margin table");
    }
    const systemFlat = pages[systemPage]!;
    const SEASONS = MISO_LRZS.seasons;

    for (const row of SYSTEM_ROWS) {
      let values: number[];
      try {
        values = readNumbers(systemFlat, row.label, { expect: SEASONS.length });
      } catch (error) {
        throw new CapacitySourceFormatError("miso-lole", error instanceof PdfTableError ? error.message : String(error));
      }
      SEASONS.forEach((season, index) => {
        emit(systemPage + 1, "MISO System Planning Reserve Margin", "Table 1-1", row.term, "MISO",
          season, String(values[index]), row.unit, {
            kind: "component", scenarioKey, quantityKind: row.kind, componentKind: row.componentKind,
            capacityBasis: row.basis, subareaNativeKey: null, interfaceNativeKey: null,
            period: periodOf(season), value: values[index]!, unit: row.unit,
          });
      });
    }

    for (const component of UCAP_COMPONENTS) {
      let values: number[];
      try {
        values = readNumbers(systemFlat, component, { expect: SEASONS.length });
      } catch {
        // A decomposition row the report has dropped is not a reason to fail: the total stands.
        continue;
      }
      SEASONS.forEach((season, index) => {
        emit(systemPage + 1, "MISO System Planning Reserve Margin", "Table 1-1",
          `Unforced Capacity: ${component}`, "MISO", season, String(values[index]), "MW",
          { kind: "evidence_only", reason: UCAP_COMPONENT_REASON }, { resourceClass: component });
      });
    }

    // ------------------------------------------------------- the zonal tables, one per season
    //
    // Each season's table repeats the same row labels, so the tables are found by their own
    // heading and read in turn rather than by assuming one table to a page.
    const HEADING = /Local\s*Reliability\s*Requirements\s*[-–]\s*([A-Za-z]+)\s*([\d\s]*\d(?:\s*[-–]\s*[\d\s]*\d)?)/g;
    let zonalTables = 0;
    for (let page = 0; page < pages.length; page += 1) {
      const flat = pages[page]!;
      HEADING.lastIndex = 0;
      for (let heading = HEADING.exec(flat); heading !== null; heading = HEADING.exec(flat)) {
        const season = misoSeason(heading[1]!);
        if (season === null) continue;
        zonalTables += 1;
        const from = heading.index;
        for (const row of ZONAL_ROWS) {
          let values: number[];
          try {
            values = readNumbers(flat, row.label, { expect: MISO_LRZS.zones.length, terminator: `\\[${row.key}\\]`, from });
          } catch (error) {
            throw new CapacitySourceFormatError(
              "miso-lole",
              `${season.label}: ${error instanceof PdfTableError ? error.message : String(error)}`,
            );
          }
          MISO_LRZS.zones.forEach((zone, index) => {
            emit(page + 1, "Local Resource Zone Analysis", `LRR ${season.label}`, row.term, zone.nativeKey,
              season, String(values[index]), "MW", {
                kind: "component", scenarioKey, quantityKind: row.kind, componentKind: row.componentKind,
                capacityBasis: row.basis, subareaNativeKey: zone.nativeKey, interfaceNativeKey: null,
                period: periodOf(season), value: values[index]!, unit: "MW",
              }, { zone: zone.nativeLabel });
          });
        }

        // The requirement as a proportion of the zone's own peak. It is the quotient of two values
        // already stored, so it stays evidence rather than becoming a third canonical figure.
        try {
          const ratios = readRow(flat, "LRR UCAP per-unit of LRZ Peak Demand", {
            expect: MISO_LRZS.zones.length, terminator: "\\[F\\]", from,
          });
          MISO_LRZS.zones.forEach((zone, index) => {
            const value = ratios.values[index];
            if (value === null || value === undefined) return;
            emit(page + 1, "Local Resource Zone Analysis", `LRR ${season.label}`,
              "LRR UCAP per-unit of LRZ Peak Demand", zone.nativeKey, season,
              ratios.raw[index] ?? String(value), "percent", {
                kind: "evidence_only",
                reason: "this is the local reliability requirement divided by the zone's own peak demand, and both of those are stored; keeping the quotient as a canonical value would state one fact twice in two denominations",
              }, { zone: zone.nativeLabel });
          });
        } catch { /* the ratio row is a convenience the report may drop */ }
      }
    }

    if (zonalTables !== SEASONS.length) {
      throw new CapacitySourceFormatError(
        "miso-lole",
        `expected one local reliability requirement table for each of ${SEASONS.length} seasons, found ${zonalTables}`,
      );
    }

    return {
      vintage: {
        nativeVintageKey: `lole-study-${PLANNING_YEAR}`,
        nativeReportId: `PY ${PLANNING_YEAR} LOLE Study Report`,
        reportTitle: `MISO Planning Year ${PLANNING_YEAR} Loss of Load Expectation Study Report`,
        releaseKind: "study",
        // The study is adopted before the planning year opens. It states no date in its text, so
        // it is dated to the year it governs at year precision rather than to a guess.
        publishedAt: `${startYear}-01-01T00:00:00Z`,
        publishedAtPrecision: "year",
        sourceMethodologyName: "MISO Loss of Load Expectation study",
        sourceMethodologyVersion: `Planning Year ${PLANNING_YEAR}`,
        publicationState: "internal_only",
        qualityStatus: "accepted",
      },
      scenarios: [{
        nativeScenarioKey: scenarioKey,
        nativeScenarioLabel: `Planning Year ${PLANNING_YEAR} LOLE study`,
        canonicalClass: "reference",
        isReference: true,
        assumptions: { planningYear: PLANNING_YEAR, study: "Loss of Load Expectation" },
        assumptionsText:
          "The study that sets the planning year's reserve margin and local reliability requirements. "
          + "MISO states that the reserve margin requirement effective for the Planning Resource "
          + "Auction is redetermined after load serving entities submit updated peak demand "
          + "forecasts, so this is the study's requirement and not the auction's.",
      }],
      subareas: MISO_LRZS.zones.map((zone) => ({
        nativeKey: zone.nativeKey,
        nativeLabel: zone.nativeLabel,
        subareaKind: "lrz" as const,
        notes:
          "A MISO Local Resource Zone. Its membership of local balancing authorities is published "
          + "in the capacity limits deck and recorded from there, not from anything written here.",
      })),
      interfaces: [],
      records,
    };
  },
};
