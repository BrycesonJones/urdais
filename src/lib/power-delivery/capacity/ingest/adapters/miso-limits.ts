/**
 * MISO — Planning Year Capacity Import and Export Limit results.
 *
 * What each Local Resource Zone's network permits it to bring in and send out, per season. These
 * are the limits the Planning Resource Auction applies, and they are the reason a zone's clearing
 * requirement is not simply its reliability requirement.
 *
 * Two quantities per zone per season, and they are not the same thing. Zonal Import Ability is
 * what the transfer study measured; the Capacity Import Limit is what MISO applies, and the deck
 * prints both side by side precisely because they differ. Only the limit becomes a constraint; the
 * ability is kept as evidence of what the study found.
 *
 * The deck states each zone's abilities twice — once in a summary table and once on the zone's own
 * slide — so the two are read independently and compared. A disagreement stops the ingestion,
 * because a deck that contradicts itself is one this adapter has misread.
 */

import {
  CapacitySourceFormatError,
  type CapacityAdapter, type CapacityExtraction, type CapacityTargetPeriod,
  type InterfaceDraft, type NormalizedCapacityRecord, type SubareaDraft,
} from "@/lib/power-delivery/capacity/ingest/types";
import { MISO_SEASONS, MISO_ZONES, misoZoneKey, type MisoSeason } from "@/lib/power-delivery/capacity/ingest/adapters/miso-zones";
import { PdfDocument } from "@/lib/power-delivery/pdf/document";
import { flatten, numericCells } from "@/lib/power-delivery/pdf/tables";

const PLANNING_YEAR = "2026-2027";
const ARTIFACT = {
  label: "cil-cel-results-2026-2027",
  url: "https://cdn.misoenergy.org/20251030%20LOLEWG%20Item%2004%20PY%202026-2027%20CIL_CEL%20Results724589.pdf",
} as const;

type Direction = "import" | "export";

const SIDES = [
  {
    direction: "import" as const, ability: "ZIA", limit: "CIL",
    heading: /Capacity\s*Import\s*Limits/, summary: /Zonal\s*Import\s*Ability\s*Results/,
    constraintKind: "cil" as const,
    abilityTerm: "Zonal Import Ability (ZIA)", limitTerm: "Capacity Import Limit (CIL)",
  },
  {
    direction: "export" as const, ability: "ZEA", limit: "CEL",
    heading: /Capacity\s*Export\s*Limits/, summary: /Zonal\s*Export\s*Ability\s*Results/,
    constraintKind: "cel" as const,
    abilityTerm: "Zonal Export Ability (ZEA)", limitTerm: "Capacity Export Limit (CEL)",
  },
] as const;

const ABILITY_REASON =
  "This is what the transfer study measured, not the limit MISO applies. The deck prints the "
  + "ability and the limit side by side because they differ; only the limit governs the auction, so "
  + "only the limit becomes a constraint and the study's finding is kept here beside it.";

/** The season a slide row names. `Winter 2026-27` and `Winter 2026-2027` are the same season. */
function seasonOfRow(text: string): MisoSeason | null {
  const matched = /^(Summer|Fall|Winter|Spring)\b/i.exec(text.trim());
  if (matched === null) return null;
  return MISO_SEASONS.find((season) => season.key === matched[1]!.toLowerCase()) ?? null;
}

