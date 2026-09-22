# UMPI Phase 2B — licensing closure, 22 September 2026

**Status: internal research document. Not a methodology page, not routed publicly, not registered in the docs catalog.** It writes no code, ingests nothing, approves no vendor and establishes no right. It records what the sources have actually said, what they have not said, and what would have to change before UMPI-DRAM Spot V1 could enter production engineering.

**Phase 2B did not succeed.** No source is cleared. The reason is specific and is not "nobody has answered": the best-fit source answered, and its answer is incompatible with what Phase 2A froze UMPI V1 as publishing.

**Product under test.** UMPI-DRAM Spot V1: six canonical DRAM chip instruments, published in **USD per chip** as the selected source close **unchanged**, beside a Urdais-calculated **1D close-to-close change**. See `/docs/methodology/umpi`.

---

## A. Executive conclusion

**The binding constraint is not price, access, or vendor silence. It is that UMPI V1 publishes a number Urdais did not compute.**

Three facts, each evidenced below, produce that conclusion.

1. **TrendForce replied on 15 September 2026 and said commercial use of its data is not permitted** — with one named opening: publication "only after a complete re-analysis", as a separate licence discussion **[verified, email `1a0a41d3fe2098c7`]**. UMPI V1 applies no arithmetic to the price it publishes, so it is the one thing that opening does not cover.
2. **The conversation was closed by Urdais, not by TrendForce.** On 15 September Urdais wrote that the pricing was outside budget and withdrew; TrendForce invited a future approach **[verified, `1a0a527bbf062685`, `1a0ad42e131f4676`]**. No narrow scope was ever priced. The repository recorded none of this and said "No response recorded".
3. **CFM cannot substitute, on coverage rather than on rights.** Its public board quotes five of the six canonical instruments and **does not quote DDR3 4Gb**, and its DRAM cycle is presented as weekly rather than as a business-day session **[retrieved, chinaflashmarket.com/price, 22 September 2026]**.

**The shortest route to a licensed UMPI V1 is to re-open TrendForce with a scope one-twentieth the size of the first ask, and to put the raw-display question in terms that cannot be answered ambiguously.** Urdais asked for DRAM and NAND spot, contract, GDDR, LPDDR and HBM, and described its output as an index. It needs six spot lines, one close per business day, and it publishes a price. Those are different conversations, and only the second one has ever been declined.

If that re-approach fails on the raw-display question specifically, the decision is no longer a licensing decision. It is a product decision, and it belongs to the founder: **change what UMPI V1 publishes, or keep UMPI withheld.** Options in §K.

---

## B. Evidence standard

Carried over from Phase 1B and unchanged.

- **[verified]** — quoted from a primary document, email or page read in this pass.
- **[retrieved]** — obtained from a primary page, substance reliable, wording indicative where rendering was partial.
- **[inferred]** — a reading of how facts interact. **Never treated as a right.**

Three rules govern every classification below.

> **Do not broaden a restriction beyond its text. Do not treat silence as permission. Sales guidance is not a licence.**

A named salesperson writing "we can open a separate discussion" establishes that a discussion is available. It establishes nothing about its outcome, and it is recorded as `custom_license_required`, never as a grant.

---

## C. What Phase 2B found in the mailbox, and what the repository had wrong

The repository's outreach record was materially stale. Phase 2B searched the sending account (`bryceson.jones17@gmail.com`) and found the following. Each correction is applied in `docs/architecture/sources/memory-photonics-outreach-tracker.md`, with the superseded state preserved rather than overwritten.

