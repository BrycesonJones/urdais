# UMPI Phase 4A — credential-free access paths, 22 September 2026

**Status: internal source-access research. Not a methodology page, not routed publicly, not registered in the docs catalog.** It changes no code, no schema and no methodology. It records what was probed, what answered, and what each path is worth.

**The problem.** Both approved UMPI sources are reachable only through an account, and both account-registration flows require Korean identity verification that the founder cannot complete. This is an operational production blocker, not a rights or methodology problem: the data is public, the terms permit the use, and Phase 4's adapters are built and tested. Only the key is missing.

**What was and was not tested.** Every claim marked **[probed]** was established by an actual unauthenticated HTTP request on 22 September 2026, with the response recorded. Claims marked **[retrieved]** come from official pages. Claims marked **[unverified]** are exactly that, and are called out rather than smoothed over — most importantly, **the registration flows themselves could not be inspected**, because both signup pages are JavaScript-rendered behind a session. The founder's report that they require Korean phone or identity verification is taken as given, and §F is written to test that premise precisely rather than to argue with it.

---

## A. Conclusion

> **Superseded 22 September 2026, on the same day, by deeper probing. The gate is `PHASE_4A_ACCESS_PATH_FOUND`, not blocked.**
>
> This document's original conclusion was `PHASE_4A_BLOCKED`. It was wrong about Korea Customs, and it was wrong in a way worth recording rather than quietly editing: **it stopped one step too early.** Section C.3 observed that `tradedata.go.kr` loads its query pages through an in-session loader, concluded that reaching the data meant "scraping a government portal", and classified it `RESEARCH_ONLY` without ever looking at what the page's own XHR does. A companion pass (`umpi-phase-4a.md`) did look, found the official query endpoint, and verified it.
>
> **The findings below have been re-verified independently before this correction was written**, not accepted on report. The corrected conclusions are in §A.1; everything after it is the original pass, retained unedited, because its negative results remain accurate and its one bad call is more useful visible than erased.

### A.1 Corrected conclusions

| Series | Decision | Transport |
|---|---|---|
| **UMPI-KR-DRAM-PPI** | **`KEEP_SOURCE_CHANGE_ACCESS_PATH`** | ECOS Open API, published demo key `sample`, 10-row pagination |
| **UMPI-KR-DRAM-EXPORT-UV** | **`KEEP_SOURCE_CHANGE_ACCESS_PATH`** | `tradedata.go.kr` public-session item query |

**Korea Customs — the correction.** The portal's own query is a plain form POST that answers without a login, after a GET of the public index establishes the session the UI itself uses. Re-verified 22 September 2026:

```
GET  https://tradedata.go.kr/cts/index.do                     → 200, sets the public session
POST https://tradedata.go.kr/cts/hmpg/retrieveTrade.do
     tradeKind=ETS_MNK_1020000A  priodKind=MON  statsBase=acptDd
     ttwgTpcd=1  hsSgnGrpCol=HS10_SGN  hsSgnWhrCol=HS10_SGN  hsSgn=8542321010
```

returns `searchresult: OK` and one row per month:

| `priodTitle` | `hsSgn` | `korePrlstNm` | `expTtwg` | `expUsdAmt` |
|---|---|---|---|---|
| 2026.05 | 8542321010 | 디램 | 147,350 | 11,428,371 |
| 2026.06 | 8542321010 | 디램 | 149,633 | 11,175,623 |
| 2026.07 | 8542321010 | 디램 | 155,818 | 13,551,552 |
| 2026.08 | 8542321010 | 디램 | 177,730 | 15,733,149 |

`cntyCd` and `cntyNm` are present as **empty strings** — the shape carries no country dimension, which is the property Series B needs.

**Two things the re-verification established that matter for the adapter:**

1. **`expUsdAmt` is thousand USD, not dollars.** The on-page unit line reads 킬로그램(KG), 천 달러. So `export_value_usd = expUsdAmt × 1000`, and reading it as dollars would understate Korea's DRAM exports by three orders of magnitude while looking entirely plausible.
2. **The response includes a `총계` row, and it is the sum of the monthly rows.** Summed: 630,531 kg against the total row's 630,532 kg; 51,888,695 against 51,888,696 thousand USD — agreement to rounding. **Admitting it alongside the months would double every figure.** It is identifiable twice over: `priodTitle` is `총계` rather than a month, and its `hsSgn` is empty.

