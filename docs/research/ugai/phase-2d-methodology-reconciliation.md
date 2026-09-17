# UGAI Phase 2D — methodology reconciliation and empirical universe sample, 16 September 2026

**Status: internal research document. Not a methodology page, not routed publicly, not registered in the docs catalog.** It amends no methodology, approves no parameter, creates no constituent list, publishes no value, and commits Urdais to nothing. It converts Phases 1A, 2B and 2C into a founder decision package.

**Founder decision already locked and not reopened here:** UGAI is a capitalization-weighted equity index of publicly traded AI companies. It is not an AI activity composite.

---

## 0. Two limitations the reader must hold before anything else

### 0.1 The Phase 2B report was not available to this phase

The brief instructs review of "the full Phase 2B report provided for this workstream." **No such report was provided in this conversation, and none exists in the repository** (`docs/research/ugai/` contains only `phase-1a-audit.md` and `phase-2c-market-data-sources.md`).

What this phase therefore reconciles against is **2B's parameters as restated in the Phase 2D brief itself**: the τ candidates (20/25/33, with the brief's instruction "do not simply accept 25%" implying 25% was 2B's proposal), the entry and retention investability screens, `c` ∈ {8%, 10%}, the identity-path rule, the furnished-8-K/Broadcom question, the mixed-segment prohibition, and the 5/10/40 question.

**Consequence:** section 3's reconciliation matrix compares 2C against *2B-as-conveyed*, not against 2B's own evidence or reasoning. Where the matrix says the two "agree", that means the parameter as stated is consistent with 2C's findings — not that I have checked 2B's justification for it. **Anywhere 2B's reasoning would change a recommendation below, that is an unquantified risk in this document.** Locating the 2B report and re-running section 3 against it is cheap and should precede founder sign-off.

### 0.2 What is measured versus asserted in the issuer sample

Every revenue figure below was retrieved this session from a primary filing, a furnished earnings release, or a search over those documents, and each carries its source and evidence tier. Three practices are followed strictly:

- **No `Q_i_lower` is invented.** Where disclosure does not support a qualifying-revenue figure, the record says `insufficient evidence`. That result is the single most common outcome in the sample and is the phase's principal finding, not a gap in the research.
- **Figures marked `not confirmed`** are ones where the retrieval returned an implausible or ambiguous value and I declined to use it. The clearest case: a search returned Microsoft "Intelligent Cloud revenue was $39.3 billion" for FY2026, which is a quarterly magnitude, not an annual one. It is excluded rather than repaired by guesswork. **No verdict below depends on an unconfirmed figure.**
- **Ten issuers were verified individually** (NVIDIA, Broadcom, TSMC, Microsoft, AMD, Intel, Micron, Palantir, C3.ai, CoreWeave, SoundHound, BigBear.ai — twelve, in fact). The remainder (ASML, Applied Materials, Arm, Alphabet, Amazon, Meta, Salesforce, Adobe, Equinix) were checked at the level of "does a completed-fiscal-year AI revenue disclosure exist" and are marked as such. They are corroborating, not load-bearing.

---

## 1. Current methodology state and unresolved parameters

`docs/methodology/ugai.md` (0.1.0-draft) is complete on mechanics: the divisor-based Laspeyres form, index shares, weight drift, corporate actions, additions and deletions, the two return series, status model, corrections, and versioning. Its arithmetic has no open questions.

`docs/methodology/ai-equity-universe.md` (0.1.1-draft) is complete on *structure* and open on every *number*.

**Unresolved parameters, enumerated from the documents themselves:**

*Parent universe (4 explicit, plus items deferred to open questions):* the material-exposure threshold `τ` (constrained `0 < τ ≤ 50%`); the country/exchange/segment eligibility register; the reconstitution calendar dates, holiday handling and minimum announcement interval; and — from Open Questions — the issuer cap `c`, investability minima and entry/retention buffers, the exposure-retention buffer, the TTM-measure question, multi-share-class representativeness, the reference investor, and quarterly workload validation.

*UGAI (11 explicit):* index-share decimal precision; reset lead time; exchange-rate fixing source, time, convention, licensing and fallback; half-day and unscheduled-closure treatment; distribution-line maximum holding period; **base date**; publication target and deadline; correction window and materiality threshold; stale-input tolerances and escalation; numerical tolerances for implausible moves; and whether additional return series are added.

**What 2D can close, and what it cannot.** 2D can close the *eligibility* parameters, because they are answerable from filings: `τ`, the identity path, the evidence hierarchy, the mixed-segment rule, the semiconductor and hyperscaler boundaries, the representative-security rule, and — jointly with 2C — the venue register, reference investor, float methodology and `c`. It **cannot** close the eleven UGAI operational parameters, every one of which 2C established is gated on a vendor contract that does not yet exist.

---

## 2. The agreed architecture is preserved

```
AI relevance eligibility → security/investability eligibility → representative security
→ accessible free-float market cap → issuer cap c → UGAI calculation
```

Nothing in this phase's evidence justifies collapsing a layer or introducing an exposure-weight multiplier. Specifically: **the failure mode discovered below is a failure of layer 1 to admit enough issuers, not a failure of layers 3–5 to weight them sensibly.** An exposure multiplier would not fix it — it would multiply weights for a universe that is too small to weight at all. The recommendation in section 5.4 therefore changes the *evidence rule inside layer 1*, and leaves the architecture intact.

---

## 3. Reconciliation of Phase 2B and Phase 2C

| Topic | 2B (as conveyed) | 2C (evidenced) | Status | Resolution |
|---|---|---|---|---|
| Filing-based AI revenue eligibility | `r_i_lower ≥ τ` from completed-FY filings | Silent — a methodology matter | **Constrains nothing** | 2D finding: the rule as written admits almost nobody (§5) |
| Identity path | `r_i_lower = 100%` where all disclosed commercial activity qualifies | Silent | Independent | 2D refines it mechanically (§6) |
| Mixed-segment prohibition | Cannot count a segment in full unless all material activity qualifies | Silent | Independent | 2D confirms and locks it (§7) |
| `τ` | 20/25/33 tested | Silent | Independent | **2D: τ has no discriminating power at the current evidence standard** (§5) |
| `c` | 8% or 10% | Silent | Independent | **2D: moot — `n × c ≥ 1` fails first** (§14) |
| Investability thresholds | $500M float cap, $5M ADTV, 90% sessions, 15% float, 3mo history | Float and ADTV are licensed inputs; ADTV computable from prices | **Constrained** | Testable only indicatively pre-contract (§13) |
| Free-float requirement | float ≥ 15% entry / 10% retention | Float is purchasable (EDI, 170+ exchanges, per-market methodology); index-provider factors unavailable | **Constrained and resolved** | Licence float; never self-compute (§18) |
| Geography / venue register | Register unresolved | Data available for all target markets; **rights are per-exchange and cost scales with venue count** | **Hard constraint** | Launch register must be small (§16) |
| China access | Venue register + foreign-ownership rules | Shares and float data exist (`XSHG`, `BJSE`) | **2C narrows 2B** | China is an access problem, not a data problem (§16) |
| Representative security | One issuer → one membership → one security | EDI supplies MIC, ISIN, SEDOL, FIGI per listing | **Agree** | Deterministic tie-breakers (§19) |
| FX | Not in 2B's scope | **ECB omits TWD**; WMR is licensed; Urdais already runs ECB + Taiwan CBC interfaces | **2C decides** | Licensed fixing preferred, patchwork costed (§18.3) |
| Historical reconstruction | Not in 2B's scope | PIT reference exists from Jan 2005; **PIT universe versions do not and cannot be bought** | **Hard constraint** | Live-only launch; reconstruction kept open (§21) |
| Point-in-time data | Implied by completed-FY + evidence-cutoff discipline | `PIT_SRF`/`PIT_EVT` dated start/end since 2005; historical float "where available" | **Agree, partially evidenced** | Vendor question, not a methodology question |
| Public constituent disclosure | Methodology commits to publishing as-of weights | **Reconstruction tests in two vendors' terms may forbid it** | **Direct conflict** | Three-layer transparency model (§20) |
| Licensing constraints | Not in 2B's scope | Three licensing layers; index creation separately licensed | **Constrains public output only** | Never weakens internal reproducibility (§20) |
| Methodology transparency | Full public methodology | Unaffected — methodology is Urdais's own text | **Agree** | Always public (§20) |

**The only direct conflict is public constituent-weight disclosure.** Everything else is either agreement, or 2C constraining a 2B parameter without contradicting it.

---

## 4. The candidate AI relevance rule

Preserved unchanged from the parent:

`r_i = Q_i / R_i`, admission on `r_i_lower ≥ τ`, where `R_i` is positive consolidated external revenue for the **latest completed fiscal year available at the evidence cutoff**, and `Q_i` is qualifying external revenue from **the same period and consolidation perimeter**, `0 ≤ Q_i ≤ R_i`, using the substantiated lower bound.

The completed-fiscal-year principle survives this phase's testing and should be retained. The sample produced no case where it was unusable; it produced many cases where *no qualifying figure of any period* existed, which is a different problem.

The prohibitions are retained and each one bound on at least one real issuer in the sample: no annualizing quarters; no mixing periods; no analyst estimates; **no ARR or run rates** (bound on Microsoft and Amazon — §9); no capex as revenue (bound on every hyperscaler); no customer demand as supplier revenue (bound on the "supplier to NVIDIA" pattern — §8); no strategic importance substituting for economic evidence (bound on NVIDIA itself — §5.2).