| Provider | Repository said | Actually true | Evidence |
|---|---|---|---|
| TrendForce / DRAMeXchange | `sent — awaiting response`, "No response recorded" | **Replied in 18 hours.** Commercial use refused; one opening named; Excel only, no API. Urdais then withdrew on budget and TrendForce closed the thread courteously | Thread `1a0a1136783e37cd` **[verified]** |
| Silicon Data | `sent — awaiting response` | **Never delivered.** `support@silicondata.com` is a Google Group that rejected the post: "the group you tried to contact (support) may not exist, or you may not have permission to post messages to the group" | Bounce `1a0a113955c48dfc`, 2 seconds after send **[verified]** |
| WSTS | `sent — awaiting response` | **No message found** in the searched mailbox, sent or received. Either it was never sent, or it was sent from an account not searched here | Absence of evidence, recorded as such **[verified absence in one mailbox]** |
| CFM | Not in the tracker at all | **Never contacted.** No draft existed in `memory-photonics-permission-requests.md` either | **[verified]** |
| Omdia | `sent — awaiting response` | Replied; commercial team engaged; a call is scheduled. **Photonics, not UMPI** | Threads `1a0a67c741eb14e4`, `1a0a6aa6d1771d31` **[verified]** |
| LightCounting | `sent — awaiting response` | Replied 15 September, asking what benefit the platform offers them; Urdais answered. **Photonics, not UMPI** | Thread `1a0a113adc76287c` **[verified]** |

Two of those corrections change what Phase 2B could conclude. TrendForce's reply is the central evidence of this phase. Silicon Data's bounce means the only memory outreach besides TrendForce never reached anyone.

**The Introduction Kit PDF attached to the TrendForce reply was not opened and is not committed.** It is a vendor document in a private mailbox; its pricing is recorded below only as "held, not extracted".

---

## D. TrendForce / DRAMeXchange rights matrix

Legal entity: TrendForce Corp., 11F No.68 Sec.3 Nanjing E. Rd., Taipei 104, Taiwan. Terms retrieved from `dramexchange.com/About/TermsOfUse` on 22 September 2026, last updated 1 January 2020 **[verified]**. Vendor statements from Deric Lin, Sales Division, 15 September 2026 **[verified]**.

| Right | Status | Evidence | Clause / wording | Notes |
|---|---|---|---|---|
| G1 Access / retrieval | `restricted` | Vendor reply **[verified]** | "We only provide Excel files, and no other APIs are currently available." | Access exists, by paid membership, as Excel files. No machine interface. Retrieval is possible; it is not automatable through a vendor-supported channel |
| G2 Storage | `ambiguous_requires_written_confirmation` | ToU silent; vendor silent | — | Storing a delivered Excel file is inherent in receiving it. Retaining parsed observations as a canonical database is not addressed anywhere in the text read |
| G3 Calculation | `ambiguous_requires_written_confirmation` | ToU §6.2 **[verified]** | "YOU MAY NOT REPRODUCE, MODIFY, CREATE DERIVATIVE WORKS FROM…" | §6.2 bars creating derivative works, which reaches a calculated output. The vendor's "complete re-analysis" sentence implies internal calculation is not itself the objection. Unresolved in writing |
| G4 Derived publication | `custom_license_required` | Vendor reply **[verified]** | "if the data is to be published only after a complete re-analysis, we can open a separate discussion regarding the license" | The one door that is open. It is a discussion, not a grant, and it is conditioned on re-analysis that UMPI V1 does not perform |
| G5 Post-termination retention | `ambiguous_requires_written_confirmation` | ToU has no termination-data clause **[verified]**; vendor did not answer | — | Asked in the original enquiry. Not answered. Silence is not permission |
| **Raw price republication / public display** | **`denied`** under current terms; `custom_license_required` as a negotiation | ToU §6.2 **[verified]**; vendor reply **[verified]** | §6.2 bars "DISPLAY… PUBLISH… CIRCULATE TO ANY THIRD PARTY"; vendor: "We do not permit the commercial use of our data" | **The blocking right.** The public terms forbid display and publication; the vendor forbids commercial use; the named exception requires complete re-analysis, which is not raw display |
| Commercial use | `denied` under standard membership | Vendor reply **[verified]** | "We do not permit the commercial use of our data." | Unqualified as written. A bespoke licence was not refused, but none exists |
| Attribution | `ambiguous_requires_written_confirmation` | ToU §6.3 **[verified]** | "USERS ARE REQUIRED TO INCLUDE A NOTICE INDICATING THAT THE WEBSITE IS THE SOURCE OF THE MATERIAL" | The form exists but applies only once a use is authorized. Exact wording and placement for a price surface unconfirmed |
| Automation / rate limits | `ambiguous_requires_written_confirmation` | ToU contains no automation clause **[verified]**; vendor did not answer | — | No API exists, so the practical question is whether scheduled parsing of a licensed Excel file is permitted. Unanswered |
| Post-termination deletion obligation | `ambiguous_requires_written_confirmation` | No clause found **[verified]** | — | Neither imposed nor waived in the text read |

