# Memory and Photonics Permission Requests — Drafts

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Prepared 14 September 2026.

**None of these has been sent.** They are drafts for human review and approval. No email was sent and no draft was created in any mail client while preparing them. The outreach record for each lives in `memory-photonics-outreach-tracker.md`, where every row is `not yet contacted` with an empty date.

## Before sending any of these

Carried over from the compute outreach in this directory, where each of these went wrong at least once.

1. **Resolve the sender block.** The signature must carry the address the message is actually sent from. The Runpod request was signed `brycesonshui@gmail.com` but sent from `bryceson.jones17@gmail.com`; that mismatch is recorded in `runpod-permission-request.md` and should not be repeated. Every draft below leaves the sender block as a placeholder for exactly this reason.
2. **Do not invent a role.** No job title is recorded anywhere in this project. Name, company, site and reply address only.
3. **Sending is not permission.** No row in the tracker and no field in `reference.source_interfaces` changes because a message went out.
4. **Record whatever comes back, including a refusal**, verbatim, in a dedicated document. A clear no is a complete answer.
5. **Verify the recipient in a browser first** for anything marked SEMI-VERIFIED, and decide the channel for anything marked UNVERIFIED. Do not substitute a guessed address.

Every draft opens with the same one-line description of the company, by design:

> Urdais is building market data and indices for the Information Age, covering compute, AI model economics, memory, photonics, energy, and related infrastructure.

---

# Memory

## 1. WSTS — distribution licence for Memory ASP

**To:** `tp@wsts.org` (Tobias Proettel, Administrator) · **cc:** `sh@wsts.org` · **VERIFIED**
**Why this recipient:** the WSTS contact page lists distribution licenses within his remit. Recipient status: **ready to send.**

**Subject:** Distribution licence enquiry — WSTS memory ASP series in a published price index

Hello Mr Proettel,

Urdais is building market data and indices for the Information Age, covering compute, AI model economics, memory, photonics, energy, and related infrastructure. We publish market indices and historical data products for AI and compute infrastructure, with the methodology behind every figure published openly.

We are building a memory price index and would like to ask about licensing WSTS data for it.

**What we would want.** The monthly Memory category from the WSTS statistics — shipment value, units, and the average selling price derivable from them. As far as we can establish, WSTS is the only source of a memory ASP reported directly by the manufacturers themselves, which is why we are starting here rather than with a spot survey.

**What we would do with it.** Store each release as a dated observation, normalise it alongside comparable observations, and compute an index from the combined set. We would publish current and historical index values, with WSTS as one input to an aggregate rather than a republished series.

**What we are asking.** Your terms provide that reproduction in any form without written permission is prohibited, and your subscription pages refer to distribution licences held by semiconductor industry organizations. We are asking about a distribution licence for this use. Specifically:

- Is a licensed dataset, feed, CSV or API available, and in what form is the Memory category delivered?
- Does a licence permit commercial use in a market-data product?
- Does it permit publication of a derived index or a normalised historical series computed from WSTS figures? We understand subscribers may conduct derivative analyses for external communications, and want to know whether an index falls inside that or needs a separate grant.
- What attribution do you require, in what wording and placement?
- Are there rate limits or restrictions on automated retrieval, and are there limits on how long we may retain historical observations? Our methodology requires keeping raw observations so a published figure stays reproducible years later, which is the point we have least flexibility on.
- What are the licensing terms and pricing, and does this need a written agreement rather than an email confirmation?

We would not retrieve or use anything before you tell us it is permitted. If the answer is no, that is a complete answer and we will record it and stop.

Thank you for your time.

[Sender name]
Urdais · https://urdais.com
[Reply address — must match the sending account]

---

## 2. TrendForce / DRAMeXchange — spot and contract memory prices

**To:** `SR_MI@trendforce.com` (Semiconductor Research) · **cc:** `mi@dramexchange.com` · **VERIFIED**
**Why this recipient:** the Semiconductor Research desk is the department that owns memory, per TrendForce's own contact page. Recipient status: **ready to send.**

**Subject:** Licensing enquiry — DRAMeXchange spot and contract prices in a published memory index

Hello,

Urdais is building market data and indices for the Information Age, covering compute, AI model economics, memory, photonics, energy, and related infrastructure. We publish market indices and historical data products for AI and compute infrastructure, with an openly published methodology.

We are building a memory price index and would like to license DRAMeXchange data for it.

