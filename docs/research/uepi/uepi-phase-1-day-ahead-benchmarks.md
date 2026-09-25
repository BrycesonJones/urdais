# UEPI phase 1 — canonical day-ahead benchmarks for seven U.S. markets

**Status: internal research document. Not a methodology page, not routed publicly, not registered in the docs catalog.** It designs no ingestion code, selects no national composite, and establishes no legal right.

**Research date.** Sources were fetched and files were parsed on 24 September 2026. URLs, file layouts, and terms are as they stood that day.

**Product target.** A family of market-level daily wholesale electricity benchmarks, one per organized market (ERCOT, PJM, CAISO, MISO, ISO-NE, NYISO, SPP), in $/MWh, with a daily change, a history, fixed lookbacks, a cross-market comparison, and source metadata. The preferred concept is a daily value derived from authoritative day-ahead market data.

---

## 0. Evidence standard

- **[verified]** — read from a primary page, tariff or protocol PDF, or a file downloaded in this pass.
- **[retrieved]** — taken from a search extraction of a primary page, or from a third-party document that quotes a primary schema. Wording is reliable as to substance; it was not re-read in the original renderer where noted.
- **[inferred]** — a reading of how verified pieces fit together. Never treated as a right, and never used to fill a missing fact.

Nothing here is legal advice. Public availability is not permission to republish.

---

## 1. Executive summary

A consistent **procedure** is feasible: for each market, take the authoritative hourly day-ahead benchmark and report the arithmetic mean of the valid hours in that market’s operating day.

A consistent **price construct** is not. Three markets publish one series that is already the market’s own benchmark and already includes delivered-energy pricing (energy and congestion, and losses where the market uses them):

| Market | What the ISO itself publishes as the single series |
| --- | --- |
| ERCOT | Day-ahead settlement point price `HB_HUBAVG` |
| PJM | Day-ahead total LMP at the RTO aggregate, pricing node id 1 |
| ISO-NE | Final day-ahead Hub LMP, location id 4000 |

The other four markets do **not** publish a system-wide total LMP, a system lambda file, or a single hub that covers the footprint. Each publishes many locational prices plus a system marginal energy component that is the same at every internal location:

| Market | Market-wide object that does not require averaging hubs or zones | What it leaves out |
| --- | --- | --- |
| CAISO | Day-ahead Marginal Energy Cost (`MCE`) | Congestion, losses, and a separate greenhouse-gas component |
| MISO | Day-ahead ex-post energy component, derived as `LMP − MCC − MLC` | Congestion and losses. The file has no MEC column |
| NYISO | Reference-bus system marginal price, derived as `LBMP − losses + congestion` | Congestion and losses. Not a published column |
| SPP | Day-ahead `MEC` on the SPP balancing authority | Congestion and losses |

Using the energy component in those four markets, and the full hub or RTO price in the other three, is the only way to avoid inventing an average. It also means a chart that compares UEPI-PJM with UEPI-CAISO is comparing different economic objects. That difference has to be on the methodology card. It is not a reason to average NP15 with SP15, or North Hub with South Hub, or New York’s eleven zones.

Negative prices are a real property of these series, not an edge case to be clipped. On 12 April 2026 the arithmetic mean of SPP North Hub day-ahead LMPs was **−$0.11/MWh**, and the South Hub mean was **−$8.63/MWh** **[verified, SPP file]**. Ordinary percentage changes are not defined in a useful way when either endpoint is zero or negative.

No ISO terms page found in this pass is a public-domain grant of the EIA kind. ERCOT is the only market whose website terms affirmatively allow raw public data to be used in compilations, charts, and analyses. PJM forbids redistribution of data derived from Data Miner without membership. MISO’s website terms forbid derivative works. SPP requires written authorization for commercial publication. CAISO, NYISO, and ISO-NE are ambiguous and need legal review before a public index.

There is no EIA wholesale-price series that can replace these files. EIA-930 does not contain $/MWh.

---

## 2. Comparison

| Market | Recommended benchmark | Price type | Geographic scope | Source dataset | Source URL | Source granularity | Proposed daily aggregation | Timezone | Historical depth | Negative prices possible? | Rights classification | Automation suitability | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ERCOT | `HB_HUBAVG` day-ahead settlement point price | DAM settlement point price (system lambda and congestion via averaged shift factors) | ERCOT 345 kV hub average of North, South, Houston, West. Excludes Panhandle and LRGV | EMIL NP4-190-CD | https://www.ercot.com/mp/data-products/data-product-details?id=NP4-190-CD | Hourly, hour-ending | Mean of published `HB_HUBAVG` hours | Central Prevailing Time | Report first run 29 Nov 2010. API history depth not fully confirmed | Yes for settlement point prices. A negative daily `HB_HUBAVG` was not in the one-day display fetched here | Suitable with attribution | Good, after API registration. Display HTML is not the production path | High |
| PJM | Day-ahead total LMP at pnode id 1 | Total LMP = energy + congestion + loss | PJM RTO aggregate zone | Data Miner 2 `da_hrl_lmps` | https://dataminer2.pjm.com/feed/da_hrl_lmps/definition | Hourly, hour-beginning | Mean of `total_lmp_da`, latest version only | Eastern Prevailing Time, plus UTC | First available 1 Jun 2000; retained indefinitely; archive rules after 731 days | Yes. Not re-measured on a downloaded file in this pass | Unsuitable without permission | Stable documented API. Key required. Non-members limited to 6 calls/minute. Derived-data clause blocks public use | High on the feed. Medium on the exact weight formula |
| CAISO | Day-ahead Marginal Energy Cost | System energy component of the DAM LMP | CAISO BAA reference. Not a trading hub | OASIS `PRC_LMP`, `market_run_id=DAM` | https://oasis.caiso.com/oasisapi/SingleZip | Hourly. Components are separate rows: LMP, MCC, MCE, MCL, MGHG | Mean of hourly MCE from one hub row, after an equality check | Pacific hour-ending; instants also in GMT | About 39 months online. Bulk history to 2016 via AWS requester-pays. Pre-2016 UNKNOWN | Yes. Not observed on the 23 Sep 2026 hub file | Ambiguous / legal review | Anonymous ZIP API works. 31-day query cap. HTTP 429 under repeat calls. Schema now has a GHG row | Medium |
| MISO | Ex-post marginal energy component | Derived `LMP − MCC − MLC` from the ex-post file | MISO system. Not Indiana Hub | `YYYYMMDD_da_expost_lmp.csv` | https://docs.misoenergy.org/marketreports/ | Hourly HE 1–HE 24, wide CSV. Columns are LMP, MCC, MLC | Mean of 24 derived MEC hours | Eastern Standard Time all year. Always 24 hours | Daily URL verified back to 7 Apr 2024. 1 Apr 2013 404. Start date UNKNOWN | Yes at locations in the file. Official hubs and derived MEC were non-negative on four tested days | Unsuitable without permission | Plain HTTPS CSV, no key. Filename convention is stable. No directory listing. Ex-ante file differs | Medium |
| ISO-NE | Final day-ahead Hub LMP | Total LMP at the Hub | Internal Hub, location 4000 | Web Services `/hourlylmp/da/final` | https://webservices.iso-ne.com/docs/v1.1/ | Hourly | Mean of hourly Hub `LmpTotal` | Eastern Prevailing Time | About seven years on ISO Express, not re-verified this pass | Yes. Not measured on a downloaded file; the API returned 401 | Ambiguous / legal review | Documented REST. Basic auth required. Anonymous call returned 401 | High on the definition. Medium on operations until a credentialed pull exists |
| NYISO | Reference-bus day-ahead system marginal price | Derived from zonal LBMP, losses, and congestion | NYCA reference bus. Not a zone | MIS P-2A zonal DAM LBMP | http://mis.nyiso.com/public/P-2Alist.htm | Hourly hour-beginning, 11 internal zones | Mean of hourly lambda from one internal zone | Eastern Prevailing Time. Fall-back repeats the `01:00` text with no flag | Index links monthly zips from 1 Nov 1999 | Yes. Not observed in the September, March, and November samples | Ambiguous / legal review | Stable CSV and monthly ZIP, no key. Fall-back timestamp collision is a real parser bug if ignored | Medium |
| SPP | Day-ahead MEC for BAA `SPP` | Marginal energy component | SPP east BAA. Not North or South Hub. Exclude `SWPW` | DA LMP by settlement location | https://portal.spp.org/pages/da-lmp-by-settlement-location | Hourly hour-ending. LMP, MLC, MCC, MEC | Mean of hourly MEC. Use `GMTIntervalEnd` as the key | Central Prevailing Time, with UTC interval end | Portal folders from 2013. Marketplace from 1 Mar 2014. Pre-2016 path layout not re-mapped | Yes. Hourly MEC was negative on 8 Mar 2026 and 12 Apr 2026. North and South Hub **daily means** were negative on 12 Apr 2026 | Unsuitable without permission | Anonymous file API. Schema gained a `BAA` column between 8 Mar and 12 Apr 2026. `RePrice` folder exists | Medium |

---

## 3. ERCOT

### 3.1 Recommended benchmark

**Day-ahead settlement point price for settlement point `HB_HUBAVG`.**

In the Protocols this is the ERCOT Hub Average 345 kV Hub, also called ERCOT 345. It is one of the settlement points ERCOT posts in the Day-Ahead Market, alongside the regional hubs, the bus-average hub, the Panhandle hub, and the load zones **[verified, NP4-190-CD product page and the 25 Sep 2026 DAM display]**.

### 3.2 Why it is the strongest choice

ERCOT does not publish a single system-wide day-ahead price that load pays. It does publish several hub settlement points that it defines itself. `HB_HUBAVG` is the one ERCOT constructs from the four principal 345 kV hubs (North, South, Houston, West). The Panhandle hub is excluded, and the pending protocol text also excludes the Lower Rio Grande Valley hub **[verified, April 1, 2026 Nodal Protocols §3.5.2.6]**.

The day-ahead formula is not “add the four hub prices and divide by four.” For each hour:

`DASPP_ERCOT345 = DASL − Σ (DAHUBSF_ERCOT345,c × DASP_c)`

