/**
 * Frozen Korea Customs payload fixtures.
 *
 * Envelope shapes are the real ones: the data.go.kr gateway error wrapper was observed directly,
 * and the service envelope follows the portal's standard `response/header/body/items/item`
 * form. Values are synthetic and round. No fixture contains a credential.
 */

const item = (fields: Record<string, string>) =>
  `<item>${Object.entries(fields).map(([k, v]) => `<${k}>${v}</${k}>`).join("")}</item>`;

const envelope = (items: string, resultCode = "00") =>
  `<?xml version="1.0" encoding="UTF-8"?><response><header><resultCode>${resultCode}</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items>${items}</items><numOfRows>10</numOfRows><pageNo>1</pageNo><totalCount>1</totalCount></body></response>`;

/** One aggregate row for one month: the shape Series B depends on. */
export const CUSTOMS_SINGLE_MONTH = envelope(
  item({ year: "202606", hsCd: "8542321010", expDlr: "1000000", expWgt: "10000", impDlr: "5000", impWgt: "50" }),
);

export const CUSTOMS_THREE_MONTHS = envelope(
  [
    item({ year: "202606", hsCd: "8542321010", expDlr: "1000000", expWgt: "10000", impDlr: "0", impWgt: "0" }),
    item({ year: "202607", hsCd: "8542321010", expDlr: "1100000", expWgt: "10000", impDlr: "0", impWgt: "0" }),
    item({ year: "202608", hsCd: "8542321010", expDlr: "1210000", expWgt: "10000", impDlr: "0", impWgt: "0" }),
  ].join(""),
);

export const CUSTOMS_SINGLE_MONTH_REVISED = envelope(
  item({ year: "202606", hsCd: "8542321010", expDlr: "1050000", expWgt: "10000", impDlr: "5000", impWgt: "50" }),
);

/** Zero exported value against a real weight. A real month, admitted. */
export const CUSTOMS_ZERO_VALUE = envelope(
  item({ year: "202606", hsCd: "8542321010", expDlr: "0", expWgt: "10000", impDlr: "0", impWgt: "0" }),
);

/** Zero exported weight. No unit value exists, so the row is rejected with its reason. */
export const CUSTOMS_ZERO_WEIGHT = envelope(
  item({ year: "202606", hsCd: "8542321010", expDlr: "1000000", expWgt: "0", impDlr: "0", impWgt: "0" }),
);

/** A different commodity. The parser must never let this become a DRAM observation. */
export const CUSTOMS_WRONG_HS = envelope(
  item({ year: "202606", hsCd: "8542321020", expDlr: "999", expWgt: "9", impDlr: "0", impWgt: "0" }),
);

/** A six-digit aggregate covering more than DRAM chips. Also not this series. */
export const CUSTOMS_AGGREGATE_HS = envelope(
  item({ year: "202606", hsCd: "854232", expDlr: "99999999", expWgt: "999999", impDlr: "0", impWgt: "0" }),
);

/**
 * The country-dimension response. If this ever arrives, the request went to the wrong
 * operation, and summing these rows would publish a fiction.
 */
export const CUSTOMS_COUNTRY_DIMENSION = envelope(
  [
    item({ year: "202606", hsCd: "8542321010", cntyCd: "US", cntyNm: "미국", expDlr: "400000", expWgt: "4000" }),
    item({ year: "202606", hsCd: "8542321010", cntyCd: "CN", cntyNm: "중국", expDlr: "600000", expWgt: "6000" }),
  ].join(""),
);

/** Two rows for one month with no country field: an undeclared breakdown. Also refused. */
export const CUSTOMS_DUPLICATE_MONTH = envelope(
  [
    item({ year: "202606", hsCd: "8542321010", expDlr: "400000", expWgt: "4000" }),
    item({ year: "202606", hsCd: "8542321010", expDlr: "600000", expWgt: "6000" }),
  ].join(""),
);

/** A yearly total. Not a month, and never summed into one. */
export const CUSTOMS_YEAR_TOTAL = envelope(
  item({ year: "2026", hsCd: "8542321010", expDlr: "12000000", expWgt: "120000" }),
);

export const CUSTOMS_MALFORMED_VALUE = envelope(
  item({ year: "202606", hsCd: "8542321010", expDlr: "n/a", expWgt: "10000" }),
);

/** A successful response with no data for the range. */
export const CUSTOMS_NO_DATA = `<?xml version="1.0" encoding="UTF-8"?><response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items></items><totalCount>0</totalCount></body></response>`;

export const CUSTOMS_SERVICE_ERROR = envelope("", "22");

/** The gateway envelope, observed verbatim from an unauthenticated request. */
export const CUSTOMS_GATEWAY_ERROR = `<?xml version="1.0" encoding="UTF-8"?>
<OpenAPI_ServiceResponse>
<cmmMsgHeader>
  <errMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</errMsg>
  <returnAuthMsg>등록되지 않은 서비스키</returnAuthMsg>
  <returnReasonCode>30</returnReasonCode>
</cmmMsgHeader>
</OpenAPI_ServiceResponse>`;

/** A row with no HS field at all: a shape change at the agency, not a bad row. */
export const CUSTOMS_MISSING_FIELDS = envelope(item({ year: "202606", expDlr: "1000000", expWgt: "10000" }));
