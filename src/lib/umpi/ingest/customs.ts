/**
 * Korea Customs adapter for monthly DRAM-chip export value and weight.
 *
 * ## The aggregation decision, which is the whole of this file's risk
 *
 * Series B measures **Korea's total exports** of HSK 8542321010 in a month. The Customs portal
 * publishes two different operations, and only one of them answers that question:
 *
 *   * `Itemtrade/getItemtradeList` (data.go.kr **15101609**, 관세청_품목별 수출입실적) —
 *     "HS Code(2/4/6/10단위) 기준으로 집계한 품목별 수출입무역통계": aggregated **by HS code**.
 *     One row per code per month. No country dimension. **This is what UMPI reads.**
 *
 *   * `nitemtrade/getNitemtradeList` (data.go.kr **15100475**, 관세청_품목별 **국가별** 수출입실적) —
 *     "국가 및 HS Code별 기준으로 집계한 **국가별** 품목별 수출입무역통계": aggregated by country
 *     **and** HS code, with `cntyCd` a required parameter. **UMPI does not read this.**
 *
 * Reading the country-dimension operation would leave two bad options and no good one: request
 * a single `cntyCd` and publish one trading partner as though it were Korea, or request many and
 * sum rows that may or may not already include a total, with no documented aggregate code to
 * check against. Both produce a number that looks like Korean exports and is not. The aggregate
 * operation removes the question rather than answering it carefully.
 *
 * This adapter therefore **refuses** the country-dimension identity outright, and rejects any
 * row that carries a country field — if one appears, the request is on the wrong operation and
 * the correct response is to fail, not to aggregate.
 */

import { childText, childrenNamed, parseXml, XmlFormatError, type XmlElement } from "@/lib/interconnection-queue/xml/document";

import { identityKey } from "../identity";
import { observationProvenanceHash, payloadDigest } from "../provenance";
import { admit } from "../validate";
import type { ReferenceMonth, UmpiRawObservation, UmpiSourceIdentity } from "../types";
import { UmpiIdentityMismatchError, UmpiParseError, UmpiProviderError } from "./errors";
import { fetchText, redactUrl, type HttpOptions } from "./http";
import type { FetchRange, ParseResult, ParsedRow, SourceFetchResult, UmpiSourceAdapter } from "./types";

export const CUSTOMS_ITEM_TRADE_URL = "https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList";
/** The aggregate-by-item dataset. Named here so a reviewer can check it against the registry. */
export const CUSTOMS_ITEM_TRADE_DATASET_ID = "15101609";
/** The country-dimension dataset. Named only to refuse it. */
export const CUSTOMS_COUNTRY_DIMENSION_DATASET_ID = "15100475";

/**
 * Response element names, stated rather than guessed.
 *
 * A missing field raises a parse error naming what was expected and what arrived, so that a
 * change at the agency produces one precise failure in one place instead of a silent zero.
 */
export const CUSTOMS_FIELDS = {
  period: "year",
  hsCode: "hsCd",
  exportValueUsd: "expDlr",
  exportWeightKg: "expWgt",
  importValueUsd: "impDlr",
  importWeightKg: "impWgt",
} as const;

/**
 * Any of these appearing on a row means the response carries a country breakdown, which means
 * the request went to the wrong operation.
 */
const COUNTRY_FIELDS = ["cntyCd", "cntyNm", "statCd", "statCdCntnCd", "cntyNo"] as const;

const MONTH_TOKEN = /^(\d{4})[.\-/]?(0[1-9]|1[0-2])$/;

export function toCustomsMonth(month: ReferenceMonth): string {
  return month.replace("-", "");
}

/**
 * A period token to a reference month. Accepts the punctuation variants the portal uses and
 * refuses everything else — notably a bare `YYYY`, which is a year total and is not a month.
 */
export function fromCustomsPeriod(token: string): ReferenceMonth | null {
  const match = MONTH_TOKEN.exec(token.trim());
  return match ? `${match[1]}-${match[2]}` : null;
}

function gatewayError(root: XmlElement): UmpiProviderError | null {
  if (root.name !== "OpenAPI_ServiceResponse") return null;
  const header = childrenNamed(root, "cmmMsgHeader")[0];
  const message = header ? childText(header, "errMsg") : null;
  const reason = header ? childText(header, "returnAuthMsg") : null;
  const code = header ? childText(header, "returnReasonCode") : null;
  return new UmpiProviderError(
    `the data.go.kr gateway refused the request: ${message ?? "unknown error"}${reason ? ` (${reason})` : ""}`,
    code,
    message,
  );
}