**One genuine gap in the prohibitions, surfaced by Broadcom and requiring a founder decision.** The parent forbids constructing "annualized quarterly or half-year revenue". It is silent on whether the **sum of four disclosed quarterly actuals falling entirely within one completed fiscal year** is admissible. That is not annualization — no extrapolation occurs, and the period is exactly the canonical one. It is the difference between Broadcom being measurable and not. See §10.3.

---

## 5. Empirical `τ` test

### 5.1 The sample

Twelve issuers verified individually; nine more checked for existence of disclosure. Evidence tiers: **T1** statutory filing (10-K/20-F/equivalent); **T2** furnished earnings release or 8-K/6-K exhibit; **T3** supplementary (investor deck, earnings call, blog, press release).

| Issuer | FY end | `R_i` | Qualifying-revenue evidence | `Q_i_lower` | `r_i_lower` | Tier | Mixed-segment? | 20% | 25% | 33% |
|---|---|---|---|---|---|:-:|:-:|:-:|:-:|:-:|
| NVIDIA | 25 Jan 2026 | $215.94B | Data Center ~$193.7B; 10-K: platform accelerates "AI, data processing, graphics, robotics, and scientific computing". No AI figure anywhere. | **insufficient** | — | T1 | **Yes** | ✗ | ✗ | ✗ |
| Broadcom | 2 Nov 2025 | $63,887M | No full-year AI figure in 10-K or FY25 release. Q4 "AI semiconductor revenue increasing 74% YoY" in CEO quote; Q1 FY26 guidance $8.2B. | **insufficient** | — | T2/T3 | Yes | ✗ | ✗ | ✗ |
| TSMC | 31 Dec 2025 | ~$122B *(not confirmed)* | HPC platform = 58% of revenue. HPC is a workload class including CPUs and general HPC, not AI. | **insufficient** | — | T1 | **Yes** | ✗ | ✗ | ✗ |
| Microsoft | 30 Jun 2026 | *not confirmed* | No AI line in 10-K segment reporting. Only a "$37B annual revenue **run rate**" (T3) — prohibited by the parent. | **insufficient** | — | T1/T3 | Yes | ✗ | ✗ | ✗ |
| AMD | 27 Dec 2025 | *not confirmed* | Data Center $16.6B contains EPYC **CPUs** and Instinct GPUs together. No AI line. | **insufficient** | — | T1 | **Yes** | ✗ | ✗ | ✗ |
| Intel | 27 Dec 2025 | *not confirmed* | Segment named "Data Center **and AI**" (DCAI) — combined, no AI break-out. | **insufficient** | — | T1 | **Yes** | ✗ | ✗ | ✗ |
| Micron | Aug 2025 | $37.4B | HBM ≈ $2B in Q4 FY25, stated in earnings-call prepared remarks. No annual HBM figure in the 10-K. | **insufficient** | — | T3 | Yes | ✗ | ✗ | ✗ |
| Alphabet | 31 Dec 2025 | *not confirmed* | No AI line; Google Cloud reported as a whole. | **insufficient** | — | T1 | Yes | ✗ | ✗ | ✗ |
| Amazon | 31 Dec 2025 | *not confirmed* | No AI line; "annualized revenue of $25B" for AI (T3) — a run rate, prohibited. | **insufficient** | — | T1/T3 | Yes | ✗ | ✗ | ✗ |
| Meta | 31 Dec 2025 | *not confirmed* | Segments are Family of Apps / Reality Labs. No AI revenue. AI is internal to ad ranking. | **insufficient** | — | T1 | Yes | ✗ | ✗ | ✗ |
| Arm | Mar 2026 | *not confirmed* | Royalties and licences across all chip categories; no AI attribution. | **insufficient** | — | T1 | Yes | ✗ | ✗ | ✗ |
| ASML | 31 Dec 2025 | *not confirmed* | Lithography equipment. Not attributable to qualifying AI products. | **insufficient** | — | T1 | n/a | ✗ | ✗ | ✗ |
| Applied Materials | Oct 2025 | *not confirmed* | Semiconductor equipment. Same. | **insufficient** | — | T1 | n/a | ✗ | ✗ | ✗ |
| Salesforce | Jan 2026 | *not confirmed* | AI features (Agentforce) inside bundled CRM subscriptions; no separable qualifying revenue. | **insufficient** | — | T1 | Yes | ✗ | ✗ | ✗ |
| Adobe | Nov 2025 | *not confirmed* | Generative features inside Creative Cloud bundles. | **insufficient** | — | T1 | Yes | ✗ | ✗ | ✗ |
| Equinix | 31 Dec 2025 | *not confirmed* | Generic colocation and interconnection. Explicitly non-qualifying per the parent. | **insufficient** | — | T1 | n/a | ✗ | ✗ | ✗ |
| **Palantir** | 31 Dec 2025 | $4,475.4M | Four platforms: Gotham, Foundry, **Apollo**, AIP. Segments are Government $2.40B / Commercial $2.07B — *customer* segments, not product. No AIP revenue disclosed. | **contested** (§6.2) | — | T1 | No | ? | ? | ? |
| **C3.ai** | 30 Apr 2026 | *not confirmed* | Subscriptions 91% of FY revenue, professional services 9%. Entire catalogue is enterprise AI applications. | **~100%** | ~100% | T1 | No | ✓ | ✓ | ✓ |
| **CoreWeave** | 31 Dec 2025 | $5,130M | "Full-stack, AI-native cloud platform." Whole business is AI compute services. Microsoft ≈ 67% of revenue. | **~100%** | ~100% | T1 | No | ✓ | ✓ | ✓ |
| **SoundHound** | 31 Dec 2025 | $168.9M | Houndify, Smart Ordering, Amelia, Interactions, OASYS — all conversational/voice AI. Interactions historically blends AI with human agents. | **contested** (§6.3) | ~100%? | T1 | No | ✓? | ✓? | ✓? |
| **BigBear.ai** | 31 Dec 2025 | $127,700K | Brands as "decision intelligence". Disclosed contracts include **FAA IT services** (~$2.4B/10yr subcontract) and Army **legacy-system modernization** ($165.15M). Gross margin 22.3%. | **reject** (§6.4) | — | T1 | Yes | ✗ | ✗ | ✗ |

### 5.2 The result: τ has no discriminating power

**Not one issuer in a 21-issuer sample changes membership between τ = 20%, 25% and 33%.** Nor at 50%. Every issuer is either approximately 100% (identity path) or `insufficient evidence`. **The sample contains no issuer whose `r_i_lower` falls anywhere between 0% and 100%** — because for every diversified issuer, the numerator cannot be established at all.

This is a counterintuitive and load-bearing finding. **τ is currently unfalsifiable.** Testing 20 against 25 against 33 is testing the sensitivity of a ratio whose numerator does not exist for any issuer where the ratio would matter. Choosing τ = 25% because a provider uses it, or τ = 20% because it admits more names, would both be decisions without evidentiary content.

**τ acquires discriminating power only if the evidence standard is relaxed.** That coupling is exact and is the most useful thing in this section:

- If T2 evidence were admitted *and* four disclosed quarterly actuals within one completed FY could be summed (§10.3), Broadcom's AI-semiconductor revenue becomes measurable. Widely reported at approximately $20B against $63,887M — **≈ 31%** — which **passes at 20% and 25% and fails at 33%**. (The $20B figure was *not* confirmable from Broadcom's own FY2025 release, which gives no full-year figure; it must be recomputed from the four quarterly disclosures before any reliance.)
- If T3 evidence were admitted, Micron's HBM at roughly $2B/quarter against $37.4B is **≈ 21%** — passing at 20% and failing at 25% and 33%.

**Therefore: `τ` and the evidence hierarchy must be decided together, in that order — hierarchy first.** Deciding τ before the hierarchy is deciding the sensitivity of an undefined quantity. This is the single most important procedural recommendation in the phase.

### 5.3 Consequences of the current rule, assessed on the brief's criteria

| Criterion | Assessment at the current evidence standard |
|---|---|
| False inclusion risk | **Very low.** Only issuers whose entire business is AI can enter. |
| False exclusion risk | **Extreme.** NVIDIA, Broadcom, TSMC, AMD, Micron, and every hyperscaler are excluded. |
| Concentration | **Catastrophic** — see §14. Two to four admissible issuers. |
| Sector breadth | **Fails.** No semiconductors, no hyperscalers, no infrastructure. Software and one AI cloud only. |
| Geographic breadth | **Fails.** Sample admits US-listed issuers only; TSMC's exclusion removes Taiwan entirely. |
| Data measurability | **Excellent** — the rule is precisely why measurability is high. |
| Methodological clarity | **Excellent.** Fully mechanical and auditable. |

The rule is not defective. It is *honest*, and its honesty produces a universe that cannot support an index. That trade is the founder decision.

### 5.4 What the founder must choose between

Presented without a hidden preference; my recommendation follows.

| Option | Effect | Cost |
|---|---|---|
| **A. Keep the strict rule** | 2–4 constituents; **cap infeasible**; unpublishable under the parent's own rules (§14) | UGAI does not launch |
| **B. Admit T2 evidence + sum quarterly actuals within a completed FY** | Adds Broadcom (≈31%). Does **not** add NVIDIA, TSMC, Microsoft, AMD, Intel, Alphabet, Amazon, Meta — none discloses an AI figure at any tier | Small gain; still infeasible |
| **C. Admit T3 (earnings calls, decks)** | Adds Micron (≈21%). Still not NVIDIA or the hyperscalers | Turns oral commentary into an audited data point — the brief warns against this, correctly |
| **D. Add an absolute-revenue admission route** | The parent already lists this as an open question. Admits issuers with large *evidenced* qualifying revenue regardless of ratio — but still requires a numerator, which NVIDIA does not provide | Does not solve the numerator problem |
| **E. Sub-segment attribution: count only a substantiated qualifying *portion* of a mixed segment** | Requires the issuer to quantify a qualifying sub-component. Almost none do | Little gain, high judgement cost |
| **F. Narrow the product's claim** | Rename to reflect what the strict rule actually measures — AI-native listed equity | Smaller claim; fully defensible; launchable if `n` suffices |