**What we would want.** DRAM and NAND flash spot prices at chip level by capacity, and the monthly contract prices for UDIMM, RDIMM and raw chips. GDDR and LPDDR spot, and the HBM coverage in your Memory packages, are also of interest. Historical series matter to us as much as current values.

**What we would do with it.** Store each observation with its date, normalise it alongside comparable observations, and compute index values from the combined set. We would publish current and historical index values. Individual DRAMeXchange prices would be inputs to an aggregate, not a republished price feed.

**What we are asking.** We have read your Terms of Use and we are asking rather than assuming. Section 6.2 provides that materials may not be reproduced, modified, made the basis of derivative works, published or distributed to any third party without express prior written consent. An index is a derivative work, so we are asking for that consent. Specifically:

- Is a licensed feed, CSV or API available, and which membership tier carries which history?
- Does a licence permit commercial use in a market-data product?
- Does it permit publication of a derived index or normalised historical series computed from your prices, as distinct from republishing the prices themselves?
- Section 6.3 requires a notice naming the website and its URL. Is that the attribution you would want on a derived index, and in what placement?
- What rate limits or restrictions apply to automated retrieval, and are there limits on caching or on how long we may retain historical observations? Our methodology requires retaining raw observations indefinitely so published figures stay reproducible.
- Section 5.h prohibits using your prices in connection with betting, wagering or prediction markets. We are not building any of those. We would want to understand how you read that clause in relation to a published index that third parties might reference, so that we are not relying on a reading you do not share.
- What are the licensing terms and pricing? We would also be interested in a Silver subscription purely as an internal validation set, which we understand is a separate transaction from any redistribution licence.

We will not retrieve or use anything until you tell us it is permitted. A no is a complete answer.

Thank you for your time.

[Sender name]
Urdais · https://urdais.com
[Reply address — must match the sending account]

---

## 3. Silicon Data — partnership on non-GDDR6 memory

**To:** `support@silicondata.com`, asking to be routed to data partnerships · **VERIFIED**
**Note:** the Data Partnerships page and the "Book a call" scheduler are the published partnership routes; no BD address is published. Recipient status: **ready to send.**

**Subject:** Memory index partnership — beyond GDDR6

Hello,

Urdais is building market data and indices for the Information Age, covering compute, AI model economics, memory, photonics, energy, and related infrastructure. We publish market indices and historical data products for AI and compute infrastructure. Silicon Data already appears in our compute source research, which is why we are writing.

We are building a memory price index, and your RAM Index is the closest thing to it that exists. It covers GDDR6. DDR5, DDR4, LPDDR, HBM and NAND are not covered by anyone in the form you have built for GDDR6, and that gap is what we are working on.

**What we would want from you.** Licensed access to the RAM Index series, current and historical, through your API or bulk download, as one input among several to a broader memory index. We would also like to understand what your data-partnership programme involves in both directions.

**Questions.**

- Is the RAM Index available as a licensed API, feed, CSV or historical dataset, and how far back does history go beyond the 90 days shown on the product page?
- Does a licence permit commercial use in a market-data product?
- Does it permit publishing a derived index or normalised historical series computed from your values, as distinct from redistributing them?
- What attribution do you require, and in what form?
- What rate limits and automated-retrieval restrictions apply?
- What are the licensing terms and pricing?
- On the partnership side: what would contributing data involve, and would there be interest in extending coverage to DDR5, HBM or NAND jointly?

We would not retrieve or use anything before it is agreed.

Thank you.

[Sender name]
Urdais · https://urdais.com
[Reply address — must match the sending account]

---

# Photonics

## 4. Omdia — Optical Components Intelligence Service

**To:** `citations@omdia.com` · **SEMI-VERIFIED — load https://omdia.tech.informa.com/contact-us in a browser and confirm before sending.**
**Note:** the product-intelligence enquiry form is the fallback route.

**Subject:** Licensing enquiry — optical component pricing data in a published index

Hello,

Urdais is building market data and indices for the Information Age, covering compute, AI model economics, memory, photonics, energy, and related infrastructure. We publish market indices and historical data products for AI and compute infrastructure, with an openly published methodology.

We are building a photonics price index covering optical transceivers and related data-centre interconnect, and your Optical Components Intelligence Service is the closest match we have found to what it needs.

**What we would want.** The pricing and volume data in that service for optical transceivers — 400G, 800G and 1.6T datacom modules in particular — current and historical, in a machine-readable form.

**What we would do with it.** Store each release as a dated observation, normalise it, and compute index values from the combined set alongside other inputs. We would publish current and historical index values, with your data as an input to an aggregate rather than a republished series.