**Classification: `commercial_terms_required`**, with the raw-display right additionally `denied` on the current text. It is not `denied` outright as a source, because the vendor invited a further discussion and Urdais, not TrendForce, ended the last one.

### Product and licence path

The four packages TrendForce named — Memory Platinum (DRAM + NAND), HBM Package, Server DRAM Package, Mobile Package — are **research subscriptions, and none of them is the instrument Urdais needs**. Public membership pricing on `trendforce.com/membership/DRAMeXchange`, retrieved 22 September 2026 **[retrieved]**: Silver $5,000, Gold $11,000, DRAM Platinum $18,000, DRAM Diamond $30,000, Memory Platinum $30,000, Memory Diamond $55,000, all annual. Silver is the tier that carries spot and contract prices with five years of history.

**A subscription is the wrong product to argue about.** Every tier grants access under the same §6.2, and access has never been the blocked axis. What UMPI V1 needs is a **display and redistribution licence over six named lines**, which is not on the price list at any tier and which TrendForce has not said it sells. Whether it exists at all is the first question in §L.

---

## E. CFM / China Flash Market rights matrix

Legal entity: 深圳市闪存市场资讯有限公司 (Shenzhen CFM Memory Market Information Co., Ltd.), `chinaflashmarket.com`, contact `Service@ChinaFlashMarket.com`, operating since 2008 **[retrieved, 22 September 2026]**. **Never contacted by Urdais.** No correspondence exists in either the repository or the mailbox.

| Right | Status | Evidence | Clause / wording | Notes |
|---|---|---|---|---|
| G1 Access / retrieval | `ambiguous_requires_written_confirmation` | Price centre publicly readable, no login for the board **[retrieved]** | — | Readable ≠ retrievable by licence. No API or feed found |
| G2 Storage | `ambiguous_requires_written_confirmation` | Site disclaimer **[verified, Phase 1B]** | Forbids 复制、转载、传播、改编、汇编、展示、发行 of any content including 数据、图表 without written permission | The disclaimer reaches compilation (汇编) and display (展示), so storage into a published product is not free-standing |
| G3 Calculation | `ambiguous_requires_written_confirmation` | Same disclaimer | 改编 (adaptation) named | Not separately addressed |
| G4 Derived publication | `custom_license_required` | Same disclaimer | Licensed reuse must attribute 来源：CFM闪存市场 and stay inside the permit | A permit regime is contemplated by the text, which is more than TrendForce's terms offer. Nobody has asked for one |
| G5 Post-termination retention | `ambiguous_requires_written_confirmation` | Nothing found | — | Unaddressed |
| Raw price republication / public display | `custom_license_required` | Same disclaimer | 转载 and 展示 both barred without written permission | Barred by default, licensable in principle. Untested |
| Commercial use | `custom_license_required` | 报价中心 is a commercial product with a paid tier **[retrieved]** | — | Untested |
| Attribution | `permitted`, form known | Disclaimer **[verified, Phase 1B]** | 来源：CFM闪存市场 | The one right whose form is already documented |
| Automation / rate limits | `ambiguous_requires_written_confirmation` | No API found **[retrieved]** | — | Unknown |
| Post-termination deletion obligation | `ambiguous_requires_written_confirmation` | Nothing found | — | Unaddressed |

