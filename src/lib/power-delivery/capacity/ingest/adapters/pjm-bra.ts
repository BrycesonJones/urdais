/**
 * PJM — Base Residual Auction results.
 *
 * What the auction actually procured, by area, in unforced capacity. This is the capability half
 * of PJM: the planning parameters say what was required, and this says what cleared against it.
 *
 * Two things the narrative report states are deliberately not here. The capacity committed by
 * Fixed Resource Requirement entities, and the RTO total that adds it to the cleared figure,
 * appear only as sentences in the PDF and in no published table or workbook; and the workbook's
 * own RTO figure counts participant offers while the report's counts price responsive demand too,
 * so the two are not the same quantity under one name. Both are recorded as deferrals rather than
 * guessed at, which is why no `cleared UCAP + FRR UCAP` total is computed anywhere.
 *
 * Areas nest. MAAC contains EMAAC, which contains PS; each area's cleared figure already counts
 * everything inside it. Nothing here adds them, and `refuseNestedSubareaTotal` exists to stop
 * anything later doing so.
 */

import {
  CapacitySourceFormatError,
  type CapacityAdapter, type CapacityExtraction, type CapacityTargetPeriod,
  type NormalizedCapacityRecord, type SubareaDraft,
} from "@/lib/power-delivery/capacity/ingest/types";
import { pjmAreaKey } from "@/lib/power-delivery/capacity/ingest/adapters/pjm-parameters";
import { XlsxWorkbook } from "@/lib/power-delivery/planning/xlsx/workbook";

const DELIVERY_YEAR = "2026/2027";
const ARTIFACT = {
  label: "bra-results-2026-2027",
  url: "https://www.pjm.com/-/media/DotCom/markets-ops/rpm/rpm-auction-info/2026-2027/2026-2027-bra-results.xlsx",
} as const;

const SHEET = "Summary";
const RTO = "RTO";
/** The heading above the cleared quantities, and the one above the clearing prices. */
const CLEARED_HEADING = "Participant Sell Offers Cleared";
const PRICE_HEADING = "Resource Clearing Prices [$/MW-day]";

