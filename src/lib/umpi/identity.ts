/**
 * Source-series identity, and the one mistake this module exists to prevent.
 *
 * Phase 2C verified, live, that item code `30911201AA` is the DRAM item in BOTH BOK tables:
 * `404Y016` (producer prices) and `402Y016` (export prices). They return different numbers for
 * the same month, and `402Y016` carries a currency-basis dimension with three values, so a
 * single month there has three answers. An adapter keyed on the item code alone would publish
 * the wrong statistic and would look entirely correct while doing it.
 *
 * So a BOK identity is the triple `(statCode, itemCode, cycle)` plus any group dimensions the
 * table carries, and nothing here accepts less than that.
 */

import type { BokSeriesIdentity, CustomsSeriesIdentity, UmpiSourceIdentity, UmpiSeriesCode } from "./types";

/** The producer price index by commodity. Series A's table, and the only BOK table V1 reads. */
export const BOK_PPI_BY_COMMODITY_STAT_CODE = "404Y016";
/** The DRAM commodity item, verified live on 2026-09-22 as item name "DRAM", unit 2020=100. */
export const BOK_DRAM_ITEM_CODE = "30911201AA";
/** HSK 8542321010 — 디램. SRAM, flash and MCP are sibling codes and are not this one. */
export const KCS_DRAM_CHIP_HS_CODE = "8542321010";
/**
 * data.go.kr 관세청_품목별 수출입실적 — aggregated **by HS code**, no country dimension. One row
 * per commodity per month, which is what a Korea-wide export total requires.
 */
export const KCS_ITEM_TRADE_DATASET_ID = "15101609";
/**
 * data.go.kr 관세청_품목별 **국가별** 수출입실적 — aggregated by country AND HS code, with `cntyCd`
 * required. Named here only so it can be refused: Phase 3 bound Series B to it by mistake, and
 * reading it would mean publishing one trading partner as Korea, or summing country rows with
 * no documented aggregate to reconcile against.
 */
export const KCS_ITEM_COUNTRY_TRADE_DATASET_ID = "15100475";

/**
 * BOK tables this codebase refuses to read in V1, with the reason.
 *
 * `402Y016` is the DRAM *export price* index. The methodology defers it: choosing among its
 * KRW, USD and contract-currency bases changes what the series means, and that decision has
 * not been made. Deferring it in a comment would not stop an adapter from reading it, so it is
 * refused here and by a database constraint.
 */
export const DEFERRED_BOK_STAT_CODES: Readonly<Record<string, string>> = {
  "402Y016": "the DRAM export price index is deferred: its currency basis is an unmade methodology decision",
  "402Y014": "the export price index basic classification carries no DRAM item, only a semiconductor aggregate",
} as const;

const STAT_CODE_PATTERN = /^\d{3}Y\d{3}$/;
const ITEM_CODE_PATTERN = /^[0-9A-Z]{6,20}$/;
const HS_CODE_PATTERN = /^\d{10}$/;
const DATASET_ID_PATTERN = /^\d{6,10}$/;

export class UmpiIdentityError extends Error {}

/**
 * Build a BOK identity, refusing anything that is not a complete, permitted one.
 *
 * `groupDimensions` must be supplied explicitly even when empty, so that "this table has no
 * dimensions" is a statement someone made rather than a default someone inherited.
 */
export function bokSeriesIdentity(input: {
  statCode: string;
  itemCode: string;
  cycle: BokSeriesIdentity["cycle"];
  groupDimensions: Record<string, string>;
}): BokSeriesIdentity {
  const { statCode, itemCode, cycle, groupDimensions } = input;

  if (!STAT_CODE_PATTERN.test(statCode)) {
    throw new UmpiIdentityError(`not a BOK statistic table code: ${JSON.stringify(statCode)}`);
  }
  if (!ITEM_CODE_PATTERN.test(itemCode)) {
    throw new UmpiIdentityError(`not a BOK item code: ${JSON.stringify(itemCode)}`);
  }
  const deferral = DEFERRED_BOK_STAT_CODES[statCode];
  if (deferral) {
    throw new UmpiIdentityError(`BOK table ${statCode} is not available to UMPI V1: ${deferral}`);
  }
  // A table that carries dimensions must have them named. 404Y016 carries none; a future table
  // that does cannot be read as though a single item code identified one series.
  return { kind: "bok_ecos_series", statCode, itemCode, cycle, groupDimensions: { ...groupDimensions } };
}

export function customsSeriesIdentity(input: { hsCode: string; datasetId: string }): CustomsSeriesIdentity {
  const { hsCode, datasetId } = input;
  if (!HS_CODE_PATTERN.test(hsCode)) {
    throw new UmpiIdentityError(`not a ten-digit HSK code: ${JSON.stringify(hsCode)}`);
  }
  if (!DATASET_ID_PATTERN.test(datasetId)) {
    throw new UmpiIdentityError(`not a data.go.kr dataset id: ${JSON.stringify(datasetId)}`);
  }
  return { kind: "kcs_trade_commodity", hsCode, datasetId };
}

/** The identity each V1 series is read from. Frozen; mirrors `reference.umpi_source_series`. */
export function productionIdentityFor(seriesCode: UmpiSeriesCode): UmpiSourceIdentity {
  switch (seriesCode) {
    case "UMPI-KR-DRAM-PPI":
      return bokSeriesIdentity({
        statCode: BOK_PPI_BY_COMMODITY_STAT_CODE,
        itemCode: BOK_DRAM_ITEM_CODE,
        cycle: "M",
        groupDimensions: {},
      });
    case "UMPI-KR-DRAM-EXPORT-UV":
      return customsSeriesIdentity({
        hsCode: KCS_DRAM_CHIP_HS_CODE,
        datasetId: KCS_ITEM_TRADE_DATASET_ID,
      });
  }
}

/**
 * A stable, human-unreadable key for an identity.
 *
 * Deliberately built from codes only: a display name is not an identifier, and a series whose
 * key moved because someone improved a label would lose its history.
 */
export function identityKey(identity: UmpiSourceIdentity): string {
  if (identity.kind === "bok_ecos_series") {
    const dimensions = Object.keys(identity.groupDimensions)
      .sort()
      .map((key) => `${key}=${identity.groupDimensions[key]}`)
      .join(",");
    const suffix = dimensions ? `/${dimensions}` : "";
    return `bok:${identity.statCode}/${identity.itemCode}/${identity.cycle}${suffix}`;
  }
  return `kcs:${identity.hsCode}/${identity.datasetId}`;
}

/** Whether an observed identity is the one a series is bound to. Compared on codes, not names. */
export function identityMatches(expected: UmpiSourceIdentity, actual: UmpiSourceIdentity): boolean {
  return identityKey(expected) === identityKey(actual);
}