**Classification: `coverage_inadequate`** — and that classification is reached before the rights questions, which is why it matters.

### Why coverage, not rights, decides CFM

The DRAM chip board retrieved on 22 September 2026 quotes **[retrieved]**: DDR5 24Gb Major, DDR5 16Gb Major, DDR5 16Gb eTT, DDR4 16Gb 3200, DDR4 16Gb eTT, DDR4 8Gb 3200, DDR4 8Gb eTT, DDR4 4Gb eTT.

- **Five of the six canonical instruments have a plausible counterpart.**
- **DDR3 4Gb is not quoted at all.** Phase 2A fixes six instruments; a source that cannot price one of them cannot back the family without a methodology amendment retiring that instrument.
- **The cycle is presented as weekly**, against a Phase 2A cadence rule of a business-day session with one published close per source business day. A weekly print is a different cadence, and under the methodology that is a different product, not a slower version of the same one.
- Organization and speed qualifiers are **not shown on the board listing** for the DDR4 lines, so the 2Gx8 / 1Gx8 correspondence Phase 2A requires as mandatory identity is unconfirmed.

CFM is therefore **not a primary source for V1 as defined**, and not a drop-in backup. Its realistic roles are **validation** (a genuinely independent second desk, which Phase 1B showed prints materially different numbers from TrendForce) or **primary for a differently-scoped V2** that drops DDR3 and adopts a weekly cadence. Both require the same written permit nobody has requested.

---

## F. WSTS and Silicon Data

**WSTS — not a V1 source, and the outreach may never have been sent.** WSTS publishes a monthly Memory-category ASP derived from manufacturer-reported shipment value and units. It cannot print DDR5 16Gb or any other canonical instrument, so it is a validation or weighting input at most and is explicitly not on the V1 critical path. Reproduction without written permission is prohibited by its own Information Management terms, and distribution licences sit with regional semiconductor associations rather than with WSTS directly **[verified, Phase 1B; re-confirmed by search 22 September 2026]**. Four decades of Blue Book billings remain free to download, with copyright asserted. **No WSTS correspondence was found in the searched mailbox**, so the tracker's `sent — awaiting response` is unsupported and is corrected to `send unverified`.

**Silicon Data — outreach bounced, coverage unchanged.** The 14 September message to `support@silicondata.com` was rejected by a Google Group two seconds after sending and never reached the company **[verified, bounce `1a0a113955c48dfc`]**. Coverage remains **GDDR6 only** on the documented RAM Index, which does not intersect the six canonical instruments. Per the phase brief, work stops here. If Urdais wants to reach them, the Data Partnerships route on their own site is the channel, and the address must be re-verified.

---

## G. Six-instrument source mapping

No instrument is bound, because binding requires a cleared source. This records correspondence only.

| UMPI instrument | TrendForce / DRAMeXchange line | CFM line | Cadence at source | History | Binding state |
|---|---|---|---|---|---|
| DDR5 16Gb — 2Gx8 — 4800/5600 — Major | `DDR5 16Gb (2Gx8) 4800/5600` **[verified, Phase 1B board]** | `DDR5 16Gb Major` **[retrieved]**, org/speed unconfirmed | TF: business-day, three sessions/day. CFM: weekly | TF: Silver carries 5 years Excel; Daily Express from 2003 | **Unbound — no cleared source** |
| DDR4 16Gb — 2Gx8 — 3200 — Major | `DDR4 16Gb (2Gx8) 3200` **[verified]** | `DDR4 16Gb 3200` **[retrieved]**, org unconfirmed | Same | Same | **Unbound** |
| DDR4 8Gb — 1Gx8 — 3200 — Major | `DDR4 8Gb (1Gx8) 3200` **[verified]** | `DDR4 8Gb 3200` **[retrieved]**, org unconfirmed | Same | Same | **Unbound** |
| DDR4 16Gb eTT — 2Gx8 | `DDR4 16Gb (2Gx8) eTT` **[verified]** | `DDR4 16Gb eTT` **[retrieved]** | Same | Same | **Unbound** |
| DDR4 8Gb eTT — 1Gx8 | `DDR4 8Gb (1Gx8) eTT` **[verified]** | `DDR4 8Gb eTT` **[retrieved]** | Same | Same | **Unbound** |
| DDR3 4Gb — 512Mx8 — 1600/1866 — Major | `DDR3 4Gb 512Mx8 1600/1866` **[verified]** | **None. Not quoted** **[retrieved]** | TF only | TF only | **Unbound; no CFM counterpart exists** |
| *(optional, not in V1)* DDR5 16Gb eTT | `DDR5 16Gb (2Gx8) eTT` **[verified]** | `DDR5 16Gb eTT` **[retrieved]** | Both | — | Out of scope for V1 |