**Recommendation: B now, F as the honest framing, and D researched in parallel. Reject C.**

Reasoning: B is a genuine evidence-quality improvement rather than a loosening — a furnished earnings release is an issuer's own dated statement of a completed period, reconcilable to total revenue, and signed off under the same disclosure controls, which is categorically different from an executive's remark on a call. C crosses exactly the line the brief draws. And **no combination of B, C, D or E admits NVIDIA**, because NVIDIA discloses no AI revenue figure at any tier and its own 10-K states that Data Center is multi-workload. **A methodology that excludes NVIDIA from an AI index is not a methodology error — it is the honest consequence of NVIDIA not disclosing what UGAI requires.** That must be stated publicly and prominently rather than engineered around, and F is what makes it survivable.

---

## 6. The identity path, pressure-tested

### 6.1 Verdict

**Keep the identity path — it is the only route admitting anyone — but it cannot ship as drafted.** As written ("if every disclosed commercial product/business line of an issuer is qualifying AI activity") it is a **brand loophole**: `BigBear.ai` would plausibly pass a careless reading, and its revenue includes FAA IT services.

**Recommended mechanical form.** An issuer may be assigned `r_i_lower = 100%` only where **all four** conditions hold, each recorded with a citation:

1. **Product enumeration from the filing.** Every commercial product, platform or service line named in the issuer's own latest annual filing is enumerated, and each is individually mapped to a qualifying activity group in the Urdais taxonomy. Marketing material, the issuer's self-description and the issuer's *name* are inadmissible.
2. **No material non-qualifying line.** No enumerated line whose principal contracted functionality is something other than learned inference, prediction, generation, perception or adaptive decision-making — or demonstrably attributable infrastructure for those — may be material. Where a line's materiality cannot be established because it is not separately disclosed, the identity path **fails**; it does not pass by default.
3. **Services test.** Where services exceed a stated share of revenue, the issuer must evidence that the services are supplied *for* its own qualifying products (implementation, tuning, data preparation for AI workloads) rather than general systems integration, staffing or IT modernization. **A gross margin characteristic of labour-based services rather than software is a trigger for this test, not a disqualifier by itself.**
4. **Acquisition perimeter check.** Every business acquired within the lookback must be enumerated and mapped on the same basis as organic lines. Acquisitions are the commonest route by which non-qualifying revenue enters an "AI company".

Conditions 3 and 4 exist because the sample produced a real failure of each.

### 6.2 Palantir — contested, and it is condition 2 that bites

Revenue $4,475.4M (FY2025). Reportable segments are **Government ($2.40B) and Commercial ($2.07B)** — customer segments, not product segments, so they carry no information about activity mix. Four platforms are named: Gotham, Foundry, **Apollo**, AIP.

Gotham, Foundry and AIP map to qualifying groups. **Apollo does not.** Apollo is a software deployment and continuous-delivery product; its principal contracted functionality is shipping and managing software across environments, which is infrastructure automation, not learned inference. The parent is explicit that "generic automation" is insufficient.

Apollo's revenue is **not separately disclosed**, so its materiality cannot be established. Under condition 2 as drafted above, **Palantir fails the identity path** — not because Apollo is large, but because Urdais cannot show it is small.

**This is the correct and uncomfortable outcome, and it should not be engineered away.** The alternatives are worse: waiving condition 2 for Palantir specifically is an undocumented analyst exception, which the parent forbids by name; and assuming Apollo is immaterial is exactly the guessed percentage the parent prohibits. **Recommended treatment: `insufficient evidence`, with the specific gap published (Apollo not separately disclosed), reviewed at each reconstitution.** If Palantir ever discloses platform-level revenue, admission follows mechanically.

### 6.3 SoundHound — contested, pending one check

Revenue $168.9M (FY2025). Lines: Houndify, Smart Ordering, Amelia (acquired 2024), Interactions (acquired 2025), OASYS. All are voice/conversational AI on their face, so conditions 1 and 2 are plausibly satisfied.

**Condition 4 is unresolved.** Interactions has historically delivered conversational service blending automated understanding with **human agents in the loop**. If a material part of acquired revenue is human-delivered contact-centre service, that is not learned inference and condition 2 fails. **Recommended: `pending`, resolved by reading the FY2025 10-K's revenue-disaggregation and acquisition notes.** Not resolved in this phase; flagged rather than assumed in either direction.

### 6.4 BigBear.ai — reject, and it is the loophole proof

Revenue $127.7M (FY2025), gross margin **22.3%**. The issuer brands itself as AI-powered decision intelligence. Its disclosed contracts include an FAA subcontract for **information technology services** (reported at approximately $2.4B over ten years) and a $165.15M Army programme to **transform legacy systems into modern data-centric platforms**.

Systems modernization and IT services are not qualifying activity. A 22.3% gross margin is characteristic of labour-based government services, not AI software. **BigBear.ai fails conditions 2 and 3 and must be rejected.**

**This is the single most useful case in the sample**, because it demonstrates that the identity path as drafted would have admitted it on branding — the company name ends in `.ai` — and that conditions 1 and 3 are what stop it. Any final form of the rule must reject BigBear.ai on the record.

### 6.5 C3.ai and CoreWeave — pass

**C3.ai** (FY2026, ended 30 Apr 2026): subscriptions 91% of revenue, professional services 9%. The catalogue is enterprise AI applications throughout. Services at 9% are plainly implementation of its own qualifying products. **Passes.** *(Full-year `R_i` not confirmed this session — Q4 revenue was $51.6M; obtain the annual figure before use. The verdict does not depend on it.)*

**CoreWeave** (FY2025): revenue $5,130M, an AI-native cloud platform — infrastructure, networking, orchestration, storage and developer tooling for AI workloads — mapping squarely to "AI compute services". **Passes.** Two facts to carry forward, neither an eligibility bar under the parent: Microsoft is approximately 67% of FY2025 revenue, and revenue rests on multi-year take-or-pay contracts with a $66.8B backlog. **Recommendation: disclose single-customer concentration for admitted constituents as a published diagnostic.** The parent has no customer-concentration screen and this phase does not propose adding one, but a constituent two-thirds dependent on one counterparty is a fact a reader of the index should have.

---

## 7. Mixed-segment treatment — resolving the rule, not the company

### 7.1 The rule, locked

> **A reported segment, platform, market category or division may be counted toward `Q_i` in full only where the issuer's own disclosure establishes that all material revenue-generating activity within it is qualifying. Where it does not, the segment contributes only a separately substantiated qualifying portion, and where no such portion is substantiated it contributes zero. A segment's *name* never establishes qualification.**

The final clause is not decoration. **Intel reports a segment literally named "Data Center and AI" and breaks out no AI figure within it.** A rule that read segment names would admit Intel's entire DCAI revenue as qualifying.

### 7.2 The consistency test the brief demanded, applied

| Disclosure | Contains | Full count? |
|---|---|---|
| **NVIDIA Data Center** (~$193.7B) | 10-K, verbatim: platform "focused on accelerating compute-intensive workloads, such as **AI, data processing, graphics, robotics, and scientific computing**" | **No** |
| **TSMC HPC** (58% of revenue) | A workload class spanning AI accelerators, CPUs and general high-performance computing | **No** |
| **AMD Data Center** ($16.6B) | EPYC server **CPUs** alongside Instinct accelerators | **No** |
| **Intel DCAI** | Xeon CPUs alongside accelerators | **No** |
| **Broadcom Semiconductor Solutions** ($36,858M) | Custom AI accelerators and AI networking alongside broadband, wireless, storage | **No** |
| **Microsoft Intelligent Cloud / Azure** | All cloud workloads | **No** |
| **AWS, Google Cloud** | All cloud workloads | **No** |
| **Micron DRAM** | HBM alongside commodity DRAM | **No** |
| Generic datacenter revenue | Colocation for all workloads | **No** |
| General server revenue | All compute | **No** |

**Every one is rejected, and the consistency the brief insisted on is achieved: NVIDIA Data Center is refused on exactly the ground that refuses TSMC HPC** — a multi-workload category with no AI split — and NVIDIA's own filing supplies the evidence. Nothing here is decided by how AI-central a company feels.

**A segment would pass** if an issuer reported, say, "AI Accelerators" as a segment whose entire revenue is accelerator products for AI workloads. None in the sample does.

---

## 8. Semiconductor boundary, locked

**Rule:** qualification attaches to *evidenced revenue from a qualifying product*, never to position in a supply chain, and never to a customer's identity.

**Potentially qualifying where revenue is separately evidenced:** GPU and accelerator design; AI ASICs and custom XPUs; AI-specific networking and interconnect (fabric switches sold for AI clusters); **HBM only where separately disclosed for a completed fiscal year**; integrated AI compute systems; advanced packaging attributable to named qualifying AI products.

**Non-qualifying absent product-level attribution:** foundry services (TSMC — a foundry's revenue is a manufacturing service, and the AI content belongs to its customer's product); lithography (ASML); semiconductor capital equipment (Applied Materials); commodity DRAM and NAND; CPUs, including server CPUs sold into AI datacentres; power semiconductors; general networking; general servers.

