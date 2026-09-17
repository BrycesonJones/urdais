# UGAI Phase 2F — China/Hong Kong eligibility and final framework sanity check, 16 September 2026

**Status: internal research document. Not a methodology page, not routed publicly, not registered in the docs catalog.** It amends no methodology, approves no parameter, creates no constituent list, publishes no value, and commits Urdais to nothing.

**Scope: three objectives only.** (1) Pressure-test the Phase 2E tier framework against China/Hong Kong issuers. (2) Resolve the 20-vs-21 eligible-count discrepancy and enforce exactly one primary tier per eligible issuer. (3) Re-run universe-size and cap feasibility on the corrected, expanded sample. The Phase 2E architecture is preserved; nothing in §14 of the 2E brief's do-not-reopen list is revisited.

**Verdict: the framework passes. Two defects found, both narrow, both fixable without touching the tier architecture.**

---

## 0. Standing limitation

**Phase 2B remains unavailable** — no report exists in `docs/research/ugai/` and none was provided, as in 2D and 2E. Its parameters are carried only as restated in the briefs. This does not affect 2F's three objectives, none of which depends on 2B.

**Evidence confidence** is marked per issuer. `H` = verified against a primary filing or issuer results release; `M` = verified against issuer results materials via retrieval; `L` = rule application against a publicly known product category, issuer disclosure not verified. The China/HK sample is mostly `M`, because issuer results releases were read but Hong Kong, Shanghai and Shenzhen statutory annual reports were not opened directly.

---

## 1. The 20-vs-21 discrepancy — root cause

### 1.1 What I did

I extracted all 39 rows of the Phase 2E §14 table programmatically and recomputed every count from the rows themselves rather than from the §16 summary.

```
rows: 39
status: Yes 14 | Likely 6 | Contested 4 | Pending 1 | Insufficient evidence 1 | No 13   → sums to 39 ✓

ELIGIBLE (Yes + Likely) = 20
  Tier 1: 6   Astera Labs, Palantir, CoreWeave, C3.ai, Symbotic, Mobileye
  Tier 2: 10  NVIDIA, TSMC, Broadcom, AMD, Micron, SK hynix, Super Micro, Arista, Marvell, Credo
  Tier 3: 4   Microsoft, Alphabet, Amazon, Oracle
  tier subtotal sum = 20 ✓
```

### 1.2 The finding

**The Phase 2E table is internally consistent and correct. Every error is in the §16 summary prose.** The table's 39 rows yield 20 eligible issuers distributed 6 / 10 / 4, summing to exactly 20.

**Root cause: `SoundHound AI` has status `Pending` and primary tier `1?`. It was excluded from the eligible total (correctly) and simultaneously counted in the Tier 1 subtotal (incorrectly), which was written as 7 with the parenthetical "(SoundHound pending)" visible in the list itself.**

The underlying mechanism is precise and worth naming, because it is the thing to fix rather than the arithmetic: **§16's tier subtotals were produced by reading down the table's primary-tier column, while §16's eligible total was produced by filtering on the status column. Those two operations disagree for any issuer that carries a tier but is not eligible.** The four `Contested` issuers (Samsung, Coherent, Dell, HPE) all carry primary tier `2` and were correctly excluded from the Tier 2 subtotal of 10 — so the leak was not systematic, it was a single row. A compounding factor: **§16's status breakdown had no `Pending` row at all**, so SoundHound had nowhere legitimate to appear and was absorbed into the tier count instead.

### 1.3 Two further errors in the same summary, from the same cause

| Location | Stated | Actual | Cause |
|---|---|---|---|
| §16 Tier 1 subtotal | 7 | **6** | `Pending` issuer counted in a tier subtotal |
| §16 Rejected | 9 | **13** | The row lists 13 names and states 9. The status breakdown then summed to 38, not 39 — the missing row being SoundHound again |
| §0.2 and §14 heading | "37-issuer sample" | **39** | The heading was drafted before the row set was finalized and never reconciled against the table |

**None of these changes a single eligibility verdict.** The sample, the rules, and every issuer outcome stand. What failed was the summary accounting.

### 1.4 The accounting rule to codify

> **Tier subtotals are computed only over issuers whose status is `eligible`. Every other status — `pending`, `contested`, `insufficient evidence`, `rejected` — may carry a candidate tier for analysis, and never counts toward universe size. Tier subtotals must be asserted to equal the eligible total, and the status breakdown must be asserted to equal the sample size.**

Both assertions are one line each and would have caught all three errors. **Recommendation: state them in the parent methodology's weighting-interface section, where the feasibility gate `n × c ≥ 1` already lives**, so that the count feeding the gate is defined rather than assumed.

---

## 2. Primary-tier assignment rule

### 2.1 The rule, as tested

Phase 2E's rule, restated and confirmed deterministic:

