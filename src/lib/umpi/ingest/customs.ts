/**
 * Korea Customs adapter for monthly DRAM-chip export value and weight.
 *
 * ## Transport
 *
 * The official trade-statistics portal, `tradedata.go.kr`, answers its own query without a
 * login: a GET of the public index establishes the session the UI itself uses, then the page's
 * own form POST returns JSON. That is the transport UMPI uses, because the data.go.kr API
 * carrying the same figures requires a service key whose registration needs Korean identity
 * verification, and the portal does not.
 *
 * The result page carries 공공누리 제1유형 — attribution, commercial use and derivatives all
 * permitted — so this is a documented public reuse of a public query, not a way around a gate.
 *
 * ## The aggregation decision, which is the whole of this file's risk
 *
 * Series B measures **Korea's total** monthly exports of HSK 8542321010. This query is the
 * 품목별 (by-item) view: it carries `cntyCd` and `cntyNm` as **empty** fields and returns one
 * row per month for the whole country. No country filter is sent, and a response that carries a
 * populated country field is refused rather than aggregated — summing partner rows, with no
 * documented aggregate code to reconcile against, is the specific way this product could
 * quietly become a fiction.
 *
 * ## Two properties of this payload that will ruin the series if missed
 *
 * 1. **`expUsdAmt` is thousand USD**, per the portal's own unit line (킬로그램(KG), 천 달러).
 *    Read as dollars it understates Korean DRAM exports by three orders of magnitude while
 *    looking entirely plausible. The conversion happens here, once, and is asserted by test.
 * 2. **The response includes a `총계` total row, and it is the sum of the monthly rows.**
 *    Verified 22 September 2026: the four months of 2026-05..08 sum to 630,531 kg against the
 *    total row's 630,532, and to 51,888,695 against 51,888,696 thousand USD. Admitting it
 *    alongside the months would double every figure. It is rejected on two independent
 *    grounds — its period is not a month, and its `hsSgn` is empty.
 */

import { identityKey } from "../identity";
import { observationProvenanceHash, payloadDigest } from "../provenance";
import { admit } from "../validate";
import type { ReferenceMonth, UmpiRawObservation, UmpiSourceIdentity } from "../types";
import { UmpiIdentityMismatchError, UmpiParseError, UmpiProviderError } from "./errors";
import { fetchText, redactUrl, type HttpOptions } from "./http";
import type { FetchRange, ParseResult, ParsedRow, SourceFetchResult, UmpiSourceAdapter } from "./types";

export const CUSTOMS_PORTAL_ORIGIN = "https://tradedata.go.kr";
/** Establishes the public session the portal's own UI uses. No login, no key. */
export const CUSTOMS_SESSION_URL = `${CUSTOMS_PORTAL_ORIGIN}/cts/index.do`;
/** The portal's own query endpoint, as the 품목별 page calls it. */
export const CUSTOMS_QUERY_URL = `${CUSTOMS_PORTAL_ORIGIN}/cts/hmpg/retrieveTrade.do`;
/** The by-item view: no country dimension. */
export const CUSTOMS_TRADE_KIND = "ETS_MNK_1020000A";
/** Weight in kilograms. The form's own default is tonnes, which would be a silent 1000× error. */
export const CUSTOMS_WEIGHT_KG = "1";
/** Declaration-acceptance basis, the portal's default for this table. */
export const CUSTOMS_STATS_BASE = "acptDd";
/** The dataset identity recorded in the registry for this transport. */
export const CUSTOMS_PORTAL_DATASET_ID = "15101609";
/** The country-dimension dataset, named only to refuse it. */
export const CUSTOMS_COUNTRY_DIMENSION_DATASET_ID = "15100475";

/** `expUsdAmt` is thousand USD. This is the only place that conversion happens. */
export const CUSTOMS_USD_SCALE = 1000;