with

`DAHUBSF_ERCOT345,c = (DAHUBSF_North345,c + DAHUBSF_South345,c + DAHUBSF_Houston345,c + DAHUBSF_West345,c) / 4`

`DASL` is the day-ahead system lambda, the shadow price on the system power-balance constraint. `DASP_c` is the shadow price of binding constraint `c` **[verified, Protocols §3.5.2.6]**. Real-time ERCOT 345 **is** the simple average of the four real-time hub settlement point prices. Day-ahead is the shift-factor form. NPRR931 (approved 13 Aug 2019, effective 1 Sep 2019) changed the written rule to match the shift-factor calculation and away from direct averaging of the hub prices **[retrieved, NPRR931 issue page]**.

On the 25 Sep 2026 display, `HB_HUBAVG` differed from the arithmetic mean of Houston, North, South, and West by at most $0.005/MWh across 24 hours **[verified, parsed display]**. That is close, and it is not an identity: hour ending 8 was 35.80 versus a four-hub mean of 35.805. Production should store the published `HB_HUBAVG` and not recompute it.

`HB_NORTH` is the liquid bilateral hub. It is northern ERCOT, not the footprint. `HB_BUSAVG` is the bus-average hub of the same four hubs’ buses, again a shift-factor construct in the day-ahead, and it is a poorer explanation for users. `HB_PAN` is a regional hub and was the series that printed a negative price in an earlier display extract.

ERCOT LMPs do not carry a separate marginal-loss component of the PJM kind. Losses are not a third column on this report. The settlement point price is system lambda adjusted for congestion.

### 3.3 Alternatives considered

- **`HB_NORTH`.** Best match to the traded ERCOT North contract. Rejected as the market benchmark because it is one region.
- **`HB_BUSAVG`.** ERCOT-published, but harder to explain, and still not load-weighted.
- **Load-weighted average of load-zone settlement point prices.** More representative of what load pays. ERCOT does not publish it. Not recommended.
- **Day-ahead system lambda alone.** Defined in the protocol formula. A standalone public hourly series was not found in this pass. UNKNOWN whether NP4-190 or another EMIL product exposes `DASL` by itself.

### 3.4 Exact source