1. **Tier 1 if the issuer satisfies the Tier 1 whole-issuer test** (all material commercial activity qualifies, per 2E §3.2 conditions 1–4 or the safe harbour).
2. **Otherwise Tier 2 or Tier 3, whichever corresponds to the issuer's largest qualifying activity** — by disclosed revenue where disclosed, and otherwise by the principal business presented in the issuer's own segment structure.
3. **Secondary tags** record additional qualifying exposure. They never affect membership, weight, universe size, or the primary tier.

Applied to all 51 sampled issuers, this rule produced **exactly one primary tier for every eligible issuer, with no ties and no judgement calls required**. It is confirmed.

### 2.2 A real interpretive defect the China sample exposed

The rule is deterministic, but **the tier labels conflate two different things, and the China/HK additions made the conflation visible.**

Tier 1 precedence means an issuer's tier depends on **how it qualified** (whole-issuer versus product test), not on **where it sits in the AI value chain**. Consequences now visible in the combined ledger:

- **Cambricon** sells cloud AI accelerators and is **Tier 1**, because that is its entire business.
- **NVIDIA** sells AI accelerators and is **Tier 2**, because Gaming and Professional Visualization make it non-AI-native.
- Similarly **Astera Labs** (Tier 1) and **Credo** (Tier 2) both sell AI connectivity silicon; **Horizon Robotics** (Tier 1) and **Mobileye** (Tier 1) sell automotive AI compute.

**Within 2E's own definition this is correct and harmless**: tiers are *eligibility routes*, they carry no economic meaning, and they do not touch weights. The defect is not in membership — it is in **published attribution**. A reader shown "Tier 1 (10): Palantir, CoreWeave, C3.ai, Symbotic, Mobileye, Astera Labs, Cambricon, SenseTime, Horizon Robotics, iFlytek" would reasonably infer that Tier 1 means AI software and services, when it in fact contains two chip designers and two automotive-compute companies — and would infer that Tier 2 is the chip layer, when it excludes the pure-play chip designers.

Before 2F, Tier 1 held six issuers of which one (Astera Labs) was a component supplier. After adding China, Tier 1 holds ten of which four are component or automotive-compute suppliers. **The misreading became material because China's eligible issuers are disproportionately AI-native hardware companies.**

### 2.3 Recommended amendment — smallest possible

**Separate the two concepts. Keep the eligibility route as the deterministic membership mechanism; publish value-chain layer as a distinct attribution dimension.**

| Dimension | Values | Role |
|---|---|---|
| **Eligibility route** (internal, versioned) | Tier 1 / Tier 2 / Tier 3 | Determines membership. Exactly one per issuer. Deterministic. |
| **Value-chain layer** (published attribution) | Compute & infrastructure · Platform · Application · Autonomy | Describes where the issuer sits. Zero economic effect. |

Under this, Cambricon and NVIDIA both publish as *Compute & infrastructure* while qualifying by different routes; Palantir and C3.ai publish as *Application*; Baidu and Microsoft as *Platform*; Horizon, Mobileye and Symbotic as *Autonomy*.

This changes no membership, no weight, no count, and no tier test. It changes one published table. **It is the only framework amendment 2F recommends, and it is a labelling fix, not an architecture change.**

---

## 3. China/Hong Kong issuer results

Same rules, no China-specific exceptions, no relaxed evidence standard.