export const CUSTOMS_FIELDS = {
  period: "priodTitle",
  hsCode: "hsSgn",
  koreanName: "korePrlstNm",
  exportWeightKg: "expTtwg",
  exportValueThousandUsd: "expUsdAmt",
} as const;

/** Any populated one of these means the response carries a country breakdown. */
const COUNTRY_FIELDS = ["cntyCd", "cntyNm"] as const;

/** `2026.05`, `2026-05`, `202605`. A bare year, or `총계`, is not a month. */
const MONTH_TOKEN = /^(\d{4})[.\-/]?(0[1-9]|1[0-2])$/;

export function toCustomsMonth(month: ReferenceMonth): string {
  return month.replace("-", "");
}

export function fromCustomsPeriod(token: string): ReferenceMonth | null {
  const match = MONTH_TOKEN.exec(token.trim());
  return match ? `${match[1]}-${match[2]}` : null;
}

/** Portal figures arrive space-padded and comma-grouped. */
function numeric(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim().replace(/,/g, "");
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function assertPortalDataset(identity: UmpiSourceIdentity): void {
  if (identity.kind !== "kcs_trade_commodity") return;
  if (identity.datasetId === CUSTOMS_COUNTRY_DIMENSION_DATASET_ID) {
    throw new UmpiIdentityMismatchError(
      `dataset ${CUSTOMS_COUNTRY_DIMENSION_DATASET_ID} is the country-dimension operation; Series B needs Korea-wide totals`,
      CUSTOMS_PORTAL_DATASET_ID,
      identity.datasetId,
    );
  }
  if (identity.datasetId !== CUSTOMS_PORTAL_DATASET_ID) {
    throw new UmpiIdentityMismatchError(
      `UMPI V1 reads Customs dataset ${CUSTOMS_PORTAL_DATASET_ID}; refusing ${identity.datasetId}`,
      CUSTOMS_PORTAL_DATASET_ID,
      identity.datasetId,
    );
  }
}

export function buildCustomsQueryBody(input: {
  identity: Extract<UmpiSourceIdentity, { kind: "kcs_trade_commodity" }>;
  range: FetchRange;
  rowLimit?: number;
}): string {
  const { identity, range, rowLimit } = input;
  const body = new URLSearchParams();
  body.set("tradeKind", CUSTOMS_TRADE_KIND);
  body.set("priodKind", "MON");
  body.set("statsBase", CUSTOMS_STATS_BASE);
  body.set("ttwgTpcd", CUSTOMS_WEIGHT_KG);
  body.set("hsSgnGrpCol", "HS10_SGN");
  body.set("hsSgnWhrCol", "HS10_SGN");
  body.set("hsSgn", identity.hsCode);
  // The portal's period selector values carry a trailing space; the form submits them as-is.
  body.set("priodFr", `${toCustomsMonth(range.fromMonth)} `);
  body.set("priodTo", `${toCustomsMonth(range.toMonth)} `);
  // Large enough that every month in the window comes back on one page, plus the total row.
  body.set("showPagingLine", String(rowLimit ?? 500));
  // Deliberately absent: any country parameter. Its presence would change the economic object.
  return body.toString();
}

type PortalRow = Record<string, unknown>;

export function parseCustomsPayload(input: { identity: UmpiSourceIdentity; payload: string }): ParseResult {
  const { identity, payload } = input;
  if (identity.kind !== "kcs_trade_commodity") {
    throw new UmpiParseError("the Customs parser was given a non-Customs identity");
  }
  assertPortalDataset(identity);

  let document: unknown;
  try {
    document = JSON.parse(payload);
  } catch (error) {
    throw new UmpiParseError("the Customs portal response is not JSON", { cause: error });
  }
  if (document === null || typeof document !== "object") {
    throw new UmpiParseError("the Customs portal response is not an object");
  }

  const envelope = document as Record<string, unknown>;
  const result = envelope.searchresult;
  if (result !== undefined && result !== null && String(result) !== "OK") {
    throw new UmpiProviderError(
      `the Customs portal reported ${String(result)}`,
      String(result),
      typeof envelope.message === "string" ? envelope.message : null,
    );
  }
  const items = envelope.items;
  if (items === undefined) {
    throw new UmpiParseError("the Customs portal response carries no items");
  }
  if (!Array.isArray(items)) {
    throw new UmpiParseError("the Customs portal items field is not an array");
  }

  const rows: ParsedRow[] = [];
  for (const entry of items as PortalRow[]) {
    const record = { ...entry };

    const country = COUNTRY_FIELDS.find((field) => String(record[field] ?? "").trim() !== "");
    if (country) {
      throw new UmpiIdentityMismatchError(
        `the Customs response carries a country dimension (${country}); UMPI reads the by-item view only`,
        "by-item, no country dimension",
        `country-bearing row (${country})`,
      );
    }

    const periodRaw = String(record[CUSTOMS_FIELDS.period] ?? "");
    const referenceMonth = fromCustomsPeriod(periodRaw);
    if (referenceMonth === null) {
      // The 총계 row lands here, and must: it is the sum of the months beside it, so admitting
      // it would double the series.
      rows.push({
        state: "rejected",
        code: periodRaw.trim() === "총계" ? "summary_row" : "malformed_reference_month",
        detail: `${CUSTOMS_FIELDS.period} ${JSON.stringify(periodRaw)} is not a single month`,
        rawPayload: record,
      });
      continue;
    }

    const hsCode = String(record[CUSTOMS_FIELDS.hsCode] ?? "").trim();
    if (hsCode !== identity.hsCode) {
      rows.push({
        state: "rejected",
        code: "hs_code_mismatch",
        detail: hsCode === "" ? "row carries no HS code" : `row is ${hsCode}, series is ${identity.hsCode}`,
        rawPayload: record,
      });
      continue;
    }

    if (record[CUSTOMS_FIELDS.exportValueThousandUsd] === undefined || record[CUSTOMS_FIELDS.exportWeightKg] === undefined) {
      throw new UmpiParseError(
        `a Customs row is missing ${CUSTOMS_FIELDS.exportValueThousandUsd} or ${CUSTOMS_FIELDS.exportWeightKg}; fields present: ${Object.keys(record).slice(0, 20).join(", ")}`,
      );
    }

    const exportWeightKg = numeric(record[CUSTOMS_FIELDS.exportWeightKg]);
    const thousandUsd = numeric(record[CUSTOMS_FIELDS.exportValueThousandUsd]);
    if (exportWeightKg === null || thousandUsd === null) {
      rows.push({
        state: "rejected",
        code: "non_numeric_value",
        detail: `export value or weight is not numeric for ${referenceMonth}`,
        rawPayload: record,
      });
      continue;
    }

    const observation: UmpiRawObservation = {
      kind: "kcs_trade_month",
      referenceMonth,
      // The conversion, in one place. The portal publishes thousands of dollars.
      exportValueUsd: thousandUsd * CUSTOMS_USD_SCALE,
      exportWeightKg,
    };

    const admission = admit({ expectedIdentity: identity, actualIdentity: identity, observation });
    if (admission.state === "rejected") {
      rows.push({ state: "rejected", code: admission.code, detail: admission.detail, rawPayload: record });
      continue;
    }

    rows.push({
      state: "admitted",
      identity,
      observation,
      rawPayload: record,
      provenanceHash: observationProvenanceHash({ identity, observation }),
    });
  }

  const months = rows
    .filter((row): row is Extract<ParsedRow, { state: "admitted" }> => row.state === "admitted")
    .map((row) => row.observation.referenceMonth);
  const duplicates = months.filter((month, index) => months.indexOf(month) !== index);
  if (duplicates.length > 0) {
    throw new UmpiIdentityMismatchError(
      `the Customs response carries more than one row for ${[...new Set(duplicates)].join(", ")}; the by-item view returns one row per month and these must not be summed`,
      "one row per month",
      `${months.length} rows for ${new Set(months).size} months`,
    );
  }

  return {
    rows,
    sourceMetadata: {
      datasetId: identity.datasetId,
      hsCode: identity.hsCode,
      transport: "tradedata.go.kr retrieveTrade.do",
      aggregation: "by item, Korea-wide, no country dimension",
      weightUnit: "kg",
      valueUnit: "thousand_usd_converted_to_usd",
      declaredCount: envelope.count ?? null,
      itemCount: items.length,
      koreanName: (items as PortalRow[]).map((row) => String(row[CUSTOMS_FIELDS.koreanName] ?? "")).find((name) => name !== "") ?? null,
    },
  };
}

export function createCustomsAdapter(options: HttpOptions = {}): UmpiSourceAdapter<string> {
  return {
    name: "kcs-tradedata-item-query",
    seriesCode: "UMPI-KR-DRAM-EXPORT-UV",
    identityKind: "kcs_trade_commodity",
    // No credential. The portal query is public; the field is kept for interface shape.
    credentialEnv: "",
    parse: parseCustomsPayload,
    async fetch({ identity, range }): Promise<SourceFetchResult> {
      if (identity.kind !== "kcs_trade_commodity") {
        throw new UmpiParseError("the Customs adapter was given a non-Customs identity");
      }
      assertPortalDataset(identity);

      // Establish the public session the portal's own UI uses, and carry its cookies forward.
      const session = await fetchText(CUSTOMS_SESSION_URL, { ...options, method: "GET" });
      const body = buildCustomsQueryBody({ identity, range });
      const response = await fetchText(CUSTOMS_QUERY_URL, {
        ...options,
        method: "POST",
        body,
        cookies: session.cookies,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-requested-with": "XMLHttpRequest",
          referer: CUSTOMS_SESSION_URL,
        },
      });

      const parsed = parseCustomsPayload({ identity, payload: response.body });
      const admitted = parsed.rows.filter((row) => row.state === "admitted").length;
      const expectedMonths = monthsBetween(range.fromMonth, range.toMonth);
      const complete = admitted === expectedMonths;

      return {
        ...parsed,
        enumerationAssessment: complete ? "complete" : "unknown",
        enumerationEvidence: `${admitted} month(s) admitted for a ${expectedMonths}-month window ${range.fromMonth}..${range.toMonth}`,
        payloadDigest: payloadDigest(parsed.rows.map((row) => row.rawPayload)),
        retrievedAt: new Date().toISOString(),
        requestUrl: redactUrl(CUSTOMS_QUERY_URL),
        requestParameters: {
          transport: "tradedata.go.kr",
          tradeKind: CUSTOMS_TRADE_KIND,
          priodKind: "MON",
          statsBase: CUSTOMS_STATS_BASE,
          ttwgTpcd: CUSTOMS_WEIGHT_KG,
          hsSgn: identity.hsCode,
          priodFr: toCustomsMonth(range.fromMonth),
          priodTo: toCustomsMonth(range.toMonth),
          countryParameter: "none — by-item view",
        },
        httpStatus: response.status,
        contentType: response.contentType,
        responseByteLength: response.byteLength,
      };
    },
  };
}

/** Inclusive month count, for the completeness check. */
export function monthsBetween(from: ReferenceMonth, to: ReferenceMonth): number {
  const [fy, fm] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm) + 1;
}

export const CUSTOMS_EXPECTED_IDENTITY_KEY = `kcs:8542321010/${CUSTOMS_PORTAL_DATASET_ID}`;

export function assertCustomsIdentity(identity: UmpiSourceIdentity): void {
  const key = identityKey(identity);
  if (key !== CUSTOMS_EXPECTED_IDENTITY_KEY) {
    throw new UmpiIdentityMismatchError(
      `UMPI V1 reads ${CUSTOMS_EXPECTED_IDENTITY_KEY}; refusing ${key}`,
      CUSTOMS_EXPECTED_IDENTITY_KEY,
      key,
    );
  }
}