| Item | Value |
| --- | --- |
| ISO | ERCOT |
| Dataset | DAM Settlement Point Prices |
| EMIL | NP4-190-CD, report type 12331 |
| Page | https://www.ercot.com/mp/data-products/data-product-details?id=NP4-190-CD |
| Human display | https://www.ercot.com/content/cdr/html/dam_spp.html |
| Market page | https://www.ercot.com/mktinfo/dam |
| API | `https://api.ercot.com/api/public-reports/np4-190-cd/dam_stlmnt_pnt_prices` **[retrieved, ERCOT api-specs discussion #48, which quotes the live product document]** |
| Archive link quoted there | `https://api.ercot.com/api/public-reports/archive/np4-190-cd` |
| Format | zip, csv, xml on EMIL. API download accepts `download=csv` **[retrieved, same discussion]** |
| Auth | Public API requires a subscription key and an ID token that lasts one hour **[retrieved, ERCOT developer portal, registration and using-the-API guides]** |
| Cadence | Event, per DAM run. Security classification Public. First run 29 Nov 2010 **[retrieved, EMIL product page]** |
| Display window | The DAM market page says the hub-and-zone display covers the next day, the current day, and the previous five days, and that the full settlement-point file covers the last thirty days **[retrieved, ercot.com/mktinfo/dam]** |

The HTML fetched on 24 Sep 2026 contained only operating day 25 Sep 2026, 24 hour-ending rows. The page is script-heavy; that fetch should not be treated as proof that older days are absent from the display.

### 3.5 Fields

From the display header **[verified]**: `Oper Day`, `Hour Ending`, then settlement points `HB_BUSAVG`, `HB_HOUSTON`, `HB_HUBAVG`, `HB_NORTH`, `HB_PAN`, `HB_SOUTH`, `HB_WEST`, `LZ_AEN`, `LZ_CPS`, `LZ_HOUSTON`, `LZ_LCRA`, `LZ_NORTH`, `LZ_RAYBN`, `LZ_SOUTH`, `LZ_WEST`.

From the API metadata quoted in the ERCOT discussion **[retrieved]**: `deliveryDate`, `hourEnding`, `settlementPoint`, `settlementPointPrice`, `DSTFlag`. That metadata was not re-fetched with a token in this pass.

Geographic identifier for the benchmark: `settlementPoint = HB_HUBAVG`.

### 3.6 Timestamp and timezone

Operating day and hour ending, Central Prevailing Time. ERCOT’s public API guide says passed times for the participant API are a separate system; for this report the operating-day convention is CPT. A `DSTFlag` is part of the quoted schema, which is how ERCOT distinguishes the repeated hour. A 23-hour or 25-hour file was not downloaded.

### 3.7 Daily aggregation

`UEPI-ERCOT(day) = mean of HB_HUBAVG settlement point prices for each valid hour ending of that operating day.`

Expected count on a normal day: 24. Use 23 or 25 when the file has them. Do not drop negatives. Do not fill a missing hour with a neighbor. If an hour is absent, either omit the day or publish the mean of the hours that exist and store the hour count. The second option is preferred only when the absence is the DST short day, not a hole in a 24-hour day. A hole in a normal day should fail the day.

The half-cent gap versus the four-hub mean is why the published column wins over a recomputed average.

Load-weighting the hours by ERCOT load would change the daily number and is not how this settlement point is defined. Not recommended.

ERCOT does not publish a daily average of `HB_HUBAVG` for us to adopt.

### 3.8 Missing data, DST, revisions

- **DST.** Rely on `DSTFlag` and the set of hour-ending values once a credentialed pull confirms them. Not file-verified here.
- **Missing hour.** Do not interpolate.
- **Duplicate hour.** If `DSTFlag` marks the repeated fall hour, keep both.
- **Revisions.** Nodal protocols provide for price corrections generally. Whether NP4-190 files are replaced in place was not verified. UNKNOWN.
- **Nulls.** Do not treat a blank as zero.
- **Negatives.** Keep them.

### 3.9 Negative and zero prices

The 25 Sep 2026 display had no negative settlement point price **[verified]**. A search extraction of the same display for 27 Apr 2026 showed `HB_PAN` at −0.42 in hour ending 1 while `HB_HUBAVG` in that hour was positive (about 20.67) **[retrieved]**. So:

- Hourly settlement point prices in this report can be negative.
- A negative hourly `HB_HUBAVG` is allowed by the formula (no zero floor in §3.5.2.6) but was not observed in the windows read here.
- A negative **daily** mean is therefore possible and was not demonstrated.
- An exactly zero daily mean was not observed. Prices on the display are in cents, so a zero print is possible.
- Consecutive days can cross zero if a negative day is followed by a positive one. Not demonstrated for `HB_HUBAVG`.

Percentage returns are unsafe whenever either daily value is ≤ 0, including the case where only one of the two days is negative.

### 3.10 Historical availability

EMIL first run date is 29 Nov 2010, which is the nodal go-live window **[retrieved]**. The developer portal says API downloads start at each product’s activation date inside the Public API, and that data from before that activation date is kept as historic files for at least seven years **[retrieved, Known Limitations]**. The 2,555-day `archiveDuration` figure in a portal example belonged to a different EMIL product (resource outage capacity), not to a sentence that named NP4-190. One year is inside any plausible retention. Bulk history back to 2010 should be treated as UNKNOWN until a credentialed archive call lists the files.

Rate limit: 30 requests per minute; historic-file downloads limited to 1,000 files at a time; some non-U.S. regions are blocked **[retrieved, Known Limitations]**. The Data Access Portal has also limited repeat downloads of the same report **[retrieved, prior portal description; not re-tested]**.

### 3.11 Licensing

ERCOT Terms of Use §5 **[retrieved, https://www.ercot.com/help/terms]**:

> The publicly available contents of this website may be used, reproduced, and redistributed, provided that the contents are not modified and that you maintain all copyright and other notices contained in the contents, including this Agreement. Notwithstanding the foregoing, raw data provided in public portions of this website may be used, reproduced, and redistributed in compilations, charts, and analyses without maintaining such notices. ERCOT does not guarantee the accuracy of any such compilations, charts, or analyses.

| Use | Reading |
| --- | --- |
| Displaying raw prices | Allowed for unmodified content, with notices. Raw data may also go into a chart without keeping the notices. |
| Storing raw data | The terms do not forbid local storage of public raw data. The Data Access Portal has separately told users to keep copies because re-download is limited. |
| Publishing a derived daily mean | The raw-data sentence covers compilations, charts, and analyses. A daily mean of `HB_HUBAVG` is that kind of analysis. ERCOT disclaims its accuracy. |
| Redistributing the source CSV | Unmodified redistribution requires the notices. That is a different act from publishing the derived mean. |

**Classification: suitable with attribution.** The raw-data sentence is an affirmative grant, not silence. It is not a public-domain dedication. Attribute ERCOT, and do not present the daily mean as an ERCOT-published index.

### 3.12 Operational risks

- The production path is the authenticated API, not the HTML display.
- ID tokens expire every hour.
- Geographic blocking and a 30/minute cap.
- `HB_HUBAVG` methodology text changed effective 1 Sep 2019 (NPRR931). A long history mixes the pre-change and post-change definitions if older files were produced under the old averaging rule. Confirm the implementation date before splicing history.
- New hubs (`HB_PAN`, and LRGV when implemented) appear on the report and must not be folded into the benchmark.

### 3.13 Open questions

1. Credentialed confirmation of the column list, `DSTFlag`, and archive start date.
2. Whether day-ahead price corrections overwrite NP4-190.
3. Whether a public hourly `DASL` series exists, if a later version wants an energy-only ERCOT number comparable to CAISO MCE.

### 3.14 Citations

- https://www.ercot.com/mp/data-products/data-product-details?id=NP4-190-CD
- https://www.ercot.com/mktinfo/dam
- https://www.ercot.com/content/cdr/html/dam_spp.html (fetched 24 Sep 2026)
- https://www.ercot.com/files/docs/2026/03/29/April-1-2026-Nodal-Protocols.pdf §3.5.2.6
- https://www.ercot.com/mktrules/issues/NPRR931
- https://www.ercot.com/help/terms
- https://developer.ercot.com/applications/pubapi/user-guide/using-api/
- https://developer.ercot.com/applications/pubapi/user-guide/registration-and-authentication/
- https://developer.ercot.com/applications/pubapi/known-limits/
- https://github.com/ercot/api-specs/discussions/48

---

## 4. PJM

### 4.1 Recommended benchmark

**Day-ahead total LMP at pricing node id 1**, the RTO aggregate, from Data Miner 2 feed `da_hrl_lmps`, field `total_lmp_da`, latest version only.

### 4.2 Why it is the strongest choice

PJM’s day-ahead LMP at every bus is system energy price + congestion price + loss price **[verified, Data Miner feed definition; verified, Manual 11 (the archived 15 Nov 2023 text that was fetched, which still states the three-part definition)]**. The feed carries all three components plus the total, for buses and for aggregates.

Pricing node id 1 is listed as name `PJM-RTO`, type `AGGREGATE`, subtype `ZONE` **[retrieved, Data Miner pnode feed]**. A settlements-verified hourly sample for the same id displayed the name `PJM` and a day-ahead total of 40.36689 against a system energy price of 40.38, congestion −0.051717, and loss 0.038607 **[retrieved, `rt_da_monthly_lmps` sample]**. Those three components add to the total. The display name is not stable across feeds. The id is.

Manual 11 says day-ahead zonal bus distributions come from the state estimator (default: 08:00 one week prior) and that EDCs can update them **[verified, fetched Manual 11 text]**. Node 1 is typed as a zone. That is strong evidence the posted total is a distribution-weighted aggregate, not a simple average of hubs. This pass did not find a single PJM sentence that says “the `total_lmp_da` posted for pnode 1 equals the load-weighted average of all load-bus LMPs.” The Monitoring Analytics 2008 State of the Market appendix describes how the IMM computes a system load-weighted day-ahead LMP, and it warns that the zonal day-ahead load-weighted price is not the price paid by every megawatt-hour that cleared **[verified, that appendix]**. Do not treat the IMM statistic as the definition of pnode 1.

Western Hub is the liquid trading hub. It is a fixed set of buses in western PJM, not the RTO after ComEd, AEP, Dominion, and the other expansions. It is the right alternative if the product wants the traded benchmark instead of the footprint price. It is the wrong choice for a market-wide series when PJM already posts the RTO aggregate.

`system_energy_price_da` is on the same row and is the uniform energy component. Using it would match CAISO MCE and SPP MEC, and it would throw away the RTO aggregate PJM already computes. Not recommended for V1.

### 4.3 Alternatives considered

- **Western Hub total LMP.** Trading benchmark. Not footprint-wide.
- **System energy price.** Uniform and clean. Omits the congestion and loss residual that the RTO aggregate actually carries. The sample residual was about one cent, which will not always be that small.
- **A simple average of zonal LMPs.** PJM already posts the RTO zone. Do not rebuild it.

### 4.4 Exact source

| Item | Value |
| --- | --- |
| Feed | Day-Ahead Hourly LMPs |
| Short name | `da_hrl_lmps` |
| Definition | https://dataminer2.pjm.com/feed/da_hrl_lmps/definition |
| API | `GET https://api.pjm.com/api/v1/da_hrl_lmps` |
| API guide | https://www.pjm.com/-/media/DotCom/etools/data-miner-2/data-miner-2-api-guide.pdf (dated 10 Feb 2026 in the file that was fetched) |
| Account | Required for the API. The UI can be browsed without an account **[retrieved, PJM knowledge article “Getting access to Data Miner”]** |
| Header | `Ocp-Apim-Subscription-Key` |
| Rate limit | Non-members 6 connections per minute. Members 600. Associate membership is the minimum membership that lifts the non-member cap; the annual fee is stated as $2,500 **[retrieved, Data Miner page and membership enrollment page]** |

Feed definition **[retrieved]**: posting frequency daily; update availability daily between 12:00 p.m. and 1:30 p.m.; retention indefinitely; first available 1 Jun 2000 00:00; data archived after two years. The clock timezone of the 12:00–1:30 window is not stated.

### 4.5 Fields

**[retrieved, feed definition and API guide § for `da_hrl_lmps`]**

`datetime_beginning_utc`, `datetime_beginning_ept`, `pnode_id`, `pnode_name`, `voltage`, `equipment`, `type`, `zone`, `system_energy_price_da`, `total_lmp_da`, `congestion_price_da`, `marginal_loss_price_da`, `row_is_current`, `version_nbr`.

Benchmark field: `total_lmp_da` where `pnode_id = 1` and `row_is_current = true`.

### 4.6 Timestamp and timezone

Hour beginning, Eastern Prevailing Time, with a UTC twin. A datetime filter is mandatory. Standard queries cannot span the archive boundary, and a single request is limited to 366 days. Historic (archived) queries must stay inside one UTC calendar year and cannot be custom-sorted **[verified, API guide]**.

A 23-hour or 25-hour extract was not downloaded. The field is prevailing time, so those days should exist. Treat the hour count as something to assert in code, not as something this pass counted.

### 4.7 Daily aggregation

Mean of the latest-version hourly `total_lmp_da` values for pnode 1. Normal day: 24 hour-beginning stamps. Keep negatives. Do not replace the total with the system energy price.

The aggregate is already PJM’s weighted price. A second load-weighting across hours is optional color, not a correction. Not recommended.

### 4.8 Missing data, DST, revisions

LMP rows are versioned. `version_nbr` increases; `row_is_current = true` is the row to keep **[verified, API guide]**. Corrections are a first-class feature, not a surprise. Re-pull recent days.

Missing hours: do not fill. Duplicate prevailing-time stamps on the fall-back day: keep both if both are current; distinguish them with `datetime_beginning_utc`.

### 4.9 Negative and zero prices

PJM energy offers may clear below zero; the LMP components are unbounded in the feed definition (they are numbers, not documented as non-negative). This pass did not download a PJM file, so a negative pnode-1 hour was not measured here. The construct permits:

- negative hourly totals
- a negative daily mean, if enough hours are negative or largely negative
- an exact zero, which would be uncommon for a weighted aggregate but is not forbidden
- a sign change from one daily mean to the next

Do not compute a percentage change across a non-positive endpoint.

### 4.10 Historical availability

First available 1 Jun 2000 **[retrieved, feed definition]**. One year is trivial. History older than 731 days remains queryable with the archive restrictions above. PJM’s data-availability page says older history that was not converted into Data Miner is not available **[retrieved]**.

### 4.11 Licensing

Data Miner page **[retrieved, https://www.pjm.com/markets-and-operations/etools/data-miner-2]**:

> Information and data contained in Data Miner is for internal use only and redistribution of information and or data contained in or derived from Data Miner is strictly prohibited without an active PJM Membership. A minimum level of Associate Membership is required.

API guide **[verified]**: the same prohibition, plus “If you wish to use the Data and/or Tools for commercial purposes, including publishing and making derivatives of the Data, you must become a PJM Member.”

The Data License Agreement text that was fetched says members may republish and non-members may not **[verified, data-license PDF]**.

| Use | Reading |
| --- | --- |
| Displaying raw LMPs publicly | Prohibited for a non-member. |
| Storing raw LMPs internally | “Internal use” is what the terms allow. |
| Publishing a derived daily index | Explicitly prohibited. The clause says “or derived from.” A mean of pnode 1 is derived data. |
| Redistributing the CSV | Prohibited. |

**Classification: unsuitable without permission.** Associate membership is the path PJM names. It is not a substitute for reading the licence; it is the condition PJM states.

### 4.12 Operational risks

- Subscription key and a low non-member rate limit.
- Archive-boundary errors if a query crosses 731 days or a UTC year-end on the historic side.
- Versioned rows: averaging without `row_is_current=true` will double-count corrected hours.
- Name drift between `PJM-RTO` and `PJM`. Filter on id 1.
- The weighting formula for id 1 is not pinned to one manual sentence.

### 4.13 Open questions

1. A PJM primary sentence for how pnode 1 is weighted.
2. Membership / redistribution licence before any public number.
3. File-verify DST day length and a negative day at pnode 1.

### 4.14 Citations

- https://dataminer2.pjm.com/feed/da_hrl_lmps/definition
- https://dataminer2.pjm.com/feed/pnode
- https://www.pjm.com/-/media/DotCom/etools/data-miner-2/data-miner-2-api-guide.pdf
- https://www.pjm.com/markets-and-operations/etools/data-miner-2
- https://www.pjm.com/-/media/DotCom/etools/edatafeed/data-license-agreement-edata-feed-data-miner-2.pdf
- https://www.pjm.com/-/media/DotCom/documents/manuals/archive/m11/m11v127-energy-and-ancillary-services-market-operations-11-15-2023.pdf
- https://www.monitoringanalytics.com/reports/pjm_state_of_the_market/2008/2008-som-pjm-volume2-appendix2.pdf
- https://pjm.my.site.com/publicknowledge/s/article/Getting-access-to-Data-Miner

---

## 5. CAISO

### 5.1 Recommended benchmark

**Day-ahead Marginal Energy Cost (`MCE`, XML item `LMP_ENE_PRC`)** from OASIS report `PRC_LMP` with `market_run_id=DAM`.

There is no CAISO-wide trading hub and no published ISO-wide load-aggregation price. The three Existing Zone Generation Trading Hubs are NP15, SP15, and ZP26. Each is an aggregation of **generator** nodes inside one legacy zone, with generation weights from the prior year, by season and by peak or off-peak **[verified, CAISO tariff §27.3, as of 1 May 2026; the weighting formula is in the older Appendix C/E text that was fetched]**. Averaging those three LMPs would be a new index. Do not do it.

### 5.2 Why it is the strongest choice

Tariff §27.1.1.1 **[verified, 1 May 2026 tariff PDF]**:

> The Marginal Energy Cost (MEC) component of the LMP reflects the marginal cost of providing Energy from a designated reference Location. … The MEC shall be the same throughout the Balancing Authority Area.

The 23 Sep 2026 DAM file for `TH_NP15_GEN-APND`, `TH_SP15_GEN-APND`, and `TH_ZP26_GEN-APND` had 24 hours and five component rows per node per hour: `LMP`, `MCC`, `MCE`, `MCL`, `MGHG` **[verified]**. Cross-hub MCE spread was 0.000000 in every hour. Hour 12 MCE was 22.51355 at all three hubs, while LMPs were 29.18319, 18.81280, and 17.20498.

The identity on that file, within $0.00001, was:

`LMP = MCE + MCC + MCL + MGHG`

The current tariff says the LMP has **four** components: MEC, marginal losses, marginal congestion, and marginal greenhouse-gas cost **[verified, §27 opening of the 1 May 2026 section]**. The GHG term is new relative to the old three-part LMP. On 23 Sep 2026, MGHG was also identical across the three hubs in every hour, and it was exactly 0 in at least some hours (the day’s minimum was 0). The tariff does **not** say MGHG is the same throughout the BAA. One uniform day is not a rule. V1 should publish MCE, because that is the component the tariff defines as system-wide, and should carry MGHG as an open methodology choice rather than silently adding it.

SP15 is the largest southern hub and the usual traded point. It is not CAISO. Default Load Aggregation Points (PG&E, SCE, SDG&E) are load-weighted prices for utility service areas **[verified, Appendix C LAP formula in the fetched tariff appendix]**. There is no CAISO LAP that stacks them.

### 5.3 Alternatives considered

- **`TH_SP15_GEN-APND` LMP.** A real traded hub price, including congestion, losses, and GHG. Geographically southern California. Rejected as the single market series.
- **`MCE + MGHG`.** Equals `LMP − MCC − MCL`. On the test day this was system-wide and includes the carbon component that is part of the LMP. Better economics if legal and tariff review confirms MGHG stays uniform inside the California GHG area. Not adopted until that is checked on more than one day.
- **An average of NP15 and SP15.** Not published. Rejected.

### 5.4 Exact source

| Item | Value |
| --- | --- |
| System | OASIS |
| Report | Locational Marginal Prices, `PRC_LMP`, version 12 in the current FAQ example |
| API | `https://oasis.caiso.com/oasisapi/SingleZip` |
| Spec | https://www.caiso.com/documents/oasisapispecification.pdf and the Fall 2017 interface specification |
| FAQ | https://www.caiso.com/documents/oasis-frequently-asked-questions.pdf |
| Query that worked | `resultformat=6` (CSV in a zip), `queryname=PRC_LMP`, `version=12`, `market_run_id=DAM`, `node=TH_NP15_GEN-APND,TH_SP15_GEN-APND,TH_ZP26_GEN-APND`, GMT start and end |
| Auth | None on that call. A second call in the same hour returned HTTP 429 |
| Range cap | 31 days. The FAQ and a live error cited in secondary notes say a wider range returns OASIS error 1004. Not re-triggered here |

The FAQ says the API uses GMT, and its sample DAM query for a Pacific Daylight Time trading day uses `T07:00-0000` through the next day `T07:00-0000` **[verified, FAQ]**. Standard time would be `T08:00-0000`. A DST transition query was not run.

### 5.5 Fields

CSV header **[verified, 23 Sep 2026 zip]**:

`INTERVALSTARTTIME_GMT`, `INTERVALENDTIME_GMT`, `OPR_DT`, `OPR_HR`, `OPR_INTERVAL`, `NODE_ID_XML`, `NODE_ID`, `NODE`, `MARKET_RUN_ID`, `LMP_TYPE`, `XML_DATA_ITEM`, `PNODE_RESMRID`, `GRP_TYPE`, `POS`, `MW`, `GROUP`.

`MW` is the price in $/MWh despite the column name. `OPR_INTERVAL` was 0 for every DAM hourly row. `LMP_TYPE` values: `LMP`, `MCC`, `MCE`, `MCL`, `MGHG`. Matching XML items: `LMP_PRC`, `LMP_CONG_PRC`, `LMP_ENE_PRC`, `LMP_LOSS_PRC`, `LMP_GHG_PRC`.

Use `LMP_TYPE=MCE`. Node id is only a vehicle for reading the system component.

### 5.6 Timestamp and timezone

`OPR_DT` is the trading date. `OPR_HR` is the hour-ending number in Pacific prevailing time (1–24 on the test day). `INTERVALSTARTTIME_GMT` is the UTC start. Hour 1 on 23 Sep 2026 started at `2026-09-23T07:00:00-00:00`, which is midnight Pacific Daylight Time.

### 5.7 Daily aggregation

Mean of the 24 hourly MCE values. Before averaging, check that MCE at a second hub matches within a fraction of a cent. If it does not, stop. That check is a data-quality assertion of the tariff identity, not an average.

Do not average LMPs. Do not load-weight NP15 and SP15. CAISO does not publish the weights for a system price, and the hub weights are generation weights, not load weights.

No published daily MCE average was found.

### 5.8 Missing data, DST, revisions

DST hour counts were not file-verified. Build the GMT window from the Pacific trading day and then trust `OPR_HR`, including a 23- or 25-hour set if that is what returns.

OASIS has a publication-and-revisions log **[retrieved, interface specification intro]**. Whether DAM LMPs are restated in the same query was not tested. Re-pull the recent day.

Null `MW`: drop the hour, do not zero it. A missing component row is a failed hour.

### 5.9 Negative and zero prices

The test day was entirely positive (NP15 LMP minimum 29.18, MCE minimum 20.71). CAISO’s bid floor is negative (the tariff allows negative energy bids; the numeric floor was not re-read in the tariff section fetched here). MCE is a component of LMP and can be negative when the marginal resource is a negative bid. So:

- Hourly MCE can be negative. Not observed on 23 Sep 2026.
- The daily mean can be negative. Not observed.
- MGHG was exactly zero in part of that day. MCE was not.
- A daily series can cross zero. Not observed in this one-day sample.

SP15 versus NP15 LMPs differed by about $10/MWh in hour 12. An average of the hubs would have hidden that and still would not be a CAISO price.

### 5.10 Historical availability

OASIS FAQ: retention for most reports is the previous 39 months **[verified]**. OASIS homepage: historical data beyond 39 months, back to 2016, is on the Historical OASIS Data Downloader, which uses an AWS requester-pays bucket **[retrieved, OASIS home and the CAISO notice on that tool]**. One year of MCE fits in the live API. Bulk history needs the downloader and will cost the caller AWS egress. Schema version changes are real: the GHG row is present in the 2026 file and is not in the older three-component descriptions in the 2017 specification.

Nodal market start (1 Apr 2009) is earlier than the 2016 downloader floor. Availability of `PRC_LMP` before 2016 is UNKNOWN.

### 5.11 Licensing

Website terms, last updated 2 Oct 2018 for the terms body **[verified, https://www.caiso.com/privacy-terms-of-use]**:

Most website materials “are freely available for public use consistent with the general policies of the Public Records Act … and may be used by you provided that you keep intact all copyright, trademark and other proprietary notices and that you credit the California ISO.”

API terms, created 22 Aug 2019 **[verified, same page]**:

> CAISO owns all right, title and interest in and to the CAISO API and CAISO Data. … These terms grant you no right, title or interest in any intellectual property owned or licensed by CAISO, including without limitation the CAISO API and any CAISO Data.

The licence to the API is revocable, non-exclusive, and limited. The OASIS price pull used in this pass was the API (`oasisapi`), not a web page.

| Use | Reading |
| --- | --- |
| Displaying raw LMPs | Website text would allow it with credit, if the prices are “website materials.” API text reserves CAISO Data. |
| Storing raw data | Not clearly granted by the API terms. |
| Derived daily MCE | A derivative of CAISO Data. Not granted in the API section. |
| Redistributing the ZIP | Not granted. |

**Classification: ambiguous / requires legal review.** The two clauses on one page disagree about whether a downstream user receives a reuse right. Do not treat the successful anonymous download as permission.

### 5.12 Operational risks

- HTTP 429. The FAQ points operators at the publication log so they do not poll before the data exists.
- GMT window mistakes on DST days.
- Five component rows now, not three. A parser that assumes `LMP = MCE + MCC + MCL` will be wrong by MGHG.
- Node set drift. Trading-hub APNode ids (`TH_NP15_GEN-APND` and the others) are the stable names today.
- 31-day cap and a separate, paid, historical bucket.
- EDAM / WEIM nodes can appear in all-node pulls. A system MCE check should stay on CAISO trading hubs, not on an EIM entity, until the identity is proven there.

### 5.13 Open questions

1. Include MGHG or not.
2. DST file check.
3. Legal review of API terms versus the Public Records Act paragraph.
4. Whether MCE remains identical if the query node is outside the three California hubs.

### 5.14 Citations

- https://www.caiso.com/documents/section-27-california-iso-markets-and-processes-as-of-may-1-2026.pdf
- https://www.caiso.com/Documents/AppendicesC-F-FifthReplacementCAISOTariff_15-Dec-10.pdf (LAP and hub weight formulas; older vintage)
- https://www.caiso.com/documents/oasis-frequently-asked-questions.pdf
- https://www.caiso.com/documents/oasisapispecification.pdf
- https://oasis.caiso.com/ (homepage help text)
- https://www.caiso.com/notices/new-tool-now-available-on-caiso-oasis-website
- https://www.caiso.com/privacy-terms-of-use
- File: OASIS `PRC_LMP` DAM zip for trading day 2026-09-23, fetched 24 Sep 2026

---

## 6. MISO

### 6.1 Recommended benchmark

**The day-ahead ex-post marginal energy component**, computed from the public ex-post file as:

`MEC = LMP − MCC − MLC`

taken from any one node, then averaged across the 24 Eastern Standard Time hours.

The file does not label this column. On three 2026 days and on 7 Apr 2024, the residual was identical across the eight official hubs and a sample of other nodes (spread 0.0000) **[verified]**. That is the system energy component. It is not an average of hubs.

### 6.2 Why it is the strongest choice

MISO publishes eight commercial hubs in this file: `ARKANSAS.HUB`, `ILLINOIS.HUB`, `INDIANA.HUB`, `LOUISIANA.HUB`, `MICHIGAN.HUB`, `MINN.HUB`, `MS.HUB`, `TEXAS.HUB`. A MISO BPM excerpt filed in a state docket says hub LMPs are the weighted average of the hub’s EPNodes and that for most hubs the weights are predetermined and fixed **[verified, BPM-002 Attachment text in Kentucky PSC Case No. 2022-00402]**. The current BPM PDF on misoenergy.org was not the file read. Indiana Hub is the usual traded point. On 23 Sep 2026 its daily mean LMP was $41.93 while Minnesota Hub was $30.26 **[verified]**. Picking Indiana and calling it MISO would misstate the North.

The `Type` column value `Hub` is much wider than these eight names. On 23 Sep 2026 it included hundreds of ARR, aggregate, and MVP locations, some of which were negative (for example `NIPS.MUNSTR.LN` at about −$17 to −$18). Filter on the eight official names if a hub is ever used. Do not filter on `Type=Hub`.

Ex-ante and ex-post are different series. On 23 Sep 2026, Indiana Hub hourly LMP differed by as much as $6.17, average absolute gap about $0.68 **[verified]**. MISO’s help center says the ex-post process applies extended LMP and does not change the megawatts cleared in the ex-ante process, and it points to a virtual ELMP make-whole **[retrieved, KA-01138]**. The settlements calculation guide prices day-ahead asset energy at `DA_LMP_EN`, described as the day-ahead clearing price, and it has separate ELMP make-whole charge types **[verified, settlements guide text]**. The guide does not, in the pages read, label `DA_LMP_EN` as the ex-post column. The make-whole’s existence is the reason to prefer ex-post: it is the ELMP price, and the make-whole exists because that price can differ from the price at which volume cleared. This mapping should be confirmed in BPM-005 before implementation. It is the main open question for MISO.

### 6.3 Alternatives considered

- **Indiana Hub ex-post LMP.** Tradable, includes congestion and losses, not footprint-wide.
- **Ex-ante MEC.** Same identity, different price. Closer to the dispatch engine than to ELMP settlement.
- **An average of the eight hubs.** Weights are not published as load weights. Rejected.

### 6.4 Exact source

| Item | Value |
| --- | --- |
| Page | https://www.misoenergy.org/markets-and-operations/real-time--market-data/market-reports/ under Historical LMP |
| Daily file | `https://docs.misoenergy.org/marketreports/YYYYMMDD_da_expost_lmp.csv` |
| Sibling | `YYYYMMDD_da_exante_lmp.csv` |
| Auth | None. The URL returned the CSV directly |
| Participant API | MUI 2.0 `/markets/day-ahead/{day}/reports/lmp-expost` requires a market-participant identity **[verified, MUI API guide]**. Not the public path |

There is no directory listing. `docs.misoenergy.org/marketreports/` itself is not a catalog. Names have to be constructed. A readers’ guide is linked from the market-reports navigator; it was not downloaded.

### 6.5 Fields

Preamble **[verified]**:

```
Day Ahead Market ExPost LMPs
MM/DD/YYYY

,,,All Hours-Ending are Eastern Standard Time (EST)
Node,Type,Value,HE 1,...,HE 24
```

`Value` is `LMP`, `MCC`, or `MLC`. There is no `MEC` row. One node has three rows. Prices are in dollars and cents.

### 6.6 Timestamp and timezone

The file header and the MUI API guide agree. MISO does not observe daylight-saving transitions. Every day has 24 hours ending, Eastern Standard Time, UTC−05:00 **[verified, API guide “Daylight Savings Time Transition” section; verified, 8 Mar 2026 file still has HE 1 through HE 24]**.

Do not convert these hours onto Eastern Prevailing Time and then drop the spring-forward hour. That would delete an EST hour MISO actually priced.

### 6.7 Daily aggregation

For each HE 1–24, compute MEC from one node. Average the 24 numbers. The node is a carrier. Indiana Hub is a convenient carrier because the row is stable; the number does not depend on that choice as long as the identity holds.

Always 24 observations. No DST branch.

Load-weighting hours is not recommended. Load-weighting the eight hubs would be a new index.

### 6.8 Missing data, DST, revisions

No DST short day and no duplicated hour in this clock.

A blank HE cell should fail the day. Do not zero it.

Settlement statements are issued 7, 14, 55, and 105 days after the operating day, and disputes run to 120 days or 15 days after a resettlement **[retrieved, MISO help article KA-01143, citing Tariff §§12 and 12A and BPM-005]**. Whether the public CSV is overwritten when prices are corrected was not tested. Re-pull is cheap; do it through the settlement window until that behavior is known.

### 6.9 Negative and zero prices

Verified in the ex-post file:

- Hourly LMPs at locations typed `Hub` (the broad type) were negative on 23 Sep 2026, 8 Mar 2026, and 12 Apr 2026.
- The eight official hubs were non-negative on those three days and on 7 Apr 2024.
- Derived MEC was identical and non-negative on those days. The lowest official-hub hourly LMP seen was Minnesota Hub at $0.05 on 8 Mar 2026.
- A negative daily mean of MEC was not observed. It is arithmetically allowed, and the file already contains negative LMPs, so the offer stack does clear below zero somewhere in the footprint.
- Exact zero was not observed for MEC. Cent-level prices can print 0.00.
- A day can cross from a negative daily mean to a positive one. Not shown as a consecutive pair for the recommended series.

Percentage changes across a non-positive MEC day should not be published as ordinary returns.

### 6.10 Historical availability

Working URLs in this pass: 7 Apr 2024, 8 Mar 2026, 12 Apr 2026, 23 Sep 2026. `20130401_da_expost_lmp.csv` returned 404, “blob does not exist.” The market-reports page lists historical annual and quarterly day-ahead LMP zips. Those zips were not opened, so their start date, schema, and whether they contain ex-post versus an older single LMP are UNKNOWN. MISO’s day-ahead market began 1 Apr 2005; South integration was later. Do not assume the daily URL pattern covers that whole period.

One year of daily files is supported by the 2024 success. The MVP UI need is met if 2025–2026 files keep working. Deeper history needs a zip inventory.

### 6.11 Licensing

MISO Legal and Privacy **[verified, https://www.misoenergy.org/meet-miso/legal-and-privacy/]**:

> You are not permitted to modify, publish, transmit, participate in the transfer or sale of, reproduce, create derivative works of, distribute, publicly perform, publicly display or in any way exploit any of the materials or content on this Website or the App in whole or in part. … access … does not confer any license.

The CSV host is MISO’s document site. The daily MEC is a derivative of that file.

| Use | Reading |
| --- | --- |
| Displaying raw LMPs | The quoted sentence forbids publishing the content. |
| Storing raw data | Not clearly allowed; the sentence is broader than a website-chrome copyright. |
| Derived index | “Create derivative works” is named. |
| Redistributing the CSV | Named as distribute / reproduce. |

**Classification: unsuitable without permission.** A letter from MISO, or a finding by counsel that the clause does not reach numeric market prices, is required before a public series. Silence is not a grant.

### 6.12 Operational risks

- Undocumented URL convention. A rename breaks ingestion with a 404 and no catalog.
- Ex-ante versus ex-post. Using the wrong file moves the index by dollars, as on 23 Sep 2026.
- The broad `Hub` type. A filter bug will average participant aggregates.
- EST versus prevailing time. Joining this series to PJM or NYISO on a civil clock will be wrong on DST days.
- Possible later restatement of the CSV.
- Historical schema of the annual zips is UNKNOWN.

### 6.13 Open questions

1. BPM-005 sentence that binds `DA_LMP_EN` to the ex-post file.
2. Inventory of historical zip coverage and columns.
3. Written reuse permission.

### 6.14 Citations

- https://www.misoenergy.org/markets-and-operations/real-time--market-data/market-reports/
- https://docs.misoenergy.org/marketreports/20260923_da_expost_lmp.csv and the other dated files parsed above
- https://cdn.misoenergy.org/MUI%202.0%20API%20User%20Guide629008.pdf (EST, no 23/25-hour days, ex-ante and ex-post report paths)
- https://help.misoenergy.org/knowledgebase/article/KA-01138/en-us
- https://misodevcrmportal.powerappsportals.us/knowledgebase/article/KA-01143/en-us
- Kentucky PSC Case No. 2022-00402 attachment of MISO BPM-002 (hub LMP weights and ELMP description)
- https://www.misoenergy.org/meet-miso/legal-and-privacy/
- Settlements calculation guide fetched from https://cdn.misoenergy.org/20230131%20SUG%20Item%20XX%20Market%20Settlements%205%20Minute%20Calculation%20Guide627710.pdf (`DA_LMP_EN`, `DA_ASSET_EN`)

---

## 7. ISO-NE

### 7.1 Recommended benchmark

**Final day-ahead Hub LMP**, location id **4000**.

### 7.2 Why it is the strongest choice

This is the cleanest market in the set. Market Rule 1 §III.2.8 **[verified, the Market Rule text fetched from the ISO site, whose running headers include effective dates in March and April 2026]**:

> The ISO shall calculate and publish Hub Prices for both the Day-Ahead and Real-Time Energy Markets based upon the arithmetic average of the Locational Marginal Prices of the nodes that comprise the Hub.

The Hub node list is published **[verified, https://www.iso-ne.com/static-assets/documents/2021/07/hub_definition.pdf, revision 1 Jun 2021]**. The FAQ says the Hub is a collection of locations meant to represent an uncongested trading price, and that the Hub congestion and loss components are themselves averages of the nodal components **[retrieved, ISO-NE LMP FAQ]**. The Hub price is still a total LMP. It is not the pure energy component. Zonal prices are load-weighted; the Hub is an arithmetic mean. That is the market’s rule, so the daily UEPI step should not “improve” it with load weights.

The ISO’s own location table maps 4000 to the Hub **[retrieved, web-services data page]**.

### 7.3 Alternatives considered

- **Energy component at the Hub.** Published alongside the total if the derived schema is right. Closer to CAISO MCE. Worse as the New England benchmark, because the ISO already publishes the Hub total and tells the market to use it.
- **A load-weighted average of the eight load zones.** Not what §III.2.8 tells the ISO to publish as the Hub. Rejected.
- **Massachusetts zone.** A zone, not the Hub.

### 7.4 Exact source

| Item | Value |
| --- | --- |
| Docs | https://webservices.iso-ne.com/docs/v1.1/ |
| Resource | `GET /hourlylmp/da/final/day/{YYYYMMDD}/location/4000` |
| Base | `https://webservices.iso-ne.com/api/v1.1` |
| Formats | `.json` or `.xml` |
| Auth | HTTP Basic over SSL. Official docs: apply through ISO Express. An anonymous GET of `/hourlylmp/da/final/info` returned **401** on 24 Sep 2026 **[verified]** |
| Version | 1.1, deployed November 2013 **[retrieved, web-services data page]** |

ISO Express also offers browser downloads of pricing reports. That path was not exercised. It is a fallback if the API credential is delayed, and it is a worse automation target.

### 7.5 Fields

The official resource page confirms the payload element is `HourlyLmps` and does not list child fields in the HTML that was fetched. A derived OpenAPI that cites `ns0.xsd` gives `HourlyLmp` the properties `BeginDate`, `Location`, `LmpTotal`, `EnergyComponent`, `CongestionComponent`, `LossComponent` **[retrieved, that OpenAPI’s `x-xsd-source`]**. Treat those names as probable, not confirmed, until one authenticated document is saved.

Benchmark field, once confirmed: `LmpTotal` at location 4000.

### 7.6 Timestamp and timezone

`BeginDate` is documented in the derived schema as a date-time. ISO-NE operates on Eastern Prevailing Time. Hour-ending versus hour-beginning was not confirmed from a live document. DST day length was not file-verified.

### 7.7 Daily aggregation

Mean of the hourly Hub totals. The hourly value is already the arithmetic node average required by §III.2.8. The daily value is the mean of those hours, not a second weighting.

Normal day: 24 hours, subject to the DST check. No published daily Hub average was identified as a substitute. ISO-NE does publish weekly and monthly LMP indices **[retrieved, the resource index lists `WeeklyLmpIndex` and `MonthlyLmpIndex`]**. Those are coarser than the UI’s daily series. Do not use them as the daily observation.

### 7.8 Missing data, DST, revisions

The resource is `/da/final`. Day-ahead does not have the preliminary/final split that real-time has. Market Rule III.2.9A, in the same fetched text, is about final **real-time** prices and a five-business-day outer bound. It is not the day-ahead clock.

If a final day is later corrected, behavior is UNKNOWN. Re-pull yesterday until that is known.

Missing hour: do not interpolate. Fall-back duplicate: keep both once a file shows how they are labeled.

### 7.9 Negative and zero prices

The market design allows negative LMPs. This pass did not measure a Hub hour because the API refused anonymous access. The same four possibilities apply: negative hours, a negative daily mean, an exact zero, and a sign change between days. None were counted. Percentage returns remain unsafe at or below zero.

### 7.10 Historical availability

A prior reading of ISO Express, not repeated on 24 Sep 2026, said hourly reports are available for about the past seven years. One year is inside that claim if it is still true. Confirm with the first authenticated backfill. History before the web-services window may exist as archived CSV on ISO Express. Not inventoried here.

### 7.11 Licensing

ISO-NE legal page **[retrieved, https://www.iso-ne.com/legal-privacy]**:

> You are also hereby put on notice that the Content is protected by copyright under United States laws. Any duplication of the Content or non-personal use may violate copyright, trademark, and other laws.

Content is “as is,” may change without notice, and the tariff controls if the website disagrees.

| Use | Reading |
| --- | --- |
| Displaying raw Hub LMPs | “Non-personal use” may violate copyright. Not a grant. |
| Storing raw data | Not addressed as a licence. |
| Derived daily mean | Not granted. A mean of copyrighted prices can still be a derivative. Counsel has to decide. |
| Redistributing files | The duplication sentence is the problem. |

**Classification: ambiguous / requires legal review.**

### 7.12 Operational risks

- Hard dependency on credentials. Confirmed 401.
- Field names not yet confirmed against a live payload.
- DST unlabeled until a transition file is saved.
- Seven-year horizon is secondhand until re-checked.
- Hub node list can be revised. The PDF is dated 1 Jun 2021. A later revision would change the average without changing location id 4000. Pin the hub-definition version in metadata.

### 7.13 Open questions

1. One authenticated day, including a DST day.
2. Actual API history start.
3. Legal review.

### 7.14 Citations

- https://www.iso-ne.com/static-assets/documents/2014/12/mr1_sec_1_12.pdf §III.2.8 (fetched text includes 2026 effective-date headers)
- https://www.iso-ne.com/static-assets/documents/2021/07/hub_definition.pdf
- https://www.iso-ne.com/participate/support/faq/lmp
- https://www.iso-ne.com/participate/support/web-services-data
- https://webservices.iso-ne.com/docs/v1.1/
- https://webservices.iso-ne.com/docs/v1.1/rest.hourlylmp.da.final.day.day.location.locationId.html
- https://www.iso-ne.com/legal-privacy

---

## 8. NYISO

### 8.1 Recommended benchmark

**The day-ahead system marginal price at the Reference Bus**, derived from any one internal zone in report P-2A.

There is no NYISO hub. There are eleven internal zones. Each zonal LBMP is a load-weighted average of the load-bus LBMPs in that zone, and each component is load-weighted the same way **[verified, MST §17.1.5 in the tariff PDFs fetched]**. A twelfth “NYCA” price is not in the file. Averaging the eleven zones, equally or by a load series we would have to join, would be a Urdais index. Do not do it.

### 8.2 Why it is the strongest choice

Tariff §17.1.1 **[verified, formula structure; the plus-sign glyphs in the PDF extract were destroyed, so the algebraic signs below are pinned by the file, not by the glyph]**:

`LBMP at a bus = system marginal price at the Reference Bus + marginal losses relative to the Reference Bus + congestion relative to the Reference Bus.`

Day-ahead components come from SCUC and are posted for each of the 24 hours of the next day **[verified]**. External zones (H Q, NPX, O H, PJM) are informational proxies **[verified, §17.1.5]**.

On 23 Sep 2026 the internal-zone residual

`LBMP − Marginal Cost Losses + Marginal Cost Congestion`

had a cross-zone range of **$0.01** in every hour **[verified]**. The other sign combinations had ranges of many dollars. The published congestion column is the one that must be **added** after losses are subtracted, given cent rounding. Example, hour beginning 12:00: Capital 29.57, losses 0.38, congestion 0.00, residual 29.19; Central 28.93, losses −0.26, congestion 0.00, residual 29.19; West 27.15, losses −2.04, residual 29.19.

The same residual range was $0.02 on 8, 9, and 15 Mar 2026 **[verified, monthly zip]**. That is rounding, not a second price. Compute the residual from one internal zone (West is fine) and do not average the residuals except as a one-cent sanity check.

Zone J (`N.Y.C.`) is the load pocket people quote. On that September hour it was $31.96 against a reference price of $29.19. It is not the state.

### 8.3 Alternatives considered

- **Zone J LBMP.** The New York City price. Wrong geography for a NYCA benchmark.
- **A load-weighted average of the eleven zonal LBMPs.** Needs an hourly load weight NYISO does not apply for this purpose in P-2A. Rejected.
- **Generator-bus file P-2B.** Same components at a finer grain. No easier system price, much bigger files.

### 8.4 Exact source

| Item | Value |
| --- | --- |
| Report | P-2A Day-Ahead Market LBMP — Zonal |
| Index | http://mis.nyiso.com/public/P-2Alist.htm |
| Daily | `http://mis.nyiso.com/public/csv/damlbmp/YYYYMMDDdamlbmp_zone.csv` |
| Monthly | `http://mis.nyiso.com/public/csv/damlbmp/YYYYMM01damlbmp_zone_csv.zip` |
| Auth | None |
| Sibling | P-2B generator LBMP. Not used |

Daily files for 12 Apr 2026, 8 Mar 2026, and 2 Nov 2025 returned 404. The March 2026 and November 2025 monthly zips returned 200 and contained those days. Recent days are daily CSVs (23 Sep 2026 worked). Older days live in the monthly zip. The index’s newest daily link on 24 Sep 2026 was 25 Sep 2026, so the next operating day was already posted.

### 8.5 Fields

**[verified, 23 Sep 2026 CSV]**

`Time Stamp`, `Name`, `PTID`, `LBMP ($/MWHr)`, `Marginal Cost Losses ($/MWHr)`, `Marginal Cost Congestion ($/MWHr)`.

Internal names and PTIDs seen that day: `WEST` 61752, `GENESE` 61753, `CENTRL` 61754, `NORTH` 61755, `MHK VL` 61756, `CAPITL` 61757, `HUD VL` 61758, `MILLWD` 61759, `DUNWOD` 61760, `N.Y.C.` 61761, `LONGIL` 61762. External: `H Q` 61844, `NPX` 61845, `O H` 61846, `PJM` 61847. Do not use the external names in the residual.

### 8.6 Timestamp and timezone

`MM/DD/YYYY HH:MM`, hour beginning, Eastern Prevailing Time. No timezone column and no DST flag.

**Spring forward, 8 Mar 2026.** Twenty-three NYC timestamps. The list jumps from `01:00` to `03:00`. There is no `02:00` **[verified]**.

**Fall back, 2 Nov 2025.** Twenty-five NYC rows. The timestamp `11/02/2025 01:00` appears **twice**, with LBMPs 53.65 and 52.59 **[verified]**. Nothing in the row says which occurrence is which clock hour. Row order is the only separator. A parser that deduplicates on `Time Stamp` will drop an hour and, if it averages the two, will invent a price.

### 8.7 Daily aggregation

For each physical row of one internal zone, compute lambda as above. Average those lambdas. On 8 Mar 2026 that is a mean of 23 hours. On 2 Nov 2025 it must be a mean of 25 rows, not 24 unique timestamp strings.

The $0.01 cross-zone gap is rounding. Pick one zone and keep it. Do not average zones to “fix” the cent. Document the zone used only as the carrier.

Load-weighting the hours is not recommended.

### 8.8 Missing data, DST, revisions

DST rules are the ones measured above. Do not assume a DST flag will appear.

Missing hour on a non-transition day: fail the day.

Revisions: UNKNOWN whether a posted daily CSV is replaced. The monthly zip is a second copy; if they disagree, that is a revision signal worth storing. Not compared in this pass.

Nulls: fail the hour. Negatives: keep. The congestion sign in the formula is part of the methodology and must be tested, not hardcoded from memory, if the column order ever changes.

### 8.9 Negative and zero prices

Samples (23 Sep 2026, 8–15 Mar 2026, 2 Nov 2025) had no negative internal LBMP and no negative lambda. The lowest internal LBMP in the March 8 file was $17.73. The market allows negative LBMPs. So hourly lambda can be negative, the daily mean can be negative, an exact zero is possible at cent resolution, and consecutive days can change sign. None of those four were observed in the sampled days. The return rule still has to handle them, because the file is not floored at zero.

The fall-back duplicate is a more immediate data bug than negativity.

### 8.10 Historical availability

The P-2A index HTML links monthly zip names from `19991101damlbmp_zone_csv.zip` through `20260901` **[verified, index parsed 24 Sep 2026]**. The November 1999 zip was not opened, so the claim is “the index links it,” not “the file contains valid LBMP rows.” NYISO’s day-ahead market started in November 1999, which matches the index. One year is easy. Bulk history is one zip per month, no key, no stated rate limit. A polite sequential pull is enough. Schema changes since 1999 were not reviewed; the 2025 and 2026 files share the six-column header.

### 8.11 Licensing

NYISO legal notice **[retrieved, https://www.nyiso.com/legal-notice]**:

Access “does not confer any license or ownership interest.” NYISO reserves all IP. “Downloading, republishing, retransmitting, reproducing, or other use of any image or video on this website as a stand-alone file is strictly prohibited.” The notice does not say the same sentence about CSV numbers, and it also does not grant a licence to them.

| Use | Reading |
| --- | --- |
| Displaying raw LBMPs | No grant. The image/video sentence does not clearly cover numbers, and it does not authorize them either. |
| Storing raw CSVs | No grant. |
| Derived lambda and daily mean | No grant. |
| Redistributing the CSV | No grant. |

**Classification: ambiguous / requires legal review.**

### 8.12 Operational risks

- The fall-back timestamp collision will silently drop or blend an hour.
- Daily versus monthly URL. A 404 on the daily path is normal for older dates.
- External zones in the same file. Including `PJM` or `H Q` in the residual will break the identity.
- Cent rounding. Do not expect the residual to be bit-identical across zones.
- Sign convention. Pin it with the test above and re-run it when the header changes.
- Long history may change column order. Not checked before 2025.

### 8.13 Open questions

1. Recompute lambda on each of the two `01:00` rows separately and confirm the $0.02 spread still holds.
2. Counsel on the legal notice.
3. Open the 1999 zip before promising history from market start.

### 8.14 Citations

- http://mis.nyiso.com/public/P-2Alist.htm
- http://mis.nyiso.com/public/csv/damlbmp/20260923damlbmp_zone.csv
- Monthly zips `20260301damlbmp_zone_csv.zip` and `20251101damlbmp_zone_csv.zip`
- https://nyisoviewer.etariff.biz/ViewerDocLibrary/MasterTariffs/9TariffSections/MST%2017.1%20FID1854%20clean_28817.pdf §17.1.1 and §17.1.5
- https://www.nyiso.com/legal-notice

---

## 9. SPP

### 9.1 Recommended benchmark

**Day-ahead Marginal Energy Component (`MEC`) for balancing authority `SPP`.**

SPP publishes two trading hubs, `SPPNORTH_HUB` and `SPPSOUTH_HUB`, and it publishes MEC on every settlement-location row. MEC is the system energy price. The two hub LMPs are not the footprint, and they diverge: on 23 Sep 2026 the North Hub daily mean LMP was $23.98 and the South Hub daily mean was $32.84, while MEC was the same series on both **[verified]**.

### 9.2 Why it is the strongest choice

Glossary **[retrieved, spp.org/glossary]**: an LMP is the market-clearing price at a price node and is equivalent to the marginal cost of serving demand there while meeting operating-reserve requirements. MEC is “a component of LMP representing Energy’s marginal cost.” A hub is “a settlement location consisting of an aggregation of price nodes developed for financial and trading purposes.”

Integrated Marketplace Protocols Revision 36 (24 Feb 2016) §4.5.5.1 **[verified, that PDF]**: a trading-hub LMP is the weighted average of constituent PNode LMPs, and the weights are predetermined and fixed. The same weights apply to MCC and MLC. A current protocols PDF was not retrieved. Whether §4.5.5.1 still reads that way is UNKNOWN. The glossary still defines a hub the same way, and the 2025 Market Monitoring Unit report still charts North and South separately and calls both trading hubs **[verified, Spring 2025 Quarterly State of the Market]**.

On 23 Sep 2026, within BAA `SPP`, MEC on a single interval ranged only from 18.5068 to 18.5070 across 1,307 settlement locations **[verified]**. That 0.0002 spread is rounding. `LMP = MEC + MCC + MLC` held for the North Hub to numerical noise.

The same file also contains BAA `SWPW` and hubs such as `SWPW_HUB` and `CRSP_HUB`. Those are the western market, not the Integrated Marketplace east footprint. They must be excluded. On 8 Mar 2026 the file had **no** `BAA` column. On 12 Apr 2026 the column existed and `SWPW` was present. The cutover date is between those two operating days and was not pinned.

Other names ending in `_HUB` inside BAA `SPP` (`CSWS_HUB`, `ETEC_HUB`, `GRDA_HUB`, and others) are participant or resource hubs, not the two market trading hubs. Ignore them for this benchmark.

### 9.3 Alternatives considered

- **`SPPNORTH_HUB` LMP.** A real trading hub. On 12 Apr 2026 its daily mean was negative. It is not SPP-wide. The MMU charts it next to South, not instead of South.
- **`SPPSOUTH_HUB` LMP.** Same problem, often the higher price.
- **An average of North and South.** Not published. On 12 Apr 2026 it would have mixed −$0.11 and −$8.63. Rejected.
- **MEC from the North Hub row in files that lack `BAA`.** Acceptable historical method, because that MEC matched the system MEC. State the rule: if `BAA` is absent, read MEC from `SPPNORTH_HUB`; if `BAA` is present, read MEC from any `SPP` row and assert it matches the North Hub.

### 9.4 Exact source

| Item | Value |
| --- | --- |
| Portal page | https://portal.spp.org/pages/da-lmp-by-settlement-location |
| Description | https://portal.spp.org/groups/day-ahead-market — “LMP information by Pnode location and corresponding Settlement Location,” updated after day-ahead results |
| File API | `https://portal.spp.org/file-browser-api/download/da-lmp-by-settlement-location?path=/{YYYY}/{MM}/By_Day/DA-LMP-SL-{YYYYMMDD}0100.csv` |
| Auth | None. 2026 and 2 Nov 2025 files returned 200 |
| Listing | No listing endpoint was used. A wrong path 404s |
| RePrice | The portal page lists a RePrice folder beside the year folders **[retrieved]** |

`DA-LMP-SL-201403010100.csv` at both the By_Day path and the older monthly path returned 404. The pre-21 Jul 2016 layout (no `By_Day`) is described in secondary code and was not re-proven.

### 9.5 Fields

**On and after 12 Apr 2026 [verified]:** `Interval`, `GMTIntervalEnd`, `BAA`, `Settlement Location`, `Pnode`, `LMP`, `MLC`, `MCC`, `MEC`.

**On 8 Mar 2026 and 2 Nov 2025 [verified]:** the same list without `BAA`.

Benchmark column: `MEC`, restricted to `BAA=SPP` when the column exists.

### 9.6 Timestamp and timezone

`Interval` is Central Prevailing Time, hour ending. `GMTIntervalEnd` is the UTC hour ending and is unique.

**Spring forward, 8 Mar 2026.** North Hub has 23 rows. Local intervals jump from `01:00` to `03:00`. `01:00` maps to `07:00` GMT (CST, UTC−6). `03:00` maps to `08:00` GMT (CDT, UTC−5) **[verified]**.

**Fall back, 2 Nov 2025.** North Hub has 25 rows. Local `02:00` appears twice, with `GMTIntervalEnd` `07:00` and `08:00` **[verified]**. Deduplicate on GMT, not on `Interval`.

### 9.7 Daily aggregation

Mean of the MEC values for the operating day’s GMT interval ends, SPP BAA only. Use 23 or 25 values when that is the whole day. Do not invent the missing spring hour. Do not average the two fall-back hours into one before the daily mean; they are two hours.

North and South must not be averaged. Load-weighting them is not recommended.

SPP does not publish a daily MEC.

### 9.8 Missing data, DST, revisions

DST behavior is measured, above.

Protocols Revision 36 §4.5.5 says nodal LMPs are subject to price-correction procedures in §6.6.1. The portal’s RePrice folder is the operational trace of that. Corrected days may appear as a second file rather than, or in addition to, an overwrite. Not diffed in this pass. Ingestion should check RePrice.

Null MEC: fail the hour. A `BAA` value other than `SPP` is not a null; it is a different market.

### 9.9 Negative and zero prices

This is the clearest empirical case in the study.

**8 Mar 2026, North Hub, 23 hours [verified]:**

- Hourly LMP minimum −$11.05 (4 negative hours).
- Hourly MEC minimum −$9.41 (2 negative hours).
- Daily mean LMP **+$10.73**. Daily mean MEC **+$14.50**.

**12 Apr 2026, BAA SPP, 24 hours [verified]:**

- North Hub hourly LMP negative in 12 hours, minimum −$18.82. **Daily mean LMP −$0.1083.**
- South Hub hourly LMP negative in 19 hours, minimum −$26.42. **Daily mean LMP −$8.6282.**
- MEC negative in 10 hours, minimum −$15.26. **Daily mean MEC +$2.7785.**

**2 Nov 2025, North Hub:** one hourly LMP of −$0.02 at the last hour. Daily mean not separately needed; the day is mostly positive.

So, for the **recommended MEC series**:

- Hourly values can be negative. Observed.
- The daily mean can be negative in principle. On 12 Apr 2026 it stayed positive even with 10 negative hours. A negative daily MEC was not observed in this sample.
- Exact zero was not observed.
- A negative hour inside a positive day is enough to make intraday stories confusing; the daily series itself did not change sign in the sampled MEC days.

For the **hub LMPs people might have preferred**:

- The daily benchmark can be negative. Observed on 12 Apr 2026 for both hubs.
- Consecutive-day sign changes are therefore possible for a hub-based series. A neighboring day was not pulled to show the cross, and one negative day is enough to require the return rule.

If V1 uses MEC, still implement the non-positive return rule. Hourly MEC already goes negative, and a more negative day than 12 Apr 2026 would pull the daily mean through zero.

### 9.10 Historical availability

The portal page lists year folders 2013 through 2026 plus RePrice **[retrieved]**. Integrated Marketplace started 1 Mar 2014. EIS-market files in 2013 are a different price (LIP, not LMP) if they are present. Do not mix them. The 2014 path tried here 404’d, so the bulk layout is not one pattern for the whole archive. One year of By_Day files worked (2025 and 2026). Rate limit: unknown. Files are a few megabytes per day.

### 9.11 Licensing

Portal terms **[retrieved, https://portal.spp.org/terms-of-use]** and the same clause on https://spp.org/terms-conditions/:

> Permission is implicitly granted to copy and distribute … in whole or in part (with appropriate citation) EXCEPT when such materials will be used, in whole or in part, within a commercial publication … or when the author(s) or SPP will be quoted in commercial materials, forums, or publications. Commercial use of any information contained on the Portal requires express written authorization from the author(s) or a duly authorized officer of SPP.

Access “does not confer any license.”

| Use | Reading |
| --- | --- |
| Displaying raw LMPs in a commercial product | Requires written authorization. |
| Storing raw files internally | Not clearly the “commercial publication” trigger, and also not granted as a licence. Counsel should separate internal storage from publication. |
| Derived daily MEC on a public commercial site | A commercial publication of SPP information. The exception applies. |
| Redistributing the CSV | Copying into a commercial publication is the prohibited case. |

**Classification: unsuitable without permission** for a commercial Urdais page. Citation is not enough.

### 9.12 Operational risks

- The March-to-April 2026 schema break (`BAA`, and western rows). A parser that assumes eight columns will shift MEC into the wrong field after the break, or drop the column before it.
- Western contamination if `BAA` is ignored.
- Participant hubs whose names contain `HUB`.
- DST duplicates that share `Interval` and not `GMTIntervalEnd`.
- RePrice files.
- 2016-era path change around 21 Jul 2016, not re-tested.
- Hub-weight documentation is ten years old.

### 9.13 Open questions

1. Current protocols section for trading-hub weights and for MEC.
2. The exact operating day the `BAA` column appeared.
3. Written commercial-use authorization.
4. A day on which the **daily MEC mean** itself is negative, so the return-rule test fixture is real. 12 Apr 2026 is the fixture for hub means, not yet for the MEC mean.

### 9.14 Citations

- https://portal.spp.org/pages/da-lmp-by-settlement-location
- https://portal.spp.org/groups/day-ahead-market
- https://portal.spp.org/terms-of-use
- https://spp.org/terms-conditions/
- https://www.spp.org/glossary/
- https://www.spp.org/documents/36461/integrated%20marketplace%20protocols%2036%201.pdf Revision 36, 24 Feb 2016, §4.5.5.1
- https://www.spp.org/documents/74287/spp%20mmu%20qsom%20spring%202025.pdf (North and South as the two trading hubs)
- Files downloaded 24 Sep 2026: `DA-LMP-SL-202609230100.csv`, `DA-LMP-SL-202604120100.csv`, `DA-LMP-SL-202603080100.csv`, `DA-LMP-SL-202511020100.csv`

---

## A. Recommended cross-market UEPI V1 methodology

1. **No national composite.** Seven series, seven definitions, no sum and no average across markets.
2. **One operating-day value per market**, in $/MWh, equal to the arithmetic mean of that day’s valid hourly benchmark prices.
3. **Use the market’s own series when it has one.**
   - ERCOT: published `HB_HUBAVG` day-ahead settlement point price.
   - PJM: latest-version day-ahead total LMP at pnode id 1.
   - ISO-NE: final day-ahead Hub LMP at location 4000.
4. **Where the market has no such series, use the system marginal energy component and say so.**
   - CAISO: hourly `MCE`, from one trading hub, after checking the other hubs match.
   - MISO: hourly `LMP − MCC − MLC` from the ex-post file, from one node.
   - NYISO: hourly `LBMP − losses + congestion` from one internal zone, preserving duplicate fall-back rows.
   - SPP: hourly `MEC` for BAA `SPP`, keyed by `GMTIntervalEnd`.
5. **Do not average hubs, zones, or nodes** to manufacture a footprint price.
6. **Do not load-weight the hours** in V1. PJM’s aggregate and NYISO’s zones are already weighted at the hourly step. A second weighting is a different index.
7. **Keep negative and zero hours.** They are valid prices.
8. **DST.** Mean the hours the market actually posted.
   - MISO: always 24, Eastern Standard Time.
   - SPP: 23 in spring, 25 in fall, distinguished by `GMTIntervalEnd`. Verified.
   - NYISO: 23 in spring (no `02:00`), 25 in fall (two rows labeled `01:00`). Verified.
   - ERCOT, PJM, CAISO, ISO-NE: prevailing-time 23/25 is expected and was not file-verified in this pass.
9. **Returns.** Store the level in $/MWh. Publish a dollar change always. Publish a percentage change only when both endpoints are strictly positive. The 12 Apr 2026 SPP North Hub daily mean of −$0.11 is the existence proof.
10. **Metadata on every point.** Market, construct (hub total, RTO total, or system energy), source file, hour count, timezone, version or revision flag, and the rights status. The comparison UI has to show the construct, or the comparison overclaims.
11. **Rights gate.** ERCOT is the only source with an affirmative raw-data chart grant. PJM, MISO, and SPP are not cleared for a public derived series. CAISO, NYISO, and ISO-NE need counsel. Internal storage and a public chart are different questions.

## B. Market-specific exceptions

| Market | Exception to the naive “mean of hourly day-ahead LMPs” story |
| --- | --- |
| ERCOT | Store published `HB_HUBAVG`. Day-ahead is a shift-factor formula, not the mean of the four hubs. Real-time would be that mean. Panhandle is not in the hub. |
| PJM | Use the RTO aggregate total, latest version, not Western Hub and not system energy. Redistribution is prohibited without membership. |
| CAISO | Use MCE, not an average of NP15 and SP15. LMP also contains MGHG. Parser must not assume a three-part LMP. |
| MISO | Use ex-post, derive MEC, stay on Eastern Standard Time, ignore the broad `Hub` type. |
| ISO-NE | Use the Hub. The hourly price is already an arithmetic node average. Credentials required. |
| NYISO | Derive the reference price. Do not average zones. Do not dedupe `01:00` on the fall-back day. |
| SPP | Use MEC for BAA `SPP`. Drop `SWPW`. Do not average North and South. Key on GMT. |

## C. Questions that must be resolved before implementation

1. **Legal.** Which of these seven derived series may be shown on a public commercial page? PJM, MISO, and SPP are blocked on the text read here. ERCOT is allowed as a compilation or chart of raw public data, with the disclaimer that ERCOT does not stand behind the derived figure. CAISO, NYISO, and ISO-NE are unresolved.
2. **CAISO greenhouse gas.** Add uniform MGHG to MCE, or leave it out and label the benchmark as energy-only? One day of uniformity is not a tariff rule.
3. **MISO ex-post versus ex-ante.** Confirm `DA_LMP_EN` in the current BPM-005.
4. **PJM weighting sentence.** Confirm pnode 1 is the distribution-weighted RTO price, and lock the name (`PJM-RTO` versus `PJM`) to id 1.
5. **SPP protocols.** Replace the 2016 citation with the current revision, and pin the `BAA` cutover date.
6. **DST files still missing** for ERCOT, PJM, CAISO, and ISO-NE.
7. **Return convention.** Dollar change only when an endpoint is ≤ 0, or a different transform. This is a product rule, and the data require it.
8. **NYISO fall-back identity.** Re-test lambda on each physical `01:00` row.
9. **History floors.** Credentialed ERCOT archive start; MISO zip inventory; ISO-NE API start; SPP pre-2016 paths; open the NYISO November 1999 zip before citing it as data rather than as an index link.
10. **Revision policy.** For each feed, does a correction overwrite the file, add a version, or land in a side folder (SPP RePrice, PJM `version_nbr`)?

## D. Machine-readable source map

`docs/research/uepi/uepi-phase-1-source-map.json`

---

## Files read in this pass

Downloaded and parsed on 24 Sep 2026, not committed:

- ERCOT DAM display HTML for operating day 25 Sep 2026
- CAISO OASIS `PRC_LMP` DAM zip for trading day 23 Sep 2026, three trading hubs
- MISO ex-post CSVs for 23 Sep 2026, 12 Apr 2026, 8 Mar 2026, and 7 Apr 2024; ex-ante CSV for 23 Sep 2026
- NYISO P-2A daily CSV for 23 Sep 2026; monthly zips for March 2026 and November 2025
- SPP `DA-LMP-SL` files for 23 Sep 2026, 12 Apr 2026, 8 Mar 2026, and 2 Nov 2025
- Tariff and protocol PDFs cited above
- Terms pages cited above

Not downloaded, and not treated as measured: any PJM LMP row, any ISO-NE LMP row, any ERCOT API payload, any CAISO DST day, any MISO file older than 7 Apr 2024.