| Issuer | Listing(s) | Thematic status | Primary tier | Secondary tags | Qualifying activity and materiality evidence | Launch feasibility | Conf. |
|---|---|---|---|---|---|---|:-:|
| **Baidu** | BIDU `XNAS` · 9888 `XHKG` | **Eligible** | **3** (Route A) | 1 | Baidu AI Cloud sells AI compute and ERNIE model access. **Discloses AI Cloud Infra revenue ≈ RMB 20bn for FY2025, +34%**; Q4 AI Cloud Infra RMB 5.8bn; Core AI-powered business > RMB 11bn in Q4 = 43% of General Business revenue. Apollo Go autonomous driving (tag 1). | Requires commercial/licensing work (ADR route plausible) | **H** |
| **Alibaba** | BABA `XNYS` · 9988 `XHKG` | **Eligible** | **3** (Route A) | — | Alibaba Cloud sells Qwen model access and AI compute. **Discloses "AI-related product revenue" RMB 8,971m in the March quarter, 11th consecutive quarter of triple-digit growth; annualized > RMB 35.8bn (~US$5.2bn); 30% of Cloud external revenue.** Cloud Intelligence Group FY2026 revenue RMB 158,132m. | Requires commercial/licensing work | **H** |
| **Tencent** | 0700 `XHKG` | **Insufficient evidence** | none | — | FY2025 revenue RMB 751.8bn. Discloses **AI spending** — RMB 18bn on Hunyuan and Yuanbao in 2025, > RMB 36bn planned for 2026 — and attributes AI's effect to improving its own gaming, advertising and cloud. **No disclosed external AI revenue or scale metric.** Hunyuan is available by API and Tencent Cloud supplies GPUs, but neither is quantified. | n/a while ineligible | **H** |
| **SMIC** | 0981 `XHKG` · 688981 `XSHG` | **Insufficient evidence** | none | — | FY2025 revenue US$9.327bn, +16.2%, utilization 93.5%. Prong A5 plausibly met — it fabricates advanced-node logic including domestic AI accelerators — but **Prong B fails: no revenue breakdown by node, no AI or HPC end-market revenue share, no disclosed capacity allocation to qualifying products.** Cites AI/HPC as a 2026 focus. | Access constrained | **M** |
| **Cambricon** | 688256 `XSHG` | **Eligible** | **1** | 2 | FY2025 revenue RMB 6.497bn, +453%; first annual profit. Entire business is cloud AI accelerators. | Access constrained (STAR Market) | **M** |
| **SenseTime** | 0020 `XHKG` | **Eligible** | **1** | 3 | FY2025 revenue RMB 5bn, +32.9%. **Discloses generative AI revenue RMB 3.6bn, +51%, = 72.4% of group revenue.** Negative full-year EBITDA — not an eligibility bar (the parent requires positive revenue, not profit). | Requires commercial/licensing work | **M** |
| **Horizon Robotics** | 9660 `XHKG` | **Eligible** | **1** | 2 | FY2025 revenue RMB 3.76bn, +57.7%, gross margin 64.5%. ADAS and autonomous-driving compute; product-and-solution revenue +144.2% to RMB 1.62bn. Learned-perception dependence satisfied. | Requires commercial/licensing work | **M** |
| **iFlytek** | 002230 `XSHE` | **Eligible** | **1** | 3 | FY2025 revenue ¥27.11bn, +16.1%. AI applications across education (¥8.97bn), healthcare and consumer devices; **AI platform and licensing revenue ¥1.25bn, of which large-model API and MaaS ¥385m, +263%** (tag 3). | Access constrained (Shenzhen) | **M** |
| **Kingsoft Cloud** | KC `XNAS` · 3896 `XHKG` | **Eligible (likely)** | **3** (Route A) | — | Sells AI cloud compute externally. **Discloses AI business gross billing RMB 926m in Q4 2025, +95%, = 49% of public cloud services**; Q4 public cloud revenue RMB 1,902.4m. **Caveat: "gross billing" is not revenue** — see §5.2. | Requires commercial/licensing work | **M** |
| **Lenovo** | 0992 `XHKG` | **Contested** | 2 (candidate) | — | FY2026 revenue US$83.1bn, +20%. ISG $19.2bn for the year including AI servers, +37% in Q4; discloses AI growth rates, a $21bn order pipeline and 5,800 AI deployments — **pipeline is forward-looking (E8), and realized AI-system revenue is not disclosed separately.** | Requires commercial/licensing work | **M** |
| **Xiaomi** | 1810 `XHKG` | **Rejected** | none | — | AI embedded as features in phones, AIoT and EVs; no separately sold AI platform or product at disclosed scale. **E5.** | n/a | **L** |
| **Meituan** | 3690 `XHKG` | **Rejected** | none | — | AI internal to dispatch, routing and recommendation. **E4.** | n/a | **L** |

**China/HK sample: 12 issuers — 7 eligible (4 Tier 1, 0 Tier 2, 3 Tier 3), 2 insufficient evidence, 1 contested, 2 rejected.**

### 3.1 What the sample demonstrates

**The framework identifies meaningful Chinese AI exposure, and it does so through the same tests.** Five of the seven eligible issuers were admitted on a **disclosed, AI-specific quantitative metric** — Baidu (AI Cloud Infra revenue), Alibaba (AI-related product revenue), SenseTime (generative AI revenue at 72.4%), iFlytek (AI platform and MaaS revenue), Kingsoft Cloud (AI gross billing). That is a **higher rate of AI-specific disclosure than the US sample**, where Microsoft and Amazon offer only run rates and NVIDIA, Broadcom, AMD, Micron and Intel offer no AI figure at all.

**This directly refutes the concern that the evidence standards "cannot operate outside SEC-style filings."** On this sample the opposite holds: Baidu discloses a completed-fiscal-year AI revenue line that no US hyperscaler matches.

**And the rules still bite.** Tencent, Xiaomi and Meituan — three of China's largest technology companies — are not admitted. Tier 3 did not turn every major Chinese internet company into a constituent.

---

## 4. Tier-boundary re-tests, and the consistency checks that matter

Each failure mode the brief named, tested against the sample:

| Failure mode | Result |
|---|---|
| **Alibaba qualifying merely because Alibaba Cloud exists** | **No.** It qualifies on disclosed AI-related product revenue (RMB 8,971m quarterly, 30% of cloud external revenue), not on the existence of a cloud business. Remove that disclosure and Alibaba becomes insufficient evidence — which is exactly Tencent's position. |
| **Tencent qualifying merely because it uses AI internally** | **No — and this is the strongest consistency result in the phase.** Tencent fails for the same reason Meta fails: it discloses AI *spending*, and it attributes AI's effect to improving its own products. **A US and a Chinese issuer with economically identical AI postures receive identical outcomes.** |
| **Baidu qualifying purely because of model branding** | **No.** ERNIE branding is inadmissible under E6. Baidu qualifies on RMB 20bn of disclosed AI Cloud Infra revenue. |
| **SMIC qualifying merely because it manufactures semiconductors generally** | **No.** Correctly `insufficient evidence` — Prong B unmet. See the TSMC comparison below. |
| **Lenovo qualifying merely because it sells PCs and servers** | **No.** Contested, on identical grounds to Dell and HPE: an AI-server line inside a broader infrastructure segment, with growth rates and pipeline disclosed but not realized AI-system revenue. **Same treatment, different listing venue.** |