**TrendForce covers all six exactly, including the organizations and speed bins Phase 2A made mandatory identity.** That is precisely why it is Priority 1 and why its licensing answer is decisive rather than merely inconvenient. Whether one package carries all six lines, and whether eTT sits at the same tier as branded, is unconfirmed and is question 1 in §L.

---

## H. Commercial terms

| Item | Known | Value |
|---|---|---|
| Membership list pricing | **Yes**, public | Silver $5,000 · Gold $11,000 · DRAM Platinum $18,000 · DRAM Diamond $30,000 · Memory Platinum $30,000 · Memory Diamond $55,000, annual **[retrieved 22 September 2026]** |
| Which tier carries the spot board with history | Partly | Silver: spot and contract with 5-year history **[retrieved]** |
| Vendor-quoted price for Urdais's use | **No** | Never quoted. The reply referred to an Introduction Kit, held in the mailbox, not extracted |
| Display / redistribution licence fee | **No** | Not published, not quoted, **not confirmed to exist as a product** |
| Derived-index licence fee | **No** | Only "a separate discussion" was offered |
| Setup, seats, volume caps, geography, term, termination obligations | **No** | None stated anywhere |
| CFM pricing at any tier | **No** | Paid quote centre exists; no public price |

**Urdais declined on price without ever receiving one for the narrow scope.** The declination on 15 September was made against research-package list prices for products Urdais does not need. That is the single most recoverable mistake in this record.

---

## I. Production classification

| Source | Classification | The specific unmet right |
|---|---|---|
| TrendForce / DRAMeXchange | `commercial_terms_required` | Raw price republication / public display — `denied` on current terms, and outside the "complete re-analysis" opening. G5 and G2 additionally unconfirmed |
| CFM / China Flash Market | `coverage_inadequate` | No DDR3 4Gb line; weekly rather than business-day cadence; org/speed qualifiers unconfirmed. All rights untested — never contacted |
| WSTS | `coverage_inadequate` | Cannot print any canonical instrument. Not a V1 source at any rights state |
| Silicon Data | `coverage_inadequate` | GDDR6 only. Outreach never delivered |

**No source is `fully_cleared_for_umpi_v1`. None is close.**

---

## J. Phase 3 gate

**`PHASE_3_BLOCKED`.**

Unmet rights, in the order they block:

1. **Raw price republication / public display — the blocking right.** UMPI V1 publishes the source close unchanged. TrendForce's terms bar display and publication to third parties, its sales position bars commercial use, and its one opening is conditioned on complete re-analysis that V1 does not perform. No other source both covers the six instruments and offers a permit route.
2. **G5 post-termination retention — unconfirmed everywhere.** No source has addressed it. Phase 2A makes it a launch gate, so it must be answered even if right 1 is solved.
3. **G2 storage and G3 calculation — unconfirmed** at TrendForce; reached by §6.2's derivative-works bar and not cured by any statement received.
4. **G1 automation — restricted.** Excel only, no API; whether scheduled parsing of a licensed file is permitted has not been answered.

---

## K. Recommended strategy

Three routes. They are not equivalent, and only the first two are Phase 2B actions.

