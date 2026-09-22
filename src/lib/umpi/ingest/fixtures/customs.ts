/**
 * Frozen Korea Customs portal payload fixtures.
 *
 * The envelope shape is the real one, observed from `retrieveTrade.do` on 22 September 2026:
 * `{count, searchPaging, searchresult, items[]}`, with figures arriving space-padded and
 * comma-grouped, and `cntyCd` / `cntyNm` present but empty. Values are synthetic and round so a
 * test asserts arithmetic rather than trusting a copied number. No fixture carries a credential.
 *
 * The one fixture modelled on real proportions is `CUSTOMS_TOTAL_ROW_MATCHES_SUM`, because the
 * property it encodes — that 총계 is the sum of the months beside it — is the reason that row
 * must never be admitted.
 */

const row = (fields: Record<string, string>) => ({
  cntyCd: "",
  cntyNm: "",
  hsSgn: "",
  korePrlstNm: "",
  englPrlstNm: "",
  expTtwg: "",
  expUsdAmt: "",
  impTtwg: "",
  impUsdAmt: "",
  ...fields,
});

const envelope = (items: Record<string, string>[], searchresult = "OK") =>
  JSON.stringify({ count: items.length, searchPaging: "0", searchresult, items });

const month = (priodTitle: string, expTtwg: string, expUsdAmt: string) =>
  row({ priodTitle, hsSgn: "8542321010", korePrlstNm: "디램", expTtwg, expUsdAmt, impTtwg: "1,000", impUsdAmt: "500" });

/** One month, one row. 10,000 kg against 1,000 thousand USD = 1,000,000 USD. */
export const CUSTOMS_SINGLE_MONTH = envelope([month("2026.06", "                  10,000", "           1,000")]);

export const CUSTOMS_THREE_MONTHS = envelope([
  month("2026.06", "10,000", "1,000"),
  month("2026.07", "10,000", "1,100"),
  month("2026.08", "10,000", "1,210"),
]);

export const CUSTOMS_SINGLE_MONTH_REVISED = envelope([month("2026.06", "10,000", "1,050")]);

/**
 * A month plus the portal's 총계 row, in the real proportion: the total is exactly the sum.
 * Admitting it would double the series.
 */
export const CUSTOMS_TOTAL_ROW_MATCHES_SUM = envelope([
  row({ priodTitle: "총계", hsSgn: "", expTtwg: "                  20,000", expUsdAmt: "           2,100" }),
  month("2026.06", "10,000", "1,000"),
  month("2026.07", "10,000", "1,100"),
]);

/** Zero exported value against a real weight. A real month. */
export const CUSTOMS_ZERO_VALUE = envelope([month("2026.06", "10,000", "0")]);

/** Zero exported weight: no unit value exists, so the row is rejected with its reason. */
export const CUSTOMS_ZERO_WEIGHT = envelope([month("2026.06", "0", "1,000")]);

/** A different commodity. Must never become a DRAM observation. */
export const CUSTOMS_WRONG_HS = envelope([
  row({ priodTitle: "2026.06", hsSgn: "8542321020", korePrlstNm: "에스램", expTtwg: "9", expUsdAmt: "1" }),
]);

/** A country breakdown. If this arrives the query went to the wrong view. */
export const CUSTOMS_COUNTRY_DIMENSION = envelope([
  row({ priodTitle: "2026.06", hsSgn: "8542321010", cntyCd: "US", cntyNm: "미국", expTtwg: "4,000", expUsdAmt: "400" }),
  row({ priodTitle: "2026.06", hsSgn: "8542321010", cntyCd: "CN", cntyNm: "중국", expTtwg: "6,000", expUsdAmt: "600" }),
]);

/** Two rows for one month with no country field: an undeclared breakdown. Also refused. */
export const CUSTOMS_DUPLICATE_MONTH = envelope([
  month("2026.06", "4,000", "400"),
  month("2026.06", "6,000", "600"),
]);

/** A yearly total. Not a month. */
export const CUSTOMS_YEAR_TOTAL = envelope([month("2026", "120,000", "12,000")]);

export const CUSTOMS_MALFORMED_VALUE = envelope([month("2026.06", "10,000", "n/a")]);

/** A successful query with no data for the range. */
export const CUSTOMS_NO_DATA = envelope([]);

/** The portal reporting its own failure. */
export const CUSTOMS_PORTAL_ERROR = envelope([], "FAIL");

export const CUSTOMS_NOT_JSON = "<html><body>시스템 에러</body></html>";

/** A row with no period field at all: a shape change at the portal, not a bad row. */
export const CUSTOMS_MISSING_FIELDS = JSON.stringify({
  count: 1,
  searchresult: "OK",
  items: [{ cntyCd: "", cntyNm: "", priodTitle: "2026.06", hsSgn: "8542321010" }],
});
