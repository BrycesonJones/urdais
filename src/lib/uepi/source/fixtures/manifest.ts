/**
 * The committed source fixtures: what each one is, where it came from, and what it proves.
 *
 * Every implemented adapter is pinned to at least one artifact captured from the market operator
 * itself on a named operating day. That is the point of the phase. Six months from now, when a
 * parser starts failing, this directory is what distinguishes "the ISO changed its file" from "the
 * reader was always wrong" -- a distinction a hand-written mock cannot make, because a mock is
 * only ever evidence of what its author believed.
 *
 * Two digests per fixture, and they are not the same claim. `originalSha256` identifies the
 * artifact as the operator served it. `fixtureSha256` identifies the bytes committed here. For
 * CAISO and NYISO the two are equal and the committed file *is* the artifact. For MISO and SPP the
 * originals are 1.2 MB and 4 MB of every node in the footprint, so the committed file is a row
 * subset produced by `scripts/uepi/reduce-fixture.ts`: whole lines, unedited, with a few rows kept
 * deliberately so the fixture can prove what the parser rejects. A reduced fixture is never
 * presented as the original, and `reduction` says exactly how it was made.
 *
 * Rights govern retention here, separately from publication. All four sources are retained
 * internally under the determinations UEPI-1 recorded; none of these files is served publicly, and
 * three of the four markets may not be published at all.
 */

export type FixtureCompleteness =
  /** The committed bytes are the artifact exactly as retrieved. */
  | { kind: "complete" }
  /** The committed bytes are a documented subset of the artifact. */
  | { kind: "reduced"; reduction: string };

export type SourceFixture = {
  readonly file: string;
  readonly seriesId: string;
  readonly market: string;
  readonly sourceOrganization: string;
  readonly dataset: string;
  /** The exact URL the artifact was retrieved from. */
  readonly url: string;
  readonly operatingDate: string;
  /** Why this date was chosen, rather than any date that happened to work. */
  readonly why: string;
  readonly retrievedAt: string;
  readonly sourceTimezone: string;
  readonly format: string;
  readonly completeness: FixtureCompleteness;
  readonly originalSha256: string;
  readonly originalBytes: number;
  readonly fixtureSha256: string;
  readonly fixtureBytes: number;
  readonly attribution: string;
  /** What a reader of this file needs to know that the file does not say about itself. */
  readonly caveats: readonly string[];
};

const MISO_REDUCTION =
  "row subset via scripts/uepi/reduce-fixture.ts: the preamble and header, every INDIANA.HUB and "
  + "MINN.HUB row, and up to three rows each of ILLINOIS.HUB, MICHIGAN.HUB, NIPS.* and AECI.* kept "
  + "so the fixture proves what the parser turns away. Lines are copied verbatim; no value is edited.";

const SPP_REDUCTION =
  "row subset via scripts/uepi/reduce-fixture.ts: the header, every SPPNORTH_HUB and SPPSOUTH_HUB "
  + "row, and up to three rows each of BAA SWPW, the CSWS_HUB participant hub and settlement "
  + "location AEC, kept so the fixture proves the western market and participant hubs are excluded. "
  + "Lines are copied verbatim; no value is edited.";

