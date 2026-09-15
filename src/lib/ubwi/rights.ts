/**
 * Source rights for the UBWI denominator and numerator.
 *
 * The design invariant this file exists to implement:
 *
 *   A rights state derives from retained, reviewed, hashed terms evidence -- not from
 *   whether the terms URL happens to answer on a given run.
 *
 * The OECD's terms host returns HTTP 403 intermittently to the same URL that grants
 * access: Phase 2B read the terms there, Phase 2C was refused twice twenty minutes
 * later with identical headers. A collector that re-derives rights from a live fetch
 * demotes a permitted source at random, and does it silently, because a 403 looks like
 * an answer.
 *
 * So `recheckTerms` below cannot revoke a grant. A failed recheck records that the
 * terms were not re-confirmed today and touches nothing else. Only a successfully
 * retrieved document whose content hash differs from the stored artifact raises a
 * review flag, and even then the state moves through human review, never automatically.
 *
 * Every `contentHash` below is the SHA-256 of the artifact retained in the research
 * record, and every `decisiveClause` is quoted verbatim from that artifact. A source
 * with no retained artifact carries `termsArtifact: null` and is not cleared -- the
 * absence is visible rather than assumed away.
 */
import type { SourceRightsStatus } from "./types";

/** Whether automated retrieval through this interface is permitted by its own terms. */
export type TermsReviewState = "not_reviewed" | "under_review" | "permitted" | "not_permitted";

/**
 * The retained terms document a rights state is anchored to. The hash and byte length
 * are what make a grant re-checkable years later without re-reading the network.
 */
export type TermsArtifact = {
  url: string;
  /** SHA-256 of the retained artifact. */
  contentHash: string;
  byteLength: number;
  httpStatus: number;
  retrievedAt: string;
  /** The decisive sentence, verbatim. A classification that cannot quote itself is an opinion. */
  decisiveClause: string;
  attributionRequired: string;
};

/**
 * One axis of a permission. `conditional` is the state the two-valued model could not
 * express and that Phase 2D found twice: the terms grant the use, but only to a party
 * that has executed something Urdais does not hold. A conditional grant is not a grant.
 */
export type UsagePermission = "permitted" | "conditional" | "not_permitted" | "not_reviewed";

/**
 * What a source's own terms say about the six things a published index actually does.
 * Recorded per axis because they diverge: Bitstamp permits automated retrieval outright
 * and permits the derived-index use only under a signed agreement, and collapsing those
 * into one flag loses precisely the fact that decides publication.
 */
export type UsageTerms = {
  /** May Urdais read this endpoint on a schedule, by machine? */
  automatedRetrieval: UsagePermission;
  /** May Urdais compute and publish a commercial index derived from the reading? */
  commercialDerivedIndex: UsagePermission;
  /** May Urdais display the reading itself to third parties? */
  redistribution: UsagePermission;
  /** Attribution the terms require, verbatim in substance. Null where none is stated. */
  attribution: string | null;
  /** May Urdais retain the reading in its own store? */
  cachingAndRetention: UsagePermission;
  /** The rate limit the provider publishes, quoted. Null where the terms state none. */
  rateLimit: string | null;
};

/**
 * An explicit product decision to proceed on inferred permission rather than on a grant.
 *
 * This exists because Phase 2E needed a state the model could not express. Chainlink's
 * BTC/USD Data Feed is published through a documented public interface and Urdais found
 * no prohibition on using an observed reference price as an input to a derived index --
 * but Chainlink granted nothing, its terms page could not be read at all, and the
 * upstream providers' terms are undisclosed. Recording that as `permitted` would assert a
 * permission nobody gave. Recording it as `under_review` would assert an open review that
 * an explicit decision has in fact closed.
 *
 * The three lists are the whole point and none is optional. `basis` is what was found,
 * `notFound` is what was looked for and was not there -- which is the half a confident
 * record always loses -- and `limits` is what the inference does not cover. A decision
 * that cannot state what it does not cover has not been thought about.
 */
export type InferredPermission = {
  /** Stable identifier for the decision, so a published point can cite it. */
  decisionId: string;
  decidedOn: string;
  /** The phase and document the decision was taken in. Never a person's name. */
  decidedIn: string;
  /** The affirmative evidence, each item checkable against the retained artifact or docs. */
  basis: readonly string[];
  /** What was searched for and not found. Absence of a prohibition, recorded as absence. */
  notFound: readonly string[];
  /** What this inference does not extend to. */
  limits: readonly string[];
};

export type UbwiSourceInterface = {
  slug: string;
  providerName: string;
  providerKind: "statistical_compiler" | "spot_venue" | "chain_data" | "oracle_network";
  canonicalUrl: string;
  /** Question 1: may Urdais retrieve this automatically? */
  termsReviewState: TermsReviewState;
  /** Question 2: may Urdais use it to construct and publish an index? */
  dataUseTermsState: TermsReviewState;
  /**
   * The per-axis reading behind the two states above. Required on every numerator
   * interface, where the axes diverge and the divergence is the finding; optional on the
   * statistical compilers, whose licences answer all six axes with one sentence.
   */
  usageTerms?: UsageTerms;
  /**
   * Present only where an explicit product decision proceeds on inference rather than on
   * a grant. Its presence is what produces `inferred_permitted` from
   * `effectiveRightsStatus`, and it can never produce `cleared`.
   */
  inferredPermission?: InferredPermission;
  termsArtifact: TermsArtifact | null;
  /**
   * Whether an automated production collector exists and is usable today. False does
   * not by itself block publication of a manually verified observation; it is recorded
   * so the surface never implies an automation Urdais does not have.
   */
  automatedRetrievalAvailable: boolean;
  note: string | null;
};