**One thing we want to be straightforward about.** Your robots.txt disallows ClaudeBot and Claude-User at the site root. We have not retrieved anything beyond your public product pages and we are not asking you to change that file. We are asking about a licensed relationship instead, which is why we are writing rather than collecting.

**Questions.**

- Is a licensed API, feed, CSV or historical dataset available, as distinct from the report deliverable?
- Does a licence permit commercial use in a market-data product?
- Does it permit publication of a derived index or normalised historical series computed from your data?
- What attribution do you require, and in what form and placement? We noted that you publish a citations address, so we assume there is an established position here.
- What rate limits or automated-retrieval restrictions would apply to a licensed feed, and are there limits on retaining historical observations? Our methodology requires keeping raw observations so a published figure stays reproducible.
- What are the licensing terms and pricing?

If this is better handled by a different team, we would be glad to be redirected.

Thank you for your time.

[Sender name]
Urdais · https://urdais.com
[Reply address — must match the sending account]

---

## 5. LightCounting — transceiver price and shipment database

**To:** `info@lightcounting.com` · **VERIFIED** (published in plain text on lightcounting.com). `sales@lightcounting.com` is semi-verified; prefer `info@`.
Recipient status: **ready to send.**

**Subject:** Licensing enquiry — transceiver pricing database for a published photonics index

Hello,

Urdais is building market data and indices for the Information Age, covering compute, AI model economics, memory, photonics, energy, and related infrastructure. We publish market indices and historical data products for AI and compute infrastructure, with an openly published methodology.

We are building a photonics price index for optical transceivers and AI data-centre interconnect, and your forecast databases are the deepest source of transceiver pricing we have found.

**What we would want.** The historical and forecast price and shipment series by product — the 200-plus product lines in your market forecast databases, with the datacom and AI-cluster transceiver lines being the priority — in a machine-readable form.

**What we would do with it.** Store each release as a dated observation, normalise it against a stable SKU taxonomy, and compute index values from the combined set. We would publish current and historical index values, with your data as one input to an aggregate rather than a republished series.

**We should say this plainly.** Your robots.txt disallows ClaudeBot, Claude-Web and anthropic-ai at the site root, and blocks the common scraping toolchain. We have read that and we have not collected anything from your site. We are writing to ask about a licence rather than to work around it.

**Questions.**

- Is a licensed API, feed, CSV or historical dataset available, as distinct from the report and database deliverables?
- Does a licence permit commercial use in a market-data product?
- Does it permit publication of a derived index or a normalised historical series computed from your figures, as distinct from redistributing them?
- What attribution do you require, and in what form?
- What rate limits or automated-retrieval restrictions would apply, and are there limits on how long we may retain historical observations? Retention is the part of this we have least flexibility on, because our methodology requires that a published figure stay reproducible years later.
- What are the licensing terms and pricing?

We will not retrieve or use anything before you tell us it is permitted.

Thank you for your time.

[Sender name]
Urdais · https://urdais.com
[Reply address — must match the sending account]

---

## 6. Cignal AI — Optical Components report and the Citation Policy

**To:** form at https://cignal.ai/contact/ · **UNVERIFIED — no published email address.**
**Channel decision needed before sending.** The alternate is LinkedIn to Andrew Schmitt. Do not guess an address.

**Subject:** Citation Policy enquiry — optical component data in a published index

Hello,

Urdais is building market data and indices for the Information Age, covering compute, AI model economics, memory, photonics, energy, and related infrastructure. We publish market indices and historical data products for AI and compute infrastructure, with an openly published methodology.

We are building a photonics price index covering optical transceivers and AI data-centre interconnect, and your quarterly Optical Components report is one of the few sources carrying unit shipments at the granularity we need.

**What we would want.** The unit shipment and revenue series for datacom transceivers — 400G, 800G and 1.6T, plus 400ZR/800ZR coherent — current and historical, in a machine-readable form.

**What we would do with it.** Store each release as a dated observation, normalise it, and compute index values from the combined set. We would publish current and historical index values, with your data as an input to an aggregate rather than a republished series.

**What we are asking, and why.** Your subscription agreement provides that the services are for internal use only, that subscribers will not make information available to third parties without express written consent, and that subscribers will not create derivative works from the data. An index is a derivative work, so we are not going to assume our way past that. The same agreement refers to a Cignal Citation Policy, which is what prompted this message.