export const SOURCE_FIXTURES: readonly SourceFixture[] = [
  {
    file: "spp-2026-04-01.csv",
    seriesId: "uepi-spp",
    market: "SPP",
    sourceOrganization: "Southwest Power Pool",
    dataset: "Integrated Marketplace, day-ahead LMP by settlement location",
    url: "https://portal.spp.org/file-browser-api/download/da-lmp-by-settlement-location?path=/2026/04/By_Day/DA-LMP-SL-202604010100.csv",
    operatingDate: "2026-04-01",
    why: "A day SPP wrote without zero-padding or seconds: `4/1/2026 6:00`. One of eleven days a thirteen-month production backfill refused, which is how the variant was found.",
    retrievedAt: "2026-09-26T03:55:00Z",
    sourceTimezone: "America/Chicago (hour-ending), with a GMT interval end",
    format: "CSV",
    completeness: { kind: "reduced", reduction: SPP_REDUCTION },
    originalSha256: "389b97dff7fb75f3765e48f59436454edfb669749cdeec1032d3eb2d21b2821d",
    originalBytes: 3758731,
    fixtureSha256: "d3c4a86380da95c7d40c84ccead3aab79df64a4244e983b26a73dc596965b1dd",
    fixtureBytes: 4990,
    attribution: "Source: SPP. Retained internally; commercial publication needs written SPP authorization.",
    caveats: [
      "GMTIntervalEnd reads `4/1/2026 6:00`: no seconds, no zero-padding.",
      "The columns are the documented nine, in the documented casing.",
    ],
  },
  {
    file: "spp-2026-06-01.csv",
    seriesId: "uepi-spp",
    market: "SPP",
    sourceOrganization: "Southwest Power Pool",
    dataset: "Integrated Marketplace, day-ahead LMP by settlement location",
    url: "https://portal.spp.org/file-browser-api/download/da-lmp-by-settlement-location?path=/2026/06/By_Day/DA-LMP-SL-202606010100.csv",
    operatingDate: "2026-06-01",
    why: "The third spelling of the same field: `6/1/2026 06:00`, padded hour and still no seconds.",
    retrievedAt: "2026-09-26T03:55:00Z",
    sourceTimezone: "America/Chicago (hour-ending), with a GMT interval end",
    format: "CSV",
    completeness: { kind: "reduced", reduction: SPP_REDUCTION },
    originalSha256: "bbdbe9a1c146a219a3c59e04bd52dda4e55f5cd980888c06ba352fe8d5a6ddee",
    originalBytes: 3640976,
    fixtureSha256: "133e8ecd681d3030967ed6192fb732a1c61f9efe2ba4551d9839d4d77a748d05",
    fixtureBytes: 4998,
    attribution: "Source: SPP. Retained internally; commercial publication needs written SPP authorization.",
    caveats: [
      "GMTIntervalEnd reads `6/1/2026 06:00`.",
      "Padding and seconds vary by day rather than by era, so neither can be inferred from a date.",
    ],
  },
  {
    file: "spp-2026-06-04.csv",
    seriesId: "uepi-spp",
    market: "SPP",
    sourceOrganization: "Southwest Power Pool",
    dataset: "Integrated Marketplace, day-ahead LMP by settlement location",
    url: "https://portal.spp.org/file-browser-api/download/da-lmp-by-settlement-location?path=/2026/06/By_Day/DA-LMP-SL-202606040100.csv",
    operatingDate: "2026-06-04",
    why: "The day SPP shipped the header in upper case, with `SETTLEMENT_LOCATION` for `Settlement Location`. A positional or case-sensitive reader takes the wrong field or none.",
    retrievedAt: "2026-09-26T03:55:00Z",
    sourceTimezone: "America/Chicago (hour-ending), with a GMT interval end",
    format: "CSV",
    completeness: { kind: "reduced", reduction: SPP_REDUCTION },
    originalSha256: "930e82a6bf5da1f16298d4abcd61949a80d9b35123e318e6d8b930a7bac58416",
    originalBytes: 3761723,
    fixtureSha256: "65ed2ddc841b3b43dfffedc9d0fa4ea7020823e89d969caefca9c1e3afbccb37",
    fixtureBytes: 4965,
    attribution: "Source: SPP. Retained internally; commercial publication needs written SPP authorization.",
    caveats: [
      "Header reads `INTERVAL,GMTINTERVALEND,BAA,SETTLEMENT_LOCATION,PNODE,LMP,MLC,MCC,MEC`.",
      "The columns themselves are unchanged; only their spelling is.",
    ],
  },
  {
    file: "miso-2025-12-01.csv",
    seriesId: "uepi-miso",
    market: "MISO",
    sourceOrganization: "Midcontinent Independent System Operator",
    dataset: "Day-Ahead Market ExPost LMPs, daily report",
    url: "https://docs.misoenergy.org/marketreports/20251201_da_expost_lmp.csv",
    operatingDate: "2025-12-01",
    why: "The day MISO wrote its report date as `12/1/2025` rather than `12/01/2025`. The parser "
      + "required the padded form and refused the day; this fixture is the evidence that both exist.",
    retrievedAt: "2026-09-26T03:55:00Z",
    sourceTimezone: "Etc/GMT+5 (Eastern Standard Time all year, hour-ending)",
    format: "CSV with a four-line preamble and a wide HE 1..HE 24 body",
    completeness: { kind: "reduced", reduction: MISO_REDUCTION },
    originalSha256: "3b76ec51a8bf93a4ffbba46ed766855d5c23fd43ed5395cd41c442285501f39e",
    originalBytes: 1224717,
    fixtureSha256: "c4c4480794cc9b45a299a6178d06dcdf5e3d3918ae2f2cdac972ba99c931b1df",
    fixtureBytes: 3214,
    attribution: "Source: MISO. Retained internally; MISO's terms forbid publishing derived works.",
    caveats: [
      "The preamble date is unpadded: `12/1/2025`.",
    ],
  },

  // ------------------------------------------------------------------ ERCOT
  {
    file: "ercot-2026-09-23.json",
    seriesId: "uepi-ercot",
    market: "ERCOT",
    sourceOrganization: "Electric Reliability Council of Texas",
    dataset: "Public API NP4-190-CD, DAM Settlement Point Prices",
    url: "https://api.ercot.com/api/public-reports/np4-190-cd/dam_stlmnt_pnt_prices?deliveryDateFrom=2026-09-23&deliveryDateTo=2026-09-23&settlementPoint=HB_HUBAVG&size=100",
    operatingDate: "2026-09-23",
    why: "An ordinary 24-hour day, and the day every other market's ordinary fixture covers, so the "
      + "four constructs can be compared on one date.",
    retrievedAt: "2026-09-25T18:05:00Z",
    sourceTimezone: "America/Chicago (hour-ending)",
    format: "JSON: a `fields` descriptor and positional `data` rows",
    completeness: { kind: "complete" },
    originalSha256: "6c9cc034023a23086d97e008ab22a924aa6246a72f4e274009bbc5885d9375a1",
    originalBytes: 2447,
    fixtureSha256: "6c9cc034023a23086d97e008ab22a924aa6246a72f4e274009bbc5885d9375a1",
    fixtureBytes: 2447,
    attribution: "Source: ERCOT. Urdais calculation; ERCOT does not guarantee the accuracy of derived compilations.",
    caveats: [
      "The request names the settlement point, so the response holds one hub rather than the footprint.",
      "Rows are positional arrays described by the `fields` list; column order is read, never assumed.",
      "The response carries no credential: the token and subscription key travel in headers.",
    ],
  },
  {
    file: "ercot-2026-03-08.json",
    seriesId: "uepi-ercot",
    market: "ERCOT",
    sourceOrganization: "Electric Reliability Council of Texas",
    dataset: "Public API NP4-190-CD, DAM Settlement Point Prices",
    url: "https://api.ercot.com/api/public-reports/np4-190-cd/dam_stlmnt_pnt_prices?deliveryDateFrom=2026-03-08&deliveryDateTo=2026-03-08&settlementPoint=HB_HUBAVG&size=100",
    operatingDate: "2026-03-08",
    why: "Spring forward. The specification recorded ERCOT's transition behaviour as expected and "
      + "unverified; this file is the evidence that closes it.",
    retrievedAt: "2026-09-25T18:05:00Z",
    sourceTimezone: "America/Chicago (hour-ending)",
    format: "JSON: a `fields` descriptor and positional `data` rows",
    completeness: { kind: "complete" },
    originalSha256: "3dc85f397649af0af4cd2c48d040556acc0eb52c778f07c920e438d753876c15",
    originalBytes: 2403,
    fixtureSha256: "3dc85f397649af0af4cd2c48d040556acc0eb52c778f07c920e438d753876c15",
    fixtureBytes: 2403,
    attribution: "Source: ERCOT. Urdais calculation; ERCOT does not guarantee the accuracy of derived compilations.",
    caveats: ["23 rows. Hour ending runs 01:00, 02:00, 04:00 … 24:00: the missing hour is omitted by label."],
  },
  {
    file: "ercot-2025-11-02.json",
    seriesId: "uepi-ercot",
    market: "ERCOT",
    sourceOrganization: "Electric Reliability Council of Texas",
    dataset: "Public API NP4-190-CD, DAM Settlement Point Prices",
    url: "https://api.ercot.com/api/public-reports/np4-190-cd/dam_stlmnt_pnt_prices?deliveryDateFrom=2025-11-02&deliveryDateTo=2025-11-02&settlementPoint=HB_HUBAVG&size=100",
    operatingDate: "2025-11-02",
    why: "Fall back, and the only UEPI source that resolves a repeated hour with a flag rather than "
      + "with row order or an offset.",
    retrievedAt: "2026-09-25T18:05:00Z",
    sourceTimezone: "America/Chicago (hour-ending)",
    format: "JSON: a `fields` descriptor and positional `data` rows",
    completeness: { kind: "complete" },
    originalSha256: "63d0f9ccff26a4e598c151397f4a3194c899d194332508dba3878c03be51bc87",
    originalBytes: 2490,
    fixtureSha256: "63d0f9ccff26a4e598c151397f4a3194c899d194332508dba3878c03be51bc87",
    fixtureBytes: 2490,
    attribution: "Source: ERCOT. Urdais calculation; ERCOT does not guarantee the accuracy of derived compilations.",
    caveats: [
      "25 rows, with hour ending 02:00 printed twice.",
      "DSTFlag separates them: the daylight-time occurrence is true (48.25) and the standard-time repeat is false (46.44).",
    ],
  },

  // ------------------------------------------------------------------ ISO-NE
  {
    file: "isone-2026-09-23.json",
    seriesId: "uepi-iso-ne",
    market: "ISO-NE",
    sourceOrganization: "ISO New England",
    dataset: "Web Services v1.1, final day-ahead hourly LMP, location 4000",
    url: "https://webservices.iso-ne.com/api/v1.1/hourlylmp/da/final/day/20260923/location/4000.json",
    operatingDate: "2026-09-23",
    why: "The first ISO-NE payload Urdais has ever observed. Until this file the field names were a "
      + "derived schema, which is why the market was refused rather than implemented.",
    retrievedAt: "2026-09-25T18:06:00Z",
    sourceTimezone: "America/New_York (hour-beginning, with an explicit offset on every row)",
    format: "JSON: HourlyLmps.HourlyLmp[]",
    completeness: { kind: "complete" },
    originalSha256: "334123d7477df01eea13a5fc362437f769dc78ec08e8c6c768c97b8e34ead559",
    originalBytes: 4840,
    fixtureSha256: "334123d7477df01eea13a5fc362437f769dc78ec08e8c6c768c97b8e34ead559",
    fixtureBytes: 4840,
    attribution: "Source: ISO New England. Retained internally; publication awaits the legal review the specification names.",
    caveats: [
      "Confirms LmpTotal, EnergyComponent, CongestionComponent and LossComponent exactly as the derived schema had them.",
      "Location 4000 is .H.INTERNAL_HUB, type HUB.",
      "BeginDate carries the offset, so the instant is stated by the source rather than inferred.",
    ],
  },
  {
    file: "isone-2026-03-08.json",
    seriesId: "uepi-iso-ne",
    market: "ISO-NE",
    sourceOrganization: "ISO New England",
    dataset: "Web Services v1.1, final day-ahead hourly LMP, location 4000",
    url: "https://webservices.iso-ne.com/api/v1.1/hourlylmp/da/final/day/20260308/location/4000.json",
    operatingDate: "2026-03-08",
    why: "Spring forward, which the specification recorded as unresolved for this market.",
    retrievedAt: "2026-09-25T18:06:00Z",
    sourceTimezone: "America/New_York (hour-beginning, with an explicit offset on every row)",
    format: "JSON: HourlyLmps.HourlyLmp[]",
    completeness: { kind: "complete" },
    originalSha256: "200f84343ed90f3a57f5ac412e88cecd9cbe3eb4d1c2ea674937663cb35533dc",
    originalBytes: 4622,
    fixtureSha256: "200f84343ed90f3a57f5ac412e88cecd9cbe3eb4d1c2ea674937663cb35533dc",
    fixtureBytes: 4622,
    attribution: "Source: ISO New England. Retained internally; publication awaits the legal review the specification names.",
    caveats: ["23 hours, with the offset moving from -05:00 to -04:00 inside the day."],
  },
  {
    file: "isone-2025-11-02.json",
    seriesId: "uepi-iso-ne",
    market: "ISO-NE",
    sourceOrganization: "ISO New England",
    dataset: "Web Services v1.1, final day-ahead hourly LMP, location 4000",
    url: "https://webservices.iso-ne.com/api/v1.1/hourlylmp/da/final/day/20251102/location/4000.json",
    operatingDate: "2025-11-02",
    why: "Fall back. The repeated local hour is separated by the offset itself, which makes this the "
      + "one UEPI source that hands over unambiguous instants.",
    retrievedAt: "2026-09-25T18:06:00Z",
    sourceTimezone: "America/New_York (hour-beginning, with an explicit offset on every row)",
    format: "JSON: HourlyLmps.HourlyLmp[]",
    completeness: { kind: "complete" },
    originalSha256: "f708b507079c6022405c2b0c5d658bbe29507a9d3abf45d0a3f9d955e9c423f1",
    originalBytes: 5031,
    fixtureSha256: "f708b507079c6022405c2b0c5d658bbe29507a9d3abf45d0a3f9d955e9c423f1",
    fixtureBytes: 5031,
    attribution: "Source: ISO New England. Retained internally; publication awaits the legal review the specification names.",
    caveats: ["25 hours, with 01:00 appearing at -04:00 and again at -05:00."],
  },

  // ------------------------------------------------------------------ CAISO
  {
    file: "caiso-2026-09-23.zip",
    seriesId: "uepi-caiso",
    market: "CAISO",
    sourceOrganization: "California Independent System Operator",
    dataset: "OASIS PRC_LMP, market_run_id=DAM, version 12",
    url: "https://oasis.caiso.com/oasisapi/SingleZip?queryname=PRC_LMP&version=12&market_run_id=DAM&resultformat=6&startdatetime=20260923T07:00-0000&enddatetime=20260924T07:00-0000&node=TH_NP15_GEN-APND,TH_SP15_GEN-APND,TH_ZP26_GEN-APND",
    operatingDate: "2026-09-23",
    why: "An ordinary 24-hour day, and the day the Phase 1 research measured, so the captured file "
      + "can be checked against what the research reported.",
    retrievedAt: "2026-09-25T15:27:36Z",
    sourceTimezone: "America/Los_Angeles (hour-ending), instants in GMT",
    format: "ZIP containing one CSV",
    completeness: { kind: "complete" },
    originalSha256: "2e3ff63876e172d41baf6b72e92bbb02875c2df061e55b3451f1320e8d330210",
    originalBytes: 4159,
    fixtureSha256: "2e3ff63876e172d41baf6b72e92bbb02875c2df061e55b3451f1320e8d330210",
    fixtureBytes: 4159,
    attribution: "Source: California ISO (OASIS).",
    caveats: [
      "The price lives in a column named MW.",
      "Five component rows per node per hour: LMP, MCC, MCE, MCL and MGHG. A three-part identity is wrong by the greenhouse-gas term.",
      "MCE is identical at all three trading hubs in every hour of this file, which is the tariff property the benchmark rests on.",
    ],
  },
  {
    file: "caiso-2026-03-08.zip",
    seriesId: "uepi-caiso",
    market: "CAISO",
    sourceOrganization: "California Independent System Operator",
    dataset: "OASIS PRC_LMP, market_run_id=DAM, version 12",
    url: "https://oasis.caiso.com/oasisapi/SingleZip?queryname=PRC_LMP&version=12&market_run_id=DAM&resultformat=6&startdatetime=20260308T08:00-0000&enddatetime=20260309T07:00-0000&node=TH_NP15_GEN-APND,TH_SP15_GEN-APND,TH_ZP26_GEN-APND",
    operatingDate: "2026-03-08",
    why: "Spring forward. The specification recorded CAISO's transition behaviour as expected but "
      + "unverified; this file is the evidence.",
    retrievedAt: "2026-09-25T15:28:15Z",
    sourceTimezone: "America/Los_Angeles (hour-ending), instants in GMT",
    format: "ZIP containing one CSV",
    completeness: { kind: "complete" },
    originalSha256: "f6c5ac72e3769f0c9e4c1dfbc6b40c3bf1b39280f2811006e343799fe880bbaa",
    originalBytes: 3593,
    fixtureSha256: "f6c5ac72e3769f0c9e4c1dfbc6b40c3bf1b39280f2811006e343799fe880bbaa",
    fixtureBytes: 3593,
    attribution: "Source: California ISO (OASIS).",
    caveats: ["23 hours. OPR_HR runs 1, 2, 4 … 24: the missing hour is omitted by label rather than renumbered."],
  },
  {
    file: "caiso-2025-11-02.zip",
    seriesId: "uepi-caiso",
    market: "CAISO",
    sourceOrganization: "California Independent System Operator",
    dataset: "OASIS PRC_LMP, market_run_id=DAM, version 12",
    url: "https://oasis.caiso.com/oasisapi/SingleZip?queryname=PRC_LMP&version=12&market_run_id=DAM&resultformat=6&startdatetime=20251102T07:00-0000&enddatetime=20251103T08:00-0000&node=TH_NP15_GEN-APND,TH_SP15_GEN-APND,TH_ZP26_GEN-APND",
    operatingDate: "2025-11-02",
    why: "Fall back, and the more surprising of the two transitions.",
    retrievedAt: "2026-09-25T15:28:29Z",
    sourceTimezone: "America/Los_Angeles (hour-ending), instants in GMT",
    format: "ZIP containing one CSV",
    completeness: { kind: "complete" },
    originalSha256: "b72401597795b5ba2312f054e1dffd11c0e4512694ccbdeb6abf4c066dca662a",
    originalBytes: 4029,
    fixtureSha256: "b72401597795b5ba2312f054e1dffd11c0e4512694ccbdeb6abf4c066dca662a",
    fixtureBytes: 4029,
    attribution: "Source: California ISO (OASIS).",
    caveats: [
      "25 hours, and the repeated hour is labelled OPR_HR 25, filed in the file between hours 2 and 3.",
      "So OPR_HR is neither unique nor monotonic on this day; INTERVALSTARTTIME_GMT is both.",
    ],
  },

  // ------------------------------------------------------------------ NYISO
  {
    file: "nyiso-2026-09-23.csv",
    seriesId: "uepi-nyiso",
    market: "NYISO",
    sourceOrganization: "New York Independent System Operator",
    dataset: "MIS report P-2A, day-ahead zonal LBMP",
    url: "http://mis.nyiso.com/public/csv/damlbmp/20260923damlbmp_zone.csv",
    operatingDate: "2026-09-23",
    why: "An ordinary day, served from the daily URL, and the day the research measured.",
    retrievedAt: "2026-09-25T15:26:41Z",
    sourceTimezone: "America/New_York (hour-beginning)",
    format: "CSV",
    completeness: { kind: "complete" },
    originalSha256: "24238dfd065ba67459361250a499e8c684581f6fd62beb0023e62a16750c3f19",
    originalBytes: 16852,
    fixtureSha256: "24238dfd065ba67459361250a499e8c684581f6fd62beb0023e62a16750c3f19",
    fixtureBytes: 16852,
    attribution: "Source: NYISO.",
    caveats: [
      "Eleven internal zones plus four external proxies (H Q, NPX, O H, PJM) which are never used.",
      "The reference price is derived: LBMP minus losses plus congestion. It is not a column.",
    ],
  },
  {
    file: "nyiso-2026-03.zip",
    seriesId: "uepi-nyiso",
    market: "NYISO",
    sourceOrganization: "New York Independent System Operator",
    dataset: "MIS report P-2A monthly archive, day-ahead zonal LBMP",
    url: "http://mis.nyiso.com/public/csv/damlbmp/20260301damlbmp_zone_csv.zip",
    operatingDate: "2026-03-08",
    why: "Spring forward, and the archive path: the daily URL 404s for older dates, so the monthly "
      + "ZIP is the retrieval path a backfill actually uses.",
    retrievedAt: "2026-09-25T15:26:42Z",
    sourceTimezone: "America/New_York (hour-beginning)",
    format: "ZIP of daily CSVs, one per operating day",
    completeness: { kind: "complete" },
    originalSha256: "3eecf4d4114cc2d8d511397666c2df266b310ef4533861b9b4b6c92cf3bec690",
    originalBytes: 115610,
    fixtureSha256: "3eecf4d4114cc2d8d511397666c2df266b310ef4533861b9b4b6c92cf3bec690",
    fixtureBytes: 115610,
    attribution: "Source: NYISO.",
    caveats: ["The 8 March member has 23 rows per zone and no 02:00 label at all."],
  },
  {
    file: "nyiso-2025-11.zip",
    seriesId: "uepi-nyiso",
    market: "NYISO",
    sourceOrganization: "New York Independent System Operator",
    dataset: "MIS report P-2A monthly archive, day-ahead zonal LBMP",
    url: "http://mis.nyiso.com/public/csv/damlbmp/20251101damlbmp_zone_csv.zip",
    operatingDate: "2025-11-02",
    why: "Fall back. This is the artifact behind the rule that row order is load-bearing.",
    retrievedAt: "2026-09-25T15:26:42Z",
    sourceTimezone: "America/New_York (hour-beginning)",
    format: "ZIP of daily CSVs, one per operating day",
    completeness: { kind: "complete" },
    originalSha256: "a7761c608e37da08982b9514929726318f46faf3ec4920933dabbb9476ce8698",
    originalBytes: 108869,
    fixtureSha256: "a7761c608e37da08982b9514929726318f46faf3ec4920933dabbb9476ce8698",
    fixtureBytes: 108869,
    attribution: "Source: NYISO.",
    caveats: [
      "25 rows per zone, with 11/02/2025 01:00 printed twice and nothing in the row to separate them.",
      "For WEST the two occurrences read 50.72 and 48.63, so they are genuinely different prices.",
    ],
  },

  // ------------------------------------------------------------------ MISO
  {
    file: "miso-2026-09-23.csv",
    seriesId: "uepi-miso",
    market: "MISO",
    sourceOrganization: "Midcontinent Independent System Operator",
    dataset: "Day-Ahead Market ExPost LMPs, daily report",
    url: "https://docs.misoenergy.org/marketreports/20260923_da_expost_lmp.csv",
    operatingDate: "2026-09-23",
    why: "An ordinary day, and the day the research measured the residual identity on.",
    retrievedAt: "2026-09-25T15:26:43Z",
    sourceTimezone: "Etc/GMT+5 (Eastern Standard Time all year, hour-ending)",
    format: "CSV with a four-line preamble and a wide HE 1..HE 24 body",
    completeness: { kind: "reduced", reduction: MISO_REDUCTION },
    originalSha256: "8c0c16e2841ad62593973c245fd0a85d55e041cd4274391903a288107c7c2843",
    originalBytes: 1212374,
    fixtureSha256: "2c2af1353b29419596cf4a072ff8ea45f2ce7d6a87d4b7b86160e9aee1b8a2ab",
    fixtureBytes: 3127,
    attribution: "Source: MISO. Retained internally; MISO's terms forbid publishing derived works.",
    caveats: [
      "There is no MEC column. The system energy component is the residual LMP - MCC - MLC.",
      "Values below one are printed without a leading zero: .6, -.37.",
      "The Type=Hub flag covers hundreds of aggregates; only the eight named hubs are commercial hubs.",
      "The ex-ante sibling file sits at a nearly identical URL and is a different price.",
    ],
  },
  {
    file: "miso-2026-03-08.csv",
    seriesId: "uepi-miso",
    market: "MISO",
    sourceOrganization: "Midcontinent Independent System Operator",
    dataset: "Day-Ahead Market ExPost LMPs, daily report",
    url: "https://docs.misoenergy.org/marketreports/20260308_da_expost_lmp.csv",
    operatingDate: "2026-03-08",
    why: "Spring forward, which for MISO is the day that proves the day does *not* change length.",
    retrievedAt: "2026-09-25T15:26:44Z",
    sourceTimezone: "Etc/GMT+5 (Eastern Standard Time all year, hour-ending)",
    format: "CSV with a four-line preamble and a wide HE 1..HE 24 body",
    completeness: { kind: "reduced", reduction: MISO_REDUCTION },
    originalSha256: "62437a8bfcccd97c1381ec8c9e2a9f1b461dd1d2339d226791d78a1896a861fb",
    originalBytes: 1193322,
    fixtureSha256: "8ab0d090f16adf522ef41e88852e81ca138cb6ed419d98c07d62bf8064d1634b",
    fixtureBytes: 3101,
    attribution: "Source: MISO. Retained internally; MISO's terms forbid publishing derived works.",
    caveats: ["24 HE columns, on a date every prevailing-time market publishes 23."],
  },
  {
    file: "miso-2025-11-02.csv",
    seriesId: "uepi-miso",
    market: "MISO",
    sourceOrganization: "Midcontinent Independent System Operator",
    dataset: "Day-Ahead Market ExPost LMPs, daily report",
    url: "https://docs.misoenergy.org/marketreports/20251102_da_expost_lmp.csv",
    operatingDate: "2025-11-02",
    why: "Fall back, for the same reason: 24 columns where the neighbours publish 25.",
    retrievedAt: "2026-09-25T15:26:45Z",
    sourceTimezone: "Etc/GMT+5 (Eastern Standard Time all year, hour-ending)",
    format: "CSV with a four-line preamble and a wide HE 1..HE 24 body",
    completeness: { kind: "reduced", reduction: MISO_REDUCTION },
    originalSha256: "82e4fd18123dadef9d82c67f0214aa88973375d249fb346806ff2e29f795d849",
    originalBytes: 1171309,
    fixtureSha256: "d382a88c9bbec23fffc2e4dcf71d912ebf442fc8dbea1167a3b329149e48aea4",
    fixtureBytes: 3137,
    attribution: "Source: MISO. Retained internally; MISO's terms forbid publishing derived works.",
    caveats: ["24 HE columns."],
  },

  // ------------------------------------------------------------------ SPP
  {
    file: "spp-2026-09-23.csv",
    seriesId: "uepi-spp",
    market: "SPP",
    sourceOrganization: "Southwest Power Pool",
    dataset: "Integrated Marketplace, day-ahead LMP by settlement location",
    url: "https://portal.spp.org/file-browser-api/download/da-lmp-by-settlement-location?path=/2026/09/By_Day/DA-LMP-SL-202609230100.csv",
    operatingDate: "2026-09-23",
    why: "An ordinary day in the modern schema, with the BAA column present.",
    retrievedAt: "2026-09-25T15:27:05Z",
    sourceTimezone: "America/Chicago (hour-ending), with a GMT interval end",
    format: "CSV",
    completeness: { kind: "reduced", reduction: SPP_REDUCTION },
    originalSha256: "8ae745c5c81373668c88ea071d7bb238956bf4111eda51a123ad25e619f62b7e",
    originalBytes: 4243868,
    fixtureSha256: "6efb08d03851335d1b8b56168e87544c77db5f75d386eee4dd18bdb29106256f",
    fixtureBytes: 5620,
    attribution: "Source: SPP. Retained internally; commercial publication needs written SPP authorization.",
    caveats: [
      "Header: Interval, GMTIntervalEnd, BAA, Settlement Location, Pnode, LMP, MLC, MCC, MEC.",
      "BAA SWPW is the western market and is excluded. Participant hubs such as CSWS_HUB are not the system price.",
    ],
  },
  {
    file: "spp-2026-04-12.csv",
    seriesId: "uepi-spp",
    market: "SPP",
    sourceOrganization: "Southwest Power Pool",
    dataset: "Integrated Marketplace, day-ahead LMP by settlement location",
    url: "https://portal.spp.org/file-browser-api/download/da-lmp-by-settlement-location?path=/2026/04/By_Day/DA-LMP-SL-202604120100.csv",
    operatingDate: "2026-04-12",
    why: "The negative day. Ten of twenty-four MEC hours are below zero and both trading hubs close "
      + "the day negative, which is the evidence behind the whole signed-price rule.",
    retrievedAt: "2026-09-25T15:27:20Z",
    sourceTimezone: "America/Chicago (hour-ending), with a GMT interval end",
    format: "CSV",
    completeness: { kind: "reduced", reduction: SPP_REDUCTION },
    originalSha256: "8f3b1e68833ec733635ca3d5e2f9fc04e77ec53a5bc87c4df104c834208e70d3",
    originalBytes: 4151371,
    fixtureSha256: "83200d8d5d371ac2e8d23d31d95bd877220ec3e408d6fa5a558a56ba5daf0783",
    fixtureBytes: 5668,
    attribution: "Source: SPP. Retained internally; commercial publication needs written SPP authorization.",
    caveats: [
      "North Hub daily mean LMP -0.1083, South Hub -8.6282, MEC daily mean +2.7785.",
      "Hourly MEC reaches -15.26. None of this is an error, and none of it may be clipped.",
    ],
  },
  {
    file: "spp-2026-03-08.csv",
    seriesId: "uepi-spp",
    market: "SPP",
    sourceOrganization: "Southwest Power Pool",
    dataset: "Integrated Marketplace, day-ahead LMP by settlement location",
    url: "https://portal.spp.org/file-browser-api/download/da-lmp-by-settlement-location?path=/2026/03/By_Day/DA-LMP-SL-202603080100.csv",
    operatingDate: "2026-03-08",
    why: "Spring forward *and* the legacy schema: this file has no BAA column, which is the second "
      + "shape the adapter must recognise without guessing a cutover date.",
    retrievedAt: "2026-09-25T15:27:09Z",
    sourceTimezone: "America/Chicago (hour-ending), with a GMT interval end",
    format: "CSV",
    completeness: { kind: "reduced", reduction: SPP_REDUCTION },
    originalSha256: "8ef2fa8d3fad7b699bf66b312125e2d8a615010c6e781ab08430a3f01497070e",
    originalBytes: 3035143,
    fixtureSha256: "1febd0eea0893234c6a7900491a8fd4452eda35b311bd494d1932e8b62045964",
    fixtureBytes: 4952,
    attribution: "Source: SPP. Retained internally; commercial publication needs written SPP authorization.",
    caveats: [
      "Header has eight columns, without BAA. Positional readers written for nine will take the wrong field.",
      "23 rows per location; local hour-ending jumps 01:00 to 03:00.",
      "Two of the 23 hours clear below zero, the lowest MEC being -9.4073.",
    ],
  },
  {
    file: "spp-2025-11-02.csv",
    seriesId: "uepi-spp",
    market: "SPP",
    sourceOrganization: "Southwest Power Pool",
    dataset: "Integrated Marketplace, day-ahead LMP by settlement location",
    url: "https://portal.spp.org/file-browser-api/download/da-lmp-by-settlement-location?path=/2025/11/By_Day/DA-LMP-SL-202511020100.csv",
    operatingDate: "2025-11-02",
    why: "Fall back in the legacy schema: 25 rows, with local 02:00 printed twice and separated only "
      + "by the GMT interval end.",
    retrievedAt: "2026-09-25T15:27:15Z",
    sourceTimezone: "America/Chicago (hour-ending), with a GMT interval end",
    format: "CSV",
    completeness: { kind: "reduced", reduction: SPP_REDUCTION },
    originalSha256: "c710a7f5db4c67f1ccd945e2b1d4e6da7685dbb7704c7abfff340de871820037",
    originalBytes: 3264018,
    fixtureSha256: "d591729f4eebf79288de104aab66a2257f7f01f54d627f11038245a231e30d79",
    fixtureBytes: 5318,
    attribution: "Source: SPP. Retained internally; commercial publication needs written SPP authorization.",
    caveats: ["Local 02:00 appears twice, at GMT interval ends 07:00 and 08:00."],
  },
];

export function fixturesFor(seriesId: string): readonly SourceFixture[] {
  return SOURCE_FIXTURES.filter((fixture) => fixture.seriesId === seriesId);
}
