/**
 * The UBWI Production V1 observed set: seventeen national balance sheets, every one
 * rights-cleared against a retained terms artifact, every one converted at the
 * end-period FX fixing matched to its own reference date.
 *
 * This file is the denominator's observed leg. It carries, per economy, the compiler's
 * own series identifier, the reference date, the FX lineage, the land and consumer-
 * durables treatment, and the GDP weights that produce the coverage measures. Nothing
 * here is interpolated and nothing is bridged: an economy whose latest published stock
 * is too old is excluded rather than carried forward.
 *
 * Provenance for each source is recorded in `SOURCE_INTERFACES` in ./rights.ts.
 */
import type { ExcludedEconomy, ObservedEconomy, UnobservedMajorEconomy } from "./types";

/** World GDP at market exchange rates, 2024. */
export const WORLD_GDP_2024_USD = 111_669_432_109_121;
export const WORLD_GDP_SOURCE = "World Bank WDI NY.GDP.MKTP.CD, world aggregate, 2024";

/**
 * Total non-human wealth across the 150 economies in the World Bank Changing Wealth of
 * Nations 2024 database at 2020, used only to calibrate the residual model's tail ratio
 * and to report wealth-weighted coverage. It is never summed into the denominator.
 */
export const CWON_2020_NON_HUMAN_WEALTH_USD = 333_938_232_452_310.6;
export const CWON_SOURCE =
  "World Bank Changing Wealth of Nations 2024, non-human wealth by economy, 2020";

/**
 * The vintage rule. A component's reference year may be no more than four years before
 * the latest complete calendar year at the calculation date. Phase 2C measured what this
 * costs and the cost is paid rather than hidden: it removes New Zealand and Russia.
 */
export const VINTAGE_MAX_AGE_YEARS = 4;
export const LATEST_COMPLETE_YEAR = 2025;