- What does the Citation Policy permit, and does it reach a derived index or only quotation in commentary?
- Is a licensed API, feed, CSV or historical dataset available, as distinct from the report?
- Does a licence permit commercial use in a market-data product?
- Would you grant express written consent for publication of a derived index or normalised historical series computed from your data, and on what terms?
- What attribution would you require, and in what form and placement?
- What rate limits or automated-retrieval restrictions would apply, and are there limits on retaining historical observations?
- What are the licensing terms and pricing?

We will not use anything before it is agreed. If the answer is no, that closes the question and we will record it.

Thank you for your time.

[Sender name]
Urdais · https://urdais.com
[Reply address — must match the sending account]

---

## 7. FS.com — written consent for price collection, or a feed

**To:** form at https://www.fs.com/service.html, asking to be routed to business development or data licensing · **UNVERIFIED — no published BD or data address; the site refuses unauthenticated retrieval.**
**Channel decision needed before sending.** LinkedIn BD to FS (Fiberstore) partnerships is the alternate.

**Subject:** Data licensing enquiry — FS list prices in a published optics index

Hello,

Urdais is building market data and indices for the Information Age, covering compute, AI model economics, memory, photonics, energy, and related infrastructure. We publish market indices and historical data products for AI and compute infrastructure, with an openly published methodology.

We are building a photonics price index for optical transceivers and AI data-centre interconnect. FS publishes per-SKU list prices for 800G and 1.6T optics across several regional storefronts, at a granularity almost nobody else does publicly, which makes you the most useful reference point we have found.

**What we would want.** Per-SKU list prices for transceivers, DAC/AOC/ACC/AEC and related interconnect, across your regional storefronts, recorded on a periodic schedule — a small number of read-only requests per day, at whatever rate you prefer.

**What we would do with it.** Store each observation with its date, normalise it alongside comparable observations from other sources, and compute index values from the combined set. We would publish current and historical index values. Individual FS prices would be inputs to an aggregate, not a republished price list. We do not sell optics and we are not a reseller, a broker or a competitor; we measure this market rather than selling into it.

**Why we are writing before doing anything.** We tried to read your terms of use and your robots.txt to establish whether periodic price collection is permitted, and neither served to us. We are not going to work around that, and we have collected nothing. So we are asking directly.

- Is systematic, rate-limited retrieval of your public list prices permitted, and if so under what conditions?
- Is there a licensed feed, API, CSV or historical price dataset we should use instead of reading the site?
- Does either route permit commercial use in a market-data product?
- Does it permit publication of a derived index or normalised historical series computed from your prices, as distinct from republishing the prices?
- What attribution would you require, and in what form?
- What rate limits would you want us to work to, and are there limits on caching or on retaining historical observations?
- What are the licensing terms and pricing, and would this need a written agreement?

We will not begin any collection unless and until you tell us it is permitted. If the answer is no, that is a complete answer and we will record FS as unavailable to us and stop.

Thank you for your time.

[Sender name]
Urdais · https://urdais.com
[Reply address — must match the sending account]

---

## 8. US Census Bureau — practical questions only, no permission needed

**To:** `eid.international.trade.data@census.gov` · **VERIFIED**
**Note:** the Census API terms already permit both retrieval and derived commercial use, so this is not a permission request. It is a short courtesy note with practical questions, and it is optional. Recipient status: **ready to send.**

**Subject:** International trade API — HS line selection for an optical component index

Hello,

Urdais is building market data and indices for the Information Age, covering compute, AI model economics, memory, photonics, energy, and related infrastructure. We publish market indices and historical data products for AI and compute infrastructure.

We intend to use the International Trade API to derive unit values for optical transceivers and related components as one input to a published index, under the Census API Terms of Service, carrying the required notice that the product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau.

Three practical questions:

- Which 10-digit HTS lines under 8517.62 (and any adjacent headings) most cleanly isolate optical transceiver modules from routers, switches and base stations? We are aware that HS6 sweeps all of these together and want to select the narrowest defensible lines.
- Are there published rate limits or automated-retrieval guidance for the `timeseries/intltrade` endpoints beyond the general reservation in the terms?
- Is there guidance you would recommend on handling quantity-unit changes and HTS revisions across a long monthly series, so that a derived unit-value series stays consistent?

Thank you.

[Sender name]
Urdais · https://urdais.com
[Reply address — must match the sending account]

---

## 9. ICCSZ (讯石光通讯网) — automated retrieval of the news index, for discovery only

**To:** none published · **UNVERIFIED.** Only `0755-82960080` was located, and it is the 企联荟 membership line. Recipient status: **not ready to send — no address, and one prerequisite outstanding.**

**Two prerequisites, both blocking.**