**Three explicit anti-patterns, each observed:**

1. **"Supplier to NVIDIA" is not evidence.** It describes a customer relationship, not the supplied activity. The parent already says a supplier's relationship with an AI company is insufficient.
2. **Enabling AI is not selling AI.** ASML's machines are necessary for AI chips and its revenue is lithography-equipment revenue. Necessity is not attribution.
3. **A CPU in an AI server is still a CPU.** This is what refuses AMD Data Center and Intel DCAI in full.

**Micron is the boundary case to watch.** HBM is genuinely AI-specific by design. It fails only on disclosure tier — approximately $2B in Q4 FY2025 stated in earnings-call prepared remarks, with no annual figure in the 10-K. **If Micron ever discloses annual HBM revenue in a filing or furnished release, it qualifies at roughly 21%** — admitted at τ = 20%, excluded at 25% and 33%. Micron is therefore the issuer that makes the τ choice real, and it does so only *after* the evidence-hierarchy decision.

---

## 9. Hyperscaler boundary, locked

**Rule, confirmed defensible:** general cloud revenue is not AI revenue. A diversified hyperscaler qualifies only where a separately disclosed qualifying AI product or sub-segment reaches τ on a completed-fiscal-year basis, or where the issuer satisfies the identity path.

**Tested:** Microsoft (FY2026, ended 30 Jun 2026) — no AI line in 10-K segment reporting. Alphabet — Google Cloud reported whole. Amazon — AWS reported whole. Meta — Family of Apps / Reality Labs; AI is internal to ad ranking, which the parent explicitly refuses to let qualify the underlying advertising revenue.

**No Azure AI, AWS AI or Google AI share is estimated here, and none should ever be.** The only figures these issuers publish are **annualized run rates** — Microsoft's AI business at a "$37B annual revenue run rate", Amazon's at "annualized revenue of $25 billion". The parent already prohibits annualized run rates by name. **The prohibition is therefore not hypothetical: it is precisely and solely what excludes the hyperscalers**, and it excludes them even under the most permissive evidence tier. That makes the hyperscaler boundary the most robust rule in the methodology — it does not move under any tier decision.

**Consequence to state publicly:** UGAI excludes the four companies spending the most on AI. That is correct — capex is not revenue, and internal AI use is not AI commercialization — and it must be disclosed as a definitional limitation, not discovered by a reader.

---

## 10. Source hierarchy, locked

### 10.1 Recommended tiers

**Tier 1 — Primary (may establish `Q_i` and `R_i`):** audited annual report; 10-K; 20-F; equivalent statutory annual filing.

**Tier 2 — Secondary-primary (**recommended**: may establish `Q_i` for a completed fiscal year, subject to 10.2):** furnished 8-K earnings exhibit; 6-K; official annual earnings release issued by the issuer.

**Tier 3 — Supplementary (may corroborate, challenge, or trigger review; may *never* establish `Q_i`):** investor presentations; oral earnings-call statements and prepared call remarks; product blogs; press releases that are not the official results release; analyst research; news coverage.

### 10.2 Conditions on Tier 2

A Tier 2 figure may establish `Q_i` only where **all** hold: it states a figure for the **completed fiscal year** being measured; it **reconciles to consolidated revenue** in the same document or to the subsequent Tier 1 filing; it is a **realized** figure, not guidance, a run rate, a backlog, a booking or a pro forma; it appears in the **document's own text or tables**, not solely in a quoted executive remark; and the document is retained with hash and retrieval timestamp under Urdais's existing terms-artifact convention.

**The penultimate condition is the one that does the work.** It is what separates a furnished release's disclosure from an oral statement that happens to be transcribed into the same press release as a CEO quote — and the Broadcom case is exactly why it is needed.

### 10.3 The Broadcom test, and what it actually showed

I fetched Broadcom's own Q4/FY2025 results release. Findings, which **correct a widely repeated secondary claim**:

- Consolidated FY2025 revenue **$63,887M**; Semiconductor Solutions **$36,858M**; Infrastructure Software **$27,029M**. Fiscal year ended 2 November 2025.
- **The release provides no full-fiscal-year AI revenue figure.** The AI content is Q4 growth commentary ("AI semiconductor revenue increasing 74% year-over-year") and Q1 FY26 guidance ($8.2B), and it appears **in the CEO quote, not in the financial tables**.
- A secondary source asserted "AI revenue grew 65% year over year to $20 billion." **That figure is not confirmable from Broadcom's own release** and must not be used as evidence.

**Therefore the Broadcom test does not resolve as the brief anticipated.** There is no completed-year AI number in a furnished exhibit to elevate; under Tier 2 as drafted, Broadcom's own release fails the "document's own text or tables" condition, because the figure exists only in a quotation and only for a quarter.

**This exposes the real question, which is not about tiers at all.** Broadcom discloses AI-semiconductor revenue *every quarter*. Four such quarters span exactly the completed fiscal year. The parent forbids "annualized quarterly or half-year revenue" — but summing four disclosed actual quarters of the measured fiscal year extrapolates nothing.

**Recommendation: permit the sum of disclosed quarterly actuals where, and only where, all four quarters of the completed fiscal year are disclosed on a consistent definition, each from Tier 1 or Tier 2, and the sum is reconciled against consolidated revenue for the same year.** A single missing or redefined quarter makes the year unmeasurable. **Founder decision required** — it is the difference between Broadcom being measurable (approximately 31% on the widely reported magnitude, to be recomputed from the four quarterly disclosures) and not. **Note the terminology risk:** Broadcom's disclosed metric is "AI **semiconductor** revenue", which is narrower than "AI revenue" and excludes any AI-attributable software. Urdais must record the issuer's exact term, never a paraphrase.

---

## 11–12. Sample construction and the remaining evidence-record fields

The sample and its core evidence record are the table in **§5.1** (issuer, fiscal year, `R_i`, qualifying-revenue evidence, `Q_i_lower`, `r_i_lower`, evidence tier, mixed-segment flag, and the three τ outcomes). This section supplies the remaining fields the brief specifies, so the record is complete without duplicating the table.

**Sample composition against the brief's required coverage:** AI-native software/models — Palantir, C3.ai, SoundHound, BigBear.ai ✓ · AI cloud/compute — CoreWeave ✓ · semiconductors — NVIDIA, AMD, Broadcom, Intel, Micron, Arm, TSMC ✓ · semiconductor infrastructure — ASML, Applied Materials ✓ · hyperscalers — Microsoft, Amazon, Alphabet, Meta ✓ · enterprise software — Salesforce, Adobe ✓ · datacenter infrastructure — Equinix ✓ · robotics/autonomy — **not covered; see note below**.

**This is a methodology sample, not a production constituent list, and rejections carry the weight:** 17 of 21 issuers resolve to `insufficient evidence` or `reject`, and those outcomes are what tested the rules.

| Issuer | Representative listing | Identity path applicable? | Investability candidate? | Key caveat |
|---|---|:-:|:-:|---|
| NVIDIA | NVDA · `XNAS` | No — diversified (Gaming, ProViz, Auto) | Yes, trivially | **The defining case.** Its own 10-K states Data Center is multi-workload, so no AI numerator exists at any tier. No evidence-hierarchy decision admits it. |
| Broadcom | AVGO · `XNAS` | No — broadband, wireless, storage, VMware | Yes | Hinges entirely on decision #3 (quarterly summation). Metric is "AI **semiconductor** revenue" — narrower than AI revenue. |
| TSMC | 2330 · `XTAI` (ADR: TSM · `XNYS`) | No | Yes | HPC ≠ AI. Also the only non-US-listed issuer reaching investability in the sample — its exclusion removes Taiwan entirely. |
| Microsoft | MSFT · `XNAS` | No | Yes | Only AI figure is a run rate, already prohibited. `R_i` not confirmed this session. |
| AMD | AMD · `XNAS` | No | Yes | Data Center mixes EPYC **CPUs** with Instinct accelerators. |
| Intel | INTC · `XNAS` | No | Yes | Segment *named* "Data Center and AI" with no break-out — the reason §7.1 forbids name-based qualification. |
| Micron | MU · `XNAS` | No | Yes | **The τ case, if it ever qualifies.** HBM ≈ 21% but disclosed only in call remarks (T3). |
| Arm | ARM · `XNAS` | No | Yes | Royalties span all chip categories; no AI attribution possible. |
| ASML | ASML · `XAMS` | No | Yes | Enabling AI is not selling AI. |
| Applied Materials | AMAT · `XNAS` | No | Yes | Same. |
| Alphabet | GOOGL · `XNAS` | No | Yes | Google Cloud reported whole. |
| Amazon | AMZN · `XNAS` | No | Yes | "Annualized revenue" of AI business — a run rate. |
| Meta | META · `XNAS` | No | Yes | AI is internal to ad ranking; parent refuses to let that qualify ad revenue. |
| Salesforce | CRM · `XNYS` | No | Yes | AI features inside bundled subscriptions; no separable qualifying revenue. |
| Adobe | ADBE · `XNAS` | No | Yes | Same. |
| Equinix | EQIX · `XNAS` | No | Yes | Generic colocation — excluded by the parent by name. |
| **Palantir** | PLTR · `XNAS` | **Attempted — fails condition 2** | Yes, comfortably | **Apollo** is deployment tooling, not learned inference, and its revenue is not separately disclosed, so immateriality cannot be shown. |
| **C3.ai** | AI · `XNYS` | **Yes** | Likely | `R_i` for FY2026 not confirmed this session; obtain before use. Verdict independent of it. |
| **CoreWeave** | CRWV · `XNAS` | **Yes** | Likely — **float factor is the open item** | Microsoft ≈ 67% of revenue; recent IPO with concentrated strategic ownership may bind the 15% float floor. |
| **SoundHound** | SOUN · `XNAS` | **Pending** | Likely | Interactions (acquired 2025) historically blends AI with human agents in the loop; condition 4 unresolved. |
| **BigBear.ai** | BBAI · `XNYS` | **No — reject** | Would pass | FAA **IT services** and Army legacy-system modernization; 22.3% gross margin. The loophole proof for §6.1. |