/**
 * How long a terms artifact may go un-rechecked before it raises a review flag. Ageing
 * past this horizon raises a flag; it never demotes. "We have not re-read this in a
 * year" and "this is no longer permitted" are different facts and only one is evidence.
 */
export const TERMS_RECHECK_HORIZON_DAYS = 365;

export const SOURCE_INTERFACES: readonly UbwiSourceInterface[] = [
  {
    slug: "federal-reserve-z1",
    providerName: "Board of Governors of the Federal Reserve System",
    providerKind: "statistical_compiler",
    canonicalUrl: "https://www.federalreserve.gov/releases/z1/",
    termsReviewState: "permitted",
    dataUseTermsState: "permitted",
    termsArtifact: {
      url: "https://www.federalreserve.gov/disclaimer.htm",
      contentHash: "e3ef8ecfbaa9773198786745ce2ccf6eb4ee6a60d3b532ffe9d6c3350d0f6e00",
      byteLength: 85_130,
      httpStatus: 200,
      retrievedAt: "2026-09-14T23:13:08Z",
      decisiveClause:
        "Unless otherwise indicated, information on Board's website is in the public domain and may be copied and distributed without permission. Please cite to the Board as the source of the information.",
      attributionRequired: "Board of Governors of the Federal Reserve System",
    },
    automatedRetrievalAvailable: true,
    note: null,
  },
  {
    slug: "eurostat-nasa-nama",
    providerName: "Eurostat",
    providerKind: "statistical_compiler",
    canonicalUrl: "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/",
    termsReviewState: "permitted",
    dataUseTermsState: "permitted",
    termsArtifact: {
      url: "https://ec.europa.eu/eurostat/web/main/help/copyright-notice",
      contentHash: "795e8cc7e17d848a846f1e33f373727627c159d9d7c22344684b07b5225bdf61",
      byteLength: 178_111,
      httpStatus: 200,
      retrievedAt: "2026-09-14T23:11:01Z",
      decisiveClause:
        "Reuse of statistical data, metadata, publications, and other dissemination tools published on this website for commercial or non-commercial purposes is authorised provided the source is acknowledged.",
      attributionRequired: "Eurostat",
    },
    automatedRetrievalAvailable: true,
    // The country restriction is why rights are per-dimension rather than one flag per
    // interface. Every economy drawn from this interface is an EU Member State, so the
    // exclusion does not bind -- but it is recorded so that adding one later cannot
    // silently inherit a grant that does not cover it.
    note:
      'Commercial reuse excludes "Data for countries other than: Member States of the European Union (EU), Member States of the European Free Trade Association (EFTA), official EU acceding and candidate countries." Every economy drawn from this interface is an EU Member State.',
  },
  {
    slug: "oecd-sdmx-national-accounts",
    providerName: "OECD",
    providerKind: "statistical_compiler",
    canonicalUrl: "https://sdmx.oecd.org/public/rest/data/",
    termsReviewState: "permitted",
    dataUseTermsState: "permitted",
    termsArtifact: {
      url: "https://www.oecd.org/en/about/terms-conditions.html",
      contentHash: "686091572a8179613f1c3328d7d6291a6d73ae8db91b4ddba3523290c6924285",
      byteLength: 1_482_983,
      httpStatus: 200,
      retrievedAt: "2026-09-14T23:07:49Z",
      decisiveClause:
        "Except where additional restrictions apply as stated above, you can extract from, download, copy, adapt, print, distribute, share and embed Data for any purpose, even for commercial use. You must give appropriate credit to the OECD by using the citation associated with the relevant Data, or, if no specific citation is available, you must cite the source information using the following format: OECD (year), (dataset name),(data source) DOI or URL (accessed on (date)).",
      attributionRequired: "OECD",
    },
    automatedRetrievalAvailable: true,
    // Recorded so the intermittent 403 is never re-read as a revocation.
    note:
      "The terms host returns HTTP 403 intermittently to the same URL that grants access. The grant is anchored to the retained artifact above and corroborated by a Wayback capture; a failed re-fetch means not re-confirmed today, never no longer permitted.",
  },
  {
    slug: "ons-national-balance-sheet",
    providerName: "Office for National Statistics",
    providerKind: "statistical_compiler",
    canonicalUrl: "https://www.ons.gov.uk/economy/nationalaccounts/uksectoraccounts/",
    termsReviewState: "permitted",
    dataUseTermsState: "permitted",
    termsArtifact: {
      url: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
      contentHash: "f5b2b9f2af63647cde889fa6c3508f5705925295b74912c68caa28dd37e64aa5",
      byteLength: 10_450,
      httpStatus: 200,
      retrievedAt: "2026-09-14T23:46:43Z",
      decisiveClause:
        "You are free to: copy, publish, distribute and transmit the Information; adapt the Information; exploit the Information commercially and non-commercially for example, by combining it with other Information, or by including it in your own product or application.",
      attributionRequired:
        "Contains public sector information licensed under the Open Government Licence v3.0",
    },
    automatedRetrievalAvailable: true,
    note: null,
  },
  {
    slug: "statcan-nbsa",
    providerName: "Statistics Canada",
    providerKind: "statistical_compiler",
    canonicalUrl: "https://www150.statcan.gc.ca/t1/wds/rest/",
    termsReviewState: "permitted",
    dataUseTermsState: "permitted",
    termsArtifact: {
      url: "https://www.statcan.gc.ca/en/reference/licence",
      contentHash: "7a6a28dabb0c568dc4f7a711eb36024583f9a2983a0c9328ea3f3c35205a83c6",
      byteLength: 26_879,
      httpStatus: 200,
      retrievedAt: "2026-09-14T23:44:16Z",
      decisiveClause:
        "Subject to this licence, Statistics Canada grants you a worldwide, royalty-free, non-exclusive licence to: use, reproduce, publish, freely distribute, or sell the Information; use, reproduce, publish, freely distribute, or sell Value-added Products; and, sublicence any or all such rights, under terms consistent with this licence.",
      attributionRequired: "Statistics Canada",
    },
    automatedRetrievalAvailable: true,
    // The licence is versioned by access time, which is why the access time and the
    // text are both stored rather than the state alone.
    note:
      "The Open Licence may be modified at any time, effective immediately on posting, and use is governed by the licence in force as of the date and time of access. The retrieval timestamp above is therefore load-bearing.",
  },
  {
    slug: "esri-sna-stock",
    providerName: "Cabinet Office, Economic and Social Research Institute (Japan)",
    providerKind: "statistical_compiler",
    canonicalUrl: "https://www.esri.cao.go.jp/jp/sna/",
    termsReviewState: "permitted",
    dataUseTermsState: "permitted",
    termsArtifact: {
      url: "https://www.cao.go.jp/rule.html",
      contentHash: "1b544b04c32a7c58494715c21841efd909a2dd9f386d1a10900f9d6d36c49b85",
      byteLength: 8_849,
      httpStatus: 200,
      retrievedAt: "2026-09-14T23:51:44Z",
      decisiveClause:
        "当ウェブサイトで公開している情報（以下「コンテンツ」という。）の著作権は、特記されていない限り内閣府に帰属し、権利表記の記載がない限り公共データ利用規約（第1.0版）（デジタル庁）が適用されます。",
      attributionRequired: "内閣府経済社会総合研究所 (Cabinet Office, ESRI)",
    },
    automatedRetrievalAvailable: true,
    note:
      "Cabinet Office content is released under the Digital Agency Public Data Terms of Use v1.0, which permits commercial reuse with attribution. Resolution of www.esri.cao.go.jp fails on some local resolvers; that is an environment fact and never a source state.",
  },
  {
    slug: "abs-asna-5204",
    providerName: "Australian Bureau of Statistics",
    providerKind: "statistical_compiler",
    canonicalUrl: "https://www.abs.gov.au/statistics/economy/national-accounts/",
    termsReviewState: "permitted",
    dataUseTermsState: "permitted",
    termsArtifact: {
      url: "https://www.abs.gov.au/website-privacy-copyright-and-disclaimer",
      contentHash: "30b612a546eac733b8d6130def4b0a040a114bb0281bd57cdf8de64a59651cc6",
      byteLength: 98_905,
      httpStatus: 200,
      retrievedAt: "2026-09-14T23:10:27Z",
      decisiveClause:
        "All material presented on this website is provided under a Creative Commons Attribution 4.0 International licence, with the exception of: the Commonwealth Coat of Arms, the ABS logo, material protected by a trade mark, unit record data (microdata), content supplied by third parties.",
      attributionRequired: "Australian Bureau of Statistics, CC BY 4.0",
    },
    automatedRetrievalAvailable: true,
    note: null,
  },
  {
    slug: "istat-conti-patrimoniali",
    providerName: "Istat",
    providerKind: "statistical_compiler",
    canonicalUrl: "https://esploradati.istat.it/databrowser/",
    termsReviewState: "permitted",
    dataUseTermsState: "permitted",
    termsArtifact: {
      url: "https://www.istat.it/en/legal-notice/",
      contentHash: "a1728dbd7f672b28a47890c88e54700bf3c1683ecd9c6ba22aeb9a2d4fce79e1",
      byteLength: 98_378,
      httpStatus: 200,
      retrievedAt: "2026-09-14T23:10:29Z",
      decisiveClause:
        "Unless otherwise stated, content on this website is licensed under a Creative Commons License – Attribution – 4.0. You are free to: Share — copy and redistribute the material in any medium or format for any purpose, even commercially.",
      attributionRequired: "Istat, CC BY 4.0",
    },
    automatedRetrievalAvailable: true,
    note: null,
  },
  {
    slug: "cbs-statline-85953ned",
    providerName: "Centraal Bureau voor de Statistiek",
    providerKind: "statistical_compiler",
    canonicalUrl: "https://opendata.cbs.nl/ODataApi/odata/85953NED",
    termsReviewState: "permitted",
    dataUseTermsState: "permitted",
    termsArtifact: {
      url: "https://www.cbs.nl/en-gb/about-us/website/copyright",
      contentHash: "c629752ae6b8d9ca4ea4bb32072bdad663d0c3495eddc82df2c583c9de3675cb",
      byteLength: 38_956,
      httpStatus: 200,
      retrievedAt: "2026-09-14T23:10:28Z",
      decisiveClause:
        "Unless otherwise stated, the content of this website is subject to Creative Commons Attribution (CC BY 4.0). This means that the re-use of the content of this site is permitted, provided Statistics Netherlands is cited as the source.",
      attributionRequired: "Statistics Netherlands (CBS), CC BY 4.0",
    },
    automatedRetrievalAvailable: true,
    note: null,
  },
  {
    slug: "bok-ecos-national-balance-sheet",
    providerName: "Bank of Korea",
    providerKind: "statistical_compiler",
    canonicalUrl: "https://ecos.bok.or.kr/api/",
    termsReviewState: "permitted",
    dataUseTermsState: "permitted",
    termsArtifact: {
      url: "https://www.bok.or.kr/portal/main/contents.do?menuNo=200315",
      contentHash: "64e98769fbfe53bba80bfa38e21b282df5f6b2e1da9ea487798b51cdece8edfb",
      byteLength: 391_976,
      httpStatus: 200,
      retrievedAt: "2026-09-14T23:57:39Z",
      decisiveClause:
        "한국은행이 「공공데이터법」 제19조에 따라 공표하여 홈페이지에 게시한 제공대상 공공데이터는 별도의 절차 없이 자유롭게 이용할 수 있습니다.",
      attributionRequired: "Bank of Korea, Economic Statistics System (ECOS)",
    },
    // The one interface where automation is genuinely unavailable today. Whether Urdais
    // may publish a manually verified reading and whether it may run a scheduled
    // collector are two different questions, and only the second is open.
    automatedRetrievalAvailable: false,
    note:
      "Publication rights are cleared and the value is manually verified against the first-party ECOS table. An operational ECOS API key for production retrieval volumes is pending: the Bank of Korea reviews key applications rather than auto-issuing them. This is an automation gap, not a rights gap.",
  },
  {
    slug: "ecb-euro-reference-rates",
    providerName: "European Central Bank",
    providerKind: "statistical_compiler",
    canonicalUrl: "https://data-api.ecb.europa.eu/service/data/EXR/",
    termsReviewState: "permitted",
    dataUseTermsState: "permitted",
    termsArtifact: {
      url: "https://www.ecb.europa.eu/services/disclaimer/html/index.en.html",
      contentHash: "8ec1ff8edb5d458c3b790e380ee95374665385044c33a497eb0bda9f16d433b4",
      byteLength: 107_588,
      httpStatus: 200,
      retrievedAt: "2026-09-15T00:45:15Z",
      decisiveClause:
        "Subject to the exception below, users of this website may make free use of the information obtained directly from it subject to the following conditions: When such information is distributed or reproduced, it must appear accurately and the ECB must be cited as the source. [...] If the information is modified by the user (e.g. by seasonal adjustment of statistical data or calculation of growth rates) this must be stated explicitly.",
      attributionRequired: "European Central Bank",
    },
    automatedRetrievalAvailable: true,
    // The modification clause is why the FX conversion is disclosed on every component
    // rather than folded silently into a USD figure.
    note:
      "The euro foreign exchange reference rates convert national-currency stocks to USD. That conversion is a modification under the ECB's terms and is stated explicitly on every component's FX lineage.",
  },

  {
    slug: "dgbas-national-wealth",
    providerName: "Directorate-General of Budget, Accounting and Statistics, Executive Yuan (Taiwan)",
    providerKind: "statistical_compiler",
    canonicalUrl: "https://eng.stat.gov.tw/cp.aspx?n=2415",
    termsReviewState: "permitted",
    dataUseTermsState: "permitted",
    termsArtifact: {
      url: "https://www.stat.gov.tw/cp.aspx?n=3164",
      contentHash: "1ca109054477863b4718e05249f2b341f1376fc9cde6ef523fd8aa123922c0da",
      byteLength: 74_986,
      httpStatus: 200,
      retrievedAt: "2026-09-15T03:02:00Z",
      // DGBAS's own open-data declaration, quoted in the original. It releases everything
      // the site publishes under the Open Government Data License, Taiwan 1.0: free of
      // charge, non-exclusive, sublicensable, unlimited in time and territory, covering
      // reproduction, adaptation, editing, public transmission and the development of
      // derivative products and services -- and it says in terms that the grant is not
      // afterwards withdrawn and needs no separate written permission. Attribution is the
      // one condition, and it is a condition rather than a formality: the licence text
      // states that a user who fails to attribute is treated as never having been granted
      // the rights at all.
      decisiveClause:
        "為利各界廣為利用網站資料，行政院主計總處網站上刊載之所有資料與素材，其得受著作權保護之範圍，採政府資料開放授權條款-第1版發布，以無償、非專屬、得由使用者再授權之方式提供公眾使用，使用者得不限時間及地域，重製、改作、編輯、公開傳輸或為其他方式之利用，開發各種產品或服務（簡稱加值衍生物），此一授權行為不會嗣後撤回，使用者亦無須取得本機關之書面或其他方式授權；然使用時應註明出處。",
      attributionRequired:
        "行政院主計總處 (Directorate-General of Budget, Accounting and Statistics, Executive Yuan, R.O.C. (Taiwan))",
    },
    automatedRetrievalAvailable: true,
    note:
      "National Wealth Statistics, reference years 2020-2024, updated 29 April 2026. Table 4 carries the sector balance sheet in units of 100 million NT$ and is the series Urdais reads; Table 1 publishes the same totals rounded to two decimal places of NT$ trillions. The licence is the Open Government Data License, Taiwan 1.0, which data.gov.tw's own English text states is compatible with CC BY 4.0. Land is included in the published total at announced current land value rather than market price, which DGBAS states in Table 1 note 3; that is an asset-valuation caveat recorded on the component, not a rights question.",
  },

  {
    slug: "cbc-exchange-rates",
    providerName: "Central Bank of the Republic of China (Taiwan)",
    providerKind: "statistical_compiler",
    canonicalUrl: "https://www.cbc.gov.tw/en/cp-4237-165072-15ec2-2.html",
    termsReviewState: "permitted",
    dataUseTermsState: "permitted",
    termsArtifact: {
      url: "https://www.cbc.gov.tw/en/cp-958-40419-F8209-2.html",
      contentHash: "443105f3af2316087daa9a37092d21737881bb48e7db1b1d199e4bf3b6703f20",
      byteLength: 23_719,
      httpStatus: 200,
      retrievedAt: "2026-09-15T03:02:00Z",
      decisiveClause:
        'all of data and materials on the Central Bank of the Republic of China (Taiwan)(herein known as CBC) website, which are deemed as protected under copyrights and published publicly, are provided under "Open Government Data License, version 1.0 (OGDL-Taiwan-1.0), Link: https://data.gov.tw/license" in a free of charge, non-exclusive, and sublicensable method for the public.',
      attributionRequired: "Central Bank of the Republic of China (Taiwan)",
    },
    automatedRetrievalAvailable: true,
    note:
      "The NT$/US$ interbank spot market closing rate. Taiwan's stock is converted at the 31 December 2024 fixing of 32.781, matched to the component's own reference date; DGBAS's national-accounts workbook publishes a 32.11 rate for 2024 but labels it 'Average of daily figures', which is a period average and would be the wrong basis for a year-end stock. The same OGDL-Taiwan 1.0 licence as DGBAS, declared by the CBC in English on its own site.",
  },

  {
    slug: "statsnz-annual-balance-sheets",
    providerName: "Stats NZ",
    providerKind: "statistical_compiler",
    canonicalUrl: "https://www.stats.govt.nz/information-releases/annual-balance-sheets-2024-provisional/",
    // Registered although it supplies nothing, because the reason it supplies nothing is
    // a rights fact and a rights fact belongs in the rights record. New Zealand's data is
    // current, land-inclusive and exactly the denominator's concept; only the licence is
    // unestablished, and recording that as `not_reviewed` keeps the gap visible instead of
    // leaving it as a sentence in an exclusion note.
    termsReviewState: "not_reviewed",
    dataUseTermsState: "not_reviewed",
    termsArtifact: null,
    automatedRetrievalAvailable: true,
    note:
      "Stats NZ publishes Annual balance sheets: 2024 (provisional), released 27 November 2025: total-economy net worth at market value, NZD 2,973,715 mn at 31 March 2024, of which NZD 1,634,567 mn non-produced non-financial assets, series SG07NLE00000AN20000S800C0. Worth 0.23 pp of world GDP and enough on its own to bring the modelled share under the 40 % ceiling. No terms artifact could be retrieved: stats.govt.nz/about-us/copyright/ returns HTTP 200 with a client-rendered shell carrying 22 characters of body text, the CSV and workbook state no licence, and browser automation is unavailable on the machine this was attempted from. That is a retrieval fact; it is not a refusal, and it is not permission either. One successful retrieval of the licence text would settle it.",
  },

  // ---------------------------------------------------------------- numerator sources
  //
  // Phase 1 concluded that building the numerator from public venue tickers read
  // directly removes the licensing dependency that a vendor aggregate would carry. That
  // conclusion was about *vendor* licensing and it was correct as far as it went. It was
  // never a statement about the venues' own terms, and Phase 2D retrieved those terms.
  //
  // The reading is that reproducing the construction yourself does not reproduce the
  // permission. Three of the four interfaces do not permit the use Urdais actually makes
  // -- retain the reading, compute a commercial index from it, and display both -- and
  // the fourth grants it only under a signed agreement Urdais does not hold. Every state
  // below is anchored to a document retrieved on 15 September 2026 and retained with its
  // hash, and every `decisiveClause` is a verbatim slice of that document.
  {
    slug: "blockchain-info-supply",
    providerName: "Blockchain.com",
    providerKind: "chain_data",
    canonicalUrl: "https://blockchain.info/q/totalbc",
    // Retrieval is granted outright. The derived-index use is not addressed by any grant
    // and the service is scoped "solely for informational purposes", so the second axis
    // stays open rather than being read as permission by silence.
    termsReviewState: "permitted",
    dataUseTermsState: "under_review",
    usageTerms: {
      automatedRetrieval: "permitted",
      commercialDerivedIndex: "not_reviewed",
      redistribution: "not_reviewed",
      attribution: null,
      cachingAndRetention: "not_reviewed",
      rateLimit: null,
    },
    termsArtifact: {
      url: "https://www.blockchain.com/legal/terms",
      contentHash: "0e2b690483d494a013ade657ac1e9a84278bc60d0d6fe9c479d13e884de791ef",
      byteLength: 1_476_048,
      httpStatus: 200,
      retrievedAt: "2026-09-15T01:52:11Z",
      decisiveClause:
        "Subject to these Terms, we grant you a revocable, limited, non-exclusive, non-transferable licence to access and use the Explorer API. [...] The Explorer and the Explorer API are provided solely for informational purposes and do not constitute investment advice, legal advice, tax advice, financial advice or any recommendation to engage in any transaction involving crypto-assets or any other assets.",
      attributionRequired: "",
    },
    automatedRetrievalAvailable: true,
    note:
      "Section 20 (Explorer) of the Blockchain.com Terms of Service governs the Explorer API and grants access and use. It states no redistribution, retention or attribution terms, and scopes the service to informational purposes; it therefore does not grant the commercial derived-index publication Urdais performs. A separate 'API Terms of Service' is referenced in the site's own translation bundle but is served from no reachable path on www.blockchain.com (/legal/api returns HTTP 404), so it could not be retrieved and nothing is assumed from it. Issued supply remains a deterministic property of the chain: it is reproducible from the issuance schedule at a stated height and does not depend on this interface for its truth, only for its retrieval.",
  },
  {
    slug: "coinbase-spot",
    providerName: "Coinbase",
    providerKind: "spot_venue",
    canonicalUrl: "https://api.coinbase.com/v2/prices/BTC-USD/spot",
    // The only interface in the whole record whose terms prohibit the retrieval itself.
    termsReviewState: "not_permitted",
    dataUseTermsState: "not_permitted",
    usageTerms: {
      automatedRetrieval: "not_permitted",
      commercialDerivedIndex: "not_permitted",
      redistribution: "not_permitted",
      attribution: null,
      cachingAndRetention: "not_permitted",
      rateLimit: null,
    },
    termsArtifact: {
      url: "https://www.coinbase.com/legal/developer-platform/terms-of-service",
      contentHash: "1fe28153ef70be9ecebdc14a5603c572f269c4851b0f231f1837eca370484feb",
      byteLength: 610_772,
      httpStatus: 200,
      retrievedAt: "2026-09-15T01:47:52Z",
      decisiveClause:
        "Collect, cache, aggregate, or store data or content accessed via the CDP Tools other than for purposes allowed under these terms. You may not share such data or content with third parties in any manner without Coinbase’s prior written authorization. Further, you are strictly prohibited from recording data or content accessed via the CDP Tools through the use of any automated programs, software, or any other method of screen scraping.",
      attributionRequired: "",
    },
    automatedRetrievalAvailable: true,
    note:
      "The clause above is item 9 (Use Restrictions) of the Coinbase Developer Platform Terms. Urdais's numerator does all four prohibited things: it records the quote by automated program, caches it, aggregates it into a median, and shares it on a public surface. None is permitted without prior written authorization, which Urdais does not have. The licence grant in the same document is narrower still -- it covers 'the CDP Tools and underlying content available at https://cdp.coinbase.com', and the production endpoint is api.coinbase.com -- so even a permissive reading of the restrictions would leave the grant unestablished for this interface.",
  },
  {
    slug: "bitstamp-ticker",
    providerName: "Bitstamp",
    providerKind: "spot_venue",
    canonicalUrl: "https://www.bitstamp.net/api/v2/ticker/btcusd/",
    // Retrieval is granted outright and generously. The derived-index use is granted too
    // -- to a party that has signed for it. Urdais has not, and an unsigned conditional
    // grant is not a grant.
    termsReviewState: "permitted",
    dataUseTermsState: "under_review",
    usageTerms: {
      automatedRetrieval: "permitted",
      commercialDerivedIndex: "conditional",
      redistribution: "conditional",
      attribution: null,
      cachingAndRetention: "conditional",
      rateLimit:
        "As standard, all clients can make 400 requests per second. There is a default limit threshold of 10,000 requests per 10 minutes in place.",
    },
    termsArtifact: {
      url: "https://www.bitstamp.net/api/",
      contentHash: "d11bf1c0dec89cf397eef81766fa59fa75d90cd09bbe9d301b1e57d007abef76",
      byteLength: 2_007_325,
      httpStatus: 200,
      retrievedAt: "2026-09-15T01:47:44Z",
      decisiveClause:
        "Companies seeking to utilize Bitstamp's exchange data for their own commercial purposes are directed to contact partners@bitstamp.net to receive and sign a commercial use Data License Agreement. Bitstamp allows the incorporation and redistribution of our exchange data for commercial purposes. This includes the right to create ratios, calculations, new original works, statistics, and similar, based on the exchange data.",
      attributionRequired: "",
    },
    automatedRetrievalAvailable: true,
    note:
      "This is the closest any numerator venue comes to a grant, and it is the clearest 'not yet'. Bitstamp's own API documentation says in terms that it allows incorporation and redistribution of its exchange data for commercial purposes, including the right to create calculations from it -- which is exactly UBWI -- and directs companies wanting that to sign a Data License Agreement. Urdais holds no such agreement, so the permission is conditional and unmet. Executing one is an outreach decision that requires explicit approval and was not taken in this phase. The bitstamp.net terms-of-use page itself sits behind an Imperva challenge that returns a 212-byte stub to every request; that is a fact about the retrieval, and the rights state above rests on the API documentation, which is first-party and was retrieved cleanly.",
  },
  {
    slug: "kraken-ticker",
    providerName: "Kraken",
    providerKind: "spot_venue",
    canonicalUrl: "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
    termsReviewState: "permitted",
    dataUseTermsState: "not_permitted",
    usageTerms: {
      automatedRetrieval: "permitted",
      commercialDerivedIndex: "not_permitted",
      redistribution: "not_permitted",
      attribution: null,
      cachingAndRetention: "not_reviewed",
      rateLimit: null,
    },
    termsArtifact: {
      url: "https://www.kraken.com/legal/global-terms",
      contentHash: "6e61bf4ebe741d246e33849f95d10015d8a14d52b6f87501e0f15bacb4d7bea0",
      byteLength: 3_633_626,
      httpStatus: 200,
      retrievedAt: "2026-09-15T01:47:36Z",
      decisiveClause:
        "So long as you comply with these Terms, you are permitted to use our services, and Our Content made available to you as part of our services, but only for your own benefit. We can take away this permission at any time for any reason. You do not have or acquire any rights to Our Content beyond the limited, revocable permission in the previous sentence. [...] use (except as expressly permitted in these Terms), license, sublicense, sell, resell, transfer, assign, distribute or otherwise commercially exploit or make available to any third party Our Content in any way,",
      attributionRequired: "",
    },
    automatedRetrievalAvailable: true,
    note:
      "Kraken's Global Terms of Service define 'Our Content' as the services and platforms and all content and materials found on them, which reaches a published ticker price. The permission granted is to use it 'only for your own benefit'; commercially exploiting it or making it available to a third party is listed among the prohibited acts, and the document directs anyone wanting another purpose to seek prior permission first. Publishing an index derived from the price, and displaying the venue row that produced it, is the other purpose. The Global Terms are the applicable ones: Kraken serves separate Canadian, EEA and Brazil terms and the Global terms apply everywhere else.",
  },

  // ------------------------------------------------------- the 1.1.0 price source
  //
  // The one interface in this record whose state is `inferred_permitted`, and the reasons
  // for that are worth stating plainly rather than leaving in a field.
  //
  // What could be retrieved: Chainlink's own documentation of the Data Feed interface, and
  // Chainlink's own feed metadata document -- the file docs.chain.link itself renders --
  // giving the proxy address, the aggregator, the 3600-second heartbeat, the 0.5 % deviation
  // threshold and the product code `BTC/USD-RefPrice-DF-Ethereum-001`. Both HTTP 200, both
  // retained, and every figure in ./chainlink.ts was additionally read from the live
  // contract through two independent RPC endpoints.
  //
  // What could not: the terms. https://chain.link/terms -- the document docs.chain.link's
  // own footer names as governing -- returned HTTP 200 and 3,441 characters of navigation
  // chrome to a plain HTTP client. The page renders its text client-side; the retained
  // bytes contain no occurrence of "licence", "license", "grant", "warrant", "liability" or
  // "arbitration". That is a retrieval fact. It is not a refusal and it is not permission,
  // and nothing here is quoted from a document Urdais has not read.
  //
  // So the state cannot be `cleared`: no grant was read. It is also not honestly
  // `under_review`: the review is closed by an explicit decision to proceed. It is
  // `inferred_permitted`, which is a weaker thing that the model now says out loud.
  {
    slug: "chainlink-btc-usd-ethereum",
    providerName: "Chainlink",
    providerKind: "oracle_network",
    canonicalUrl:
      "https://etherscan.io/address/0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c#readContract",
    // Reading a public Ethereum contract through a public RPC endpoint is not an act the
    // provider's terms gate: the data is published onchain by design and any node serves
    // it. That axis is genuinely permitted, and it is the only one that is.
    termsReviewState: "permitted",
    // The axis that decides publication, and the one no document answered.
    dataUseTermsState: "under_review",
    usageTerms: {
      automatedRetrieval: "permitted",
      commercialDerivedIndex: "not_reviewed",
      redistribution: "not_reviewed",
      attribution: null,
      cachingAndRetention: "not_reviewed",
      rateLimit: null,
    },
    inferredPermission: {
      decisionId: "ubwi-chainlink-inferred-2026-09-15",
      decidedOn: "2026-09-15",
      decidedIn: "UBWI Phase 2E; docs/methodology/ubwi.md v1.1.0",
      basis: [
        "The feed is exposed through Chainlink's documented public interface: docs.chain.link/data-feeds documents the AggregatorV3Interface read path, and Chainlink's own feed metadata document publishes this proxy address, its heartbeat and its deviation threshold.",
        "The data is published onchain by the oracle network and is readable by any Ethereum node; Urdais reads it through public RPC endpoints requiring no key, no account and no acceptance of a click-through agreement.",
        "Urdais is not reselling or redistributing the raw Chainlink feed. It reads one reference price at one instant.",
        "That single observed reference price is an input to Urdais's own derived wealth index, alongside a Bitcoin supply figure and a wealth denominator Chainlink has no part in.",
      ],
      notFound: [
        "No Chainlink terms document could be read at all: https://chain.link/terms returns HTTP 200 with a client-rendered shell carrying 3,441 characters of navigation text and no terms prose.",
        "No explicit prohibition of the Coinbase or Kraken kind -- on caching, on automated recording, or on creating an external financial index from the data -- was found in any Chainlink document Urdais was able to retrieve.",
        "No explicit affirmative grant of a derived-index right was found either. The absence runs in both directions and both directions are recorded.",
      ],
      limits: [
        "This is an inference, not a licence. Chainlink has granted Urdais nothing, has not been contacted, and no outreach was sent.",
        "It extends to reading one reference price as an index input. It does not extend to redistributing the feed, to mirroring it, or to presenting Urdais's output as a Chainlink product.",
        "The terms of the upstream data providers whose data the oracle network aggregates are undisclosed to Urdais and are not covered by this inference.",
        "One successful retrieval of Chainlink's terms text settles this either way and supersedes the inference.",
      ],
    },
    termsArtifact: {
      // Chainlink's documentation of the interface, which is what the inference rests on.
      // It is not a licence and is not cited as one.
      url: "https://docs.chain.link/data-feeds",
      contentHash: "cd1500be9c7fbc512ba304e30626bf7c7c4f41b92c8c0e6eabc81d8d3ad585e6",
      byteLength: 361_460,
      httpStatus: 200,
      retrievedAt: "2026-09-15T03:13:35Z",
      decisiveClause:
        "Chainlink Data Feeds are the quickest way to connect your smart contracts to real-world data such as asset prices, reserve balances, and L2 sequencer health. [...] Data Feeds aggregate many data sources and publish them onchain using a combination of the Decentralized Data Model and Offchain Reporting. [...] Chainlink Data Feeds do not provide streaming data. Rather, the aggregator updates its latestAnswer when the value deviates beyond a specified threshold or when the heartbeat idle time has passed. [...] Your application should track the latestTimestamp variable or use the updatedAt value from the latestRoundData() function to make sure that the latest answer is recent enough for your application to use it.",
      attributionRequired: "",
    },
    automatedRetrievalAvailable: true,
    note:
      "Chainlink BTC/USD Data Feed on Ethereum mainnet, proxy 0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c. Verified live through two independent public RPC endpoints on 15 September 2026: chain id 1, description() 'BTC / USD', decimals() 8, version() 6, phaseId() 7, aggregator() 0x4a3411ac2948b33c69666b35cc6d055b27ea84f1 reporting typeAndVersion 'AccessControlledOCR2Aggregator 1.0.0'. Chainlink's own feed metadata document gives heartbeat 3600 s, deviation threshold 0.5 % and product name BTC/USD-RefPrice-DF-Ethereum-001, confirming a standard push-based Data Feed reference price rather than Data Streams or Smart Value Recapture. The quoted clause is the documentation of the interface, not a grant: it is retained because the inference rests on the interface being publicly documented, and because its last two sentences are the source of the staleness rule Urdais applies. Chainlink is not a spot exchange and Urdais cannot reconstruct the underlying source basket; the documentation says the feed aggregates many data sources and names none of them.",
  },
];

