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
