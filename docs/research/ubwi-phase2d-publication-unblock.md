# UBWI Phase 2D — Final Publication Unblock

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Prepared 15 September 2026. **No UBWI value is published, seeded or promoted by this phase, and none may be.** Every figure below is either evidence about a source or a labelled research candidate.

Continues [Phase 2C](./ubwi-phase2c-denominator-hardening.md), [Phase 2B](./ubwi-phase2b-coverage-expansion.md), [Phase 2A](./ubwi-phase2a-denominator-source-study.md) and [Phase 1](./ubwi-phase1-source-study.md), and follows UBWI Production V1 (PR #66, `489684c`). **No amendment to the methodology is proposed.** The denominator concept, the numerator construction and the publication gate are all unchanged; the gate's thresholds are untouched.

## The question

> **Production V1 refuses to publish. Can the two remaining blockers — the modelled share of wealth, and the four unreviewed numerator source interfaces — be cleared without weakening the methodology?**

## Headline Result

> ### One blocker got smaller and the other got much larger. The numerator's own venues do not permit the thing UBWI does.

**One. Phase 1's numerator rights conclusion was about vendors, and was read as if it were about venues.** Phase 1 concluded that reading public spot tickers directly "removes the licensing dependency" a vendor aggregate would carry. That is true of *vendors*. It was never a statement about the *venues*, and no venue's terms had ever been retrieved — the methodology said so plainly, in open question 4. Phase 2D retrieved them. **Reproducing a construction yourself does not reproduce the permission to publish it**, and three of the four interfaces do not grant it.

**Two. Coinbase prohibits the retrieval itself.** The Coinbase Developer Platform Terms, item 9 (Use Restrictions), verbatim from the retained artifact:

> "Collect, cache, aggregate, or store data or content accessed via the CDP Tools other than for purposes allowed under these terms. You may not share such data or content with third parties in any manner without Coinbase's prior written authorization. Further, you are strictly prohibited from recording data or content accessed via the CDP Tools through the use of any automated programs, software, or any other method of screen scraping."

Urdais's numerator does all four of those things. **Both axes are `not_permitted`.** The licence grant in the same document is narrower still — it covers content "available at https://cdp.coinbase.com", and the production endpoint is `api.coinbase.com`.

**Three. Kraken permits the read and forbids the publication.** Kraken's Global Terms define "Our Content" as the services and platforms and all content and materials found on them, which reaches a ticker price. The grant is to use it "but only for your own benefit", and the prohibited acts include to "distribute or otherwise commercially exploit or make available to any third party Our Content in any way". The document names the remedy: seek prior permission. **Retrieval permitted, data use `not_permitted`.**

**Four. Bitstamp grants exactly what UBWI needs, to a signatory.** From Bitstamp's own API documentation:

> "Companies seeking to utilize Bitstamp's exchange data for their own commercial purposes are directed to contact partners@bitstamp.net to receive and sign a commercial use Data License Agreement. Bitstamp allows the incorporation and redistribution of our exchange data for commercial purposes. This includes the right to create ratios, calculations, new original works, statistics, and similar, based on the exchange data."

That is UBWI, described almost exactly. It is conditional on an agreement Urdais does not hold. **A conditional grant is not a grant**, and executing one is an outreach decision requiring explicit approval, which this phase did not have and did not take.

**Five. Blockchain.com grants access and says nothing about publication.** Section 20 (Explorer) grants "a revocable, limited, non-exclusive, non-transferable licence to access and use the Explorer API" and scopes the service "solely for informational purposes". No redistribution, retention or attribution term exists. **Silence is recorded as silence, not read as permission.**

**Six. The venue set cannot be repaired by substitution, because the methodology has no substitution rule.** UBWI's own [open question 7](/docs/methodology/ubwi) is "the venue set for the numerator median, and the rule for adding or removing a venue without moving the series." There is no such rule. Replacing a venue for rights reasons is therefore a methodology-impacting decision, and Phase 2D stops for review rather than swapping venues quietly. **No venue was swapped.**

**Seven. The gate now checks the numerator's rights, which it did not before.** Production V1's gate held every *denominator* constituent to a retained terms artifact and left the numerator to the readiness report. That meant a gate could pass a calculation whose price Urdais was not permitted to publish. `NUMERATOR_SOURCE_NOT_RIGHTS_CLEARED` closes that. This is a strengthening; no threshold moved.

**Eight. The artifact-integrity invariant exists, and it verifies the whole existing record.** All eleven Production V1 terms artifacts were re-found in the research store by content hash and every one reproduces byte-for-byte, and every one of the eleven committed decisive clauses occurs, word for word and in order, in the document it cites. The record is sound. The invariant is now enforced in code so that the next one has to be too.

**Nine. The denominator's best remaining candidate is one retrieval away, and it is a licence, not a balance sheet.** Nine national compilers were checked. Eight publish produced assets, household wealth or financial accounts and no land. **Stats NZ publishes exactly the right thing** — total-economy net worth at market value, land-inclusive, at 31 March 2024 — and Production V1 excluded it on the OECD's 2017 mirror. Its terms could not be retrieved, because its copyright page renders client-side and returns 22 characters of body text. **No terms artifact, no rights state, no inclusion.** The exclusion record now says that rather than repeating a vintage reason that is no longer true.

**Decision: UBWI stays unpublished. The binding blocker is the numerator, not the denominator.**

---

## Method and Evidence Standard

Unchanged from Phases 2A–2C, and tightened in one respect that Phase 2D added to the codebase rather than to this document.

Every artifact below was retrieved on 15 September 2026 by direct `urllib` call, saved to disk, and hashed with `shasum -a 256` over the bytes actually saved. **Every quoted clause was cut out of the retained file by a script, not typed.** A retrieval failure is a fact about the retrieval and never about the source. No search engine result is cited as evidence. No sub-agent's finding entered this document or the repository without the artifact being re-hashed locally.

**No Grok 4.6 research memo was supplied to this phase.** Every finding here is first-party and was verified in this session.

---

## Part 1 — Numerator rights, interface by interface

The exact production interfaces, taken from `src/lib/ubwi/numerator.ts` rather than from the methodology's prose.

| Interface | Production endpoint | Terms artifact | Bytes | SHA-256 |
|---|---|---|---:|---|
| `coinbase-spot` | `api.coinbase.com/v2/prices/BTC-USD/spot` | `coinbase.com/legal/developer-platform/terms-of-service` | 610,772 | `1fe28153…70484fec` |
| `bitstamp-ticker` | `bitstamp.net/api/v2/ticker/btcusd/` | `bitstamp.net/api/` | 2,007,325 | `d11bf1c0…07abef76` |
| `kraken-ticker` | `api.kraken.com/0/public/Ticker?pair=XBTUSD` | `kraken.com/legal/global-terms` | 3,633,626 | `6e61bf4e…b4d7bea0` |
| `blockchain-info-supply` | `blockchain.info/q/totalbc` | `blockchain.com/legal/terms` | 1,476,048 | `0e2b6904…4de791ef` |

All four returned HTTP 200. The full hashes are in `src/lib/ubwi/rights.ts` and in migration `20260915000300`; `npm run ubwi:verify-terms` re-derives them from the retained bytes.

### 1.1 The six axes, per interface

The brief asks six questions of each interface. They diverge, which is why `UsageTerms` in `rights.ts` now records them separately rather than collapsing them into one flag.

| | Coinbase | Bitstamp | Kraken | Blockchain.com |
|---|---|---|---|---|
| Automated retrieval | **not permitted** | permitted | permitted | permitted |
| Commercial derived-index use | **not permitted** | **conditional** | **not permitted** | not addressed |
| Redistribution of the reading | **not permitted** | **conditional** | **not permitted** | not addressed |
| Attribution required | none stated | none stated | none stated | none stated |
| Caching / retention | **not permitted** | **conditional** | not addressed | not addressed |
| Rate limit | none stated in the terms | **400 req/s; 10,000 per 10 min** | none stated in the terms | none stated in the terms |
| **Effective rights state** | **blocked** | **under review** | **blocked** | **under review** |

**"Conditional" is the state the two-valued model could not express**, and it is the most important classification in the phase. Bitstamp does not refuse; it names an instrument. Recording that as `not_reviewed` would have been wrong in one direction and as `permitted` wrong in the other.

### 1.2 Retrieval facts that are not source facts

- **`bitstamp.net/terms-of-use/` is behind an Imperva challenge.** Every request — three URL variants, browser headers — returned HTTP 200 with a 212-byte interstitial stub (`sha256 d0203228…`), never the terms. This is a fact about the retrieval. The rights state rests on `bitstamp.net/api/`, which is first-party, is the documentation governing the endpoint Urdais reads, and returned 2,007,325 bytes cleanly.
- **`kraken.com/legal` is a JavaScript shell**: 848,267 bytes containing navigation and 6,354 characters of readable text, no terms body. It does carry the link to the applicable document. Kraken serves separate Canadian, EEA and Brazil terms; the Global terms apply everywhere else and are the ones retained.
- **Blockchain.com's "API Terms of Service" could not be retrieved.** The string appears in the site's own translation bundle with a "Last Updated: August 13, 2026" date, but no reachable path serves it: `/legal/api` and `/legal/terms-of-service` both return HTTP 404, and the only legal paths the page itself emits are `/legal/terms` and `/legal/blockchain-europe/terms-and-conditions`. **Nothing is assumed from a document that could not be read.** The state rests on section 20 of the Terms of Service, which is the document that governs the Explorer API by its own terms.
- **`mempool.space` serves an Angular shell** (3,017 bytes) at both `/about` and `/terms-of-service`. It is cited in the production observation only as an independent confirmation of block height, not as a data source, and it is not registered as a source interface. No rights claim is made about it.

### 1.3 The methodology document is now stale on this point, deliberately

`docs/methodology/ubwi.md` is approved at version 1.0.0 and its content hash is pinned in migration `20260915000200` and re-computed by the test suite, which is what stops it drifting silently. Its open question 4 reads "Numerator source terms have not been reviewed", and after this phase that is no longer true.

**The document is not edited here.** Changing an approved, hash-pinned methodology is a versioned act with its own review, and doing it as a side effect of a research phase is exactly the kind of quiet amendment the pinning exists to prevent. The correct record of the change is this document and the source-rights record, both of which the methodology page links to. Amending open questions 4 and 7 belongs in the same review that decides what to do about the venue set.

### 1.4 What this does not change

**Issued supply is still a deterministic property of the chain.** It is reproducible from the nominal issuance schedule at a stated height, and Production V1 already cross-checks it that way. Blockchain.com is a *retrieval path* for that fact, not the authority for it. The open question is whether Urdais may publish a figure obtained through that particular path, and it is a narrower question than the venues'.

---

## Part 2 — Denominator coverage

The gate needs the modelled share of wealth at or below 40 %. It is 40.44 %.

### 2.1 What the arithmetic actually requires

Own computation, and it produced one result worth stating because it is not obvious. Writing the imputed share out,

$$\frac{I}{O+I} = \frac{k R\,(G_w - G_o)}{O + k R\,(G_w - G_o)} = \frac{k\,(G_w - G_o)}{G_{\text{ref}} + k\,(G_w - G_o)}$$

since $R = O / G_{\text{ref}}$. **The observed wealth level cancels.** The modelled share depends only on the tail calibration $k$, the observed set's reference-year GDP, and its 2024 GDP — not at all on how wealthy the added economy turns out to be. A poor economy and a rich one of the same GDP move the gate identically.

The requirement is therefore exactly stateable: **+$515.3 bn of 2024 GDP, or +0.4614 pp of world GDP**, taking coverage from 52.2340 % to 52.6954 %. That is roughly one mid-sized economy.

### 2.2 The land constraint, re-measured from first-party data

Phase 2B found land to be the binding constraint. Phase 2D re-measured it directly rather than relying on the earlier finding, with one Eurostat API call per asset code on 15 September 2026 (`nama_10_nfa_bs`, `sector=S1`, `unit=CP_MNAC`, all geographies, all years; HTTP 200; dataset updated 2026-09-08).

| Asset code | Concept | Geographies with data | Latest year per geography |
|---|---|---:|---|
| `N211N` | **Land** | **10** | AT 2023, CZ 2025, DE 2024, EE 2023, FI 2024, FR 2025, NL 2024, SE 2025, SK 2024, UK 2019 |
| `N2N` | Non-produced assets, total | 6 | AT 2023, CZ 2025, FR 2025, **NO 2014**, SE 2025, UK 2019 |
| `N21N` | Natural resources | 4 | CZ, FR, SE 2025, UK 2019 |
| `N1N` | Produced assets, total | 11 | + HU 2023, LV 2023, NO 2022, PT 2023 |
| `N11N` | Fixed assets | 32 | most of the EU |

> **Every one of the ten Eurostat geographies that publishes land is already in the observed set.** AT, CZ, DE, EE, FI, FR, NL, SE, SK are observed through Eurostat; the UK is observed through the ONS (and Eurostat's UK row is stale at 2019 and excluded from commercial reuse in any case). Italy is observed through Istat's own service. **Eurostat is exhausted.**

The OECD's `DSD_NASEC10@DF_TABLE9B` was re-queried directly on 15 September 2026 (HTTP 200 on every asset code) rather than read out of the Phase 2C matrix, because a claim about what a compiler publishes today should be measured today.

| Asset code | Reference areas | Not already observed |
|---|---:|---|
| `N211N` (land) | 17 | **HRV 2020, NZL 2017** |
| `NN` (total non-financial) | 10 | NZL 2017, RUS 2019 |
| `N2N` (non-produced) | 10 | NZL 2017 |
| `N1N` (produced) | 18 | HUN 2021, ISR 2021, LVA 2021, NOR 2020, PRT 2021, RUS 2019 |
| `N11N` (fixed assets) | 37 | most of the EU, plus CHL |

**Croatia and New Zealand are the only land-publishing geographies in either harmonised compiler that Urdais does not observe, and neither survives the vintage rule.**

- **Croatia**: land at **2020**, five years before the latest complete calendar year, past the four-year bound. Its fixed-asset series runs to 2021 and its land to 2020, so even ignoring vintage the two legs are different years, and the OECD publishes no `N1N`, `N2N` or `NN` for Croatia at all. **It is not constructible.**
- **New Zealand**: every code stops at 2017, which is why it already sits in `EXCLUDED_ECONOMIES`.

For completeness, what they would have been worth if either were current:

| Addition | Coverage | Modelled share | Gate |
|---|---:|---:|---|
| Production V1 as it stands | 52.2340 % | **40.4392 %** | refused |
| + Croatia *(counterfactual)* | 52.3173 % | 40.3974 % | still refused |
| + New Zealand *(counterfactual)* | 52.4682 % | 39.9999 % | passes by 0.0001 pp |
| + both *(counterfactual)* | 52.5515 % | 39.9581 % | passes |

Croatia would not have been enough on its own in any case. And **a gate that passes by one ten-thousandth of a percentage point is not a margin** — building the first published UBWI on New Zealand alone would have been a worse decision than not publishing.

> **There is no economy outside the observed set, in either harmonised compiler, with a land-inclusive balance sheet that satisfies the vintage rule. Not one.** The remaining route to the denominator is national compilers, one at a time.

### 2.3 The "near-term frontier" is softer than it reads

Phase 2C's near-term frontier of 55.72 % — which the gate's `FEASIBLE_FRONTIER` constant records and which every threshold is checked against — is built on adding Norway, Finland, Hungary, Israel, Latvia and Portugal, described as "each already publishes a valued non-financial asset total". Finland has since been added. **Of the remaining five, the Eurostat measurement above shows that Hungary, Latvia, Norway and Portugal publish `N1N` — produced assets — and no land at all**, and Israel appears in the OECD's `N1N` and `N11N` rows and not in its `N211N` row.

Admitting any of them would mean treating produced capital stock as national net wealth, which the methodology prohibits and this brief explicitly rejects. **They are not "blocked on a matched net-foreign-position year"; four of the five are blocked on land.** This is a correction to Phase 2C's open question 4.

No threshold is changed here. The frontier constant stays at the measured 55.72 % and remains above every configured bound, so no gate becomes unsatisfiable. But the near-term frontier should be re-measured on a land-inclusive basis before it is leaned on again, and that is recorded as an open question rather than acted on tonight.

### 2.4 The national compilers, nine of them

Both harmonised compilers being exhausted, the remaining route is national statistical offices one at a time. Nine were checked, chosen by GDP weight, each against its own first-party publication or API. **Every artifact was re-hashed and every quoted string re-grepped locally before it entered this document.**

| Economy | GDP 2024 | Verdict | What is published instead |
|---|---:|---|---|
| **New Zealand** | $261 bn | **LAND-INCLUSIVE BALANCE SHEET FOUND** | *Annual balance sheets: 2024 (provisional)* |
| Spain | $1,726 bn | not found | GDP, national income, GFCF by asset type. No asset balance sheet. BdE publishes financial accounts and experimental *household* distributional wealth accounts. |
| Switzerland | $970 bn | not found | Net non-financial capital stock: "buildings, works of civil engineering, machinery and equipments, cultivated assets, research and development as well as software" — produced assets only. |
| Poland | $918 bn | not found | Fixed assets (*środki trwałe*). Six national-accounts sub-topics, none a balance sheet. |
| Belgium | $671 bn | **not found — near miss** | See below. |
| Israel | $542 bn | not found | A subject literally named *מאזן לאומי* (national balance sheet) whose 266 series are entirely financial: AF.1–AF.8, LF.1–LF.8, net financial worth. No AN codes. |
| Norway | $501 bn | not found | Fixed capital (09181, 11189), *household* wealth accounts (10315), financial accounts. Table 11123 is a flow. |
| Denmark | $425 bn | not found | NAHK/NABK/NASK are AN.11 fixed assets; "other structures and land improvements" is a produced asset, not land. |
| Croatia | $93 bn | not found | DZS publishes gross fixed capital *formation* (a flow) and non-financial sector accounts. **The OECD's `N211N` row for Croatia corresponds to nothing DZS publishes nationally.** |

**Belgium is the one that would have closed the gap alone**, and it fails for an unusually precise reason. The NBB's `DF_CAPSTOCK2010_DISS` cube does publish land with the full AN.21 breakdown — but only for households and NPISH. Verified by direct grep of the retained CSV:

```
…,SLS,TOT,AN21000,V,S14_15,2023,1137164.2,P,F,6,1
…,SLS,TOT,AN21000,V,S1,   2023,NaN,      M,F,6,1
```

The total-economy cell **exists in the published cube and is empty**, flagged `M` for missing, as are S.11, S.12 and S.13. This is "not compiled or not released", not a conceptual absence — a materially different finding from the other seven negatives, and the only one where a question to the compiler could plausibly change the answer.

### 2.5 New Zealand: the data is there, the licence is not

Stats NZ publishes *Annual balance sheets: 2024 (provisional)*, released 27 November 2025, covering years ended March 2007–2024 at current price (market value) for the total domestic economy. Independently re-hashed (`sha256 3b2a8baf…0f2438`, 1,016,246 bytes, HTTP 200) and re-grepped:

| Line | Code | NZD million, 31 March 2024 |
|---|---|---:|
| Total non-financial assets | `AN00000` | 3,171,132 |
| — produced | `AN10000` | 1,536,566 |
| — **non-produced (land)** | `AN20000` | **1,634,567** |
| Total financial assets | `AFA0000` | 4,334,450 |
| Total financial liabilities | `AFL0000` | 4,531,868 |
| **Closing balance net worth** | `B900000` | **2,973,715** |

Series `SG07NLE00000AN20000S800C0`, sector 800 "Total economy (excl rest of the world)". The identity checks: 3,171,132 + 4,334,450 = 7,505,582 against a published total of 7,505,583, and 7,505,583 − 4,531,868 = 2,973,715 exactly. **This is national net worth on the same construction as the ABS's and Statistics Canada's — land-inclusive, market-valued, net of the foreign position — and it is better than the Eurostat assembly, not worse.** The ECB's last NZD fixing at or before 31 March 2024 (Easter Sunday) is 28 March 2024 at 1.8092 NZD/EUR against 1.0811 USD/EUR, giving 1.673481 NZD per USD and **USD 1.7770 tn**.

Production V1 excluded New Zealand on vintage, reading the OECD's mirror, which stops at 2017. That reason is no longer true, and leaving it in place would have been the same mistake Phase 2C corrected four times over.

**It is still excluded, and the reason is rights.** Stats NZ's copyright page returns HTTP 200 with a client-rendered shell carrying 22 characters of body text; the CSV and the workbook state no licence; and browser automation is unavailable on this machine. **No terms artifact could be retrieved, so no rights state can be established** — not "permitted", and not "refused" either. `EXCLUDED_ECONOMIES` now records `source_rights_not_established` rather than `vintage_max_age_years`, and `statsnz-annual-balance-sheets` is registered in the rights record as `not_reviewed` with no artifact, so the gap is visible in code rather than only in prose.

### 2.6 What New Zealand would have done to the gate, and why that is uncomfortable

Had its rights been established, the existing reference-year convention — the one Australia's 30 June component already follows — would pair a 31 March 2024 balance sheet with New Zealand's 2024 GDP, and the gate would read:

| | Modelled share | Gate |
|---|---:|---|
| Production V1 | 40.43922 % | refused |
| + New Zealand, paired with 2024 GDP | **39.99989 %** | **passes by 0.00011 pp** |
| + New Zealand, paired with 2023 GDP | 40.00194 % | refused |

**The gate outcome turns on which calendar year's GDP is paired with a fiscal-year balance sheet.** The 2024 pairing is the rule-following one and is not chosen to produce a pass — but a threshold decided at the fifth decimal place by an alignment convention is not a measurement, and this is recorded so that whoever clears New Zealand's licence knows the denominator does not really clear with it. **It reaches the line; it does not clear it.** One more economy of any size would.

---

## Part 3 — The artifact-integrity invariant

### 3.1 Why

During UBWI Production V1 an agent wrote terms hashes and licence clauses into the rights record from memory, caught itself, and recomputed everything from the retained files. Several remembered quotes were wrong and one artifact it reached for was a 404 page. **Nothing in the codebase would have caught that.** A rights record that cannot be checked against its own evidence is an assertion wearing evidence's clothes, which is precisely the failure mode the whole rights model exists to prevent.

### 3.2 What was built

`src/lib/ubwi/terms-integrity.ts`, in two layers of deliberately different strength.

**`checkTermsArtifactShape`** needs no artifacts, so it runs in the test suite and inside the publication gate on every evaluation. It refuses a hash that is not 64 lowercase hex characters, a non-positive byte length, a non-200 body cited as terms, a retrieval timestamped in the future, a decisive clause too short to identify a licence, a relative terms URL, one hash cited for two different documents, and a source that reads permitted on both axes with no artifact at all. It cannot prove a hash is right. **It can prove a hash is fake**, and a new gate code `TERMS_ARTIFACT_INTEGRITY_FAILED` refuses publication when it fires.

**`verifyAgainstRetainedBytes`** needs the document and is the real check: hash, byte length, and — the part that catches a remembered quote — **every word of the decisive clause must occur, in order, in the text of the document.** `npm run ubwi:verify-terms` drives it over the retained-artifact store.

### 3.3 Why word-subsequence and not substring

Substring containment was implemented first and **failed on six of the eleven Production V1 records.** Investigating each showed the records were right and the check was wrong: the OGL v3.0, the ABS notice, the Istat notice and the CBS notice all present the decisive sentence as a bulleted list, so any committed quote that reads as prose must join the bullets with punctuation the source does not contain. The Japanese and Korean clauses failed for a different reason — they are not word-delimited at all.

Word identity and word order survive list flattening; punctuation does not. The tokenizer discards punctuation, case, curly quotes and dash width, and makes every non-ASCII character its own token so CJK licence text compares character by character. **A clause written from memory fails a subsequence check**, which is demonstrated by a test that passes a correct hash and a correct byte length with a plausible paraphrase and watches the verification refuse it.

### 3.4 The result on the existing record

Every one of the eleven Production V1 terms artifacts was located in the research store **by content hash** — not by filename, not by trust — and all eleven reproduce exactly. All eleven committed clauses verify as in-order word subsequences of their documents. With Phase 2D's four added:

```
  15 verified, 0 failed, 0 not present in the store, 0 structural problem(s)
```

**The Production V1 evidence record is sound.** The agent's self-correction worked, and it is now checkable rather than merely reported.

---

## Part 4 — The recomputed candidate

Rerun from source lineage on 15 September 2026. **This is not a published value and may not be promoted to one.**

| | |
|---|---:|
| Observed economies | 17, all rights-cleared |
| Rights-cleared GDP coverage | **52.2340 %** |
| Observed wealth-to-GDP ratio $R$ | 5.728257 |
| CWON 2020 tail calibration $k$ | 0.762954 |
| Observed wealth | $343.3455 tn |
| Modelled residual wealth | $233.1169 tn |
| **Modelled share of wealth** | **40.4392 %** (ceiling 40.00 %) |
| BTC issued supply | 20,084,481 BTC at height 967,044 |
| Coinbase / Bitstamp / Kraken | 77,948.285 / **77,941.37** / 77,940.90 USD |
| Median spot | 77,941.37 USD (dispersion 0.95 bp) |
| Bitcoin market capitalization | $1.5654 tn |
| **Total Global Wealth** | **$578.0278 tn** |
| Observed / modelled / Bitcoin share of TGW | 59.3995 % / 40.3297 % / 0.2708 % |
| **Candidate UBWI** | **0.2708 %** |
| Sensitivity range | **0.2248 % – 0.2963 %** |

The figures are identical to Production V1's because **no input changed**: no economy was added, no venue was swapped, no threshold moved. The calculation was rerun rather than reused, and it reproduced.

### 4.1 Gate result

```
REFUSED:
  [IMPUTED_SHARE_ABOVE_CEILING]            40.44 % of the wealth denominator is modelled, above the 40.00 % ceiling
  [NUMERATOR_SOURCE_NOT_RIGHTS_CLEARED]    blockchain-info-supply (under_review), coinbase-spot (blocked),
                                           bitstamp-ticker (under_review), kraken-ticker (blocked)
```

Publication count: **zero**. Instrument lifecycle: **`launch_blocked`**. No point was frozen.

---

## Decision

> **Blocked on both, and the numerator is the harder one.**

The denominator blocker is 0.46 pp of world GDP away. Both harmonised compilers and nine national compilers are now exhausted, and the search produced one real candidate and one precise near miss:

- **New Zealand** publishes the right thing and its licence could not be read. One successful retrieval settles it — and even then it reaches the 40 % ceiling at the fifth decimal place rather than clearing it.
- **Belgium** compiles land for households and leaves the total-economy cells empty in its own published cube. Worth 0.60 pp, and a question for the NBB rather than a search.

Neither is a research problem any more.

The numerator blocker is not a research gap. **Three venues' terms say no to the thing UBWI does, in writing, and the fourth says yes to a signatory.** No amount of further retrieval changes that. The resolutions available are all decisions rather than findings:

1. **Sign Bitstamp's Data License Agreement.** The most direct path and the only one where the counterparty has already published the permission. Requires explicit approval to make contact; none was sought or given.
2. **Seek Kraken's prior permission**, which its terms name as the remedy. Same approval requirement.
3. **Define a venue eligibility rule in the methodology** — open question 7, still open — and change the venue set under it as a versioned methodology change. This is the only route that does not depend on a counterparty, and it is explicitly not something to do quietly.

**What was not done, deliberately:** no venue was swapped, no threshold was lowered, no outreach was sent, no rights state was upgraded without a retained artifact, and China was not reopened.

---

## Rejected Sources and Dead Ends

| Route | Outcome |
|---|---|
| `bitstamp.net/terms-of-use/`, `/legal/terms-of-use/`, `/legal/` | All HTTP 200 with a 212-byte Imperva interstitial. Superseded by `bitstamp.net/api/`, which is first-party and governs the endpoint read. |
| `kraken.com/legal/terms-of-service` | HTTP 404. The real path is `/legal/global-terms`, reached from `/legal`. |
| `coinbase.com/legal/developer-platform`, `/legal/cloud`, `/legal/developer-platform/api-terms` | HTTP 404 each. The live document is `/legal/developer-platform/terms-of-service`, reached by redirect from `/legal/cloud/terms-of-service`. |
| `blockchain.com/legal/api`, `/legal/terms-of-service` | HTTP 404. An "API Terms of Service" exists in the site's translation bundle and is served from no reachable path. Nothing assumed from it. |
| `mempool.space/terms-of-service`, `/about` | HTTP 200, 3,017-byte Angular shell at both. Not registered as a source; cited only for block-height confirmation. |
| Eurostat for Norway, Hungary, Latvia, Portugal | `N1N` only. **No land.** Produced assets are not national net wealth. |
| INE / Banco de España for Spain | No balance sheet of non-financial assets in INE's complete list of national-accounts operations. BdE has financial accounts and experimental household distributional wealth accounts. |
| FSO Switzerland | Net non-financial capital stock only, produced assets by its own definition. |
| GUS Poland, Danmarks Statistik, SSB Norway | Fixed assets or household wealth. No land, no non-produced total. |
| CBS Israel subject 46, *מאזן לאומי* | Named "national balance sheet" and entirely financial: AF/LF codes and net financial worth across all 266 series. |
| DZS Croatia | Gross fixed capital *formation* (a flow) and non-financial sector accounts. The OECD's `N211N` row for Croatia corresponds to nothing DZS publishes. |
| Stats NZ copyright page | HTTP 200, client-rendered, 22 characters of body text. Browser automation broken on this machine. The balance sheet is usable; the licence could not be read. |
| `stat.nbb.be` direct, `statbel.fgov.be` | Connection reset (curl 56) on every attempt, and a CAPTCHA interstitial respectively. Belgium's finding rests on the NBB SDMX cube, which returned cleanly. |
| Eurostat for Spain, Poland, Belgium, Denmark, Ireland, Greece and the rest | `N11N` only. Unchanged across four phases. |
| OECD terms page, live re-fetch | **Not attempted, by standing instruction.** The grant is anchored to the cached artifact, whose hash was re-verified from the retained bytes this phase. |
| Headless Chrome | Not attempted. Known broken on this machine (`CVDisplayLinkCreateWithCGDisplay failed`: produces output, never exits). Plain `urllib` retrieved every artifact in this phase. |

---

## Open Questions Carried Forward

1. **The numerator venue set.** Three venues do not permit publication and the methodology has no rule for changing the set. This is now the single blocking item for UBWI, and it is a decision, not research.
2. **Bitstamp's Data License Agreement.** The permission Urdais needs, named by the counterparty, unsigned. Requires approval to pursue.
3. **Stats NZ's licence.** One successful retrieval of a client-rendered page is the entire distance between New Zealand's balance sheet and the observed set. It is the cheapest open item in the phase.
4. **Whether the NBB compiles total-economy land.** Belgium's S.1 land cells exist in the published cube and are empty while households' are populated. It is worth 0.60 pp of world GDP and it is a question for the compiler, not a search.
5. **One more land-inclusive economy beyond New Zealand.** New Zealand alone reaches the ceiling at the fifth decimal place, which is not a margin. Both harmonised compilers and nine national compilers are now exhausted.
6. **Re-measure the near-term feasible frontier on a land-inclusive basis.** Part 2.3 shows four of the six economies behind the 55.72 % figure publish no land. The constant is not changed here and no threshold depends on it being exact, but it should not be leaned on again as measured.
7. **Whether the artifact store belongs in the repository.** Fifteen documents, roughly 11 MB, several third-party. Today the store lives outside version control and `npm run ubwi:verify-terms` is run against it deliberately; the structural half of the invariant runs on every commit.
8. Carried unchanged from Phase 2C: Korea's ECOS operational API key; Spain's non-financial asset stock; whether Mexico can be re-sourced from INEGI; how the US public-land omission is disclosed; non-Bitcoin crypto in the denominator.

**Not carried forward: China.** Not reopened by this phase and no first-party lead was found that would alter [the study's conclusion](./ubwi-china-source-study.md).

---

## Sources and Evidence

All retrieved 15 September 2026 by direct `urllib` call, saved, and hashed over the saved bytes.

| # | Source | URL | Status | Bytes | SHA-256 (first 16) |
|---|---|---|---:|---:|---|
| 1 | Coinbase Developer Platform Terms of Service | `www.coinbase.com/legal/developer-platform/terms-of-service` | 200 | 610,772 | `1fe28153ef70be9e` |
| 2 | Bitstamp API documentation | `www.bitstamp.net/api/` | 200 | 2,007,325 | `d11bf1c0dec89cf3` |
| 3 | Kraken Global Terms of Service | `www.kraken.com/legal/global-terms` | 200 | 3,633,626 | `6e61bf4ebe741d24` |
| 4 | Blockchain.com Terms of Service | `www.blockchain.com/legal/terms` | 200 | 1,476,048 | `0e2b690483d494a0` |
| 5 | Kraken legal index | `www.kraken.com/legal` | 200 | 848,267 | `ac00d10cbad2b357` |
| 6 | Bitstamp terms-of-use (Imperva stub) | `www.bitstamp.net/terms-of-use/` | 200 | 212 | `d02032286070b4dd` |
| 7 | Eurostat `nama_10_nfa_bs`, `N211N`, all geographies | `ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/` | 200 | — | dataset updated 2026-09-08 |
| 8 | Eurostat `nama_10_nfa_bs`, `N2N` / `N21N` / `N1N` / `N11N` | same | 200 | — | same |
| 9 | OECD `DSD_NASEC10@DF_TABLE9B`, `N211N` / `NN` / `N2N` / `N1N` / `N11N` | `sdmx.oecd.org/public/rest/data/` | 200 | — | re-measured this phase, not read from the Phase 2C matrix |
| 10 | Stats NZ, Annual balance sheets 2007–2024 (provisional) | `stats.govt.nz/assets/Uploads/Annual-balance-sheets/…/annual-balance-sheets-2007-2024-provisional.csv` | 200 | 1,016,246 | `3b2a8bafba97e4f6` |
| 11 | NBB `DF_CAPSTOCK2010_DISS`, stocks of land by sector | `nbb.stat.bnb.be` SDMX | 200 | 127,380 | `b1d9ae8a18ee55a0` |
| 12 | ECB `D.NZD.EUR.SP00.A` and `D.USD.EUR.SP00.A`, March 2024 | `data-api.ecb.europa.eu/service/data/EXR/` | 200 | — | 20 daily fixings each; last common 2024-03-28 |

Full hashes are recorded in `src/lib/ubwi/rights.ts` and in migration `20260915000300_ubwi_numerator_terms_evidence.sql`, and are re-derivable from the retained bytes with `npm run ubwi:verify-terms`.

---

## Research History

| Phase | Question | Result |
|---|---|---|
| Phase 1 | Can UBWI be constructed at all? | Yes; numerator from venue tickers read directly, denominator from national balance sheets. |
| Phase 2A | What denominator sources exist? | Land is the binding constraint, not rights. |
| Phase 2B | How far does coverage reach? | 53.99 % observed, 47.66 % rights-cleared; ceiling 62.93 % without China. |
| Phase 2C | Can the rights gap close, and what gate is feasible? | Gap closed to zero; the proposed ≤ 25 % gate is arithmetically unsatisfiable; frontier 55.72 %. |
| Production V1 | Build it and let the gate decide. | Gate refused on the modelled share. Correct behaviour. |
| **Phase 2D** | **Can the last two blockers clear?** | **No. The numerator's own venues do not permit the use. The denominator is 0.46 pp short; New Zealand would reach the line but its licence could not be read.** |