**Bank of Korea — unchanged findings, changed posture.** §B.1's evidence stands exactly as written: the `sample` key returns the exact series, capped at ten rows per call, with `list_total_count` for paging. What changed is not the evidence but the decision. This document classified it `RESEARCH_ONLY` on the reasoning in §B.1, and that reasoning is still the honest description of the risk. **The founder has reviewed it and accepted that risk for production use.**

The rights state is therefore **not** relabelled. It stays `ambiguous_requires_legal_review`, carried in the registry alongside an explicit `founder_accepted_risk` marker and the reason. Ambiguity accepted is not ambiguity resolved, and the record has to be able to tell the difference — the same posture `rights-policy-ambiguous-publishes` already sets for this project.

### A.2 What the original pass got right, and should be kept

Unchanged by the correction, and still load-bearing:

- **ECOS serves `json` and `xml` only** — `csv` and `xlsx` are rejected at the request-type check, so there is no file export to automate (§B.2).
- **data.go.kr file downloads are session-gated** — `success: false`, no bytes, without a login (§C.2).
- **KOSIS relocates the registration wall** rather than removing it, and its ICT "DRAM" aggregate sums chips *and* modules, which is a different economic object (§B.4, §C.4).
- **Rights were never the blocker** (§D). Both agencies' terms permit the use; only the credential was missing.
- **A key needs zero code changes** (§E) — and the corollary now matters: a *transport* change needs adapter work only in the fetch half, because the parsers, store, vintage machinery and tests are transport-independent by construction.
- **§F's registration routes are now moot for V1.** They remain the path to a registered ECOS key, which would retire the `sample` ambiguity and lift the ten-row cap. Worth doing eventually; no longer blocking anything.

---

## B. Series A — Bank of Korea DRAM PPI

Target: `404Y016` / `30911201AA` / `M`, unit `2020=100`, range `199501`–present.

### B.1 ECOS Open API with the documented `sample` key — **SUPERSEDED CLASSIFICATION — see §A.1; founder-approved for production under `ambiguous_requires_legal_review` + `founder_accepted_risk`**

| Field | Finding |
|---|---|
| Owner | Bank of Korea |
| URL | `https://ecos.bok.or.kr/api/StatisticSearch/sample/json/kr/{start}/{end}/404Y016/M/{YYYYMM}/{YYYYMM}/30911201AA` |
| Access | HTTPS GET, **no account, no key of one's own** |
| Korean phone required | **No** |
| Machine-readable | Yes — JSON and XML **[probed]** |
| Series identity | Exact. Response echoes `STAT_CODE 404Y016`, `ITEM_CODE1 30911201AA`, `ITEM_NAME1 DRAM`, `UNIT_NAME 2020=100`, `WGT 1.2` **[probed]** |
| Data returned | Real values. `202604 = 437.49` **[probed]** |
| Cap | **10 rows per call.** `list_total_count` is returned, so paging is mechanically possible — roughly 38 calls for the full history, one per month thereafter **[probed]** |
| Formats | `json` and `xml` only. `csv` and `xlsx` are rejected with `ERROR-200` **[probed]** |
| No-key call | Rejected: `INFO-100 인증키가 유효하지 않습니다` **[probed]** |

**Why this is not the answer.** `sample` is a documented affordance for trying the API, and its ten-row cap is what a testing key looks like. Using it as the production credential for a commercial published index would be reading an absence of prohibition as a grant — the exact move this project refused for TrendForce, for MOTIE footnotes and for aggregators. It is also operationally fragile in a way that matters: a shared testing key can be rate-limited, rotated or withdrawn without notice or recourse, and a published monthly index would break silently when it was.

It stays recorded because it is genuinely useful for what it is: **it proves the series identity and the retrieval shape end to end without a key**, which is how Phase 2C verified the identifiers and how a future adapter change can be smoke-tested before a real key exists.

### B.2 ECOS file export — **`STRUCTURALLY_INADEQUATE`**

ECOS serves `json` and `xml` and rejects `csv` and `xlsx` at the request-type check **[probed]**. There is no file-export format to automate, so the second priority in the brief has no member here.

### B.3 ECOS web download — **`AUTH_BLOCKED`**

The ECOS site is a JavaScript application; its statistic pages and download actions are session-bound and were not reachable by direct request **[probed]**. Even were they reachable, driving a portal UI to extract a series is a fragile substitute for the API the same institution publishes.