export const OBSERVED_ECONOMIES: readonly ObservedEconomy[] = [
  {
    economy: "USA",
    referenceDate: "2025-12-31",
    referenceYear: 2025,
    valueNationalCurrency: 158209900000000.03,
    currency: "USD",
    fx: {
      basis: "end_period",
      rateLcuPerUsd: 1.0,
      fixingDate: null,
      sourceInterface: "not-applicable-usd",
    },
    valueUsd: 158209900000000.03,
    sourceInterface: "federal-reserve-z1",
    sourceType: "primary",
    sourceSeries: "Fed Z.1 S1.b FL892090005 less consumer durables LM155111005",
    acquisitionMode: "automated",
    observationStatus: "observed",
    rightsStatus: "cleared",
    landTreatment: "partially_included",
    consumerDurablesTreatment: "included_and_stripped",
    consumerDurablesStrippedUsd: 8_653_800_000_000,
    consumerDurablesSourceSeries: "Fed Z.1 LM155111005 consumer durable goods, households and nonprofit organizations",
    gdpUsd2024: 29298013000000,
    gdpUsdReferenceYear: 30769700000000,
    note: "federalreserve.gov/disclaimer.htm: public domain, cite the Board",
  },
  {
    economy: "JPN",
    referenceDate: "2024-12-31",
    referenceYear: 2024,
    valueNationalCurrency: 4549474200000000.0,
    currency: "JPY",
    fx: {
      basis: "end_period",
      rateLcuPerUsd: 156.9544710751757,
      fixingDate: "2024-12-31",
      sourceInterface: "ecb-euro-reference-rates",
    },
    valueUsd: 28985948401692.625,
    sourceInterface: "esri-sna-stock",
    sourceType: "primary",
    sourceSeries: "ESRI 2024sca_jp.xlsx \u671f\u672b\u8cb8\u501f\u5bfe\u7167\u8868\u52d8\u5b9a 4. \u6b63\u5473\u8cc7\u7523 (JPY 4,549,474.2 bn)",
    acquisitionMode: "automated",
    observationStatus: "observed",
    rightsStatus: "cleared",
    landTreatment: "included",
    consumerDurablesTreatment: "excluded",
    gdpUsd2024: 4190008188358.57,
    gdpUsdReferenceYear: 4190008188358.57,
    note: "released 20 Jan 2026; replaces OECD NN+BF90(W) 2022",
  },
  {
    economy: "DEU",
    referenceDate: "2024-12-31",
    referenceYear: 2024,
    valueNationalCurrency: 27167482000000.0,
    currency: "EUR",
    fx: {
      basis: "end_period",
      rateLcuPerUsd: 0.9625565501973241,
      fixingDate: "2024-12-31",
      sourceInterface: "ecb-euro-reference-rates",
    },
    valueUsd: 28224297049800.0,
    sourceInterface: "eurostat-nasa-nama",
    sourceType: "harmonized",
    sourceSeries: "Eurostat nama_10_nfa_bs N11N 15,872,831 + N211N 7,652,655 + nasa_10_f_bs BF90 S1 CO 3,641,996 (EUR mn)",
    acquisitionMode: "automated",
    observationStatus: "observed",
    rightsStatus: "cleared",
    landTreatment: "included",
    consumerDurablesTreatment: "excluded",
    gdpUsd2024: 4685592577804.69,
    gdpUsdReferenceYear: 4685592577804.69,
    note: "reproduces Bundesbank/Destatis Volksvermoegen 2024 of EUR 27,235.2 bn to 0.25%",
  },
  {
    economy: "FRA",
    referenceDate: "2025-12-31",
    referenceYear: 2025,
    valueNationalCurrency: 20235380600000.0,
    currency: "EUR",
    fx: {
      basis: "end_period",
      rateLcuPerUsd: 0.851063829787234,
      fixingDate: "2025-12-31",
      sourceInterface: "ecb-euro-reference-rates",
    },
    valueUsd: 23776572205000.0,
    sourceInterface: "eurostat-nasa-nama",
    sourceType: "harmonized",
    sourceSeries: "Eurostat nama_10_nfa_bs N1N+N2N (S1, CP_MNAC) + nasa_10_f_bs BF90 S1 CO 2025",
    acquisitionMode: "automated",
    observationStatus: "observed",
    rightsStatus: "cleared",
    landTreatment: "included",
    consumerDurablesTreatment: "excluded",
    gdpUsd2024: 3160442622465.08,
    gdpUsdReferenceYear: 3366315927447.33,
    note: "INSEE/BdF patrimoine national 31 Dec 2025 = EUR 20,235.4 bn; Eurostat = EUR 20,235.381 bn",
  },
  {
    economy: "KOR",
    referenceDate: "2025-12-31",
    referenceYear: 2025,
    valueNationalCurrency: 2.45614542e+16,
    currency: "KRW",
    fx: {
      basis: "end_period",
      rateLcuPerUsd: 1444.2042553191488,
      fixingDate: "2025-12-31",
      sourceInterface: "ecb-euro-reference-rates",
    },
    valueUsd: 17006911667472.04,
    sourceInterface: "bok-ecos-national-balance-sheet",
    sourceType: "primary",
    sourceSeries: "BOK ECOS 291Y505 \uc81c\ub3c4\ubd80\ubb38\ubcc4 \ub300\ucc28\ub300\uc870\ud45c, SEC10 \uad6d\ub0b4, item 4 \uc21c\uc790\uc0b0 (KRW 24,561,454.2 bn)",
    acquisitionMode: "manual_verified",
    observationStatus: "observed",
    rightsStatus: "cleared",
    landTreatment: "included",
    consumerDurablesTreatment: "excluded",
    gdpUsd2024: 1875388209406.8,
    gdpUsdReferenceYear: 1872374961553.15,
    note: "2020 base year; replaces OECD NN+BF90(W) 2022, which is 10.9% lower on an older base",
  },
  {
    economy: "GBR",
    referenceDate: "2024-12-31",
    referenceYear: 2024,
    valueNationalCurrency: 13084293000000.0,
    currency: "GBP",
    fx: {
      basis: "end_period",
      rateLcuPerUsd: 0.7981326402926173,
      fixingDate: "2024-12-31",
      sourceInterface: "ecb-euro-reference-rates",
    },
    valueUsd: 16393632260425.96,
    sourceInterface: "ons-national-balance-sheet",
    sourceType: "primary",
    sourceSeries: "ONS The UK national balance sheet estimates, Table C, B.90 Net worth (GBP 13,084,293 mn)",
    acquisitionMode: "automated",
    observationStatus: "observed",
    rightsStatus: "cleared",
    landTreatment: "included",
    consumerDurablesTreatment: "excluded",
    gdpUsd2024: 3695539513534.15,
    gdpUsdReferenceYear: 3695539513534.15,
    note: "released 18 Dec 2025; replaces OECD NN+BF90(W) 2021 and clears the Eurostat non-EU exclusion",
  },
  {
    economy: "AUS",
    referenceDate: "2025-06-30",
    referenceYear: 2025,
    valueNationalCurrency: 21412600000000.0,
    currency: "AUD",
    fx: {
      basis: "end_period",
      rateLcuPerUsd: 1.5313993174061433,
      fixingDate: "2025-06-30",
      sourceInterface: "ecb-euro-reference-rates",
    },
    valueUsd: 13982375306440.83,
    sourceInterface: "abs-asna-5204",
    sourceType: "primary",
    sourceSeries: "ABS 5204.0 table 10 NET WORTH current prices A2421151J (30 Jun 2025)",
    acquisitionMode: "automated",
    observationStatus: "observed",
    rightsStatus: "cleared",
    landTreatment: "included",
    consumerDurablesTreatment: "excluded",
    gdpUsd2024: 1757022451652.83,
    gdpUsdReferenceYear: 1798518933689.21,
    note: "reference date is 30 June, not 31 December",
  },
  {
    economy: "CAN",
    referenceDate: "2025-12-31",
    referenceYear: 2025,
    valueNationalCurrency: 18135848000000.0,
    currency: "CAD",
    fx: {
      basis: "end_period",
      rateLcuPerUsd: 1.369191489361702,
      fixingDate: "2025-12-31",
      sourceInterface: "ecb-euro-reference-rates",
    },
    valueUsd: 13245662232720.041,
    sourceInterface: "statcan-nbsa",
    sourceType: "primary",
    sourceSeries: "StatCan 36-10-0580 National balance sheets, market value, Net worth 19,108,615 less consumer durables 972,767 (CAD mn, 31 Dec 2025)",
    acquisitionMode: "automated",
    observationStatus: "observed",
    rightsStatus: "cleared",
    landTreatment: "included",
    consumerDurablesTreatment: "included_and_stripped",
    consumerDurablesStrippedUsd: 710_468_190_576.8275,
    consumerDurablesSourceSeries: "StatCan 36-10-0580 consumer durables, vector 62693716 (CAD 972,767 mn)",
    gdpUsd2024: 2270076189683.46,
    gdpUsdReferenceYear: 2319899772425.92,
    note: "quarterly; 2026Q2 (30 Jun 2026) net worth 20,302,362 also published 11 Sep 2026",
  },
  {
    economy: "ITA",
    referenceDate: "2024-12-31",
    referenceYear: 2024,
    valueNationalCurrency: 11838802700000.0,
    currency: "EUR",
    fx: {
      basis: "end_period",
      rateLcuPerUsd: 0.9625565501973241,
      fixingDate: "2024-12-31",
      sourceInterface: "ecb-euro-reference-rates",
    },
    valueUsd: 12299332125030.0,
    sourceInterface: "istat-conti-patrimoniali",
    sourceType: "primary",
    sourceSeries: "Istat 94_1063_DF_DCCN_ISTITUZ_ANA1_5 LEN_D_W0 S1 'all non-financial assets' 11,513,938.7 + Eurostat nasa_10_f_bs BF90 S1 CO 324,864 (EUR mn)",
    acquisitionMode: "automated",
    observationStatus: "observed",
    rightsStatus: "cleared",
    landTreatment: "included",
    consumerDurablesTreatment: "excluded",
    gdpUsd2024: 2383435562458.12,
    gdpUsdReferenceYear: 2383435562458.12,
    note: "reproduces the Istat/BdI joint publication total of EUR 11,835 bn to 0.03%; compiler-stated omissions: monuments, valuables, natural resources other than land",
  },
  {
    economy: "MEX",
    referenceDate: "2022-12-31",
    referenceYear: 2022,
    valueNationalCurrency: 216179405008000.03,
    currency: "MXN",
    fx: {
      basis: "end_period",
      rateLcuPerUsd: 19.553722107631728,
      fixingDate: "2022-12-30",
      sourceInterface: "ecb-euro-reference-rates",
    },
    valueUsd: 11055665198577.523,
    sourceInterface: "oecd-sdmx-national-accounts",
    sourceType: "harmonized",
    sourceSeries: "OECD SDMX DF_TABLE9B NN + DF_T720R_A BF90(W), 2022",
    acquisitionMode: "automated",
    observationStatus: "observed",
    rightsStatus: "cleared",
    landTreatment: "included",
    consumerDurablesTreatment: "excluded",
    gdpUsd2024: 1830489311088.89,
    gdpUsdReferenceYear: 1466934724243.38,
    note: "OECD BF90(W) carries the disagreement documented in Part 4",
  },
  {
    // Taiwan, admitted in Phase 2E. The only new denominator constituent since Production
    // V1, and the one that brings the modelled share under the 40 % ceiling.
    //
    // Two caveats travel with it and neither is hidden. Land is valued at 公告現值, the
    // announced current land value -- an administrative assessment, not a market price --
    // which DGBAS states in Table 1 note 3 and which almost certainly understates the land
    // stock: DGBAS's own alternative household-sector series, re-valuing residential,
    // industrial and commercial land at market price, raises net worth by NT$10,119 x 10^8,
    // or 0.39 %. Urdais takes the announced-value headline, so Taiwan's contribution is if
    // anything conservative. And Taiwan is absent from the World Bank's Changing Wealth of
    // Nations 150-economy cross section, so it contributes wealth to the denominator while
    // contributing nothing to the residual model's calibration weights; `observedWealthCoverage`
    // is therefore a slight understatement from this phase onward.
    economy: "TWN",
    referenceDate: "2024-12-31",
    referenceYear: 2024,
    // DGBAS Table 4 (C) Net Worth 2,589,685 less household durables 27,885 + 31,921, in
    // units of 100 million NT$. Taken from Table 4 rather than Table 1 because Table 1 is
    // published to two decimal places of NT$ trillions and Table 4 is not rounded.
    valueNationalCurrency: 252987900000000,
    currency: "TWD",
    fx: {
      basis: "end_period",
      rateLcuPerUsd: 32.781,
      fixingDate: "2024-12-31",
      sourceInterface: "cbc-exchange-rates",
    },
    valueUsd: 7717516244165.828,
    sourceInterface: "dgbas-national-wealth",
    sourceType: "primary",
    sourceSeries:
      "DGBAS National Wealth Statistics table4e113 (C) Net Worth 2,589,685 less items 4 and 5, Household Durable and Semi-durable Properties 27,885 and Household Cars and Motorcycles 31,921 (100 million NT$)",
    acquisitionMode: "automated",
    observationStatus: "observed",
    rightsStatus: "cleared",
    landTreatment: "included",
    consumerDurablesTreatment: "included_and_stripped",
    consumerDurablesStrippedUsd: 182441048168.14618,
    consumerDurablesSourceSeries:
      "DGBAS National Wealth Statistics table4e113 items 4 and 5, Household Durable and Semi-durable Properties (excluding household cars and motorcycles) and Household Cars and Motorcycles",
    // Taiwan is not a WDI country, so its GDP weight cannot come from the same source as
    // every other component's. It is DGBAS's own nominal GDP in US dollars. The World Bank
    // states that Taiwan is nonetheless added to the WDI world aggregate, which is what
    // makes the coverage ratio and the residual's unobserved-GDP term consistent.
    gdpUsd2024: 801529000000,
    gdpUsdReferenceYear: 801529000000,
    note:
      "DGBAS National Wealth Statistics for 2024, released 29 April 2026; the accounting identity reproduces exactly, 2,080,329 net non-financial + 509,356 net financial = 2,589,685 (100 million NT$), and net financial assets are net foreign financial assets by DGBAS's own Table 1 note 1. Land is included in full but valued at announced current land value. FX is the CBC interbank spot market closing rate for 31 December 2024.",
  },
  {
    economy: "NLD",
    referenceDate: "2025-12-31",
    referenceYear: 2025,
    valueNationalCurrency: 6818337000000.0,
    currency: "EUR",
    fx: {
      basis: "end_period",
      rateLcuPerUsd: 0.851063829787234,
      fixingDate: "2025-12-31",
      sourceInterface: "ecb-euro-reference-rates",
    },
    valueUsd: 8011545975000.0,
    sourceInterface: "cbs-statline-85953ned",
    sourceType: "primary",
    sourceSeries: "CBS 85953NED niet-financiele activa 6,259,747 (market value) + Eurostat BF90 S1 CO 558,590 (EUR mn)",
    acquisitionMode: "automated",
    observationStatus: "observed",
    rightsStatus: "cleared",
    landTreatment: "included",
    consumerDurablesTreatment: "excluded",
    gdpUsd2024: 1213936238063.28,
    gdpUsdReferenceYear: 1332767651100.39,
    note: "",
  },
  {
    economy: "SWE",
    referenceDate: "2025-12-31",
    referenceYear: 2025,
    valueNationalCurrency: 40363307000000.0,
    currency: "SEK",
    fx: {
      basis: "end_period",
      rateLcuPerUsd: 9.209787234042553,
      fixingDate: "2025-12-31",
      sourceInterface: "ecb-euro-reference-rates",
    },
    valueUsd: 4382653580834.45,
    sourceInterface: "eurostat-nasa-nama",
    sourceType: "harmonized",
    sourceSeries: "Eurostat nama_10_nfa_bs N1N+N2N (S1, CP_MNAC) + nasa_10_f_bs BF90 S1 CO, 2025",
    acquisitionMode: "automated",
    observationStatus: "observed",
    rightsStatus: "cleared",
    landTreatment: "included",
    consumerDurablesTreatment: "excluded",
    gdpUsd2024: 604827393488.582,
    gdpUsdReferenceYear: 668998664082.081,
    note: "",
  },
  {
    economy: "AUT",
    referenceDate: "2023-12-31",
    referenceYear: 2023,
    valueNationalCurrency: 3131455700000.0,
    currency: "EUR",
    fx: {
      basis: "end_period",
      rateLcuPerUsd: 0.9049773755656109,
      fixingDate: "2023-12-29",
      sourceInterface: "ecb-euro-reference-rates",
    },
    valueUsd: 3460258548500.0,
    sourceInterface: "eurostat-nasa-nama",
    sourceType: "harmonized",
    sourceSeries: "Eurostat nama_10_nfa_bs N1N+N2N (S1, CP_MNAC) + nasa_10_f_bs BF90 S1 CO, 2023",
    acquisitionMode: "automated",
    observationStatus: "observed",
    rightsStatus: "cleared",
    landTreatment: "included",
    consumerDurablesTreatment: "excluded",
    gdpUsd2024: 534790720466.822,
    gdpUsdReferenceYear: 516670509628.876,
    note: "",
  },
  {
    economy: "CZE",
    referenceDate: "2025-12-31",
    referenceYear: 2025,
    valueNationalCurrency: 44974185000000.0,
    currency: "CZK",
    fx: {
      basis: "end_period",
      rateLcuPerUsd: 20.62723404255319,
      fixingDate: "2025-12-31",
      sourceInterface: "ecb-euro-reference-rates",
    },
    valueUsd: 2180330378140.8591,
    sourceInterface: "eurostat-nasa-nama",
    sourceType: "harmonized",
    sourceSeries: "Eurostat nama_10_nfa_bs N1N+N2N (S1, CP_MNAC) + nasa_10_f_bs BF90 S1 CO, 2025",
    acquisitionMode: "automated",
    observationStatus: "observed",
    rightsStatus: "cleared",
    landTreatment: "included",
    consumerDurablesTreatment: "excluded",
    gdpUsd2024: 347082562221.377,
    gdpUsdReferenceYear: 391026962800.475,
    note: "",
  },
  {
    economy: "FIN",
    referenceDate: "2024-12-31",
    referenceYear: 2024,
    valueNationalCurrency: 1417856000000.0,
    currency: "EUR",
    fx: {
      basis: "end_period",
      rateLcuPerUsd: 0.9625565501973241,
      fixingDate: "2024-12-31",
      sourceInterface: "ecb-euro-reference-rates",
    },
    valueUsd: 1473010598400.0,
    sourceInterface: "eurostat-nasa-nama",
    sourceType: "harmonized",
    sourceSeries: "Eurostat nama_10_nfa_bs N1N 1,136,910 + N211N 210,650 + nasa_10_f_bs BF90 S1 CO 70,296 (EUR mn)",
    acquisitionMode: "automated",
    observationStatus: "observed",
    rightsStatus: "cleared",
    landTreatment: "included",
    consumerDurablesTreatment: "excluded",
    gdpUsd2024: 298729432711.719,
    gdpUsdReferenceYear: 298729432711.719,
    note: "added for production V1; N21N not published, so non-produced assets other than land are a compiler-stated omission, understating in the conservative direction",
  },
  {
    economy: "SVK",
    referenceDate: "2024-12-31",
    referenceYear: 2024,
    valueNationalCurrency: 474301299999.99994,
    currency: "EUR",
    fx: {
      basis: "end_period",
      rateLcuPerUsd: 0.9625565501973241,
      fixingDate: "2024-12-31",
      sourceInterface: "ecb-euro-reference-rates",
    },
    valueUsd: 492751620569.99994,
    sourceInterface: "eurostat-nasa-nama",
    sourceType: "harmonized",
    sourceSeries: "Eurostat nama_10_nfa_bs N11N + N211N + nasa_10_f_bs BF90 S1 CO, 2024",
    acquisitionMode: "automated",
    observationStatus: "observed",
    rightsStatus: "cleared",
    landTreatment: "included",
    consumerDurablesTreatment: "excluded",
    gdpUsd2024: 140934076532.375,
    gdpUsdReferenceYear: 140934076532.375,
    note: "added for production V1; non-produced assets other than land not published",
  },
  {
    economy: "EST",
    referenceDate: "2023-12-31",
    referenceYear: 2023,
    valueNationalCurrency: 149026900000.0,
    currency: "EUR",
    fx: {
      basis: "end_period",
      rateLcuPerUsd: 0.9049773755656109,
      fixingDate: "2023-12-29",
      sourceInterface: "ecb-euro-reference-rates",
    },
    valueUsd: 164674724500.0,
    sourceInterface: "eurostat-nasa-nama",
    sourceType: "harmonized",
    sourceSeries: "Eurostat nama_10_nfa_bs N11N + N211N + nasa_10_f_bs BF90 S1 CO, 2023",
    acquisitionMode: "automated",
    observationStatus: "observed",
    rightsStatus: "cleared",
    landTreatment: "included",
    consumerDurablesTreatment: "excluded",
    gdpUsd2024: 43130419829.35,
    gdpUsdReferenceYear: 41470344395.1086,
    note: "added for production V1; non-produced assets other than land not published",
  },
];