1. **Read `https://iccsz.com/robots.txt` in a browser on an unfiltered connection.** It was never read during the study behind `docs/research/photonics-pricing/iccsz-tender-pricing.md` — the domain did not resolve from that environment, so nothing at all was fetched from it. If the file names ClaudeBot, Claude-Web, Claude-User or anthropic-ai, **say so in the first paragraph**, exactly as the Omdia and LightCounting drafts above do.
2. **Retrieve an email address from the domain.** Do not guess one and do not take one from an aggregator.

**Why this ask is unusually small.** Urdais does not want to license ICCSZ's content. The tender facts it reports are compelled public disclosure by China Mobile, China Telecom and China Unicom under 《招标投标法实施条例》第五十四条, and they belong to the buyer's notice rather than to the outlet reporting it. What Urdais would want is only to *read the index* in order to learn that an award happened, and then go to the primary notice. Ask for that, and nothing more. Asking for a content licence here would be asking for the wrong thing and would probably get a deserved no.

**Subject:** 关于自动检索贵网新闻索引的许可咨询 / Permission enquiry — automated retrieval of the ICCSZ news index

您好，

Urdais 正在为信息时代建设市场数据与指数产品，涵盖算力、AI 模型经济、存储、光通信、能源及相关基础设施。我们公开发布每一项指数背后的方法论。

Urdais is building market data and indices for the Information Age, covering compute, AI model economics, memory, photonics, energy, and related infrastructure, and we publish the methodology behind every figure openly.

我们希望咨询一个范围很小的问题。

**我们想做的事。** 定期读取讯石光通讯网的新闻索引与检索页面，用于**发现**运营商集采（招标公告、中标候选人公示）的发生时间与项目名称。发现之后，我们会前往采购人自己的官方采购平台获取原始公告，并以该原始公告作为唯一的数据来源。

**我们不想做的事。** 我们不打算转载贵网的文章，不打算使用贵网的分析、月报或产研院报告，也不打算把贵网内容作为价格数据的来源。我们理解这些属于贵公司的版权内容与会员权益。

**因此我们要问的是：**

- 贵网是否允许自动化程序按合理频率读取新闻列表页与检索结果页，仅用于发现文章标题、日期与链接？
- 如果允许，贵网希望的访问频率、时段或 User-Agent 标识是什么？
- 在我们发布的方法论文档中提及"通过讯石光通讯网发现该次集采公告"是否需要贵方书面许可？如需要，希望使用何种措辞？
- 若贵网 robots.txt 已明确禁止此类访问，请直接告知，我们会遵守并停止。

In short: may an automated client read your news listing and search pages at a modest rate, solely to discover article titles, dates and links, so that we can then go to the buyer's own procurement portal for the underlying notice? We would not reproduce your articles, would not use your analysis, monthly reports or 产研院 research, and would not treat your content as a price data source. We would also like to know whether crediting ICCSZ as the discovery route in our published methodology requires your written permission, and in what wording.

在收到贵方明确答复之前，我们不会进行任何自动化访问。如果答复是"不可以"，那也是一个完整的答复，我们会记录并停止。

We will not retrieve anything before you tell us it is permitted. If the answer is no, that is a complete answer and we will record it and stop.

顺颂商祺。

[Sender name]
Urdais · https://urdais.com
[Reply address — must match the sending account]

---

## Sending checklist

| # | Provider | Recipient | Ready to send? |
|---|---|---|---|
| 1 | WSTS | `tp@wsts.org` | **Yes** — verified |
| 2 | TrendForce / DRAMeXchange | `SR_MI@trendforce.com` | **Yes** — verified |
| 3 | Silicon Data | `support@silicondata.com` | **Yes** — verified |
| 4 | Omdia | `citations@omdia.com` | **Confirm in a browser first** — semi-verified |
| 5 | LightCounting | `info@lightcounting.com` | **Yes** — verified |
| 6 | Cignal AI | none published | **No** — channel decision needed (web form or LinkedIn) |
| 7 | FS.com | none published | **No** — channel decision needed (web form or LinkedIn) |
| 8 | US Census | `eid.international.trade.data@census.gov` | **Yes** — verified, and optional |
| 9 | ICCSZ (讯石) | none published | **No** — no address, and `iccsz.com/robots.txt` must be read in a browser first |

Korea Customs, and the Micron / SK hynix / Nanya / Accelink / Innolight / Eoptolink filings, have no draft because they need no permission ask. The open question on Korea Customs is reading its copyright policy, not writing to anyone.