### B.4 KOSIS — **`AUTH_BLOCKED`**

KOSIS carries the Bank of Korea's producer price survey, so the data is present. `kosis.kr/openapi/` redirects to single sign-on **[probed]**, its OpenAPI rejects an unregistered key (`err:11 유효하지않은 인증KEY입니다`) **[probed]**, and `statHtml` returns a 302 without a session **[probed]**. KOSIS therefore relocates the same registration problem rather than solving it — **unless** its signup accepts a route ECOS does not, which is one of the open questions in §F.

### B.5 BOK monthly PPI press release — **`RESEARCH_ONLY`, unverified**

The Bank publishes a monthly producer-price release with attachments on a public site requiring no account. Press coverage quotes DRAM movements from it, so item-level detail is plausibly present. This was **not verified**: the attachment structure, whether DRAM appears as a named item, and whether a stable machine-readable file URL exists were all left untested.

Even at best it is a poor production source. A press attachment is formatted for readers, its layout is not a contract, and it carries the current month rather than the thirty-year series Phase 3's backfill policy contemplates. It is recorded as a fallback worth ten minutes if §F fails entirely, not as a candidate.

---

## C. Series B — Korea Customs DRAM chip exports

Target: HSK `8542321010`, monthly export value (USD, FOB) and weight (kg), Korea-wide aggregate, no country dimension.

### C.1 data.go.kr `Itemtrade/getItemtradeList` — **`AUTH_BLOCKED`**

The approved Phase 4 path. The operation resolves and rejects an unregistered key with `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`, and a missing key with `SERVICE_KEY_IS_NULL` **[probed]**. There is no unauthenticated mode.

### C.2 data.go.kr file datasets — **`AUTH_BLOCKED`**

The most promising lead in this pass, and it failed cleanly. The portal's file-download endpoint answers an unauthenticated request with HTTP 200 and a JSON body carrying **`"success": false`**, `atachFileYn: "N"`, and null `atchFileId` / `downloadUrl` **[probed, dataset 15049722]**. The 200 is a wrapper, not a grant: no bytes are served without a session.

### C.3 `tradedata.go.kr` Customs trade-statistics portal — **SUPERSEDED CLASSIFICATION — see §A.1; approved production transport after deeper XHR verification**

| Field | Finding |
|---|---|
| Owner | Korea Customs Service |
| URL | `https://tradedata.go.kr/cts/index.do` (`unipass.customs.go.kr/ets/` redirects here) **[probed]** |
| Index access | Public, HTTP 200, no login **[probed]** |
| Sub-pages | Session-bound. A direct request for a query page returns the portal's error template **[probed]** |
| Menu structure | Recovered: the portal loads pages through an in-session loader, and the public index exposes only top-level entries (`수출입 총괄`, `수출입 실적`, …) **[probed]** |

The ten-digit HSK query with monthly value and weight almost certainly lives behind that loader — this is the portal the Customs API is built from. Reaching it means establishing a session and replaying the portal's internal calls, which is **screen-scraping a government portal to avoid its own published API**. That is a rights question before it is an engineering one, and nothing in the portal's published terms was read in this pass to answer it. It stays `RESEARCH_ONLY`: not ruled out, not recommended, and not to be built against without the terms read first.

### C.4 KOSIS customs statistics — **`AUTH_BLOCKED`**, likely also inadequate

Same registration wall as §B.4. Separately, KOSIS publishes trade statistics by MTI category and by HS heading; a ten-digit HSK series with both value and weight was not found and is not typical of what it carries. Even unblocked, this would probably fail on the commodity granularity Series B requires.

### C.5 UN Comtrade — **`RIGHTS_BLOCKED`**

Excluded by the brief except as a last resort, and independently unusable: its licence is internal-use, with commercial re-dissemination requiring a paid licence. It is also HS6, which cannot isolate `8542321010`. Named here only to close it.

---

## D. Rights are not the problem, and should not be re-opened

Worth stating plainly because a blocked phase invites re-litigating settled questions. Phase 2C recorded, from the agencies' own published terms:

- **Bank of Korea** — designated public data is freely usable without a separate procedure; attribution mandatory; modification must be disclosed.
- **Korea Customs** — `이용허락범위 제한 없음` on both trade-statistics APIs.