export const misoLimitsAdapter: CapacityAdapter = {
  key: "miso-limits",
  marketSlug: "miso",
  sourceInterfaceSlug: "miso-cil-cel-results",
  // Internal only. MISO's terms were reviewed and refused, so this is never a production retrieval.
  retrievalPurpose: "research",
  artifacts: [ARTIFACT],

  parse(artifacts): CapacityExtraction {
    const artifact = artifacts.get(ARTIFACT.label);
    if (artifact === undefined) {
      throw new CapacitySourceFormatError("miso-limits", `artifact ${ARTIFACT.label} was not retrieved`);
    }
    const document = PdfDocument.open(artifact.body);
    const raw = Array.from({ length: document.pageCount }, (_, index) => document.pageText(index + 1));
    const pages = raw.map(flatten);

    const declared = /PY\s*(\d[\d\s]*\d)\s*[-–]\s*(\d[\d\s]*\d)/.exec(pages[0] ?? "");
    const planningYear = declared === null ? null
      : `${declared[1]!.replace(/\s/g, "")}-${declared[2]!.replace(/\s/g, "")}`;
    if (planningYear !== PLANNING_YEAR) {
      throw new CapacitySourceFormatError(
        "miso-limits",
        `the deck is for planning year ${planningYear ?? "an unreadable year"}, not the ${PLANNING_YEAR} this source is registered for`,
      );
    }
    const startYear = Number(PLANNING_YEAR.slice(0, 4));
    const period = (season: MisoSeason): CapacityTargetPeriod => ({
      periodBasis: "planning_year", targetYear: startYear, targetSeason: season.season,
      periodStart: null, periodEnd: null,
    });

    const records: NormalizedCapacityRecord[] = [];
    const interfaces = new Map<string, InterfaceDraft>();
    const scenarioKey = "final_results";

    const emit = (
      page: number, section: string, term: string, zone: string, season: MisoSeason,
      nativeValue: string, target: NormalizedCapacityRecord["target"], payload: Record<string, unknown> = {},
    ): void => {
      records.push({
        artifactLabel: artifact.label, nativeGeography: zone,
        nativePeriod: `${season.label}, planning year ${PLANNING_YEAR}`,
        nativeScenario: "Final CIL/CEL results", nativeTerm: term, nativeValue, nativeUnit: "MW",
        rawPayload: { planningYear: PLANNING_YEAR, season: season.label, ...payload },
        locator: {
          extractionMethod: "pdf_table", pdfPage: page, pdfTable: section, documentSection: section,
          archiveRef: `${artifact.label} (sha256 ${artifact.sha256})`,
        },
        target,
      });
    };

    for (const side of SIDES) {
      // --------------------------------------------------- the summary table, read on its own
      const summaryPage = pages.findIndex((page) => side.summary.test(page));
      if (summaryPage === -1) {
        throw new CapacitySourceFormatError("miso-limits", `the deck states no ${side.ability} summary table`);
      }
      const summary = new Map<string, Map<string, number>>();
      const summaryLines = raw[summaryPage]!.split("\n").map((line) => line.trim()).filter((line) => line !== "");
      // Each zone's summary row is its number followed by one value per season.
      for (let index = 0; index < summaryLines.length; index += 1) {
        const zoneKey = /^\d{1,2}$/.test(summaryLines[index]!) ? misoZoneKey(summaryLines[index]!) : null;
        if (zoneKey === null) continue;
        const values: number[] = [];
        for (let ahead = index + 1; ahead < summaryLines.length && values.length < MISO_SEASONS.length; ahead += 1) {
          const cell = numericCells(summaryLines[ahead]!)[0];
          if (cell === null || cell === undefined) break;
          values.push(cell);
        }
        if (values.length === MISO_SEASONS.length && !summary.has(zoneKey)) {
          summary.set(zoneKey, new Map(MISO_SEASONS.map((season, at) => [season.key, values[at]!])));
        }
      }
      if (summary.size !== MISO_ZONES.length) {
        throw new CapacitySourceFormatError(
          "miso-limits",
          `the ${side.ability} summary table yielded ${summary.size} zones where ${MISO_ZONES.length} were expected`,
        );
      }

      // ------------------------------------------------- each zone's own slide, read in detail
      let slides = 0;
      for (let page = 0; page < pages.length; page += 1) {
        if (!side.heading.test(pages[page]!)) continue;
        const lines = raw[page]!.split("\n").map((line) => line.trim()).filter((line) => line !== "");
        // The slide names its zone in the table's corner cell, as LRZ1 or LRZ 10.
        const corner = lines.find((line) => /^LRZ\s*[-–]?\s*\d{1,2}$/.test(line));
        const zoneKey = corner === undefined ? null : misoZoneKey(corner);
        if (zoneKey === null) continue;
        slides += 1;

        const interfaceKey = `${zoneKey} ${side.direction.toUpperCase()}`;
        if (!interfaces.has(interfaceKey)) {
          interfaces.set(interfaceKey, {
            nativeKey: interfaceKey,
            nativeLabel: `${zoneKey} capacity ${side.direction} interface`,
            interfaceKind: side.direction,
            fromSubareaNativeKey: side.direction === "export" ? zoneKey : null,
            toSubareaNativeKey: side.direction === "import" ? zoneKey : null,
            externalCounterparty: null,
            notes: `The boundary the ${side.limitTerm} bounds.`,
          });
        }

        const seasonsOnSlide = new Set<string>();
        for (let index = 0; index < lines.length; index += 1) {
          const season = seasonOfRow(lines[index]!);
          if (season === null) continue;
          // Within a season's row the only bare numbers are the ability and then the limit, in
          // that order; every other cell carries a unit, a percent sign, a facility name or
          // "None". The first two are taken rather than the last two because the slide ends in a
          // voltage legend whose "100" is also a bare number, and the final season on each slide
          // would otherwise read the legend as its limit.
          const bare: { value: number; text: string }[] = [];
          for (let ahead = index + 1; ahead < lines.length && bare.length < 2; ahead += 1) {
            if (seasonOfRow(lines[ahead]!) !== null) break;
            const line = lines[ahead]!;
            if (!/^\d[\d,]*$/.test(line)) continue;
            bare.push({ value: Number(line.replace(/,/g, "")), text: line });
          }
          if (bare.length < 2) continue;
          const ability = bare[0]!;
          const limit = bare[1]!;
          seasonsOnSlide.add(season.key);

          // The same ability stated twice is compared against itself.
          //
          // The check is here to catch a misreading, not to police MISO's arithmetic. A column
          // read out of place yields a number from another zone or season and diverges wildly; a
          // publisher rounding one of its own tables differently diverges by a megawatt. So a
          // large disagreement fails the source, and a small one is recorded as what it is — the
          // deck disagreeing with itself — with the detailed slide taken as the value.
          const fromSummary = summary.get(zoneKey)?.get(season.key);
          if (fromSummary !== undefined && fromSummary !== ability.value) {
            const divergence = Math.abs(fromSummary - ability.value) / Math.max(Math.abs(fromSummary), Math.abs(ability.value), 1);
            if (divergence > 0.01) {
              throw new CapacitySourceFormatError(
                "miso-limits",
                `${zoneKey} ${season.label}: the summary table states ${side.ability} ${fromSummary} but the zone slide states ${ability.value}; a divergence this large means the table has been misread`,
              );
            }
            emit(summaryPage + 1, `${side.ability} summary`, `${side.abilityTerm}, as the summary table states it`,
              zoneKey, season, String(fromSummary), {
                kind: "evidence_only",
                reason: `The deck states this zone's ${side.ability} twice and the two disagree: the summary table says ${fromSummary} and the zone's own slide says ${ability.value}. The slide is the detailed statement and is the one carried forward; the summary's figure is kept here so the disagreement is visible in the data rather than resolved silently.`,
              }, { zone: zoneKey, disagreesWith: ability.value });
          }

          emit(page + 1, `${side.limit} results`, side.abilityTerm, zoneKey, season, ability.text,
            { kind: "evidence_only", reason: ABILITY_REASON }, { zone: zoneKey });
          emit(page + 1, `${side.limit} results`, side.limitTerm, zoneKey, season, limit.text, {
            kind: "constraint", scenarioKey, constraintKind: side.constraintKind,
            direction: side.direction as Direction, interfaceNativeKey: interfaceKey,
            subareaNativeKey: zoneKey, period: period(season), value: limit.value, unit: "MW",
          }, { zone: zoneKey });
        }
        if (seasonsOnSlide.size !== MISO_SEASONS.length) {
          throw new CapacitySourceFormatError(
            "miso-limits",
            `${zoneKey} ${side.limit} slide states ${seasonsOnSlide.size} seasons where ${MISO_SEASONS.length} were expected`,
          );
        }
      }
      if (slides !== MISO_ZONES.length) {
        throw new CapacitySourceFormatError(
          "miso-limits",
          `found ${slides} ${side.limit} zone slides where ${MISO_ZONES.length} were expected`,
        );
      }
    }

    // ----------------------------------------------- the zones' membership, from the artifact
    const membership = readZoneMembership(raw, pages);
    const subareas: SubareaDraft[] = MISO_ZONES.map((zone) => ({
      nativeKey: zone.nativeKey,
      nativeLabel: zone.nativeLabel,
      subareaKind: "lrz",
      notes: membership.get(zone.nativeKey) === undefined
        ? "A MISO Local Resource Zone."
        : `A MISO Local Resource Zone, comprising the local balancing authorities ${membership.get(zone.nativeKey)}.`,
    }));

    return {
      vintage: {
        nativeVintageKey: `cil-cel-${PLANNING_YEAR}`,
        nativeReportId: `PY ${PLANNING_YEAR} CIL/CEL Results`,
        reportTitle: `MISO Planning Year ${PLANNING_YEAR} Capacity Import and Export Limit Results`,
        releaseKind: "study",
        publishedAt: `${startYear - 1}-10-30T00:00:00Z`,
        publishedAtPrecision: "day",
        sourceMethodologyName: "MISO capacity import and export limit study",
        sourceMethodologyVersion: `Planning Year ${PLANNING_YEAR}`,
        publicationState: "internal_only",
        qualityStatus: "accepted",
      },
      scenarios: [{
        nativeScenarioKey: scenarioKey,
        nativeScenarioLabel: `Planning Year ${PLANNING_YEAR} final CIL/CEL results`,
        canonicalClass: "reference",
        isReference: true,
        assumptions: { planningYear: PLANNING_YEAR, stage: "final" },
        assumptionsText:
          "The final limits for the planning year. MISO states that any adjustment between this "
          + "posting and the Planning Resource Auction would be due to controllable export changes.",
      }],
      subareas,
      interfaces: [...interfaces.values()],
      records,
    };
  },
};

/** The zone-to-balancing-authority table the deck ends with, read from the deck. */
function readZoneMembership(raw: readonly string[], pages: readonly string[]): Map<string, string> {
  const membership = new Map<string, string>();
  const page = pages.findIndex((flat) => /Local\s*Resource\s*Zone\s*Local\s*Balancing\s*Authorities/.test(flat));
  if (page === -1) return membership;
  const lines = raw[page]!.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\d{1,2}$/.test(lines[index]!)) continue;
    const zoneKey = misoZoneKey(lines[index]!);
    const authorities = lines[index + 1];
    if (zoneKey === null || authorities === undefined) continue;
    if (!/^[A-Z][A-Za-z0-9, ]+$/.test(authorities) || !authorities.includes(",")) continue;
    if (!membership.has(zoneKey)) membership.set(zoneKey, authorities);
  }
  return membership;
}