const BY_SLUG = new Map(SOURCE_INTERFACES.map((iface) => [iface.slug, iface]));

export function sourceInterface(slug: string): UbwiSourceInterface | undefined {
  return BY_SLUG.get(slug);
}

/**
 * A source's effective rights state, derived from the retained artifact. This is the
 * only function that decides whether a source may enter a published denominator.
 * A source with no retained artifact is never cleared, whatever its states claim.
 *
 * The order of the tests is the policy. A refusal on either axis wins over everything,
 * including an inference: an explicit "no" is never something a product decision may
 * infer its way past. A grant on both axes, evidenced by a retained artifact, is
 * `cleared`. Only then may a recorded inference apply, and the most it can produce is
 * `inferred_permitted` -- never `cleared`, so no downstream check can mistake the two.
 */
export function effectiveRightsStatus(iface: UbwiSourceInterface): SourceRightsStatus {
  if (iface.termsReviewState === "not_permitted" || iface.dataUseTermsState === "not_permitted") {
    return "blocked";
  }
  if (
    iface.termsArtifact !== null &&
    iface.termsReviewState === "permitted" &&
    iface.dataUseTermsState === "permitted"
  ) {
    return "cleared";
  }
  // An inference must still rest on a retained document. "We inferred it from nothing" is
  // the failure mode the whole terms-integrity mechanism exists to refuse.
  if (iface.inferredPermission !== undefined && iface.termsArtifact !== null) {
    return "inferred_permitted";
  }
  return "under_review";
}