### 4.1 The SMIC-versus-TSMC test, examined properly

Both are foundries. TSMC is eligible; SMIC is not. **The brief is right to ask whether this is a Western-disclosure artefact, so it deserves a precise answer.**

TSMC satisfies Prong B on two independent routes: a disclosed **platform revenue mix** (HPC = 58% of FY2025 revenue) and disclosed **advanced-packaging capacity expansion**. SMIC discloses neither a node or end-market revenue mix nor a capacity allocation to qualifying products.

**Is this an East/West disclosure-convention dependency? No — TSMC's platform reporting is unusually granular for a foundry anywhere.** Intel does not report an AI revenue split either, and was refused in 2D on the same basis. The dividing line is granularity of disclosure, and it cuts across geography rather than along it.

**But there is a genuine adjacent problem, and it does have a geographic skew.** SMIC's advanced-node activity is subject to export controls, which makes granular disclosure commercially and politically costly. **The framework will systematically under-admit issuers operating under export-control opacity, and those issuers are concentrated in one jurisdiction.** That is not a rule defect — the rule is applied identically — but it is a **coverage limitation with a geographic bias that must be disclosed rather than discovered.** No rule amendment is needed; a limitations entry is.

---

## 5. Framework defects found

Two, both narrow. Neither requires reopening the tier architecture.

### 5.1 Defect 1 — tier labels conflate eligibility route with value-chain position

Detailed in §2.2. **Fix: publish value-chain layer as a separate attribution dimension (§2.3).** Labelling only.

### 5.2 Defect 2 — Route A's "quantitative indicator of scale" is unranked

The China sample revealed that Route A is being satisfied by **five different kinds of metric**, and 2E treated them as interchangeable:

| Issuer | Metric offered | Kind |
|---|---|---|
| Baidu | AI Cloud Infra revenue, FY2025 | **Realized annual revenue** |
| Alibaba | AI-related product revenue, March quarter | **Realized quarterly revenue** |
| Microsoft | ~$37bn AI "annual revenue run rate" | Run rate |
| Amazon | ~$25bn "annualized revenue" | Run rate |
| Kingsoft Cloud | AI business **gross billing** RMB 926m, Q4 | **Billings, not revenue** |

Gross billing is not revenue — it precedes revenue recognition and can include amounts never recognized. Treating it as equivalent to Baidu's audited annual AI revenue line is not defensible.

**Recommended amendment — small and self-contained.** Rank the acceptable Route A scale indicators and require at least the second rank, recording which was used on every admission:

1. Realized AI-specific revenue for the completed fiscal year *(Baidu)*
2. Realized AI-specific revenue for a disclosed period within it, or an annualized figure or run rate derived from realized revenue *(Alibaba, Microsoft, Amazon)*
3. Billings, gross billings, bookings or consumption metrics — **corroborating only, never sufficient** *(Kingsoft Cloud)*
4. Customer or deployment counts — corroborating only

**Consequence: Kingsoft Cloud moves from `eligible (likely)` to `insufficient evidence`** unless it also discloses AI revenue rather than gross billing. I have **not** applied that reclassification to the ledger below, because the amendment is not yet approved; the row is flagged instead. If approved, eligible falls from 27 to 26 and Tier 3 from 7 to 6 — **which changes no feasibility conclusion** (§7).

### 5.3 A calibration data point, not a defect

2E proposed a **75% Tier 1 safe harbour** and stated honestly that the sample could not calibrate it, because no issuer's disclosed ratio fell between roughly 10% and 100%.

**SenseTime is the first: generative AI revenue at 72.4% of group revenue** — just below the proposed threshold. This is informative rather than problematic: SenseTime does not get the shortcut and must pass the four Tier 1 conditions instead, which it does. The safe harbour behaves as designed, as a shortcut and not a gate.

But it shows **75% is a live number that will exclude obvious AI-native companies from the shortcut**, and that a value nearer 70% would capture SenseTime directly. **Recommendation: keep 75% as the proposal, record SenseTime as the sole calibration observation, and note that the threshold's only effect is procedural** — it never decides eligibility, so the cost of setting it slightly high is review effort, not a wrong outcome. This is now one data point rather than none.

---

## 6. Corrected combined ledger

**This is a methodology pressure-test sample. It is not a production constituent list and must never be used as one.** 51 issuers: the 39 from Phase 2E, corrected, plus the 12 from Phase 2F.

### 6.1 Eligible — 27, each counted exactly once