**Robotics/autonomy gap, stated rather than papered over.** The brief asked for enough issuers to test the taxonomy boundary in robotics and autonomy; none was included. The omission is material because the parent's "AI applications" group explicitly covers "autonomous or robotic systems", and that boundary is therefore **untested by this sample**. Candidates for a follow-up pass: Symbotic (warehouse automation — is it learned inference or programmed automation?), Serve Robotics, Aurora Innovation, Ouster, and Tesla as the extreme diversified case. **Recommendation: test the robotics boundary before the amendment PR is written**, since it may require taxonomy wording that §24.1 does not currently propose.

## 13. Investability screens

### 13.1 What can and cannot be tested now

2C established that accessible free float and float-adjusted capitalization are **licensed inputs Urdais does not hold**, and that vendor terms bar retaining them post-termination. Therefore:

- **Not testable now:** accessible free-float capitalization ≥ $500M / $400M; free float ≥ 15% / 10%. Both require the float dataset.
- **Testable indicatively only:** 3-month ADTV ≥ $5M / $3M, and sessions traded ≥ 90% / 80% — computable from prices and volumes, but not from data Urdais may lawfully retain today.
- **Testable now from public fact:** the 3-complete-calendar-month listing history.

### 13.2 Indicative assessment against the admissible set

| Issuer | Float cap ≥$500M | ADTV ≥$5M | Sessions ≥90% | Float ≥15% | 3mo history | Verdict |
|---|---|---|---|---|---|---|
| CoreWeave | Very likely | Very likely | Likely | **Check** — recent IPO, large insider/strategic holdings | Yes (IPO Mar 2025) | Likely passes; float factor is the open item |
| C3.ai | Likely | Likely | Likely | Likely | Yes | Likely passes |
| SoundHound | Likely | Very likely (heavily traded) | Likely | Likely | Yes | Likely passes, if eligible at all |
| Palantir | Comfortably | Comfortably | Yes | Yes | Yes | Passes — but fails **eligibility** (§6.2) |
| BigBear.ai | Likely | Likely | Likely | Likely | Yes | Passes investability — fails **eligibility** (§6.4) |

### 13.3 Findings

1. **Investability is not the binding constraint. Eligibility is.** Every issuer that passes §5–6 also plausibly passes investability; the issuers investability would reject (BigBear.ai) are already rejected on eligibility. **The screens are therefore untested in the only respect that matters** — whether they exclude credible AI issuers — because the eligibility rule excluded them first.
2. **The screens do not admit obvious junk** on this sample, but the sample cannot demonstrate that: a strict eligibility rule is doing the work a liquidity screen would otherwise do.
3. **Recommendation: adopt 2B's thresholds provisionally, unvalidated and explicitly labelled as such, and re-test once eligibility is settled and the float dataset is licensed.** Locking them now would be locking numbers this sample cannot evaluate. The one substantive comment: **CoreWeave is the case to watch** — a recent IPO with concentrated strategic ownership is exactly where a 15% float floor may bind on an otherwise obviously qualifying constituent.

---

## 14. Issuer cap `c` — the test that ends the exercise

### 14.1 The arithmetic, which needs no market data

The parent states: with `n` positive-weight companies, `n × c ≥ 1` is necessary for feasibility — because every weight is capped at `c` and the weights must sum to one.

| `c` | Minimum constituents for a valid capped weight vector |
|---|---|
| 8% | **n ≥ 13** (12.5 rounded up) |
| 10% | **n ≥ 10** |

### 14.2 Applied to the sample

Issuers admitted under the strict rule: **C3.ai and CoreWeave** (clear), plus **SoundHound** (pending) and **Palantir** (contested, currently failing). So `n` is between **2 and 4**.

- At `c` = 8%: requires 13. **Infeasible.**
- At `c` = 10%: requires 10. **Infeasible.**
- With `n` = 4, feasibility requires `c ≥ 25%`; with `n` = 2, `c ≥ 50%`.

**The parent's own rule for this case is explicit: do not relax the cap, do not add ineligible companies, do not fall back to equal weights — withhold the snapshot and publish the reason.**

### 14.3 Conclusion

**The `c` test cannot be run, and the reason is the finding.** Testing 8% against 10% presupposes a universe large enough for either to be feasible. No indicative concentration table is presented here, because computing top-1 and top-5 shares for a two-to-four-name universe would dignify with arithmetic something already excluded by arithmetic — and would require market-cap figures this phase declines to assert.

**What replaces the cap test is a launch gate, which is more useful than a cap value:**

> **UGAI cannot publish until the eligibility rule admits at least `1/c` investable issuers — 13 at `c` = 8%, 10 at `c` = 10%. Constituent count is therefore not a vanity metric; it is a feasibility precondition written into the parent methodology.**

And the corollary that should govern the founder decision in §5.4: **the eligibility rule and the cap are not independent choices.** A strict rule and a tight cap are jointly infeasible. Something must give, and the options are: admit more evidence (B/D), narrow the claim (F), or raise `c` and abandon meaningful concentration control. **Recommendation: B plus F, and hold `c` at 8–10% as a launch gate rather than weakening it.** A cap that must be loosened to make the index exist is not a concentration control.

---

## 15. 5/10/40

**Recommendation: diagnostic only. Do not adopt as binding.**

The UCITS-style 5/10/40 constraint (no holding above 10%, and holdings above 5% not exceeding 40% in aggregate) addresses a fund-regulatory diversification requirement, not an index-representativeness one. The brief is right to warn against importing it because it exists elsewhere.

On the evidence: the candidate universe's problem is that it is **too small to weight at all**, not that a single issuer cap fails to control it. A secondary constraint cannot help a universe where the primary constraint is already infeasible — and at `n` = 4, 5/10/40 is unsatisfiable *a fortiori*, since four holdings above 5% must sum to 100%.

**If a plausible universe ever emerges, 5/10/40 becomes worth re-testing**, because the AI universe will likely remain top-heavy. **Publish the 5/10/40 measurement as a concentration diagnostic alongside the effective constituent count `1/Σwᵢ²`**, and revisit bindingness only if the single cap demonstrably fails to control observed group dominance. Adopting it now would add a constraint whose failure mode has not been observed.

---

## 16. Launch venue register

Built from 2B's methodology requirement and 2C's licensing findings. **"Launch-ready" means Urdais could plausibly hold the data *and the rights*, not that the market is important.**

| Market | Methodology-eligible | Data available (EDI) | Investable for the reference investor (§17) | Index-creation rights | Display rights | **Launch status** |
|---|:-:|:-:|---|---|---|---|
| **US** | ● | ● `XNYS` + Nasdaq | Yes | SRO/exchange pass-through; separate licence needed | Separate | **Launch candidate** |
| **UK** | ● | ● `XLON` | Yes | LSE licenses Indices/Benchmarks as its own category — confirmed | Separate; Delayed/After-Midnight class may reduce cost | **Launch candidate** |
| **Japan** | ● | ● `XJPX` | Yes | To be quoted | To be quoted | **Launch candidate** |
| **Taiwan** | ● | ● `XTAI` | Yes, via ordinary channels; **FX is the constraint — ECB omits TWD** | To be quoted | To be quoted | **Launch candidate, FX-gated** |
| **South Korea** | ● | ● `XKRX` | Yes | To be quoted | To be quoted | Needs negotiation |
| **EU** (FR/DE/NL/IT/ES/IE/SE/DK/FI) | ● | ● `XPAR` `XAMS` `XBER` `XMIL` `XMAD` `XDUB` `XSTO` `XCSE` | Yes | Per-venue; several operators | Per-venue | Needs negotiation — **cost scales per venue** |
| **Switzerland** | ● | ● `XSWX` | Yes | To be quoted | To be quoted | Needs negotiation |
| **Canada** | ● | ● | Yes | To be quoted | To be quoted | Needs negotiation |
| **Hong Kong** | ● | ● `XHKG` | Yes | To be quoted | To be quoted | Needs negotiation |
| **Singapore** | ● | ● `XSES` | Yes | To be quoted | To be quoted | Needs negotiation |
| **Australia** | ● | ● `XASX` | Yes | To be quoted | To be quoted | Needs negotiation |
| **Mainland China** (`XSHG`, `XSHE`, `BJSE`) | ● in principle | ● | **Contested** — Stock Connect eligibility, foreign-ownership limits, capital controls, sanctions screening | Unknown; likely hardest | Unknown | **Out of scope for launch** |

### 16.1 Recommendation on "Global"

**Do not launch calling it Global unless the register supports it.** Two coherent paths:

- **Path 1 — narrow and honest.** Launch on **US, UK, Japan, Taiwan** (four venue relationships, covering most of the listed AI supply chain including TSMC if its eligibility ever resolves). Publish the register, and name the index for what it covers. Expand by amendment as licences are obtained.
- **Path 2 — keep the name, defer launch** until at least the major AI economies including mainland China are licensed. 2C's cost finding makes this expensive and slow, and China may be unobtainable at any price for a small publisher.