/**
 * Whether a state may supply a *numerator* source. Inferred permission is admissible here
 * and nowhere else: the denominator's constituents are checked against `"cleared"`
 * directly, so no denominator path can reach this function by accident.
 */
export function mayPublishNumeratorFrom(status: SourceRightsStatus): boolean {
  return status === "cleared" || status === "inferred_permitted";
}

/**
 * Why a retrieval failed. Only `content_shape` and `content_empty` may inform a
 * judgement about a source. `dns` and `transport` are facts about the environment:
 * two national compilers were recorded as blocked across two research phases because
 * of one machine's DNS resolver, and Japan's complete balance sheet was two lookups away.
 */
export type RetrievalFailureKind =
  | "dns"
  | "transport"
  | "tls"
  | "http_status"
  | "content_shape"
  | "content_empty";

const SOURCE_INFORMING_FAILURES: readonly RetrievalFailureKind[] = [
  "content_shape",
  "content_empty",
];

export function failureMayInformSourceState(kind: RetrievalFailureKind): boolean {
  return SOURCE_INFORMING_FAILURES.includes(kind);
}

/** The outcome of an attempt to re-read a source's terms. */
export type TermsRecheckAttempt = {
  attemptedAt: string;
  /** Null when the fetch never produced a document -- DNS, transport or TLS failure. */
  httpStatus: number | null;
  /** SHA-256 of the retrieved document, when one was retrieved. */
  contentHash: string | null;
  failureKind: RetrievalFailureKind | null;
};