| # | Issuer | Primary tier | Secondary tags | Value-chain layer (proposed) | Basis | Counted once |
|---|---|:-:|:-:|---|---|:-:|
| 1 | Palantir | 1 | 3 | Application | Tier 1 conditions; Apollo ancillary-support | ✓ |
| 2 | CoreWeave | 1 | 3 | Platform | Whole business is AI compute services | ✓ |
| 3 | C3.ai | 1 | — | Application | Subscriptions 91%, services 9% | ✓ |
| 4 | Symbotic | 1 | — | Autonomy | Learned-perception dependence | ✓ |
| 5 | Mobileye | 1 | — | Autonomy | ADAS/AV on learned perception | ✓ |
| 6 | Astera Labs | 1 | 2 | Compute & infrastructure | Whole business is accelerator connectivity | ✓ |
| 7 | **Cambricon** | 1 | 2 | Compute & infrastructure | Whole business is cloud AI accelerators | ✓ |
| 8 | **SenseTime** | 1 | 3 | Application | Generative AI revenue 72.4% of group | ✓ |
| 9 | **Horizon Robotics** | 1 | 2 | Autonomy | ADAS/AV compute | ✓ |
| 10 | **iFlytek** | 1 | 3 | Application | AI applications across all material lines | ✓ |
| 11 | NVIDIA | 2 | — | Compute & infrastructure | Accelerators (A1); segment materiality + attribution | ✓ |
| 12 | TSMC | 2 | — | Compute & infrastructure | Fabrication + advanced packaging (A5); HPC 58% | ✓ |
| 13 | Broadcom | 2 | — | Compute & infrastructure | Custom XPUs, AI networking (A1, A3) | ✓ |
| 14 | AMD | 2 | — | Compute & infrastructure | Instinct accelerators (A1) | ✓ |
| 15 | Micron | 2 | — | Compute & infrastructure | HBM (A2) | ✓ |
| 16 | SK hynix | 2 | — | Compute & infrastructure | HBM (A2) | ✓ |
| 17 | Super Micro | 2 | — | Compute & infrastructure | Rack-scale accelerated systems (A4) | ✓ |
| 18 | Arista Networks | 2 | — | Compute & infrastructure | AI fabric switching (A3) | ✓ |
| 19 | Marvell | 2 | — | Compute & infrastructure | Custom AI silicon, interconnect | ✓ |
| 20 | Credo Technology | 2 | — | Compute & infrastructure | AI connectivity silicon (A3) | ✓ |
| 21 | Microsoft | 3 | 2 | Platform | Route A; disclosed AI run rate | ✓ |
| 22 | Alphabet | 3 | 2 | Platform | Route A; Vertex AI, Gemini API | ✓ |
| 23 | Amazon | 3 | 2 | Platform | Route A; disclosed annualized AI revenue | ✓ |
| 24 | Oracle | 3 | — | Platform | Route A; OCI AI infrastructure | ✓ |
| 25 | **Baidu** | 3 | 1 | Platform | Route A; **AI Cloud Infra revenue ≈ RMB 20bn FY2025** | ✓ |
| 26 | **Alibaba** | 3 | — | Platform | Route A; AI-related product revenue disclosed | ✓ |
| 27 | **Kingsoft Cloud** | 3 | — | Platform | Route A; **flagged — gross billing only, §5.2** | ✓ |

**Tier 1 = 10 · Tier 2 = 10 · Tier 3 = 7 · sum = 27 = total eligible ✓**

### 6.2 Not eligible — 24