/**
 * Dropped from the observed set, with the rule that dropped each. Neither is bridged,
 * interpolated or carried forward. Their combined GDP weight is 2.19 pp of world GDP, and
 * losing it raises the imputed share -- the cost is stated rather than hidden.
 *
 * New Zealand's reason changed in Phase 2D and the change matters. Production V1 dropped
 * it on vintage, reading the OECD's mirror, which stops at 2017. Stats NZ itself publishes
 * *Annual balance sheets: 2024 (provisional)*, released 27 November 2025: total-economy
 * net worth at market value, NZD 2,973,715 million at 31 March 2024, of which NZD
 * 1,634,567 million is non-produced non-financial assets. That is current, land-inclusive
 * and exactly the denominator's concept -- the same lesson Phase 2C learned four times
 * over, that a national compiler is often years fresher than the harmonised mirror.
 *
 * It is still excluded, for a different and honest reason: **its rights could not be
 * established from a retained artifact.** Stats NZ's copyright page renders entirely
 * client-side and returns 22 characters of body text to a plain HTTP client; the data
 * files carry no licence statement; and browser automation is broken on the machine this
 * ran on. A rights state derives from a retained, hashed terms document, never from an
 * assumption about what a government statistics office probably permits. So the state is
 * "not established", not "permitted" and not "refused".
 */