function serviceError(root: XmlElement): UmpiProviderError | null {
  const header = childrenNamed(root, "header")[0];
  if (!header) return null;
  const code = childText(header, "resultCode");
  const message = childText(header, "resultMsg");
  // "00" is success; the portal's services use it consistently.
  if (code === null || code === "00") return null;
  return new UmpiProviderError(`Korea Customs returned ${code}: ${message ?? "no message"}`, code, message);
}

/** Every child element of an item, as a flat record. Repeated names keep the last value. */
function itemRecord(item: XmlElement): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const child of item.children) {
    if (typeof child === "string") continue;
    record[child.name] = childText(item, child.name);
  }
  return record;
}

function numeric(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim().replace(/,/g, "");
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function parseCustomsPayload(input: { identity: UmpiSourceIdentity; payload: string }): ParseResult {
  const { identity, payload } = input;
  if (identity.kind !== "kcs_trade_commodity") {
    throw new UmpiParseError("the Customs parser was given a non-Customs identity");
  }
  assertAggregateDataset(identity);

  let root: XmlElement;
  try {
    root = parseXml(payload);
  } catch (error) {
    if (error instanceof XmlFormatError) throw new UmpiParseError(`the Customs response is not well-formed XML: ${error.message}`, { cause: error });
    throw new UmpiParseError("the Customs response could not be read", { cause: error });
  }

  const gateway = gatewayError(root);
  if (gateway) throw gateway;
  const service = serviceError(root);
  if (service) throw service;

  const body = childrenNamed(root, "body")[0];
  if (!body) throw new UmpiParseError("the Customs response carries no <body>");
  const itemsContainer = childrenNamed(body, "items")[0];
  // A successful response with no <items> is a real "no data for this range", unlike a missing
  // body, which is a shape nobody documents.
  const items = itemsContainer ? childrenNamed(itemsContainer, "item") : [];

  const rows: ParsedRow[] = [];
  for (const item of items) {
    const record = itemRecord(item);

    // The country guard. If the response carries a country dimension we are on the wrong
    // operation, and summing these rows would be exactly the mistake this adapter exists to
    // prevent. Fail the whole parse rather than quietly dropping or adding them.
    const country = COUNTRY_FIELDS.find((field) => record[field] !== undefined && String(record[field] ?? "").trim() !== "");
    if (country) {
      throw new UmpiIdentityMismatchError(
        `the Customs response carries a country dimension (${country}); UMPI reads the aggregate-by-item operation only`,
        `${CUSTOMS_ITEM_TRADE_DATASET_ID} aggregate by item`,
        `country-dimension response`,
      );
    }

    const hsCode = String(record[CUSTOMS_FIELDS.hsCode] ?? "").trim();
    if (hsCode === "") {
      throw new UmpiParseError(
        `a Customs item carries no ${CUSTOMS_FIELDS.hsCode}; fields present: ${Object.keys(record).join(", ") || "none"}`,
      );
    }
    // A shorter code is an aggregate over more than the DRAM chip line; a different code is a
    // different commodity. Neither is this series.
    if (hsCode !== identity.hsCode) {
      rows.push({
        state: "rejected",
        code: "hs_code_mismatch",
        detail: `row is ${hsCode}, series is ${identity.hsCode}`,
        rawPayload: record,
      });
      continue;
    }

    const periodRaw = record[CUSTOMS_FIELDS.period];
    const referenceMonth = fromCustomsPeriod(String(periodRaw ?? ""));
    if (referenceMonth === null) {
      // A year total, a range total or a blank period all land here and none is a month.
      rows.push({
        state: "rejected",
        code: "malformed_reference_month",
        detail: `${CUSTOMS_FIELDS.period} ${JSON.stringify(periodRaw)} is not a single month`,
        rawPayload: record,
      });
      continue;
    }

    if (record[CUSTOMS_FIELDS.exportValueUsd] === undefined || record[CUSTOMS_FIELDS.exportWeightKg] === undefined) {
      throw new UmpiParseError(
        `a Customs item is missing ${CUSTOMS_FIELDS.exportValueUsd} or ${CUSTOMS_FIELDS.exportWeightKg}; fields present: ${Object.keys(record).join(", ")}`,
      );
    }

    const exportValueUsd = numeric(record[CUSTOMS_FIELDS.exportValueUsd]);
    const exportWeightKg = numeric(record[CUSTOMS_FIELDS.exportWeightKg]);
    if (exportValueUsd === null || exportWeightKg === null) {
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
      exportValueUsd,
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

  // One row per month is what the aggregate operation returns. Two rows for one month would
  // mean a breakdown arrived without a recognised country field, and summing them silently is
  // precisely the failure this adapter refuses.
  const months = rows.filter((row) => row.state === "admitted").map((row) => (row as Extract<ParsedRow, { state: "admitted" }>).observation.referenceMonth);
  const duplicates = months.filter((month, index) => months.indexOf(month) !== index);
  if (duplicates.length > 0) {
    throw new UmpiIdentityMismatchError(
      `the Customs response carries more than one row for ${[...new Set(duplicates)].join(", ")}; the aggregate operation returns one row per month and these must not be summed`,
      "one aggregate row per month",
      `${months.length} rows for ${new Set(months).size} months`,
    );
  }

  return {
    rows,
    sourceMetadata: {
      datasetId: identity.datasetId,
      hsCode: identity.hsCode,
      operation: "getItemtradeList",
      aggregation: "by HS code, no country dimension",
      itemCount: items.length,
      totalCount: childText(body, "totalCount"),
    },
  };
}

/** Refuse the country-dimension dataset before a request is built. */
export function assertAggregateDataset(identity: UmpiSourceIdentity): void {
  if (identity.kind !== "kcs_trade_commodity") return;
  if (identity.datasetId === CUSTOMS_COUNTRY_DIMENSION_DATASET_ID) {
    throw new UmpiIdentityMismatchError(
      `dataset ${CUSTOMS_COUNTRY_DIMENSION_DATASET_ID} is the country-dimension operation; Series B needs Korea-wide totals from ${CUSTOMS_ITEM_TRADE_DATASET_ID}`,
      CUSTOMS_ITEM_TRADE_DATASET_ID,
      identity.datasetId,
    );
  }
  if (identity.datasetId !== CUSTOMS_ITEM_TRADE_DATASET_ID) {
    throw new UmpiIdentityMismatchError(
      `UMPI V1 reads Customs dataset ${CUSTOMS_ITEM_TRADE_DATASET_ID}; refusing ${identity.datasetId}`,
      CUSTOMS_ITEM_TRADE_DATASET_ID,
      identity.datasetId,
    );
  }
}

export function buildCustomsUrl(input: {
  apiKey: string;
  identity: Extract<UmpiSourceIdentity, { kind: "kcs_trade_commodity" }>;
  range: FetchRange;
}): string {
  const { apiKey, identity, range } = input;
  const url = new URL(CUSTOMS_ITEM_TRADE_URL);
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("strtYymm", toCustomsMonth(range.fromMonth));
  url.searchParams.set("endYymm", toCustomsMonth(range.toMonth));
  url.searchParams.set("hsSgn", identity.hsCode);
  return url.toString();
}

export function createCustomsAdapter(options: HttpOptions = {}): UmpiSourceAdapter<string> {
  return {
    name: "kcs-item-trade-gw",
    seriesCode: "UMPI-KR-DRAM-EXPORT-UV",
    identityKind: "kcs_trade_commodity",
    credentialEnv: "UMPI_DATA_GO_KR_SERVICE_KEY",
    parse: parseCustomsPayload,
    async fetch({ identity, range, apiKey }): Promise<SourceFetchResult> {
      if (identity.kind !== "kcs_trade_commodity") {
        throw new UmpiParseError("the Customs adapter was given a non-Customs identity");
      }
      assertAggregateDataset(identity);
      const url = buildCustomsUrl({ apiKey, identity, range });
      const response = await fetchText(url, options);
      const parsed = parseCustomsPayload({ identity, payload: response.body });
      // The service reports how many rows it holds for the range. Equal means the page is the
      // whole answer; anything else is recorded as unknown rather than assumed complete.
      const declared = Number(parsed.sourceMetadata.totalCount ?? Number.NaN);
      const seen = Number(parsed.sourceMetadata.itemCount ?? 0);
      const complete = Number.isFinite(declared) && declared === seen;
      return {
        ...parsed,
        enumerationAssessment: complete ? "complete" : "unknown",
        enumerationEvidence: complete
          ? `Korea Customs reported totalCount ${declared} and returned ${seen} item(s)`
          : `Korea Customs reported totalCount ${parsed.sourceMetadata.totalCount ?? "none"} against ${seen} item(s) returned`,
        payloadDigest: payloadDigest(parsed.rows.map((row) => row.rawPayload)),
        retrievedAt: new Date().toISOString(),
        requestUrl: redactUrl(url),
        requestParameters: {
          operation: "getItemtradeList",
          datasetId: identity.datasetId,
          hsSgn: identity.hsCode,
          strtYymm: toCustomsMonth(range.fromMonth),
          endYymm: toCustomsMonth(range.toMonth),
          countryParameter: "none — aggregate by item",
        },
        httpStatus: response.status,
        contentType: response.contentType,
        responseByteLength: response.byteLength,
      };
    },
  };
}

/** The identity this adapter is allowed to read. */
export const CUSTOMS_EXPECTED_IDENTITY_KEY = `kcs:8542321010/${CUSTOMS_ITEM_TRADE_DATASET_ID}`;

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