### Route 1 — re-open TrendForce, narrowly (recommended first move)

Ask for the smallest thing that could possibly work, and ask the raw-display question so plainly it cannot be answered sideways.

**Scope to request, and nothing more:** six named spot lines, one session average per line per business day, the historical series for those lines, the right to store them, to display the price in USD per chip with attribution, to publish a Urdais-calculated percentage change, and to retain what was already collected after termination.

**Scope to explicitly disclaim**, because it is what made the first ask expensive: NAND, contract prices, HBM, LPDDR, GDDR, server modules, DXI, research reports, forecasts, analyst calls, and every seat beyond one.

The first enquiry asked for roughly twenty product families and described the output as an index built from "inputs to an aggregate". The reply that came back was priced and reasoned against that. **A six-line display licence has never been put to them.** Draft in `docs/architecture/sources/memory-photonics-permission-requests.md`, request 10, **unsent**.

### Route 2 — open CFM for the first time (parallel, low cost)

CFM has never been asked anything. It is not a V1 primary on coverage, but the ask is cheap, its disclaimer contemplates a written permit, and a second desk is worth having on the record. Expect it to resolve into validation rather than primary. Draft, request 11, **unsent**.

### Route 3 — change what UMPI V1 publishes (founder decision, not a Phase 2B action)

The one door TrendForce opened is publication after complete re-analysis. UMPI V1 walks past it because it publishes a price it did not compute. A product that published only a Urdais-computed level — an index rebased to a base date, with the raw USD/chip figure retained internally and never displayed — would be asking for exactly the right TrendForce said was discussable.

**This is recorded as an option, not a recommendation, and Phase 2B does not take it.** It would abandon the thing that makes UMPI legible — a reader seeing a dollar price for a chip — in exchange for a licensing conversation that might still fail on cost. It requires a new methodology version, and the decision belongs to the founder rather than to this phase. It is named here because §18 of the brief forbids weakening a gate to manufacture a launch path, and pretending this option does not exist would be its own kind of dishonesty.

**Not recommended under any route:** ingesting an aggregator that reproduces TrendForce prints, publishing from the free public board without a licence, or treating the absence of a robots clause as permission to automate. The first two route around a restriction rather than resolve it; the third mistakes silence for a grant.

---

## L. Questions for TrendForce

Twelve questions, each answerable yes, no, or with a number. They are reproduced in sendable form in the permission-requests document.

1. Can one package carry exactly these six spot lines — `DDR5 16Gb (2Gx8) 4800/5600`, `DDR4 16Gb (2Gx8) 3200`, `DDR4 8Gb (1Gx8) 3200`, `DDR4 16Gb (2Gx8) eTT`, `DDR4 8Gb (1Gx8) eTT`, `DDR3 4Gb 512Mx8 1600/1866` — and are the eTT lines at the same tier as the branded lines? Is `DDR5 16Gb (2Gx8) eTT` available under the same terms?
2. In what form would those six lines be delivered, and how often?
3. May Urdais retrieve the delivered file on a schedule and parse it automatically, or must retrieval be manual?
4. May Urdais store each session's value as a dated observation in its own database, indefinitely?
5. **If the licence ends, may Urdais retain the observations already collected during the term, solely to reproduce and continue displaying UMPI values it published while licensed?**
6. **May Urdais publicly display one of those values, commercially, as a price in United States dollars per chip — for example `DDR5 16Gb — $56.93 / chip` — with attribution?** This is direct display of your value, and it is the question Urdais most needs answered on its own.
7. **Separately from question 6: may Urdais calculate and publish a percentage change between two of your closes — for example `+2.4% 1D` — as a Urdais calculation?** A yes to one of these questions is not a yes to the other, and Urdais will not read it as one.
8. Is commercial use permitted under such a licence, on a subscription-funded public website?
9. May Urdais publish a historical chart of those six lines over the licensed history?
10. What exact attribution wording and placement would you require?
11. Does §5.h of the Terms of Use — betting, wagering, prediction markets, or other speculative activity — apply to a published informational market-data benchmark that Urdais does not use to settle anything and does not offer for trading? Urdais operates no prediction market and settles no wagers.
12. What licence type and price applies to this scope, and is a written agreement required rather than an email confirmation?