export const pjmBraAdapter: CapacityAdapter = {
  key: "pjm-bra",
  marketSlug: "pjm",
  sourceInterfaceSlug: "pjm-bra-results",
  retrievalPurpose: "production",
  artifacts: [ARTIFACT],

  parse(artifacts): CapacityExtraction {
    const artifact = artifacts.get(ARTIFACT.label);
    if (artifact === undefined) {
      throw new CapacitySourceFormatError("pjm-bra", `artifact ${ARTIFACT.label} was not retrieved`);
    }
    const workbook = XlsxWorkbook.open(artifact.body);
    if (!workbook.hasSheet(SHEET)) {
      throw new CapacitySourceFormatError(
        "pjm-bra", `workbook has no sheet "${SHEET}"; it has ${workbook.sheetNames().join(", ")}`,
      );
    }
    const sheet = workbook.sheet(SHEET);
    const textAt = (row: number, column: string): string | null =>
      sheet.rows.find((candidate) => candidate.row === row)?.cells.get(column)?.value?.replace(/\s+/g, " ").trim() ?? null;

    const title = textAt(1, "A") ?? "";
    const declaredYear = /^(\d{4}\/\d{4})/.exec(title)?.[1] ?? null;
    if (declaredYear === null) {
      throw new CapacitySourceFormatError("pjm-bra", `${SHEET} cell A1 does not open with a delivery year; it reads "${title}"`);
    }
    if (declaredYear !== DELIVERY_YEAR) {
      throw new CapacitySourceFormatError(
        "pjm-bra",
        `the artifact is for delivery year ${declaredYear}, not the ${DELIVERY_YEAR} this source is registered for`,
      );
    }
    const startYear = Number(declaredYear.slice(0, 4));
    const period: CapacityTargetPeriod = {
      periodBasis: "delivery_year", targetYear: startYear, targetSeason: null,
      periodStart: `${startYear}-06-01`, periodEnd: `${startYear + 1}-05-31`,
    };

    /** The row carrying a heading, so a block is found by what it says rather than by position. */
    const headingRow = (heading: string): number => {
      const found = sheet.rows.find((row) => row.cells.get("A")?.value?.replace(/\s+/g, " ").trim() === heading
        || row.cells.get("B")?.value?.replace(/\s+/g, " ").trim() === heading);
      if (found === undefined) {
        throw new CapacitySourceFormatError("pjm-bra", `${SHEET} no longer carries the heading "${heading}"`);
      }
      return found.row;
    };

    const records: NormalizedCapacityRecord[] = [];
    const subareas = new Map<string, SubareaDraft>();
    const scenarioKey = "base_residual_auction";

    const locate = (row: number, column: string) => ({
      extractionMethod: "workbook_cell" as const,
      workbookSheet: sheet.name, workbookCell: `${column}${row}`,
      archiveRef: `${artifact.label} (sha256 ${artifact.sha256})`,
      archiveMember: sheet.part, archiveMemberHash: sheet.partSha256,
    });

    const emit = (
      row: number, column: string, term: string, geography: string,
      nativeValue: string, nativeUnit: string, target: NormalizedCapacityRecord["target"],
      payload: Record<string, unknown> = {},
    ): void => {
      records.push({
        artifactLabel: artifact.label, nativeGeography: geography, nativePeriod: declaredYear,
        nativeScenario: "Base Residual Auction", nativeTerm: term, nativeValue, nativeUnit,
        rawPayload: { sheet: SHEET, deliveryYear: declaredYear, ...payload },
        locator: locate(row, column), target,
      });
    };

    /** Walk the `LDA | value` rows under a heading until the block runs out. */
    const walkBlock = (from: number, onRow: (row: number, label: string, raw: string) => void): number => {
      let seen = 0;
      for (const row of sheet.rows.filter((candidate) => candidate.row > from)) {
        const label = row.cells.get("A")?.value?.replace(/\s+/g, " ").trim();
        const raw = row.cells.get("B")?.value?.trim();
        if (label == null || label === "") {
          // A blank row is a spacer before the block; once rows have been read it ends the block.
          if (seen > 0) break;
          continue;
        }
        if (raw == null || raw === "" || !Number.isFinite(Number(raw.replace(/,/g, "")))) {
          // The column header sits between the heading and the data and is not a row of it.
          if (seen > 0) break;
          continue;
        }
        onRow(row.row, label, raw);
        seen += 1;
      }
      return seen;
    };

    // ------------------------------------------------------------------- cleared capability
    const clearedFrom = headingRow(CLEARED_HEADING);
    const cleared = walkBlock(clearedFrom, (row, label, raw) => {
      const key = label === RTO ? null : pjmAreaKey(label);
      if (key !== null && !subareas.has(key)) {
        subareas.set(key, {
          nativeKey: key, nativeLabel: label, subareaKind: "lda",
          notes:
            "A PJM locational deliverability area. Areas nest, so this area's cleared capacity "
            + "already counts every area inside it and no total across areas is ever taken.",
        });
      }
      emit(row, "B", CLEARED_HEADING, key ?? RTO, raw, "MW", {
        kind: "component", scenarioKey, quantityKind: "capability",
        componentKind: "procured_capacity",
        // PJM clears and commits capacity in unforced terms.
        capacityBasis: "ucap",
        subareaNativeKey: key, interfaceNativeKey: null,
        period, value: Number(raw.replace(/,/g, "")), unit: "MW",
      }, { area: label, nested: key !== null });
    });
    if (cleared === 0) {
      throw new CapacitySourceFormatError("pjm-bra", `${SHEET} states no cleared quantities under "${CLEARED_HEADING}"`);
    }

    // --------------------------------------------------------------------------- prices
    const priceFrom = headingRow(PRICE_HEADING);
    walkBlock(priceFrom, (row, label, raw) => {
      emit(row, "B", "Resource Clearing Price", label === RTO ? RTO : pjmAreaKey(label), raw, "$/MW-day", {
        kind: "evidence_only",
        reason: "a resource clearing price is money per megawatt-day; it is a price, not a capacity, and the capacity tables are denominated in MW",
      }, { area: label });
    });

    return {
      vintage: {
        nativeVintageKey: `bra-results-${declaredYear.replace("/", "-")}`,
        nativeReportId: `${declaredYear} Base Residual Auction results`,
        reportTitle: `PJM ${declaredYear} Base Residual Auction Summary of Auction Results`,
        releaseKind: "auction_result",
        // The auction for a delivery year settles before the year begins; the workbook states no
        // date of its own, so the release is dated to the start of the delivery period it is about.
        publishedAt: `${startYear}-06-01T00:00:00Z`,
        publishedAtPrecision: "year",
        sourceMethodologyName: "PJM Reliability Pricing Model",
        sourceMethodologyVersion: `${declaredYear} Base Residual Auction`,
        publicationState: "internal_only",
        qualityStatus: "accepted",
      },
      scenarios: [{
        nativeScenarioKey: scenarioKey,
        nativeScenarioLabel: `${declaredYear} Base Residual Auction`,
        canonicalClass: "reference",
        isReference: true,
        assumptions: { deliveryYear: declaredYear, auction: "Base Residual Auction" },
        assumptionsText:
          "What the Base Residual Auction procured. Incremental auctions later in the delivery year "
          + "restate the committed quantity and are not in this release.",
      }],
      subareas: [...subareas.values()],
      interfaces: [],
      records,
    };
  },
};
