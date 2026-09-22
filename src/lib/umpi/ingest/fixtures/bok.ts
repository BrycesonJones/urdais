/**
 * Frozen ECOS payload fixtures.
 *
 * The *shape* is the real one, observed from the service's documented metadata endpoints. The
 * *values* are synthetic and deliberately round, so a test asserts arithmetic rather than
 * trusting a number copied from a real month. Nothing here is a Bank of Korea observation and
 * none of it may be seeded into any database. No fixture contains a credential.
 */

export const BOK_SINGLE_MONTH = JSON.stringify({
  StatisticSearch: {
    list_total_count: 1,
    row: [
      {
        STAT_CODE: "404Y016",
        STAT_NAME: "4.1.1.3. 생산자물가지수(품목별)",
        ITEM_CODE1: "30911201AA",
        ITEM_NAME1: "DRAM",
        UNIT_NAME: "2020=100",
        TIME: "202606",
        DATA_VALUE: "100",
      },
    ],
  },
});

export const BOK_THREE_MONTHS = JSON.stringify({
  StatisticSearch: {
    list_total_count: 3,
    row: [
      { STAT_CODE: "404Y016", STAT_NAME: "생산자물가지수(품목별)", ITEM_CODE1: "30911201AA", ITEM_NAME1: "DRAM", UNIT_NAME: "2020=100", TIME: "202606", DATA_VALUE: "100" },
      { STAT_CODE: "404Y016", STAT_NAME: "생산자물가지수(품목별)", ITEM_CODE1: "30911201AA", ITEM_NAME1: "DRAM", UNIT_NAME: "2020=100", TIME: "202607", DATA_VALUE: "110" },
      { STAT_CODE: "404Y016", STAT_NAME: "생산자물가지수(품목별)", ITEM_CODE1: "30911201AA", ITEM_NAME1: "DRAM", UNIT_NAME: "2020=100", TIME: "202608", DATA_VALUE: "121" },
    ],
  },
});

/** The same month, revised by the agency. Used to prove a new vintage rather than an edit. */
export const BOK_SINGLE_MONTH_REVISED = JSON.stringify({
  StatisticSearch: {
    list_total_count: 1,
    row: [
      {
        STAT_CODE: "404Y016",
        STAT_NAME: "4.1.1.3. 생산자물가지수(품목별)",
        ITEM_CODE1: "30911201AA",
        ITEM_NAME1: "DRAM",
        UNIT_NAME: "2020=100",
        TIME: "202606",
        DATA_VALUE: "101",
      },
    ],
  },
});

/** ECOS answers "no rows" with an explicit RESULT code and HTTP 200. Not an empty list. */
export const BOK_NO_RESULT = JSON.stringify({
  RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다." },
});

export const BOK_PROVIDER_ERROR = JSON.stringify({
  RESULT: { CODE: "ERROR-100", MESSAGE: "인증키가 유효하지 않습니다." },
});

/** A row from the export price table. The parser must refuse it, not average it in. */
export const BOK_WRONG_TABLE = JSON.stringify({
  StatisticSearch: {
    list_total_count: 1,
    row: [
      {
        STAT_CODE: "402Y016",
        STAT_NAME: "4.3.1.3. 수출물가지수(품목별)",
        ITEM_CODE1: "30911201AA",
        ITEM_NAME1: "DRAM",
        UNIT_NAME: "2020=100",
        TIME: "202606",
        DATA_VALUE: "252.74",
      },
    ],
  },
});

export const BOK_MALFORMED_VALUE = JSON.stringify({
  StatisticSearch: {
    list_total_count: 1,
    row: [{ STAT_CODE: "404Y016", ITEM_CODE1: "30911201AA", UNIT_NAME: "2020=100", TIME: "202606", DATA_VALUE: "-" }],
  },
});

export const BOK_BAD_PERIOD = JSON.stringify({
  StatisticSearch: {
    list_total_count: 1,
    row: [{ STAT_CODE: "404Y016", ITEM_CODE1: "30911201AA", UNIT_NAME: "2020=100", TIME: "2026", DATA_VALUE: "100" }],
  },
});

export const BOK_NOT_JSON = "<html><body>gateway</body></html>";

/** More rows than one page holds; the adapter must refuse rather than truncate silently. */
export const BOK_OVER_ONE_PAGE = JSON.stringify({
  StatisticSearch: {
    list_total_count: 5000,
    row: [{ STAT_CODE: "404Y016", ITEM_CODE1: "30911201AA", UNIT_NAME: "2020=100", TIME: "202606", DATA_VALUE: "100" }],
  },
});