export const EXCLUDED_ECONOMIES: readonly ExcludedEconomy[] = [
  {
    economy: "NZL",
    referenceDate: "2024-03-31",
    gdpUsd2024: 261_497_198_363.906,
    reason:
      "Stats NZ publishes a current, land-inclusive, market-valued total-economy net worth " +
      "(NZD 2,973,715 mn at 31 March 2024), which satisfies the vintage rule. No terms artifact " +
      "could be retrieved: the Stats NZ copyright page is client-rendered and returns no licence " +
      "text to a plain HTTP client, and the data files state none. Rights not established.",
    rule: "source_rights_not_established",
  },
  {
    economy: "RUS",
    referenceDate: "2019-12-31",
    gdpUsd2024: 2_186_462_268_813.08,
    reason:
      "Latest OECD-published national balance sheet is 2019, six years before the latest complete calendar year. No ECB rouble reference-rate fixing exists after 2022 either.",
    rule: "vintage_max_age_years",
  },
];

/**
 * Economies above 3 % of world GDP that Urdais does not observe. The gate is on the
 * disclosure, not on the observation: China does not compile a comparable national
 * balance sheet, and requiring one would be a permanent refusal rather than a standard.
 * The sensitivity range is what carries the uncertainty these introduce.
 */
export const UNOBSERVED_MAJOR_ECONOMIES: readonly UnobservedMajorEconomy[] = [
  {
    economy: "CHN",
    name: "China",
    gdpShareOfWorld: 0.167724,
    reason:
      "No national balance sheet with a market-valued, published net-worth total. The CNBS/NIFD estimates are neither official national accounts nor redistributable.",
  },
  {
    economy: "IND",
    name: "India",
    gdpShareOfWorld: 0.033678,
    reason:
      "No published national balance sheet of non-financial and financial assets at market value.",
  },
];