export type TermsRecheckResult = {
  slug: string;
  /** The rights state after the recheck. Never worse than the retained artifact supports. */
  rightsStatus: SourceRightsStatus;
  /** True only where the recheck actually re-read the document. */
  reconfirmed: boolean;
  /** True where a retrieved document differs from the stored artifact. */
  reviewFlagRaised: boolean;
  lastRecheckedAt: string;
  note: string;
};

/**
 * Re-check a source's terms. This function cannot revoke a grant, by construction:
 * no branch returns a rights state worse than the retained artifact supports. A failed
 * recheck records the attempt and nothing else.
 */
export function recheckTerms(
  iface: UbwiSourceInterface,
  attempt: TermsRecheckAttempt,
): TermsRecheckResult {
  const established = effectiveRightsStatus(iface);
  const base = {
    slug: iface.slug,
    rightsStatus: established,
    lastRecheckedAt: attempt.attemptedAt,
  };

  if (attempt.failureKind !== null || attempt.httpStatus === null || attempt.httpStatus >= 400) {
    const cause = attempt.failureKind ?? `HTTP ${attempt.httpStatus}`;
    const anchor = iface.termsArtifact?.retrievedAt ?? "no retained artifact";
    return {
      ...base,
      reconfirmed: false,
      reviewFlagRaised: false,
      note: `not re-confirmed today (${cause}); the state remains anchored to ${anchor}`,
    };
  }

  if (
    iface.termsArtifact !== null &&
    attempt.contentHash !== null &&
    attempt.contentHash !== iface.termsArtifact.contentHash
  ) {
    return {
      ...base,
      reconfirmed: true,
      // A changed document raises a flag for human review. It does not move the state.
      reviewFlagRaised: true,
      note: "terms document changed since the retained artifact; queued for review, state unchanged",
    };
  }

  return {
    ...base,
    reconfirmed: true,
    reviewFlagRaised: false,
    note: "terms re-confirmed unchanged",
  };
}

/** Whether a retained artifact has aged past the recheck horizon. Raises a flag, never a demotion. */
export function termsArtifactIsStale(iface: UbwiSourceInterface, now: Date): boolean {
  if (iface.termsArtifact === null) return true;
  const retrieved = Date.parse(iface.termsArtifact.retrievedAt);
  if (Number.isNaN(retrieved)) return true;
  return (now.getTime() - retrieved) / 86_400_000 > TERMS_RECHECK_HORIZON_DAYS;
}