| Status | Count | Issuers |
|---|:-:|---|
| **Pending** | 1 | SoundHound AI *(Tier 1 condition 4 unresolved — Interactions' human-in-the-loop revenue)* |
| **Contested** | 5 | Samsung Electronics, Coherent, Dell, HPE, **Lenovo** *(all candidate Tier 2; Prong B materiality unresolved)* |
| **Insufficient evidence** | 3 | Vertiv, **Tencent**, **SMIC** |
| **Rejected** | 15 | Arm, ASML, Applied Materials, Besi/ASMPT *(E2 tools)*; Meta, Salesforce, Adobe, ServiceNow *(E4/E5)*; BigBear.ai *(E6, conditions 2–4)*; Intuitive Surgical, Fanuc *(E7)*; Equinix, Constellation Energy *(E1/E3)*; **Xiaomi** *(E5)*, **Meituan** *(E4)* |

### 6.3 Arithmetic check

```
27 eligible + 1 pending + 5 contested + 3 insufficient + 15 rejected = 51 = sample size ✓
Tier 1 (10) + Tier 2 (10) + Tier 3 (7) = 27 = total eligible ✓
No issuer appears in more than one tier. No issuer counted twice.
```

---

## 7. Universe size, geography, and cap feasibility

### 7.1 Counts

| | Phase 2E (corrected) | Phase 2F added | Combined |
|---|:-:|:-:|:-:|
| Sampled | 39 | 12 | **51** |
| **Eligible** | **20** | **7** | **27** |
| Tier 1 | 6 | 4 | **10** |
| Tier 2 | 10 | 0 | **10** |
| Tier 3 | 4 | 3 | **7** |
| Pending | 1 | 0 | 1 |
| Contested | 4 | 1 | 5 |
| Insufficient evidence | 1 | 2 | 3 |
| Rejected | 13 | 2 | 15 |

### 7.2 Geography of the 27 eligible

| Region | Eligible | Share | Tier 1 | Tier 2 | Tier 3 |
|---|:-:|:-:|:-:|:-:|:-:|
| **US-listed** | 18 | 67% | 6 | 8 | 4 |
| **China / Hong Kong** | 7 | 26% | 4 | **0** | 3 |
| **Taiwan** | 1 | 4% | 0 | 1 | 0 |
| **South Korea** | 1 | 4% | 0 | 1 | 0 |

**US concentration falls from 90% (18 of 20) to 67% (18 of 27).** That is a material reduction in geographic concentration from a single phase's additions.

**The Tier 2 zero is the significant finding.** China/HK contributes **no primary Tier 2 issuer**: SMIC, the obvious candidate, fails Prong B, while Cambricon and Horizon Robotics qualify by the Tier 1 route despite being hardware companies. **The AI infrastructure layer therefore remains entirely US, Taiwan and South Korea — and Taiwan and Korea are precisely the two venues Phase 2C identified as FX- or licence-gated.** Combined with 2E's finding that E2 removes ASML, Arm and most European and Japanese exposure, Tier 2's geographic base is both narrow and the hardest part of the register to license.

### 7.3 Cap feasibility

`n × c ≥ 1`, so `n ≥ 1/c`:

| `c` | Minimum issuers | Eligible sample (27) | Headroom | Feasible |
|---|:-:|:-:|:-:|:-:|
| **8%** | 13 (12.5 → 13) | 27 | **2.1×** | **Yes** |
| **10%** | 10 | 27 | **2.7×** | **Yes** |

**Both clear comfortably on the sample alone.** The conclusion is robust to the §5.2 amendment: if Kingsoft Cloud reclassifies, `n` = 26 and both caps still clear at 2.0× and 2.6×.

**No weights were computed and no market-cap estimates were used.** This phase establishes cap *feasibility* — an integer count against an integer floor — and nothing about concentration or final weights, which require the licensed float data Urdais does not hold.

### 7.4 Does China/HK change cap feasibility materially?

**No — it increases an already-valid `n`.** 20 eligible already cleared both thresholds; 27 widens the margin. Against the brief's options:

- **Merely increases already-valid `n`** — yes, this is the accurate characterization for feasibility purposes.
- **Materially diversifies the universe** — **yes.** US share 90% → 67%.
- **Materially reduces geographic concentration** — **yes**, as above.
- **Introduces new tier concentration** — **yes, and this is the one adverse effect.** Tier 1 grows from 6 to 10, with 4 of 10 now Chinese; Tier 2 gains nothing. Tier 1 and Tier 2 are now equal at 10 each where Tier 2 previously led 10 to 6.
- **Changes the practical case for 8% versus 10%** — **no.** Both are feasible with large headroom, and the choice still turns on the capped-versus-uncapped concentration test on point-in-time float data, which cannot be run yet. **2E's recommendation to hold 8% provisionally stands unchanged.**

---

## 8. The Global claim

Answering the brief's questions directly, and without deciding the naming question, which the evidence does not force.

**Does the framework naturally identify meaningful Chinese/HK AI exposure?** **Yes** — 7 of 12 sampled, across platforms (Baidu, Alibaba, Kingsoft Cloud), AI chips (Cambricon), AI software (SenseTime, iFlytek) and autonomy (Horizon Robotics). Five were admitted on a disclosed AI-specific metric.

**Are major Chinese AI issuers excluded for methodological or data/licensing reasons?** **Both, and the distinction is now clean.** Tencent, Xiaomi and Meituan are excluded **methodologically** — they would be excluded if listed in New York. SMIC is excluded on **disclosure**, which is a methodological outcome with an export-control cause. Everything else eligible is constrained only by **licensing and access**, not by methodology.

**Is the thematic universe structurally US-biased?** **Partly, and now measurably.** 67% US-listed overall — a real concentration, materially better than 90%. But the bias is **concentrated in one layer**: Tier 2 is 80% US-listed with the remainder in Taiwan and Korea, and zero from China, Europe, Japan or the UK. **The infrastructure layer is where the bias lives**, and 2E's tool boundary (E2) is a contributing cause. Tier 1 and Tier 3 are meaningfully international.

**Are important AI value-chain categories represented in China/HK?** Platform, application, autonomy and AI chip design: yes. **Foundry, memory, advanced packaging and AI networking: no** — not because they are absent from China, but because the disclosure Prong B requires is absent.

**Would excluding China/HK at launch invalidate the methodology?** **No.** It would create a **disclosed launch-coverage limitation** — the methodology admits these issuers and the launch venue register does not yet reach them. That is exactly the separation 2C and 2E built, and 2F confirms it holds: **thematic eligibility and launch availability diverge, and the divergence is now quantified at 7 of 27 eligible issuers (26%).**

**Recommendation on naming: do not decide it now, and do not let 2F be read as settling it.** What 2F establishes is that the *methodology* is not US-bound. Whether the *published index* may be called Global depends on the venue register, which depends on licensing quotes Urdais does not have. The honest formulation for the amendment PR: **the universe methodology is global in scope; the launch register is not, and the gap is published.**

---

## 9. Founder decisions remaining

2F reduces the set. Of 2E's sixteen rows, twelve are unaffected and stand as recommended. What remains:

| # | Decision | Status after 2F | Recommendation | Approval |
|---|---|---|---|---|
| 1 | **Three-tier framework** | **Validated.** Survived China/HK with no rule change. Tencent≡Meta and Lenovo≡Dell/HPE confirm cross-geography consistency | **Adopt as recommended in 2E** | **Yes** |
| 2 | **Primary-tier assignment rule** | **Validated as deterministic** — one tier per eligible issuer across 51 issuers, no ties. **But the labels conflate route with value-chain position (§2.2)** | **Adopt the rule. Additionally adopt the value-chain layer as a separate published attribution dimension (§2.3)** | **Yes** — the split is new |
| 3 | **China/HK thematic inclusion** | 7 of 12 eligible under unchanged rules | **Include thematically.** Nothing to decide about the rules; the decision is only whether to accept the outcome | **Yes** |
| 4 | **Launch venue exclusion vs methodology exclusion** | Cleanly separated and now quantified: 26% of eligible issuers are thematically in and launch-constrained | **Keep separate. Publish the coverage gap** | **Yes** |
| 5 | **Issuer cap range** | **Feasibility confirmed at both 8% and 10%**, 2.1× and 2.7× headroom | **Hold 8% provisionally.** Final choice still needs the concentration test on licensed float data | **Yes** |
| 6 | **Route A scale-indicator ranking** *(new, from §5.2)* | Route A is being met by five metric kinds, including gross billing | **Adopt the four-rank ordering; require rank 2 or better; record which was used.** Reclassifies Kingsoft Cloud to insufficient evidence | **Yes** — new |
| 7 | **Ledger accounting rule** *(new, from §1.4)* | The 2E summary error would have been caught by two assertions | **Codify: tier subtotals computed only over eligible issuers; assert tier sum = eligible total and status sum = sample size** | **No** — a drafting standard, not a methodology choice |
| 8 | **Tier 1 safe harbour at 75%** | Now has exactly one calibration observation (SenseTime, 72.4%) | **Keep 75%.** Its only effect is procedural — it never decides eligibility | **Yes** — unchanged from 2E |

**Nothing in 2E's do-not-reopen list was reopened.** Capitalization weighting, tier multipliers, exposure multipliers, liquidity thresholds, free-float methodology, vendor and FX selection, historical reconstruction, the trading calendar and the divisor arithmetic are all untouched.

---

## 10. Recommendation on Phase 3

**Proceed to the methodology amendment PR. 2F came back clean.**

The framework survived the sanity check: the tier architecture needed no change, the sample accounting has an identified root cause and a codifiable fix, every eligible issuer has exactly one primary tier, tier subtotals reconcile to the eligible total, and both candidate caps are feasible with better than 2× headroom.

**Three additions to the Phase 3 scope, all small, all arising from 2F:**

1. **The value-chain layer attribution dimension** (§2.3) — into the parent's tier-framework section and `ugai.md`'s published-attribution list.
2. **The Route A scale-indicator ranking** (§5.2) — into the parent's Tier 3 section.
3. **Two limitations entries** — the export-control disclosure asymmetry (§4.1), and the Tier 2 geographic concentration with its E2 contribution (§7.2). Both belong in the parent's Limitations section, which 2E's §21 structure already provides for.

**Plus the ledger accounting rule** (§1.4) into the weighting-interface section beside the feasibility gate.

**One item I would add to Phase 3 that 2F could not resolve:** the **representative-security determination for Chinese dual-listed issuers**. Baidu, Alibaba and Kingsoft Cloud each have a US ADR and a Hong Kong ordinary listing, and Cambricon and iFlytek are mainland-only. The existing rule — greatest average daily traded value over three complete calendar months, with the ordered tie-breakers — is deterministic and needs no amendment, but **which listing wins materially changes the venue register**, because an ADR route and a Hong Kong route have different access, licensing and FX consequences. That interaction is worth one paragraph in the register section rather than being discovered during implementation.

**Unchanged from 2E:** every Phase 2C blocker stands. No equity data, no licences, three licensing layers, per-venue cost, the retention requirement, no TWD from the ECB. The amendment PR remains the right next step because it is the only one that does not require money — and it is now the last research-phase output standing between the founder decisions and implementation.

---

## Appendix — evidence retrieved this phase

Retrieved 16 September 2026.

- **Baidu**, Form 20-F FY2025 — https://www.sec.gov/Archives/edgar/data/1329099/000119312526109289/d38065d20f.htm ; Q4 and FY2025 results — https://ir.baidu.com/news-releases/news-release-details/baidu-announces-fourth-quarter-and-fiscal-year-2025-results/ ; https://ir.baidu.com/node/14441/pdf — AI Cloud Infra revenue ≈ RMB 20bn FY2025 (+34%); Q4 AI Cloud Infra RMB 5.8bn; Core AI-powered business > RMB 11bn in Q4 = 43% of General Business revenue; ERNIE 5.0; Apollo Go 26 cities.
- **Alibaba**, March quarter and FY2026 results — https://www.businesswire.com/news/home/20260512841182/en/Alibaba-Group-Announces-March-Quarter-2026-and-Fiscal-Year-2026-Results ; https://www.alibabagroup.com/en-US/document-1991364841188622336 — Cloud Intelligence Group FY2026 revenue RMB 158,132m (US$22,924m, +34%); AI-related product revenue RMB 8,971m in the March quarter, 11th consecutive quarter of triple-digit growth, annualized > RMB 35.8bn, 30% of Cloud external revenue.
- **Tencent**, FY2025 annual results coverage — https://www.cnbc.com/2026/03/18/tencent-2025-annual-revenue-ai-investments.html — FY2025 revenue RMB 751.8bn (+14%); RMB 18bn spent on Hunyuan and Yuanbao in 2025, > RMB 36bn planned 2026; Tencent Cloud RMB 5bn adjusted operating profit.
- **SMIC**, FY2025 results coverage — https://www.trendforce.com/news/2026/02/11/news-smic-posts-record-9-3b-in-2025-sales-7nm-yields-reportedly-weigh-on-margins/ ; https://www.powersemiconductorsweekly.com/2026/03/26/smic-reports-strong-2025-financial-growth-driven-by-capacity-expansion-and-ai-demand/ — FY2025 revenue US$9.327bn (+16.2%); utilization 93.5%; no node or AI revenue breakdown disclosed.
- **Cambricon**, FY2025 results coverage — https://pandaily.com/cambricon-posts-first-full-year-profit-since-listing-as-2025-revenue-surges-453 — revenue RMB 6.497bn (+453.21%); net profit RMB 2.059bn; cloud AI accelerators.
- **SenseTime**, FY2025 annual results — https://www.kr-asia.com/sensetime-narrows-losses-in-2025-as-generative-ai-drives-growth ; annual results announcement — https://media-sensetime.todayir.com/2025032617320615011585800_en.pdf — revenue RMB 5bn (+32.9%); generative AI revenue RMB 3.6bn (+51%) = 72.4% of group revenue.
- **Horizon Robotics**, FY2025 annual results — https://autonews.gasgoo.com/articles/news/horizon-robotics-boasts-577-yoy-surge-in-2025-annual-revenue-2034605818467483649 ; https://iis.aastocks.com/20260319/12059245-0.PDF — revenue RMB 3.76bn (+57.7%); gross margin 64.5%; product-and-solution revenue +144.2% to RMB 1.62bn; 47.7% domestic-brand ADAS share.
- **iFlytek**, FY2025 results coverage — https://www.tradingview.com/news/urn:summary_document_report:quartr.com:3267964:0-iflytek-2025-revenue-up-16-1-and-net-profit-up-49-9-with-strong-ai-and-global-growth/ — revenue ¥27.11bn (+16.1%); net profit ¥839m (+49.9%); smart education ¥8.97bn; AI platform and licensing ¥1.25bn, of which large-model API and MaaS ¥385m (+263%).
- **Kingsoft Cloud**, Q4 and FY2025 results — https://www.sec.gov/Archives/edgar/data/1795589/000110465926034141/tm269536d1_ex99-1.htm ; https://www.prnewswire.com/news-releases/kingsoft-cloud-announces-unaudited-fourth-quarter-and-fiscal-year-2025-financial-results-302724787.html — AI business gross billing RMB 926m in Q4 2025 (+95%) = 49% of public cloud services; Q4 public cloud revenue RMB 1,902.4m.
- **Lenovo**, FY2026 results (year ended 31 March 2026) — https://news.lenovo.com/pressroom/press-releases/fy-2025-26/ ; https://doc.irasia.com/listco/hk/lenovo/annual/2026/res.pdf — total revenue US$83.1bn (+20%); ISG $19.2bn for the year, Q4 $5.6bn (+37%); $21bn order pipeline; 5,800+ AI deployments.
- **Xiaomi, Meituan** — no new retrieval; rejected by rule application against publicly known business structures (E5, E4). Marked `L` confidence.

**Carried from Phases 2D and 2E** (verified there): NVIDIA, Broadcom, TSMC, Microsoft, AMD, Intel, Micron, Palantir, C3.ai, CoreWeave, SoundHound, BigBear.ai, Salesforce, Meta, Super Micro, Arista, Symbotic, Vertiv, Constellation Energy. See those documents' bibliographies.