### On question 11

The clause reads in full: "YOU ARE PROHIBITED FROM USING, REFERENCING, INCORPORATING, OR RELYING UPON ANY PRICES, DATA, FORECASTS, RESEARCH, OR OTHER CONTENT PROVIDED THROUGH THE WEBSITE IN CONNECTION WITH ANY BETTING, WAGERING, PREDICTION MARKET, OR OTHER SPECULATIVE ACTIVITY" **[verified]**. It binds the user of the website, and a published informational benchmark is not on its face within it. But "OR OTHER SPECULATIVE ACTIVITY" is undefined, and Urdais cannot control whether a third party later references a published UMPI value. **Urdais should request an explicit written confirmation** that publishing an informational benchmark is outside the clause, and that third-party reference to a published value is not Urdais's use. That is prudence about a broad term, not a conclusion that the clause applies.

## M. Questions for CFM

Adapted to CFM's own terminology; the Chinese phrasing is given where the term is the operative one in their disclaimer.

1. Does the 报价中心 quote these lines, and at what organization and speed: DDR5 16Gb Major, DDR4 16Gb 3200, DDR4 8Gb 3200, DDR4 16Gb eTT, DDR4 8Gb eTT? **Is DDR3 4Gb quoted anywhere, in any product?**
2. What is the actual update cadence for the DRAM chip board — daily on business days, or weekly? Is there a defined session or publication time?
3. How far back does the history go for those lines, and is it obtainable?
4. Is there an API, CSV, or scheduled data delivery (API / 数据接口 / 数据导出)?
5. May Urdais retrieve the quotes automatically on a schedule (自动采集)?
6. May Urdais store each quote as a dated observation in its own database (存储/保留)?
7. **May Urdais publicly display a CFM price commercially as USD per chip, with attribution 来源：CFM闪存市场?** This is 转载 and 展示 of your value, which your disclaimer bars without written permission (未经书面许可), so Urdais is asking for that permission specifically.
8. **Separately: may Urdais publish a percentage change it calculates from two CFM quotes (衍生指数/计算结果公示)?**
9. Is commercial use permitted (商业用途)?
10. May Urdais publish historical charts of those lines?
11. What attribution wording and placement do you require?
12. If the licence ends, may Urdais retain the quotes already collected during the term, solely to reproduce previously published values (解约后历史保留)?
13. What licence type and price applies, and is a written agreement (书面协议) required?

---

## N. Phase 2B status

| Question | Answer |
|---|---|
| Is any source fully cleared? | **No.** None is partially cleared either |
| Is a custom licence required? | **Yes**, for every source that covers the instruments. No standard product grants what V1 needs |
| Is a written vendor response still the blocker? | **Partly.** For CFM, yes — nobody has asked. For TrendForce, **no**: a response already exists and it does not permit what V1 does. The blocker there is the shape of the ask, and behind it the shape of the product |
| Did Phase 2B send anything? | **No.** Two drafts are prepared and await approval |
| Did Phase 2B collect, ingest, scrape or subscribe? | **No.** Public terms pages and the user's own mailbox were read. Nothing was retrieved from any price product |

## O. What would have to be true for Phase 3

All of these, for one source:

- G1 permitted, with a named retrieval mechanism and a stated frequency;
- G2, G3, G4 permitted in writing;
- **G5 permitted in writing** — retention after termination, which no source has yet addressed;
- **raw price display permitted in writing, commercially** — or the product changed so that it is not needed;
- commercial use permitted;
- attribution form known;
- all six instruments mapped to named source lines at that source;
- a signed agreement, not an email from a salesperson.

Until then UMPI-DRAM Spot stays where Phase 2A left it: defined, reviewable, implementable, and **withheld**.