Both remain accurate. **Nothing about the licence changes because the signup form is inaccessible.** The gap is a credential, and the correct response is to obtain one, not to find a source with weaker terms.

---

## E. What the answer does *not* require changing

A useful property of how Phase 2C and Phase 3 were built: **the methodology names the commodity, the series identity and the fields — never a transport.** So under every candidate path above:

- `docs/methodology/umpi-kr-dram.md` — **no change**, for any of them.
- `reference.umpi_source_series` — **no change**, unless the *dataset* changes.
- `src/lib/umpi/ingest/bok.ts`, `customs.ts` — **no change at all** if a key arrives by any route, whoever issues it. The adapters take an `apiKey` and are pure over the payload.
- Only a move to a *file* or *portal* path would need adapter work, and only in the fetch half: the parsers, the store, the vintage machinery and the tests are transport-independent by construction.

So the cost of solving this is a signup, not a rebuild. That is worth weighing against any temptation to replace a source.

---

## F. The smallest unblock, and why it is not a Korean phone

The brief rules out a Korean number, a resident intermediary, mirrors and vendors. It does not rule out **asking the issuing institutions for a key as a foreign organisation**, which is neither a workaround nor a third party holding credentials on Urdais's behalf — it is the same written-request discipline Urdais already applies to rights.

Four candidate routes, **all unverified**, in the order they are worth trying:

1. **Corporate / institutional membership (법인·기관 회원) on data.go.kr.** Organisational registration is normally evidenced by business registration rather than a personal mobile. Urdais is a company. If any route on this list is the real answer, this is most likely it — and it would unblock **Series B directly**.
2. **Write to the ECOS operator requesting a key for a foreign organisation.** ECOS publishes a support channel; a key issued on request is an ordinary administrative act, and the Bank publishes this data precisely to be used.
3. **Write to Korea Customs / the portal operator** about statistics access for a foreign organisation, separately from data.go.kr.
4. **English-language routes.** `data.go.kr/en` and the Bank's English site both respond **[probed]**; whether either carries a signup that differs from the Korean one could not be determined from outside the form.

Each is a message, not a purchase and not a dependency. The tracker discipline already in the repository applies: sending is not permission, and a reply is recorded verbatim.

**What would change the gate.** One key, from any of these, for either series. Series A and Series B are independent — a Customs key alone would unblock Series B while Series A waits, and the product is defined so that publishing one series without the other is coherent rather than partial.

---

## G. Classification summary

| Path | Series | Class |
|---|---|---|
| ECOS Open API, own key | A | `AUTH_BLOCKED` |
| **ECOS Open API, `sample` key** | A | **SUPERSEDED — see §A.1.** Founder-approved production use under `ambiguous_requires_legal_review` + `founder_accepted_risk`; 10 rows/call. |
| ECOS csv / xlsx export | A | `STRUCTURALLY_INADEQUATE` — formats rejected |
| ECOS web download | A | `AUTH_BLOCKED` |
| KOSIS OpenAPI | A, B | `AUTH_BLOCKED` |
| BOK PPI press attachment | A | `RESEARCH_ONLY`, unverified |
| data.go.kr `getItemtradeList` | B | `AUTH_BLOCKED` |
| data.go.kr file datasets | B | `AUTH_BLOCKED` — `success: false` without a session |
| `tradedata.go.kr` portal | B | **SUPERSEDED — see §A.1.** Approved production transport after official XHR and KOGL Type 1 were verified. |
| UN Comtrade | B | `RIGHTS_BLOCKED` |

## H. Gate (superseded — see §A)

The original gate of this pass was `PHASE_4A_BLOCKED`. **It is superseded by `PHASE_4A_ACCESS_PATH_FOUND`.** The paragraphs below are the original reasoning, retained.

**`PHASE_4A_BLOCKED`** *(original, superseded)*.

**Smallest unresolved issue:** one API credential, for either agency, obtained through a registration route that does not require Korean personal identity verification. The most probable such route is organisational registration on data.go.kr (§F.1); the most probable fallback is a written request to the issuing institution (§F.2–3). Neither was verifiable from outside a signup form, and neither has been attempted.

**SUPERSEDED RECOMMENDATION — see §A.1.** The original pass advised against production use of ECOS `sample` and `tradedata.go.kr`. Deeper verification plus the founder's explicit risk acceptance supersede that recommendation: both transports are now approved, with BOK ambiguity preserved rather than relabelled.