**Recommend Path 1.** Phase 1A already concluded "Global" was not yet earned; 2C showed the obstacle is per-venue licensing cost; 2D adds that the eligibility rule currently admits only US-listed issuers anyway, so a global venue register would buy nothing at launch. **The register should be versioned and published, and the word "Global" should follow the register rather than lead it.**

---

## 17. Reference investor

**Recommended definition:**

> A **US-domiciled institutional investor** acquiring and disposing of equity through regulated custody and standard local settlement channels in each admitted market, without special government approval, without a quota licence specific to that investor, and without reliance on synthetic or derivative access.

**Applied:**

| Constraint | Treatment |
|---|---|
| Foreign ownership limits | A market-wide or issuer-level limit that is **not exhausted** does not exclude; remaining headroom is an eligibility check and constrains the float factor. An exhausted limit or an issuer-level prohibition excludes. |
| Stock Connect | **Does not by itself establish accessibility.** It is a channel with eligibility lists, quota mechanics and settlement particulars. Whether it satisfies the definition is an explicit register decision per venue, not an assumption. |
| ADR availability | **Never a substitute for local-market accessibility**, and never relocates the business. An ADR may be the *representative security* (§19) where it is the eligible listing with the greatest traded value — but its existence does not make an inaccessible local market accessible. |
| Sanctions | An issuer or venue subject to applicable sanctions or investment prohibitions is excluded, on authoritative regulatory evidence, with the effective date recorded. |
| Capital controls | Controls preventing repatriation of proceeds defeat "dispose of", and exclude. |
| Settlement and custody | The market must settle through channels a regulated custodian supports as ordinary business. |

**Why US-domiciled:** it must be *someone specific*, because accessibility is jurisdiction-dependent, and the alternative — "someone somewhere can buy it" — is precisely what the brief forbids. The choice is a disclosed convention, not a claim of universality, and it should be published with the register so a non-US reader knows what the index assumes. **Founder decision:** the domicile choice is a product decision with consequences for the register, not a technical detail.

---

## 18. Free-float methodology

### 18.1 Recommendation

**Use a licensed vendor free-float factor, applied to vendor shares outstanding, with effective dates, purchased on terms permitting indefinite retention. Do not self-compute float. Do not use index-provider investability factors.**

Three inputs were available and the choice is forced:

| Candidate | Verdict |
|---|---|
| **Vendor free-float factor** (EDI: 170+ exchanges, per-market published definitions, effective-dated, "we do not rent data, we sell it") | **Recommended.** The only option that is both global and retainable. |
| Index-provider investability factors (FTSE, MSCI, S&P) | **Rejected.** They are components of competing index products, and UGAI's weights would become a derivative of a competitor's methodology — breaking the parent's requirement that weights be reproducible from Urdais's own published rules. |
| Internally computed from filings | **Rejected for global use.** 2C established this is a standing operations function, not a phase: per issuer per review, identify every substantial holder, classify strategic versus non-strategic, reconcile overlapping categories without double-deduction, apply foreign headroom, record rationale in original language. **Retain only as a US cross-check** against the purchased dataset. |

### 18.2 Methodology versus vendor implementation detail

This distinction must be explicit in the amended text, or UGAI's weights become unauditable:

- **Methodology (Urdais's own, published, versioned):** that weights use *accessible free-float-adjusted* capitalization; the conceptual exclusions (treasury, strategic and controlling stakes, government strategic holdings, insider holdings, control cross-holdings, locked shares); that a non-strategic large investment manager is **not** excluded; that unknown ownership is a recorded gap and never assumed to be float; that foreign-ownership headroom constrains the factor; that each underlying class is counted once; that values are unrounded.
- **Vendor implementation detail (recorded, cited, and disclosed — not Urdais's rule):** the specific float factor value per security per date, and the vendor's per-market definition used to derive it.

**Consequence to publish:** UGAI's float factors are a vendor's estimates applied under Urdais's stated conceptual rules, and they will differ from FTSE's or MSCI's for the same issuer. **That is a permanent, disclosable limitation, not a defect to be fixed.** It must appear in the methodology text, not in a footnote.

### 18.3 FX, for completeness

**Recommended: a licensed single global fixing (WM/Refinitiv 16:00 London, now FTSE Russell/LSEG, a UK BMR Critical Benchmark) for production; the central-bank patchwork as the costed fallback.** UGAI's own draft already cites 16:00 London precedents from MSCI, Nasdaq, STOXX and Solactive.

The binding fact from 2C: **the ECB publishes 32 currencies and not TWD.** A Taiwan-listed constituent cannot be converted from the free source. Urdais already runs a rights-cleared Taiwan central-bank interface (`cbc-exchange-rates`) alongside `ecb-euro-reference-rates` for UBWI, so the patchwork is partly built — at the cost of a disclosed cross-rate modification through EUR/USD and a per-currency operational surface. **Both must be priced before the methodology's fixing parameter can close.**

---

## 19. Representative security rule

**Preserve: one issuer → one membership → one representative security.** Nothing in the sample requires otherwise.

**Selection, in order:**

1. **Retain the incumbent** if it remains eligible, so small liquidity differences do not churn the index.
2. Otherwise, choose the eligible listing with the **greatest average daily traded value over the same three complete calendar months used in the liquidity screen**, converted to USD at the prescribed daily fixings.
3. **Deterministic tie-breakers, in strict order:** ordinary equity preferred over a depositary receipt; then the issuer-designated primary listing; then ascending ISIN; then ascending exchange MIC. Record the inputs and the tie-break applied.

**Case treatments:**

| Case | Treatment |
|---|---|
| Multiple common classes | One membership. Issuer capitalization may aggregate eligible classes; the weight attaches to the single representative security. **The parent's multi-class validation must run before production** — economic-right equivalence, convertibility, price spreads, return correlation, liquidity divergence, and the tracking distortion of mapping issuer capitalization onto one security's return. |
| ADR + local listing | Same claim, one membership. Local ordinary is preferred on tie-break, but ADR may win on traded value. **A US listing must never be preferred because it has options** — that is UAVI's concern, not the parent's. |
| Dual listing (two venues, one claim) | One membership; greatest traded value decides; both venues must independently pass venue eligibility. |
| Dual-*listed company* structures (two legal issuers, unified economics) | **Not resolved by this rule.** Two issuers means two memberships unless the parent's identity rules make them one company. Flagged as an open item; no such case arose in the sample. |
| Parent + listed subsidiary | Potentially two distinct companies with minority shareholders. Record parent-child ownership; **remove the controlling stake from the subsidiary's float**; never portray the link as independent demand or sum revenues. |
| Tracking stocks | **Excluded** by the parent's security-eligibility rules. |

---

## 20. Public transparency versus licensing — the three layers

2C found the one direct conflict between transparency and licensing: two vendors condition derived-data rights on the output not permitting reconstruction of the underlying data (Twelve Data "cannot be reverse-engineered"; Intrinio treats output as raw redistribution where a user "could infer or reconstruct", with display licences applying to *transformed* data). UGAI's draft commits to publishing as-of constituent weights.

**Governing principle: licensing may constrain what Urdais publishes. It may never constrain what Urdais retains.**

| Item | Layer 1: Public methodology | Layer 2: Public index data (if licensing permits) | Layer 3: Internal audit state (always retained) |
|---|:-:|:-:|:-:|
| Methodology text, τ, `c`, taxonomy, all rules | **Always public** | — | ● |
| Daily index level and percentage changes | — | **Intended — the product** | ● |
| Constituent **names** | — | **Intended.** Low reconstruction risk: names are membership, not licensed market data | ● |
| Constituent **as-of weights** | — | **Intended — but negotiated.** The reconstruction-test conflict lands here | ● |
| Membership changes with effective dates | — | **Intended** | ● |
| **Divisor** | — | **Intended.** Not vendor data; it is Urdais's own computed quantity | ● |
| Float factors per security | — | **Withhold** — vendor-derived values | ● |
| Shares outstanding / index shares | — | **Withhold by default** — index shares plus level plus weights is a strong reconstruction vector | ● |
| **Raw closing prices used** | — | **Withhold** — this is the licensed data itself | ● |
| Corporate-action terms and treatments | — | **Treatment public; vendor-sourced terms withheld** | ● |
| FX rates used | — | **Withhold if licensed; publish if central-bank sourced** | ● |

### 20.1 Findings

1. **Weights are the negotiation, and names are not.** Publishing names and weights *without* prices is materially less reconstructive than publishing prices, because weights are a function of prices *and* index shares *and* FX, and withholding shares breaks the inversion. **Recommendation: seek explicit permission to publish names, weights, membership changes and the divisor, while volunteering to withhold prices, shares and float factors.** That is a defensible negotiating position rather than a concession, and it should be put to vendors in exactly those terms.
2. **A fallback that preserves the product.** If weights cannot be published, publish **weight bands** or the top-10 names with the concentration diagnostics (`1/Σwᵢ²`, top-1, top-5, 5/10/40) rather than exact weights. The reader learns the index's shape without a reconstruction vector.
3. **Layer 3 is non-negotiable and is why 2C's retention finding is a purchase requirement, not a preference.** If Urdais cannot retain prices, shares, float and FX per observation, it cannot answer "prove this print", and the methodology's lineage commitment is void. **A vendor that requires deletion on termination cannot supply UGAI at any price.**
4. **Amendment required:** `ugai.md` currently commits unconditionally to publishing as-of constituent weights. That commitment must become conditional on redistribution rights, with the fallback stated. This is a methodology amendment, not an implementation detail.

---

## 21. Historical policy

**Definitions to adopt:**

- **Live history.** Observations calculated under a methodology version effective at the time, from the universe snapshot then in force, published on the day and never retrospectively re-derived. Live history begins at the first published observation.
- **Reconstructed history.** Observations computed later from point-in-time evidence and retained market inputs, under a stated methodology version, **labelled reconstructed throughout, carried as a distinct series with its own identifier, and never spliced into the live series.**

**Recommendation: launch live-only; keep reconstruction genuinely open.** This is not a prohibition on backfill — the founder position is accepted — it is a sequencing conclusion.

**What reconstruction requires, and which parts are obtainable:**

| Requirement | Status |
|---|---|
| Point-in-time security reference data | **Obtainable** — EDI `PIT_SRF`, dated start/end records since Jan 2005, with `PIT_EVT` for the causing events |
| Historical prices, corporate actions, FX | **Obtainable**, subject to retention rights |
| Historical shares outstanding, effective-dated | **Obtainable** |
| Historical free float, effective-dated | **Partly** — "where available", per year; unquantified (a vendor question) |
| **Point-in-time parent universe versions** | **Not obtainable at any price** |

**The last row is the whole blocker.** Reconstructing membership without look-ahead bias requires re-running the parent's admission decision as of each historical quarterly review, using only evidence available at that review's cutoff: the completed fiscal year then most recently filed, the classification then supportable, the venue register then in force, and — critically — **the rejected and insufficient-evidence candidates as they then stood**, since a universe is defined as much by exclusions as inclusions. Nobody sells that. It is manual evidence work, it belongs to 2B, and it is what makes reconstruction a later project rather than a launch feature.

**Survivorship and look-ahead, concretely.** An AI universe reconstructed over 2020–2026 with today's evidence would drop every company admitted and later removed — and because removal correlates with failure, the series inherits an upward bias. Using today's restated filings and today's classifications would additionally select the historical universe using information nobody had. Both are prohibited by the parent, and both produce a series that is smooth, plausible and wrong, with no internal signal that anything is amiss.

**The action item is contractual, not editorial:** secure the right to purchase and indefinitely retain historical inputs **at signature**, so that reconstruction remains possible if 2B ever delivers point-in-time universe versions. Cheap now; impossible to retrofit.

---

## 22. What a UGAI v1 methodology snapshot must record

Not implemented. The required content of a versioned snapshot:

**Eligibility:** methodology version and effective date · τ · the majority-exposure threshold (50%, descriptive) · identity-path rule version and its four conditions · evidence hierarchy including Tier 2 conditions and the quarterly-sum rule · taxonomy version · venue register version · reference-investor definition · investability thresholds (entry and retention) · exposure-retention buffer if adopted.

**Weighting:** free-float methodology (Urdais's conceptual rules, and the vendor and per-market definition used) · issuer cap `c` · the feasibility gate `n × c ≥ 1` · concentration diagnostics published.

**Securities:** representative-security rule with ordered tie-breakers · identifier policy (FIGI canonical, Urdais-issued company key above it).

**Calculation:** price basis (raw official unadjusted close plus session status) · FX basis (source, fixing time, convention, orientation USD-per-unit) · corporate-action policy version · index-share precision · divisor and every divisor change with cause and before/after market values · base value 1,000.00 and base date · calculation calendar and cutoff · reconstitution cadence.

**State:** constituent universe snapshot consumed (parent version) · index shares per security with the reset or event that set them · as-of weights · four version identifiers per observation · observation status · market-data cutoff.

**Governance:** public disclosure policy per §20 · correction window and materiality threshold · historical-series labelling policy per §21.

---

## 23. Founder decision register

**Nothing below is final. Every row requires explicit approval before it becomes methodology.**

| # | Decision | Evidence | Recommended choice | Alternatives tested | Consequence if chosen | Approval required? |
|---|---|---|---|---|---|---|
| 1 | **Evidence hierarchy** *(decide first — #2 and #4 depend on it)* | Broadcom's FY25 release carries no full-year AI figure; hyperscalers publish only run rates; Micron's HBM appears only in call remarks | **T1 + T2 with the five conditions in §10.2. Reject T3.** | T1-only; T1+T2+T3 | T1-only leaves ~2–4 constituents. T3 turns oral remarks into audited data | **Yes** |
| 2 | **`τ`** | **No issuer in a 21-issuer sample changes membership between 20/25/33/50** | **Defer until #1 and #3 are set, then adopt 25% as a disclosed convention** | 20, 25, 33, 50 | τ is currently unfalsifiable; it only bites once Broadcom (~31%) and Micron (~21%) become measurable | **Yes** |
| 3 | **Quarterly-actual summation** | Broadcom discloses AI-semi revenue quarterly; four quarters span the completed FY; summing extrapolates nothing | **Permit, under §10.3's conditions** | Prohibit (status quo) | Prohibiting makes Broadcom permanently unmeasurable. Permitting makes τ = 33% vs 25% a live choice | **Yes** |
| 4 | **Identity path** | BigBear.ai would pass a careless reading; Palantir fails on undisclosed Apollo | **Keep, in the four-condition mechanical form (§6.1)** | Drop it (→ zero constituents); keep as drafted (→ brand loophole) | Palantir becomes `insufficient evidence`; BigBear.ai rejected on the record | **Yes** |
| 5 | **Mixed-segment rule** | NVIDIA's own 10-K calls Data Center multi-workload; Intel's segment is *named* "Data Center and AI" with no break-out | **Lock as §7.1, including "a segment's name never establishes qualification"** | Allow full count of AI-majority segments | NVIDIA, TSMC, AMD, Intel, Broadcom, Micron all excluded; consistency achieved | **Yes** |
| 6 | **Semiconductor boundary** | "Supplier to NVIDIA" is a customer relationship; a CPU in an AI server is a CPU | **Lock as §8** | Supply-chain-position qualification | Foundry, litho, equipment, commodity memory, CPUs excluded. Micron enters only if HBM is ever filed | **Yes** |
| 7 | **Hyperscaler boundary** | Only AI figures published are annualized run rates, already prohibited | **Lock as §9** | Estimate AI shares of cloud | Excludes the four largest AI spenders — must be disclosed prominently | **Yes** |
| 8 | **Investability thresholds** | Float and float-cap untestable pre-licence; eligibility rejects first | **Adopt 2B's numbers provisionally and explicitly unvalidated; re-test post-licence** | Lock now; defer entirely | Locking would fix numbers this sample cannot evaluate. CoreWeave's float is the case to watch | **Yes** |
| 9 | **Venue register** | Data exists for all target markets; rights are per-venue and cost scales with count | **Path 1: launch on US, UK, Japan, Taiwan. Publish and version the register. China out of scope** | Full global register; defer launch | "Global" must follow the register, not lead it — a naming decision | **Yes** |
| 10 | **Reference investor** | Accessibility is jurisdiction-dependent | **US-domiciled institutional investor, regulated custody, standard settlement, no special approval or investor-specific quota, no synthetic access** | Unspecified "institutional"; multi-jurisdiction | Stock Connect becomes an explicit per-venue register decision, not an assumption | **Yes** |
| 11 | **Free-float methodology** | Vendor float purchasable globally; index-provider factors are competitors' components; self-computing is a standing ops function | **Licensed vendor factor, effective-dated, purchased with indefinite retention. US filings as cross-check only** | Self-compute; index-provider factors | UGAI's floats will differ from FTSE/MSCI — a permanent disclosable limitation | **Yes** |
| 12 | **Issuer cap `c`** | `n × c ≥ 1` requires n ≥ 13 at 8%, n ≥ 10 at 10%; sample admits 2–4 | **Hold 8–10% and treat `1/c` as a hard launch gate. Do not loosen to make the index exist** | Raise `c` to 25%+; drop the cap | UGAI cannot publish until eligibility admits ≥ 1/c investable issuers | **Yes** |
| 13 | **5/10/40** | Unsatisfiable at n = 4; single cap is not the failing control | **Diagnostic only, published alongside `1/Σwᵢ²`** | Binding; omit entirely | No constraint added whose failure mode has not been observed | **Yes** |
| 14 | **Public constituent-weight disclosure** | Two vendors condition derived rights on non-reconstructability; `ugai.md` commits unconditionally | **Seek rights for names, weights, membership changes and divisor; volunteer to withhold prices, shares, float. Fallback: weight bands + top-10 + diagnostics** | Publish everything; publish level only | Requires amending `ugai.md` to make the commitment conditional | **Yes** |
| 15 | **Reconstructed-history policy** | PIT reference obtainable from 2005; **PIT universe versions unpurchasable** | **Launch live-only; keep reconstruction open as a separately identified series. Secure retention and history-purchase rights at signature** | Backfill at launch; prohibit backfill | Live history begins at first publication; no fabricated chart | **Yes** |
| 16 | **Product framing** | Strict rule admits only AI-native issuers; excludes NVIDIA, TSMC, the hyperscalers | **Name and describe the index for what the rule measures.** Consider an AI-native framing rather than an unqualified "Global AI" claim | Keep the name and accept the gap | Determines whether the index's exclusions read as honesty or as failure | **Yes — product-level** |

---

## 24. Proposed methodology amendments

Precise instructions. **No file is modified in this phase.**

### 24.1 `docs/methodology/ai-equity-universe.md` (parent)

1. **Source Hierarchy** — restructure into the three tiers of §10.1, adding Tier 2's five conditions verbatim and stating that Tier 3 may corroborate, challenge or trigger review but never establish `Q_i`.
2. **Material AI Exposure → Attribution rules** — add the quarterly-actual summation rule (§10.3) as an explicit permission with its four conditions, and clarify that it is not annualization. Retain every existing prohibition.
3. **New subsection: Identity path** — add the four mechanical conditions of §6.1, with worked statements that an issuer's name and self-description are inadmissible, that undisclosed line materiality fails the path rather than passing by default, and that acquisitions are enumerated on the same basis as organic lines.
4. **Material AI Exposure** — insert the mixed-segment rule of §7.1 as a numbered rule, including "a segment's name never establishes qualification."
5. **AI Economy Classification → Compute components and systems** — insert the semiconductor boundary of §8, with the three anti-patterns named.
6. **AI Economy Classification → AI compute services** — insert the hyperscaler rule of §9, and state that annualized run rates and revenue run-rate disclosures are inadmissible (cross-referencing the existing prohibition so it reads as one rule).
7. **Geographic Scope and Market Access** — replace the unresolved register with the versioned launch register of §16, add the reference-investor definition of §17, and state explicitly that Stock Connect availability does not by itself establish accessibility and that ADR availability never substitutes for local-market accessibility.
8. **Free Float and Capitalization** — add §18.2's methodology/vendor-detail separation, and the disclosure that Urdais's float factors are vendor estimates under Urdais's conceptual rules and will differ from other providers'.
9. **Security Eligibility → Representative security selection** — add the ordered tie-breakers and the case table of §19; add the unresolved dual-listed-company structure as a named open item.
10. **Base Weighting / Concentration Controls** — record `c`'s value once approved, and add the feasibility gate: no production snapshot may be published unless `n × c ≥ 1`, restating the existing withhold-and-publish-the-reason rule as a launch gate.
11. **Concentration Controls** — add 5/10/40 as a published diagnostic alongside `1/Σwᵢ²`, explicitly non-binding.
12. **Open Questions** — remove τ, `c`, the register, the reference investor and the float methodology as they are resolved; **retain** the absolute-revenue route, the exposure-retention buffer, the TTM measure, and multi-class representativeness; **add** point-in-time universe reconstruction as a named prerequisite for any reconstructed history.
13. **Version** — 0.2.0-draft. No effective date until approved.

### 24.2 `docs/methodology/ugai.md`

1. **Published Values and Percentage Changes** — make the commitment to publish as-of constituent weights **conditional on redistribution rights**, and state the §20.2 fallback (weight bands or top-10 plus concentration diagnostics). This is the one amendment forced by licensing.
2. **New section: Public Disclosure Policy** — add the three-layer table of §20, including the principle that licensing may constrain publication but never retention.
3. **Base Value and Base Date** — set the base date convention to the first live publication date; retain base value 1,000.00; add that any pre-launch series is a separately identified reconstructed series, never spliced into live history.
4. **Historical Integrity and Lineage** — add the live-versus-reconstructed definitions of §21 and the point-in-time universe prerequisite.
5. **Currency** — record the FX decision once #11/§18.3 is priced, including the USD-per-unit orientation gate and, if the patchwork is chosen, the cross-rate modification disclosure.
6. **Open Questions** — add the publication-granularity question (carried from 2C §O.10); mark the fixing, calendar, tolerances and correction window as blocked on the vendor contract rather than merely unresolved.
7. **Data Requirements** — note that index shares are withheld from publication by default per §20.
8. **Version** — 0.2.0-draft. No effective date.

---

## 25. Recommended Phase 3

**The blocker discovered in this phase is not technical. It is a founder decision about what UGAI measures, and it cannot be resolved by building anything.**

**Recommended Phase 3: the methodology amendment PR, and nothing else.**

Take the approved rows of §23 and apply §24 to the two methodology documents, bumping both to 0.2.0-draft with no effective date. It is scoped, reviewable, produces no schema and no ingestion, and it converts this study into the versioned record Urdais's own discipline requires. It is also the prerequisite for everything else: vendor outreach asks better questions once the venue register and disclosure position are settled; and the rights-schema extension is shaped by what §20 concludes Urdais must retain.

**Explicitly not Phase 3:**

- **Vendor and licensing outreach** — Phase 4. It depends on decision #9 (venue register) and #14 (disclosure), and asking before those are set wastes the first contact.
- **Rights-schema extension** (2C §N.1 — storage, redistribution granularity, post-termination retention as first-class fields) — Phase 5, and the first thing built, because it is where vendor answers get recorded as evidence.
- **Point-in-time universe research tooling** — Phase 6 at the earliest, and only if reconstruction is wanted. It is 2B-shaped evidence work, not tooling.
- **Security master foundation** — later. Building a security master before the venue register is decided builds for markets that may be out of scope.

**One sequencing warning.** If §23 #1–#5 are approved as recommended, the eligibility rule still admits only 2–4 issuers and `n × c ≥ 1` still fails. **The amendment PR would therefore codify a methodology that cannot yet publish.** That is the right outcome — an honest methodology that withholds is better than a loose one that publishes — but it must be a conscious choice, and decision #16 (product framing) is what makes it a coherent product rather than a stalled one.

---

## Appendix — evidence sources

Retrieved 16 September 2026. Primary filings and issuer releases; secondary sources used only where marked.

**Verified primary**
- NVIDIA, Form 10-K FY2026 (FY ended 25 Jan 2026) — https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm — Data Center platform described as accelerating "AI, data processing, graphics, robotics, and scientific computing"; no quantified AI revenue.
- Broadcom, Q4 and FY2025 results release (FY ended 2 Nov 2025) — https://www.prnewswire.com/news-releases/broadcom-inc-announces-fourth-quarter-and-fiscal-year-2025-financial-results-and-quarterly-dividend-302639606.html — revenue $63,887M; Semiconductor Solutions $36,858M; Infrastructure Software $27,029M; no full-year AI figure; AI commentary in CEO quote.
- Broadcom, Form 10-K FY2025 — https://www.sec.gov/Archives/edgar/data/1730168/000173016825000121/avgo-20251102.htm
- Palantir, Form 10-K FY2025 — https://www.sec.gov/Archives/edgar/data/1321655/000132165526000011/pltr-20251231.htm — revenue $4,475.4M; Government/Commercial customer segments; platforms Gotham, Foundry, Apollo, AIP.
- C3.ai, Form 10-K FY2026 (FY ended 30 Apr 2026) — https://www.sec.gov/Archives/edgar/data/0001577526/000157752626000078/ai-20260430.htm
- CoreWeave, Form 10-K FY2025 — https://s205.q4cdn.com/133937190/files/doc_financials/2025/q4/CoreWeave-Inc-FY25-10-K-7.pdf ; Q4/FY25 release — https://www.sec.gov/Archives/edgar/data/1769628/000176962826000094/coreweave4q25earningspress.htm
- SoundHound AI, Form 10-K FY2025 — https://www.sec.gov/Archives/edgar/data/1840856/000184085626000006/soun-20251231.htm
- BigBear.ai, Form 10-K FY2025 — https://ir.bigbear.ai/sec-filings/annual-reports ; Q4 2025 release — https://ir.bigbear.ai/news-events/press-releases/detail/138/
- Microsoft, Form 10-K FY2026 (FY ended 30 Jun 2026) — https://www.sec.gov/Archives/edgar/data/0000789019/000119312526323660/msft-20260630.htm
- AMD, Form 10-K FY2025 — https://www.sec.gov/Archives/edgar/data/2488/000000248826000018/amd-20251227.htm
- Intel, Form 10-K FY2025 — https://www.sec.gov/Archives/edgar/data/50863/000005086326000011/intc-20251227.htm
- TSMC, 4Q25 Management Report — https://investor.tsmc.com/english/encrypt/files/encrypt_file/reports/2026-01/00fe50f72b38d74e6b9b066398f020f337cd4e9d/4Q25%20Management%20Report.pdf ; 2025 Annual Report — https://investor.tsmc.com/static/annualReports/2025/english/index.html
- Micron, fiscal Q1 2026 and Q3 2026 earnings-call prepared remarks — https://investors.micron.com/static-files/088991c5-a249-4f66-a0a6-258d9b66f3f9 ; https://investors.micron.com/static-files/631b1a32-5537-46ae-8f40-82e42fc79dfe

**Secondary, used only for corroboration and flagged as such**
- Futurum Group analyses of Broadcom Q4 FY2025 and Micron Q4 FY2025 / Q1 FY2026.
- TradingView and StockTitan filing summaries for Palantir, BigBear.ai, SoundHound, CoreWeave.
- The "$20B Broadcom FY2025 AI revenue" claim appeared in secondary coverage and **could not be confirmed** from Broadcom's own release; it is treated as unverified throughout.

**Carried from Phase 2C (see that document's bibliography for full citations)**
- Massive/Polygon Market Data Terms (index-creation prohibition; delete-on-termination) — verified verbatim in 2C.
- London Stock Exchange Market Data Policy Guidelines 2026 (Indices/Benchmarks licence category) — verified verbatim in 2C.
- Twelve Data, Intrinio terms (reconstruction tests); Tiingo (derived products retainable, data not).
- Exchange Data International: Shares Outstanding and Free Float brochure; Free Float Service; Securities Reference Data including `PIT_SRF` and `PIT_EVT`.
- ECB euro foreign exchange reference rates (32 currencies, no TWD); LSEG/FTSE Russell WMR FX benchmarks.
