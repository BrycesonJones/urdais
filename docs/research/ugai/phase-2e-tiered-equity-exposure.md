# UGAI Phase 2E — tiered AI equity exposure framework, 16 September 2026

**Status: internal research document. Not a methodology page, not routed publicly, not registered in the docs catalog.** It amends no methodology, approves no parameter, creates no constituent list, publishes no value, and commits Urdais to nothing.

**Founder decisions locked and not reopened:** UGAI is a **broad AI equity index** of publicly traded issuers. Revenue share `r_i = Q_i / R_i` is **no longer the universal primary eligibility gate**. Eligibility now asks whether an issuer has a material, economically meaningful role in the AI value chain under a defined exposure tier.

---

## 0. Limitations to hold before reading

**0.1 Phase 2B remains unavailable.** As in Phase 2D, the brief asks that 2B's findings be incorporated. **No 2B report exists in the repository** (`docs/research/ugai/` holds only 1A, 2C and 2D) **and none was provided.** What is carried forward is 2B's parameters as restated in the 2D and 2E briefs: the investability screens, `c ∈ {8%, 10%}`, and the τ candidates now being demoted. **Anywhere 2B's own reasoning would change a recommendation, that is an unquantified risk.** Locating it remains cheap and should precede founder sign-off.

**0.2 Evidence confidence is marked per issuer and is not uniform.** Twelve issuers were verified against primary filings in Phase 2D; seven more were verified this phase (Salesforce, Meta, Super Micro, Arista, Symbotic, Vertiv, Constellation Energy). The remainder of the 37-issuer sample are **rule applications against publicly known product categories, with issuer disclosure not verified this phase**, and are marked `Low` confidence. They demonstrate how the rule behaves; they are not findings about those issuers. A methodology sample is the right place for that distinction, and it is made explicit in every row.

**0.3 No production constituent list is created here, and the sample is not one.** 37 issuers were chosen to stress the boundaries, not to cover the universe.

---

## 1. What survives, what is superseded, what needs amendment

### 1.1 Survives unchanged

Everything in `ugai.md` about **calculation**: the divisor-based Laspeyres form, index shares, weight drift, corporate actions, additions and deletions, the two return series, status model, corrections, versioning, and lineage. Phase 2E touches none of it (§25).

From the parent: the layered architecture; publicly traded issuers only; eligibility separate from weighting; one issuer → one membership → one representative security; accessible free-float capitalization weighting; the issuer cap; no exposure multiplier on weights; internal AI use insufficient; marketing language insufficient; third-party index membership insufficient; share-price performance insufficient; primary disclosures preferred; investability a separate later gate; auditable and versioned throughout.

From 2C, all of it: the three licensing layers, the purchase-not-rent retention requirement, vendor float, the FX position, the venue register's cost structure, the transparency layers. **2E changes who is eligible; it changes nothing about what data costs or what may be published.**

From 2D, these survive and are load-bearing:

- **The mixed-segment rule** (§7.1 of 2D) — but its *role* changes. It no longer decides membership; it decides whether a segment can supply a *revenue numerator*. A segment that cannot be counted in full can still evidence a qualifying product family under Tier 2.
- **The hyperscaler run-rate finding** — with a crucial reinterpretation, see 1.2.
- **The identity-path failures** — BigBear.ai's rejection and the Apollo problem both survive as tests the new rule must still pass.
- **The `n × c ≥ 1` feasibility gate.**
- **The three anti-patterns**: supplier-to-NVIDIA is not evidence; enabling AI is not selling AI; a CPU in an AI server is still a CPU.
- **Tier 2 evidence conditions** (§10.2 of 2D) and the quarterly-summation question (§10.3), which remain live wherever a revenue figure is used.

### 1.2 Superseded by 2E

| 2D conclusion | 2E status |
|---|---|
| `r_i_lower ≥ τ` is the primary admission gate | **Superseded.** Demoted to a Tier 1 safe harbour, a Tier 3 Route-B materiality test, and a diagnostic (§20). |
| The identity path is the only route admitting anyone | **Superseded.** It becomes Tier 1, one of three routes. |
| NVIDIA, TSMC, AMD, Broadcom, Micron are `insufficient evidence` | **Superseded.** All become Tier 2 eligible (§9) — not by relaxing evidence, but by asking a different question. |
| Hyperscalers excluded because run rates are prohibited | **Partially superseded, and this is the key reconciliation.** 2D's prohibition was on using a run rate as `Q_i` in a *ratio*. A ratio requires a numerator commensurable with a denominator; a run rate is not. But for the question "does a material separately-monetized AI business exist at scale?", a disclosed run rate is **good evidence of existence and scale**. **The prohibition was about arithmetic, not about materiality.** Tier 3 may therefore rely on it (§10). |
| τ = 25% recommended as a disclosed convention | **Superseded** — no universal τ. |
| The universe is 2–4 issuers and `c` is infeasible | **Superseded** (§18, §19). |
| Product framing should narrow to "AI-native" | **Superseded by founder decision** — the index is broad. 2D's decision #16 is withdrawn. |

### 1.3 Needs amendment

The parent needs restructuring, not editing (§24). `ugai.md` needs six small changes (§25). Both are specified and neither file is modified here.

---

## 2. The framework

### 2.1 The question the framework asks

> **Does the issuer supply, operate, or commercialize something whose economic purpose is the production, provision, or delivery of artificial intelligence capability — and is that activity material to the issuer?**

Two prongs, always: **qualifying role** and **materiality to the issuer**. Neither alone suffices. This is what stops the framework becoming a technology index: thousands of issuers benefit from AI; few supply it.

### 2.2 The AI value chain, as scoped

```
        ┌─── Tier 2: AI infrastructure ────────────────────────────┐
        │  accelerators · AI ASICs · HBM · advanced-node fabrication │
        │  advanced packaging · AI cluster networking · optical      │
        │  interconnect · integrated AI compute systems              │
        └───────────────────────┬───────────────────────────────────┘
                                │ embodied in
        ┌───────────────────────▼───────────────────────────────────┐
        │  Tier 3: AI platform  — AI models, training and inference  │
        │  compute, and AI development services sold to others       │
        └───────────────────────┬───────────────────────────────────┘
                                │ built on
        ┌───────────────────────▼───────────────────────────────────┐
        │  Tier 1: AI-native — the issuer's whole commercial         │
        │  identity is the supply of AI products or services          │
        └───────────────────────────────────────────────────────────┘

   OUTSIDE:  manufacturing tools · materials · EDA · electricity ·
             land, buildings, colocation · general building services ·
             internal AI use · AI features in existing products ·
             deterministic automation
```

**Tiers are eligibility routes, not a hierarchy of merit.** Tier 1 is not "better" than Tier 3, and the tier does not affect weight (§5).

---

## 3. Tier 1 — AI-native

### 3.1 Definition

> An issuer is **Tier 1** where **all material commercial activity** consists of supplying AI products or services, such that its core economic identity is the supply of AI.

### 3.2 Mechanical test (all four, each cited)

1. **Enumeration from the filing.** Every commercial product, platform or service line named in the issuer's latest statutory annual filing is listed and individually mapped to a qualifying activity. **The issuer's name, self-description, branding and marketing are inadmissible.**
2. **Materiality of non-qualifying activity.** No enumerated non-qualifying line may be (a) a reportable segment, (b) named in the filing as a principal revenue source, or (c) separately disclosed at a scale the issuer treats as material.
3. **Ancillary-support test — the Apollo fix.** A non-qualifying line that is *not* separately disclosed is presumed ancillary **only where the issuer's own filing presents it as supporting or delivering its qualifying products**. Where the filing presents it as an independent business, or does not characterize it at all, Tier 1 **fails** — it does not pass by default.
4. **Services test.** Where services are a material share of revenue, the issuer must evidence that they implement, tune, integrate or supply data for *its own* qualifying products. **General systems integration, IT modernization, staffing and managed IT fail.** A gross margin characteristic of labour-based services rather than software is a trigger for this test, not a disqualifier.

**Safe harbour.** Where the issuer discloses qualifying revenue of **≥ 75% of consolidated external revenue** for the latest completed fiscal year under 2D's Tier-1/Tier-2 evidence standard, conditions 1–4 are deemed satisfied. This is where τ survives, as a shortcut rather than a gate (§20). The 75% figure is a **calibration parameter requiring founder approval**; the sample cannot calibrate it, because no sampled issuer lands between 10% and 100%.

### 3.3 Resolution of the Phase 2D problem

2D asked: must literally every product line qualify, or only all *material* commercial activities? **Answer: all material commercial activities, with condition 3 governing the unmeasurable residue.**

**Palantir now passes.** Apollo is deployment tooling rather than learned inference, and its revenue is not separately disclosed — which in 2D was fatal. Under condition 3 it is presumed ancillary because Palantir's own filing presents Apollo as the layer that deploys and manages Gotham, Foundry and AIP. **This is a rule, not an exception**, and it produces rejections as well as admissions.

**BigBear.ai still fails**, and the distinction is exactly why the rule is not an accommodation. Its FAA IT-services subcontract and Army legacy-system modernization are **independent services businesses sold to third parties for their systems** — not the delivery layer for BigBear.ai's own AI products. Condition 3 is unavailable to it and condition 4 rejects it outright at a 22.3% gross margin. **The rule admits Palantir and rejects BigBear.ai for a stated structural reason, not because one is recognized as an AI company and the other is not.**

---

## 4. Tier 2 — AI infrastructure

This is the hardest tier and the one that must not swallow the semiconductor supply chain.

### 4.1 The organizing idea: embodiment, not benefit

The Phase 2D failure was demanding a revenue numerator. The dilution risk is admitting anything that benefits from AI demand. Between those sits a question with an objective answer:

> **Is the issuer's product a part of an AI computer, or is it something used to make, house, or power one?**

### 4.2 Definition

> An issuer is **Tier 2** where it supplies a **component, subsystem, or production capability that is embodied in, or directly performs the manufacture of, AI compute systems**, and that activity is material to the issuer.

"AI compute system" means the accelerated compute system on which AI training or inference runs: the accelerator, its memory, the interconnect fabric joining accelerators, and the integrated system containing them.

### 4.3 Mechanical test (both prongs)

**Prong A — Embodiment (one step).** The issuer supplies at least one of:

1. an AI accelerator or AI ASIC (GPU, XPU, TPU, NPU, inference accelerator);
2. memory designed for accelerator bandwidth (HBM and successors) — **not** commodity DRAM or NAND;
3. interconnect embodied in AI clusters: AI fabric switching silicon or systems, high-speed optical transceivers at AI-cluster rates, silicon photonics for scale-up/scale-out, retimers and AI connectivity silicon;
4. an integrated accelerated-compute system, server, or rack-scale AI system;
5. **the fabrication or advanced packaging of (1)–(3)** — that is, the issuer physically manufactures the component, rather than supplying the tools used to manufacture it.

**Prong B — Materiality to the issuer.** The qualifying activity is material, evidenced by at least one, from a statutory filing or furnished release (2D §10.2 conditions apply):

1. disclosed revenue for the qualifying product family; or
2. the qualifying family sits in a reportable segment that is material to the issuer **and** the issuer attributes that segment's demand or growth principally to accelerated-compute or AI end-markets; or
3. disclosed capacity, wafer, or production allocation to the qualifying activity; or
4. the issuer identifies the qualifying activity as a principal driver of results **in its statutory filing** (not in a call).

**Realized disclosures only. Guidance, targets, backlog, bookings, pipeline and TAM never satisfy Prong B** (exclusion E8, §7).

### 4.4 The brief's Tier 2 questions, answered

| Question | Answer |
|---|---|
| Must the company sell an AI-specific product? | **Effectively yes** — a product embodied in AI compute systems, or the manufacture of one. This is Prong A. |
| Is material AI end-market demand sufficient? | **No.** Demand belongs to the customer. This is the supplier-to-NVIDIA anti-pattern, and admitting it would admit utilities, miners and construction. |
| Is being technologically critical sufficient? | **No — and this is the decisive answer.** ASML is maximally critical and is excluded. Criticality without embodiment admits the entire toolchain, then the materials and chemicals behind the tools. **Criticality is a property of the supply chain; embodiment is a property of the product.** |
| How should mixed HPC revenue be handled? | The *segment* cannot supply a numerator (2D §7 survives), but the *product family* inside it can satisfy Prong A, and Prong B can be met by segment materiality plus the issuer's own attribution. This is precisely how NVIDIA and TSMC move from rejected to eligible. |
| HBM versus commodity DRAM | HBM exists to feed accelerators and is embodied in them: qualifies. Commodity DRAM and NAND are general-purpose: excluded. A memory maker qualifies on its HBM business, not on being a memory maker. |
| Advanced-node foundry exposure | Qualifies under A5 — the foundry physically manufactures the accelerator die. Not because it is advanced, but because it *makes the component*. |
| Advanced packaging | **Qualifies** where the issuer performs it (CoWoS and equivalents). **Excluded** where the issuer sells packaging *equipment*. |
| Lithography | **Excluded.** ASML sells the machine that makes chips; it does not sell a part of an AI computer. |
| General semiconductor equipment | **Excluded**, identically. |
| General server manufacturing | **Excluded.** A disclosed accelerated/GPU rack-scale product family qualifies; being a server maker does not. |
| How many steps removed? | **One.** Embodied in the system, or performing the manufacture of something embodied in it. Two steps out — the tools, materials and IP used to make those things — is outside. |

### 4.5 Why the tool boundary is the right place to cut

It is the only line in the chain that is both **objective** and **stable**. Every alternative — "critical", "advanced", "AI-exposed" — requires a judgement that expands under pressure, and expands in a predictable direction: admit ASML and there is no principled reason to exclude Applied Materials, Lam, KLA, Tokyo Electron, ASM International or Besi; admit those and the specialty chemicals and photoresist suppliers have the same claim; and the index becomes a semiconductor index.

The cut is also explicable in one sentence to a skeptical reader, which is the test this phase is held to: **ASML sells the machines that make chips; TSMC makes the chip.** One is embodied in the AI computer; the other is not.

**Consequence to disclose, not hide:** UGAI will exclude ASML, Applied Materials and the semicap complex, which some readers will find surprising. That must be stated in the published limitations.

---

## 5. Tier 3 — AI platform and application

### 5.1 The calibration problem, found empirically

A naive Tier 3 test — "separately monetized AI product plus a disclosed figure" — fails. **Salesforce discloses Agentforce ARR of $800 million specifically**, up 169%, and formally defines a "Data Cloud and AI ARR" metric. That is a separately sold AI product with a disclosed number at genuine scale. It would admit Salesforce at roughly 2% of revenue — and with it every large software company carrying a $100m+ AI SKU. That is exactly the dilution the brief warns against.

Raising an absolute floor does not fix it (every issuer crosses any fixed dollar bar eventually). A relative floor alone breaks the other way: Amazon's disclosed AI business against Amazon's revenue is a low single-digit percentage, so a 10% relative test would exclude Amazon from a broad AI index — plainly wrong.

**The resolution is that magnitude is the wrong axis. Role is the right one.** Microsoft, Amazon, Alphabet and Oracle sell AI capability *to others who build on it*. Salesforce and Adobe sell AI *inside their own applications*. That is a difference in kind, and it is observable.

### 5.2 Definition — two routes

**Route A — AI platform.** The issuer makes commercially available to external customers, at scale, access to **AI models, AI training or inference compute, or AI development and deployment services** that those customers use to build or operate their own AI workloads.

*Mechanical test:* the offering is generally available (not a free or limited preview); it is separately contracted or metered; and the issuer discloses a quantitative indicator of scale — revenue, ARR, run rate, consumption, or a reportable segment whose disclosed growth it attributes principally to that offering. **A disclosed run rate is admissible here** (§1.2): it evidences existence and scale, and no ratio is being computed.

**Route B — AI application at material scale.** The issuer sells a separately priced AI product that is **material to the issuer**, evidenced by a disclosed AI-specific revenue or ARR figure that meets a stated relative-materiality floor of consolidated revenue.

*The floor is a calibration parameter requiring founder approval.* The sample provides one bound — Salesforce at roughly 2% should fail — and cannot calibrate the upper end, because no sampled issuer lands between 5% and 30%. A floor in the region of 10% is the natural starting proposal, to be tested against a wider sample before adoption.

### 5.3 The brief's Tier 3 questions, answered

| Question | Answer |
|---|---|
| Material AI business line versus an AI feature? | A **feature** improves the issuer's existing product and is bundled into its price. A **business line** is separately contracted and separately priced, and a customer can buy it as such. |
| Must AI be separately monetized? | **Yes** — under both routes. Internal use and bundled enhancement never qualify (E4, E5). |
| Is identifiable AI ARR sufficient? | For **Route A**, yes, as the scale indicator. For **Route B**, only if it also clears the relative floor. Salesforce is the case that shows why the qualifier is needed. |
| Are customer counts sufficient? | **Weak — corroborating only.** Counts without price or consumption say nothing about commercial scale. |
| Are cloud AI services sufficient even when bundled inside broader cloud? | **Yes, under Route A**, provided the AI service is separately available and metered. This is what admits the hyperscalers where 2D excluded them: Route A asks whether the service exists and is sold, not what share of cloud revenue it is. |
| Can strategic importance qualify without revenue separation? | **No.** Strategic importance is the softest possible evidence and would admit every issuer with an AI strategy. |
| What magnitude is necessary? | Route A: generally available and disclosed at scale. Route B: the relative floor. |
| Can an issuer qualify when the AI business is clearly material but disclosure does not permit exact attribution? | **Yes, under Route A** — this is the whole point of the redesign. Exact attribution is not required; a disclosed indicator of scale is. |

### 5.4 Meta — the exclusion that proves Tier 3 bites

Meta monetizes AI **internally**, in ad ranking and recommendation. Llama is distributed without charge; the Llama API was launched in **limited free preview**; revenue-sharing with model hosts is reported in secondary sources but not disclosed at scale; a Meta AI subscription has been discussed but not established; and a $1.4-trillion-by-2035 generative-AI figure that surfaced in litigation is a **forecast**, inadmissible under E8.

**Meta therefore fails both Tier 3 routes**: no generally available AI platform disclosed at scale (Route A), and no separately priced AI product with a disclosed figure (Route B). It fails Tier 1 and Tier 2 trivially.

**A broad AI equity index that excludes Meta will attract challenge, and the answer is precise:** Meta is among the largest *consumers* of AI and among the largest *spenders* on it, and UGAI measures neither consumption nor capex. The moment Meta discloses a commercially available, externally sold AI platform at scale, it qualifies mechanically. That outcome should be published as a worked example, because it is the clearest demonstration that the framework is a rule rather than a roster.

---

## 6. Tiers do not affect weights

**Recommendation: confirm the default. Tiers determine eligibility and attribution only.**

No tier multipliers, no tier budgets, no tier-specific caps, no fixed tier allocations. Reasons:

1. **Tiers encode evidence pathways, not economic magnitudes.** Tier 1 and Tier 2 differ in how an issuer proves its role, not in how much AI economy it represents. Multiplying a weight by a tier would give arithmetic meaning to a classification that has none.
2. **It would inject a view about which layer of the value chain deserves representation** — a view Urdais has no defensible basis for, exactly as the parent already reasons when rejecting tier quotas and exposure multipliers.
3. **It would make weights non-reproducible from capitalization**, breaking the property that makes UGAI auditable: as-of weight equals index shares times price times FX over market value, and nothing else.
4. **It would create a cliff at every tier boundary**, converting each contested classification into a weight discontinuity and giving every borderline decision a financial consequence.

No failure was found that tier weighting would remedy. The failure found in 2D was too few issuers, which tier weighting does not address.

---

## 7. Exclusions — breaking the framework deliberately

Each rule blocks a named failure mode from the brief's §21.

| # | Exclusion | Blocks |
|---|---|---|
| **E1** | **Customer demand.** AI end-market demand for an issuer's general-purpose product never qualifies it. The qualifying test is about the product, not the customer. | "Every company whose customers build AI": utilities, power generation, miners, construction, logistics, general semiconductors |
| **E2** | **Tools.** Supplying equipment, materials, chemicals, or EDA/IP used to *manufacture* qualifying components does not qualify. | "Every semiconductor manufacturer": ASML, Applied Materials, Lam, KLA, Tokyo Electron, ASM, Besi, photoresist and specialty-materials suppliers |
| **E3** | **Facilities.** Supplying land, buildings, colocation, electricity, or general building services (HVAC, switchgear, generators) to sites that host AI compute does not qualify. | "Every datacenter operator": Equinix, datacenter REITs, utilities, general electrical equipment |
| **E4** | **Internal use.** Using AI within the issuer's own operations, or to improve its own existing product, never qualifies. | "Every company that uses AI": Meta's ad ranking, retailers, banks, insurers |
| **E5** | **Features.** Embedding AI capability in an existing product without separate commercialization at material scale does not qualify. | "Every enterprise software company" |
| **E6** | **Branding and third-party classification.** Name, self-description, marketing, ETF or index membership, thematic scores, analyst classification and share-price behaviour never qualify. | "Every company whose CEO talks about AI": BigBear.ai-type cases |
| **E7** | **Deterministic automation.** Programmed automation without material dependence on learned perception or learned policy does not qualify. | "Every automation company": Fanuc, ABB, traditional industrial robotics, PLC and motion control |
| **E8** | **Forward-looking statements.** Guidance, targets, backlog, bookings, pipeline, TAM and forecasts never establish eligibility. They may corroborate. | Arista on a target alone; Aurora on a roadmap; Meta on a 2035 forecast |
| **E9** | **Pre-commercial.** No positive consolidated external revenue → research candidate, not a member. | Pre-revenue robotics and AV issuers |

**E1 and E2 are the two that do the most work, and they are the two most likely to be argued against**, because they exclude companies that are genuinely central to AI. That is the price of a boundary that does not move.

---

## 8. Evidence hierarchy, varying by tier

### 8.1 Three classes

**Establishing** (may satisfy a tier test): audited annual report; 10-K; 20-F; equivalent statutory annual filing; furnished 8-K earnings exhibit, 6-K, or official annual results release meeting 2D §10.2's five conditions.

**Corroborating** (may support, challenge, or trigger review; never sufficient alone): earnings presentations; management commentary and prepared call remarks; product documentation and datasheets; investor presentations; technical specifications.

**Discovery only** (never evidence): news; analyst research; ETF and index classifications; third-party thematic scores; market commentary.

### 8.2 Where it legitimately varies by tier

The brief is right that categories do not share a reporting structure, and the variation is in **which prong** each class may satisfy — never in whether an establishing source is required.

| | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| **Qualifying activity** (Prong A) | Establishing source required — the product enumeration comes from the filing | **Establishing source for the product's existence; corroborating sources admissible for its technical characterization** | Establishing source required — the offering must be shown to be sold |
| **Materiality** (Prong B) | Establishing source | Establishing source, per §4.3 Prong B | Establishing source for the scale indicator |

**The one genuine relaxation is Tier 2's technical characterization.** Whether a product is an accelerator, HBM, or an AI-cluster transceiver is a *technical* fact that filings state imprecisely and datasheets state exactly. Permitting product documentation to characterize a product — while still requiring a filing to establish that the product exists and is material — is the minimum needed to make Tier 2 workable, and it does not admit judgement about magnitude. **It never permits product documentation to establish materiality**, which is where softness would actually bite.

---

## 9. Robotics and autonomous systems

### 9.1 The rule

> A robotic or autonomous system qualifies where its **principal contracted functionality materially depends on learned perception or learned policy** — that is, where the system's behaviour in variable or unstructured conditions is derived from data rather than from pre-programmed trajectories, fixed rule sets, or human teleoperation.

Two clarifications that make it operable:

- **Dependence, not purity.** Almost every real system mixes learned components with deterministic scheduling and control. The test is whether the contracted functionality *materially depends* on the learned component, not whether the system is entirely learned. A "core value is AI" test is unfalsifiable; a dependence test is not.
- **Teleoperation is not autonomy.** A system whose actions are directed by a human operator in real time does not depend on learned policy, however sophisticated its mechanics.

### 9.2 Application

| Issuer | Basis | Outcome |
|---|---|---|
| **Symbotic** | Discloses an "A.I.-powered robotic and software platform": machine vision and AI-driven decision-making responding to variable real-world conditions (damaged cases, inconsistent dimensions, shifting demand), autonomous mobile robots, vision-enabled de-palletizing | **Qualifies** — the contracted functionality depends materially on learned perception |
| **Mobileye** | ADAS and autonomous driving built on learned perception | **Qualifies** (disclosure not verified this phase) |
| **Serve Robotics** | Sidewalk delivery depends on learned perception | Qualifies on taxonomy; **materiality and investability likely fail** |
| **Aurora Innovation** | Autonomous trucking, learned perception and planning | Qualifies on taxonomy; **fails E9** — no material commercial revenue |
| **Intuitive Surgical** | da Vinci's principal contracted functionality is surgeon-directed **teleoperation** | **Excluded** — no dependence on learned policy. *Characterization to verify against the 10-K before reliance.* |
| **Fanuc, ABB** | Industrial arms executing programmed trajectories and fixed rule sets | **Excluded** under E7 |

**Scope consequence the founder should see.** The dependence test admits **warehouse robotics as a category**, because modern warehouse systems use learned vision for handling variability. If that is broader than intended, the alternative is a stricter test requiring the learned component to be the *primary* source of the system's economic value — which would exclude Symbotic, and which I do not recommend, because it is not objectively assessable. **The choice of test decides the outcome, and it is a founder decision** (register row 6).

**Intuitive Surgical's exclusion is the proof the rule bites**: it is unambiguously "surgical robotics", and it is excluded because the robot does not decide anything.

---

## 10. Datacenter and energy boundary

**Rule: outside UGAI, with one narrow conditional door.**

| Category | Treatment |
|---|---|
| Datacenter operators and colocation (Equinix, REITs) | **Excluded (E3).** They supply space, power and interconnection to whatever the tenant installs. The product is a facility, not part of the compute system. |
| Power generation and utilities | **Excluded categorically (E1, E3).** The product is electricity, a fungible commodity. |
| Electrical equipment, switchgear, transformers, generators | **Excluded (E3)** — general building infrastructure. |
| Cooling and thermal management | **Excluded unless** the issuer supplies a product **dedicated to accelerated-compute deployments** (direct-to-chip or immersion liquid cooling for accelerator racks) **and** satisfies Prong B materiality from an establishing source. |

### 10.1 The two tests the brief required

**Equinix → excluded.** Colocation for all workloads; no product embodied in an AI compute system; no separately monetized AI platform. Consistent with 2D and with the parent's existing exclusion of generic datacenter ownership.

**Constellation Energy → excluded, and it is the more instructive case.** Constellation has disclosed very large AI-related commercial arrangements — a 20-year agreement with Microsoft reported at $16bn, a 20-year PPA with Meta for the 1.1 GW Clinton plant. **Large, disclosed, AI-driven contracts do not qualify it**, because its product is electricity and the AI exposure is a *customer relationship*: precisely the supplier-to-NVIDIA anti-pattern (E1). Admitting it would admit every utility with a hyperscaler PPA, then every grid and generation company, and UGAI would become an infrastructure index — the failure mode the brief names.

**Vertiv → excluded on materiality evidence, not on category.** Vertiv is the conditional door's test case: it genuinely supplies liquid cooling dedicated to accelerated-compute racks, which satisfies the dedication test. But against roughly $10.2bn of 2025 revenue it discloses **no liquid-cooling revenue figure** — the strongest available statements are that liquid cooling "more than doubled" in a quarter, plus backlog and growth targets, all corroborating or forward-looking (E8). **Prong B is unmet, so Vertiv is `insufficient evidence` and reviewable if it ever discloses the figure.** This is the right shape: the door exists, and it is shut by an evidence rule rather than by a preference.

---

## 11. Photonics and networking boundary

**Rule:** qualifies under Tier 2 Prong A3 where the product is an interconnect component **deployed inside AI compute clusters**. Excluded where the product is carrier, transport, access, or enterprise campus networking.

| Qualifying | Excluded |
|---|---|
| AI fabric switching silicon and systems (scale-up and scale-out) | Carrier and transport networking; optical line systems |
| High-speed optical transceivers at AI-cluster rates (800G/1.6T class) sold into AI datacenters | Telecom access, metro and long-haul optics |
| Silicon photonics and co-packaged optics for accelerator interconnect | Enterprise campus switching and Wi-Fi |
| Retimers, AI connectivity silicon, active copper and optical cabling for accelerator fabrics | Consumer and industrial connectivity |

**The distinguishing question is the deployment location**, which is objective: is the product installed inside the compute cluster joining accelerators, or in a network carrying traffic between sites and users? Generic telecom networking does not qualify, as the brief anticipates.

Prong B still applies. A diversified optical component maker with both datacenter and telecom businesses qualifies only where the AI-datacenter family is material on an establishing source. **Arista is the clean case**: it discloses an AI-specific product category ("AI Fabrics") against $9bn of 2025 revenue — though note its most quantified figure is a **forward target of at least $3.5bn for FY2026**, which is inadmissible under E8, so eligibility must rest on realized AI networking disclosure rather than the target.

---

## 12. Cloud infrastructure, and the Tier 2 / Tier 3 overlap

Hyperscalers straddle the boundary genuinely: Amazon designs Trainium and Inferentia (Tier 2 Prong A1) and sells Bedrock and SageMaker (Tier 3 Route A). Alphabet designs TPUs and sells Vertex AI.

**Tiers are not mutually exclusive, and the resolution is a deterministic primary tier plus secondary tags** (§13).

**Deterministic rule for cloud AI compute:** selling *access to* AI compute as a metered service is **Tier 3 Route A** (platform). Supplying the *hardware embodied in* AI compute systems is **Tier 2**. An issuer doing both receives its primary tier from its principal qualifying activity as presented in its own segment structure — which puts Amazon, Alphabet and Microsoft in Tier 3 with a Tier 2 tag, because their accelerator design serves their own platforms and is not a disclosed merchant business.

**CoreWeave is the mirror case**: it sells access to AI compute (Route A), but its *entire* commercial identity is that, so **Tier 1 takes precedence** with a Tier 3 tag.

---

## 13. Tier assignment

**Recommendation: exactly one primary eligibility tier, plus optional secondary attribution tags.**

**Primary tier, determined in order:**

1. **Tier 1 if the issuer satisfies Tier 1.** Tier 1 is a whole-issuer test — all material activity qualifies — so it can only be satisfied by one kind of issuer and never conflicts with the others.
2. **Otherwise, between Tier 2 and Tier 3: the tier of the issuer's largest qualifying activity**, by disclosed revenue where disclosed, and otherwise by the principal business presented in the issuer's own segment structure.

Secondary tags are recorded for attribution and published as analysis. **They never affect membership, weight, or the primary tier**, so no double counting arises: one issuer, one membership, one weight, one primary tier.

Why this and not multi-tier membership: membership must be deterministic for the index to be reproducible, and a company appearing in two tiers would either double-count its capitalization or require a split-weight convention with no economic basis.

---

## 14. The 37-issuer pressure test

**A methodology sample, not a constituent list.** Rejections carry as much weight as admissions. Confidence: **H** verified against primary filings (this phase or 2D); **M** verified in part; **L** rule application against a publicly known product category, issuer disclosure *not* verified this phase.

| # | Issuer | Primary listing | Candidate tier | Qualifying activity | Primary evidence | Materiality evidence | Eligible? | Primary tier | Secondary tags | Conf. | Key caveat |
|---|---|---|---|---|---|---|:-:|---|---|:-:|---|
| 1 | **NVIDIA** | NVDA `XNAS` | 2 | Data-centre GPUs/accelerators (A1) | FY26 10-K | Compute & Networking $193.5B of $215.9B; issuer attributes demand to AI/accelerated computing | **Yes** | **2** | — | H | **Moves from rejected → eligible.** Segment is multi-workload, but the *product* is an accelerator |
| 2 | **TSMC** | 2330 `XTAI` | 2 | Fabrication + CoWoS advanced packaging of accelerators (A5) | 2025 annual report | HPC platform 58% of revenue; disclosed advanced-packaging capacity expansion | **Yes** | **2** | — | H | Qualifies because it *makes the component*, not because it is advanced |
| 3 | **Broadcom** | AVGO `XNAS` | 2 | Custom XPUs, AI networking silicon (A1, A3) | FY25 10-K / release | Semiconductor Solutions $36.9B of $63.9B; AI semiconductor revenue disclosed quarterly | **Yes** | **2** | — | H | No longer needs a full-year AI numerator |
| 4 | **AMD** | AMD `XNAS` | 2 | Instinct accelerators (A1) | FY25 10-K | Data Center $16.6B; issuer attributes growth to Instinct | **Yes** | **2** | — | H | EPYC CPUs remain non-qualifying; the accelerator family carries it |
| 5 | **Micron** | MU `XNAS` | 2 | HBM (A2) | FY25 10-K + calls | HBM ≈ $2B in Q4 FY25; disclosed capacity allocation | **Yes** | **2** | — | H | Qualifies on HBM, not on being a memory maker. Prong B evidence is the weakest of the semis |
| 6 | **SK hynix** | 000660 `XKRX` | 2 | HBM (A2) | Korean statutory filings | HBM disclosed in results materials | **Likely** | **2** | — | L | Not verified. Venue not launch-ready (2C) |
| 7 | **Samsung Electronics** | 005930 `XKRX` | 2 | HBM + foundry (A2, A5) | Korean statutory filings | Diversified into consumer devices | **Contested** | **2** | 3 | L | Prong B hard: HBM and foundry inside a vast consumer business |
| 8 | **Super Micro** | SMCI `XNAS` | 2 | Rack-scale accelerated compute systems (A4) | FY25 10-K | $21.97B, +46.6%, growth attributed to GPU servers and rack-scale; systems 97% of sales | **Yes** | **2** | — | H | Qualifies on the accelerated family, not on being a server maker |
| 9 | **Arista Networks** | ANET `XNYS` | 2 | AI fabric switching (A3) | FY25 results | $9B revenue; discloses AI networking as a product category | **Yes** | **2** | — | H | Strongest figure is a **forward target** — inadmissible (E8). Must rest on realized disclosure |
| 10 | **Marvell** | MRVL `XNAS` | 2 | Custom AI silicon, interconnect (A1, A3) | 10-K | Data-centre AI disclosed | **Likely** | **2** | — | L | Not verified |
| 11 | **Astera Labs** | ALAB `XNAS` | 2 | AI connectivity silicon (A3) | 10-K | Whole business is accelerator connectivity | **Likely Tier 1** | **1** | 2 | L | Not verified; may satisfy the whole-issuer test |
| 12 | **Credo Technology** | CRDO `XNAS` | 2 | High-speed AI connectivity (A3) | 10-K | AI datacenter exposure | **Likely** | **2** | — | L | Not verified |
| 13 | **Coherent** | COHR `XNYS` | 2 | Datacenter optical transceivers (A3) | 10-K | Diversified: telecom, industrial lasers | **Contested** | **2** | — | L | Prong B: AI-datacenter family must be material vs telecom/industrial |
| 14 | **Arm Holdings** | ARM `XNAS` | — | CPU IP licensed across all categories | 20-F/10-K | No dedicated AI family material | **No** | — | — | M | **E2** — IP used to build chips; not embodied as a dedicated AI component |
| 15 | **ASML** | ASML `XAMS` | — | EUV lithography | 20-F | n/a | **No** | — | — | H | **E2.** Sells the machines that make chips. Maximally critical, excluded — §4.5 |
| 16 | **Applied Materials** | AMAT `XNAS` | — | Deposition/etch equipment | 10-K | n/a | **No** | — | — | H | **E2**, identically |
| 17 | **Besi / ASMPT** | `XAMS` / `XHKG` | — | Advanced-packaging **equipment** | Statutory | n/a | **No** | — | — | L | **E2.** TSMC *performs* packaging and qualifies; the tool vendor does not |
| 18 | **Dell Technologies** | DELL `XNYS` | 2 | AI server systems (A4) | 10-K | Mostly general infrastructure and PCs; AI server backlog disclosed but forward-looking | **Contested** | **2** | — | L | Prong B: realized AI-system revenue vs disclosed *backlog* (E8) |
| 19 | **Hewlett Packard Enterprise** | HPE `XNYS` | 2 | AI server systems (A4) | 10-K | Diversified | **Contested** | **2** | — | L | As Dell |
| 20 | **Microsoft** | MSFT `XNAS` | 3 | AI platform: Azure AI, model APIs (Route A) | FY26 10-K | Disclosed AI run rate (~$37B) — admissible as a scale indicator, §1.2 | **Yes** | **3** | 2 | H | **Moves from rejected → eligible.** Run rate evidences scale, not a ratio |
| 21 | **Alphabet** | GOOGL `XNAS` | 3 | Vertex AI, Gemini API (Route A); TPUs (A1) | 10-K | Google Cloud growth attributed to AI | **Yes** | **3** | 2 | M | TPU is captive, not merchant → Tier 2 tag only |
| 22 | **Amazon** | AMZN `XNAS` | 3 | Bedrock, SageMaker, AI compute (Route A); Trainium (A1) | 10-K | Disclosed AI annualized revenue (~$25B) | **Yes** | **3** | 2 | M | Would have **failed** a relative-materiality test at ~3.5% — §5.1 |
| 23 | **Oracle** | ORCL `XNYS` | 3 | OCI AI infrastructure (Route A) | 10-K | AI-attributed cloud growth and RPO | **Likely** | **3** | — | L | Not verified. RPO is forward-looking (E8); needs a realized indicator |
| 24 | **Meta Platforms** | META `XNAS` | 3 | — | 10-K | Llama free; API in limited free preview; subscription not established; $1.4T figure is a forecast | **No** | — | — | H | **The exclusion that proves the rule.** Largest AI consumer and spender; sells no AI platform at scale (§5.4) |
| 25 | **Salesforce** | CRM `XNYS` | 3 | Agentforce (Route B) | FY26 8-K exhibit | **Agentforce ARR $800M disclosed**, ~2% of revenue | **No** | — | — | H | **The calibration case.** Separately monetized and disclosed — and immaterial to the issuer (§5.1) |
| 26 | **Adobe** | ADBE `XNAS` | 3 | Firefly (Route B) | 10-K | AI-influenced metrics are broad; standalone AI ARR small relative to revenue | **No** | — | — | L | As Salesforce. Not verified |
| 27 | **ServiceNow** | NOW `XNYS` | 3 | Now Assist (Route B) | 10-K | Discloses Now Assist ACV; small relative to revenue | **No** | — | — | L | As Salesforce. Not verified |
| 28 | **Palantir** | PLTR `XNAS` | 1 | Gotham, Foundry, AIP | FY25 10-K | $4,475.4M; platforms are the business | **Yes** | **1** | 3 | H | **Moves from insufficient evidence → eligible** via condition 3 (§3.3) |
| 29 | **CoreWeave** | CRWV `XNAS` | 1 | AI-native cloud | FY25 10-K | $5,130M, whole business | **Yes** | **1** | 3 | H | Microsoft ≈ 67% of revenue — publish as a diagnostic |
| 30 | **C3.ai** | AI `XNYS` | 1 | Enterprise AI applications | FY26 10-K | Subscriptions 91%, services 9% | **Yes** | **1** | — | H | FY26 `R_i` not confirmed; verdict independent of it |
| 31 | **SoundHound AI** | SOUN `XNAS` | 1 | Voice/conversational AI | FY25 10-K | $168.9M | **Pending** | **1?** | — | M | Condition 4: Interactions' human-in-the-loop service revenue unresolved |
| 32 | **BigBear.ai** | BBAI `XNYS` | 1 | Claimed decision intelligence | FY25 10-K | FAA **IT services**; Army legacy modernization; 22.3% GM | **No** | — | — | H | **The loophole proof.** Fails conditions 2–4 and **E6** |
| 33 | **Symbotic** | SYM `XNAS` | 1 | AI-powered warehouse robotics | FY25 10-K | Machine vision and AI decision-making for variable conditions | **Yes** | **1** | — | M | Admits warehouse robotics as a category — a scope consequence (§9.2) |
| 34 | **Mobileye** | MBLY `XNAS` | 1 | ADAS / AV on learned perception | 10-K/20-F | Whole business | **Likely** | **1** | — | L | Not verified |
| 35 | **Intuitive Surgical** | ISRG `XNAS` | — | Surgeon-directed teleoperation | 10-K | n/a | **No** | — | — | L | **Proof the robotics rule bites**: "surgical robotics", excluded because the robot decides nothing. Verify characterization |
| 36 | **Fanuc** | 6954 `XJPX` | — | Programmed industrial automation | Statutory | n/a | **No** | — | — | L | **E7** |
| 37 | **Equinix** | EQIX `XNAS` | — | Colocation | 10-K | n/a | **No** | — | — | H | **E3.** Supplies the facility, not the compute system |
| 38 | **Vertiv** | VRT `XNYS` | 2? | Liquid cooling dedicated to accelerator racks | FY25 results | ~$10.2B revenue; **no liquid-cooling revenue disclosed** | **Insufficient evidence** | — | — | H | The conditional door, shut by Prong B (§10) |
| 39 | **Constellation Energy** | CEG `XNAS` | — | Electricity | 10-K | Discloses $16bn Microsoft agreement, Meta PPA | **No** | — | — | H | **E1.** Huge disclosed AI contracts do not qualify a commodity supplier (§10) |

*(39 rows; the brief required at least 30.)*

---

## 15. Old versus new eligibility

| Movement | Issuers | Why the outcome changed |
|---|---|---|
| **Insufficient evidence → eligible** | NVIDIA, TSMC, Broadcom, AMD, Micron, Super Micro, Arista, Microsoft, Alphabet, Amazon | **The question changed, not the evidence standard.** 2D asked "what share of revenue is AI?" and needed a numerator none of them disclose. 2E asks "does the issuer supply something embodied in AI compute systems, materially?" (Tier 2) or "does it sell AI capability to others at disclosed scale?" (Tier 3) — both answerable from existing disclosure. |
| **Insufficient evidence → eligible** | Palantir | Tier 1 condition 3: an undisclosed line that the filing presents as supporting the issuer's own qualifying products is presumed ancillary. |
| **Untested → eligible** | Symbotic, Mobileye | Robotics taxonomy defined for the first time; learned-perception dependence test. |
| **Rejected → still rejected** | BigBear.ai, Equinix, Fanuc | Independent IT-services revenue (E6, conditions 2–4); facility supply (E3); deterministic automation (E7). |
| **Eligible-equivalent → rejected** | **Meta** | 2D excluded it on the run-rate prohibition. 2E *lifts* that prohibition for materiality — and Meta still fails, because it has **no externally sold AI platform at scale**. A different and more fundamental reason. |
| **New rejection** | **Salesforce** | 2D never reached it. 2E's Tier 3 Route B rejects it on relative materiality: $800M disclosed Agentforce ARR at ~2% of revenue. |
| **New rejection** | ASML, Applied Materials, Besi, Arm | 2D excluded them for want of a numerator. 2E excludes them **on a principle** — E2, the tool boundary — which is a stronger and more durable basis. |
| **New rejection** | Constellation Energy, Vertiv | Boundary cases 2D never tested. Category exclusion (E1) and materiality failure (Prong B) respectively. |

**Why this is methodological rather than arbitrary.** Three things did *not* change: the evidence hierarchy still requires establishing sources; forward-looking statements are still inadmissible; branding, third-party classification and share-price behaviour are still worthless. What changed is the **question asked of that evidence**. The 2D rule required issuers to disclose something most do not disclose (an AI revenue split). The 2E rule requires them to disclose things they already do disclose (product families, segment attribution, capacity allocation, platform availability and scale). **The framework moved from a test the market cannot satisfy to a test the market can, without lowering the standard of proof.**

The tell that this is a rule and not a roster: it admits NVIDIA and excludes ASML; it admits Microsoft and excludes Meta; it admits Palantir and excludes BigBear.ai; it admits Symbotic and excludes Intuitive Surgical. **Every one of those pairs is separated by a stated rule, and in each pair the excluded company is one a "vibes" approach would have admitted.**

---

## 16. Universe size

| | Count in sample |
|---|---|
| Sample size | 39 |
| **Eligible (yes or likely)** | **20** |
| Tier 1 primary | 7 — Palantir, CoreWeave, C3.ai, Symbotic, Mobileye, Astera Labs, (SoundHound pending) |
| Tier 2 primary | 10 — NVIDIA, TSMC, Broadcom, AMD, Micron, SK hynix, Super Micro, Arista, Marvell, Credo |
| Tier 3 primary | 4 — Microsoft, Alphabet, Amazon, Oracle |
| Contested | 4 — Samsung, Coherent, Dell, HPE |
| Insufficient evidence | 1 — Vertiv |
| **Rejected** | **9** — Meta, Salesforce, Adobe, ServiceNow, Arm, ASML, Applied Materials, Besi, BigBear.ai, Equinix, Fanuc, Intuitive Surgical, Constellation Energy *(13 rows; some grouped)* |

**Extrapolation, stated as an estimate and not a finding.** The sample deliberately over-samples boundary cases, so its ~51% eligibility rate is not the population rate. The eligible categories — accelerator and AI-ASIC designers, HBM makers, advanced foundry and packaging, AI cluster networking and optics, accelerated-system integrators, AI-native software and platforms, AI-native cloud, qualifying robotics, and hyperscale AI platforms — plausibly contain **on the order of 80 to 200 listed issuers globally** at investable scale. That is a judgement from category breadth, not a count, and **§18's conclusion does not depend on the upper end**: it depends only on comfortably exceeding 13.

**Concentration is the new problem, and it replaces the old one.** The eligible set includes several of the largest listed companies in the world. Uncapped, the top five would very likely exceed half the index, and the top one would exceed the cap by a wide margin. **No indicative weight table is presented, because computing one requires float-adjusted capitalization Urdais does not hold and may not retain (2C), and asserting approximate weights would be the fake precision the brief forbids.** The structural conclusion needs no numbers: **the issuer cap moves from mathematically impossible to binding and essential.**

**Sector and geographic composition of the eligible set.** Sectors: semiconductors and semiconductor systems dominate by count (10 of 20), then software and platforms (7), then robotics (2–3). No utilities, no REITs, no industrials, no materials — which is the evidence that the exclusions held. Geography: US-listed dominates; Taiwan (TSMC), South Korea (SK hynix, Samsung), Netherlands-listed and Japan appear, but **Japan and Europe contribute no eligible issuer in this sample** — Fanuc is rejected and ASML is rejected, which is a real finding about where AI supply is listed, not a sampling artefact. Mainland China and Hong Kong were not sampled and should be (§17).

---

## 17. Global scope — thematic eligibility versus launch availability

Kept strictly separate from 2C's licensing work, which is not reopened.

| Market | Thematic eligibility under 2E | Launch availability (2C) |
|---|---|---|
| **US** | Very high — most Tier 1 and Tier 3, many Tier 2 | Launch candidate |
| **Taiwan** | High — TSMC; the single most important Tier 2 issuer outside the US | Launch candidate, **FX-gated** (ECB publishes no TWD) |
| **South Korea** | High — SK hynix, Samsung (HBM, foundry) | Needs negotiation |
| **Japan** | **Low on this sample** — Fanuc rejected; semiconductor materials and tool vendors excluded by E2 | Launch candidate |
| **Europe (NL)** | **Low** — ASML excluded by E2, which removes Europe's largest AI-adjacent issuer | Needs negotiation |
| **UK** | Low — Arm excluded by E2 | Launch candidate |
| **Canada** | Low on this sample | Needs negotiation |
| **China / Hong Kong** | **Unassessed — a real gap.** Baidu, Alibaba and Tencent plausibly satisfy Tier 3 Route A; SMIC plausibly Tier 2 | **Out of scope for launch** (2C) |

**Two findings worth the founder's attention.**

First, **E2 has a geographic side-effect that was not designed and should be acknowledged**: excluding the semiconductor tool complex removes ASML (Netherlands), Arm (UK), and much of Japan's contribution. The exclusion is still correct — it is what prevents a semiconductor index — but it means UGAI's non-US exposure will rest heavily on Taiwan and Korea, both of which are FX- or licence-gated. **The tool boundary and the "Global" claim interact, and the interaction is adverse.**

Second, **the China gap is now a thematic gap as well as a licensing one.** 2C established that data exists and access is the constraint; 2E adds that the Chinese AI platform issuers are plausibly *eligible*, which means excluding them is excluding eligible constituents rather than merely unavailable data. **Recommendation: sample Baidu, Alibaba, Tencent and SMIC against the tier tests before the amendment PR**, so that the venue register records an eligibility-aware decision.

---

## 18. Issuer cap `c` — feasibility restored

| `c` | Minimum issuers for a valid capped vector (`n ≥ 1/c`) | Eligible in sample (20) | Plausible universe (80–200) | Feasible? |
|---|---|:-:|:-:|:-:|
| **8%** | 13 | 20 | ✓✓ | **Yes** |
| **10%** | 10 | 20 | ✓✓ | **Yes** |

**Both values are feasible, and the sample alone clears both.** Phase 2D's blocking arithmetic is resolved.

**But the cap's role inverts.** In 2D it was infeasible; now it is the **primary control on an index that would otherwise be dominated by a handful of mega-caps**. Two consequences:

1. **`c` will bind on several issuers simultaneously**, probably five to eight. That is normal for a capped thematic index but has two effects the methodology already anticipates and must disclose: the cap only binds at scheduled resets, so published as-of concentration can exceed `c` for up to a quarter (`ugai.md` weight drift); and a large redistributed mass flows to uncapped issuers, making mid-cap weights sensitive to the cap value.
2. **8% versus 10% is now a real choice with observable consequences**, where in 2D it was vacuous. **Recommendation: hold 8% provisionally** — tighter concentration control is the point of having a cap, and 2D's warning stands that a cap loosened to make the index work is not a control. **Final selection requires the capped-versus-uncapped concentration test on point-in-time float data**, which needs the licensed dataset (2C) and cannot be run now.

**Retain `n × c ≥ 1` as a published launch gate** regardless of the value chosen. It cost nothing to state in 2D and it is what caught the problem.

**5/10/40:** 2D recommended diagnostic-only, and 2E *strengthens* the case for re-examination — a top-heavy universe is exactly where 5/10/40 might bite where a single cap does not. **Recommendation unchanged: publish it as a diagnostic alongside `1/Σwᵢ²`, top-1 and top-5; revisit bindingness only if the single cap demonstrably fails on real float data.**

---

## 19. The role of `τ`

**Recommendation: retain, demoted to three narrow roles. Do not eliminate; do not restore as a gate.**

| Role | Use |
|---|---|
| **Tier 1 safe harbour** | Disclosed qualifying revenue ≥ 75% of consolidated revenue deems the Tier 1 conditions satisfied, avoiding the enumeration exercise for obvious pure plays. |
| **Tier 3 Route B materiality test** | The relative floor that rejects Salesforce at ~2%. This is the only place a ratio still gates admission, and it gates only one route of one tier. |
| **Published diagnostic** | Where an issuer discloses qualifying revenue, publish `r_i_lower` as constituent attribution. It informs readers without affecting membership or weight. |

**Why not eliminate it.** Where a ratio *is* disclosed it is the single best evidence of materiality, and discarding it would mean ignoring the strongest available evidence in the cases where it exists. **Why not restore it.** Phase 2D established empirically that it is unavailable for almost every diversified issuer, and 2E's whole design is a response to that.

**Both numeric parameters — the 75% safe harbour and the Route B floor — are calibration parameters requiring founder approval, and this sample cannot calibrate either.** No sampled issuer's disclosed ratio falls between roughly 10% and 100%: the pure plays are near 100% and Salesforce is near 2%. That is the same discriminating-power problem 2D found with τ, now confined to two narrow tests where its consequences are bounded. **Honest position: propose 75% and 10% as starting values, adopt them explicitly as conventions rather than findings, and record that neither is empirically calibrated.**

---

## 20. Investability

Unchanged and deliberately not optimized here. The sequence remains `thematic eligibility → investability → weighting`. **Liquidity and float are never used to decide whether a company is "AI."**

2B's provisional parameters are retained as provisional: entry — accessible free-float capitalization ≥ $500M, 3-month ADTV ≥ $5M, sessions traded ≥ 90%, free float ≥ 15%, 3 complete calendar months of listing history; retention — ≥ $400M, ≥ $3M, ≥ 80%, ≥ 10%.

**One change in what the screens will now do.** 2D found investability untestable because eligibility rejected everyone first. Under 2E the screens acquire real work: the eligible set now includes small AI-native issuers (Serve Robotics, and SoundHound if it survives condition 4) where float, ADTV and the 15% float floor will genuinely bind. **CoreWeave remains the case to watch** — a recent IPO with concentrated strategic ownership against a 15% float floor. **Recommendation: re-test the screens against the tiered eligible set once the float dataset is licensed**, which is the first point at which they can be tested at all.

---

## 21. Proposed structure for `docs/methodology/ai-equity-universe.md`

The current document is organized around the revenue-share gate, so restructuring is cleaner than editing. Proposed organization, following the brief's outline:

1. **Objective** — what the universe is and is not; that it is a shared primitive, not an index.
2. **AI value-chain scope** — the diagram and the boundary statement.
3. **Tier framework** — three tiers as eligibility routes; tiers do not affect weight; one primary tier plus secondary tags.
4. **Tier 1 eligibility** — definition, four conditions, safe harbour.
5. **Tier 2 eligibility** — definition, Prong A (five embodiment categories), Prong B (four materiality routes), the one-step rule.
6. **Tier 3 eligibility** — definition, Route A platform, Route B application with the relative floor.
7. **Evidence hierarchy** — establishing / corroborating / discovery, and the per-tier variation table.
8. **Materiality** — the common requirement, and how it differs by tier.
9. **Exclusions** — E1–E9 as numbered rules with their rationale.
10. **Robotics and autonomous systems** — the learned-dependence rule; teleoperation; deterministic automation.
11. **Semiconductor boundary** — the tool boundary; HBM vs commodity memory; foundry and packaging; CPUs; worked exclusions.
12. **Cloud and platform boundary** — Tier 2/Tier 3 overlap; the deterministic primary-tier rule.
13. **Datacenter and energy boundary** — exclusion, and the narrow dedicated-cooling door.
14. **Photonics and networking boundary** — deployment-location test; AI cluster vs carrier.
15. **Investability** — unchanged, provisional.
16. **Representative security** — unchanged from 2D §19, including ordered tie-breakers.
17. **Venue and access register** — reference investor; versioned register; eligibility-versus-availability separation.
18. **Weighting interface to UGAI** — accessible free-float capitalization, issuer cap, feasibility gate, what a snapshot publishes.
19. **Governance** — reconstitution cadence, announcement and effective timestamps, corporate actions and exceptional events, classification review, corrections.
20. **Limitations** — the full disclosure set: tool-boundary exclusions; internal-AI-use and capex exclusions; vendor float estimates; geographic consequences of E2; that the universe is not an additive measure of AI economy size.

**What is deleted:** the Material AI Exposure section's role as the primary gate, the exposure-tier labels (`majority`/`material exposure verified`) which are superseded by the three tiers, and the τ open question.

**What is retained largely intact:** Decision Model, Conceptual Entity Model, Security Eligibility, Free Float and Capitalization, Base Weighting, Concentration Controls, Reconstitution, IPOs, Corporate Actions and Exceptional Events, Removal, Classification Review, Downstream Weight Renormalization, Historical Membership and Lineage, Source Hierarchy.

**Version: 0.3.0-draft** (0.2.0 was 2D's proposal, never applied). No effective date until approved.

---

## 22. Changes required in `ugai.md`

Minimal, as intended. The calculation is untouched.

1. **Parent Universe Inheritance** — replace "exposure tiers" with "exposure tiers (Tier 1 AI-native, Tier 2 AI infrastructure, Tier 3 AI platform) and secondary attribution tags", retaining that they are carried for attribution and reporting only and **do not affect calculation**. This sentence already exists and only needs its vocabulary updated.
2. **Purpose and Scope** — update the limitation paragraph: UGAI measures the equity-market performance of issuers admitted under a **tiered AI value-chain exposure framework**, not issuers' AI revenue share. Retain, and strengthen, the existing statement that the level must not be presented as a valuation of AI activity.
3. **Published Values** — add tier and secondary tags to the constituent attribution published with as-of weights, **subject to the §20-of-2C disclosure constraints**.
4. **Data Requirements** — `UGAIConstituentSnapshot` carries each constituent's primary tier and secondary tags.
5. **Limitations / Open Questions** — carry forward 2C's publication-granularity question, and add that UGAI's constituents are admitted on role-based exposure, so the index includes issuers for whom AI is a minority of revenue and excludes issuers who consume or fund AI heavily.
6. **Version: 0.2.0-draft.** No effective date.

**Explicitly unchanged:** the divisor, index shares, weight drift, corporate actions, additions and deletions, both return series, currency, calendar, dividends, status model, corrections, missing data, and versioning mechanics.

---

## 23. Founder decision register

**Nothing below is final. Every row requires explicit approval before it becomes methodology.**

| # | Decision | Recommendation | Alternative tested | Consequence | Approval |
|---|---|---|---|---|---|
| 1 | **Three-tier model** | **Adopt.** Tiers as eligibility routes: Tier 1 AI-native, Tier 2 AI infrastructure (embodiment), Tier 3 AI platform/application | Single universal gate (2D — produced 2–4 issuers); two tiers; five tiers | Universe becomes viable; `c` feasible; index broad without being a technology index | **Yes** |
| 2 | **Tier 1 materiality** | **Four conditions + 75% safe harbour**, with condition 3 (ancillary-support) resolving undisclosed residual lines | "Every line must qualify" (2D — rejected Palantir); "core identity" (unfalsifiable) | Palantir admitted, BigBear.ai rejected, both by rule. **75% is an uncalibrated convention** | **Yes** |
| 3 | **Tier 2 qualification** | **Embodiment (one step) + materiality.** Product embodied in AI compute systems, or the manufacture of one | AI end-market demand (admits utilities); technological criticality (admits whole toolchain); revenue share (2D — admitted nobody) | NVIDIA, TSMC, Broadcom, AMD, Micron, Super Micro, Arista admitted. **ASML, Applied Materials, Arm, packaging-tool vendors excluded** | **Yes** |
| 4 | **Tier 3 qualification** | **Route A platform (AI sold to others, disclosed at scale) + Route B application (separately priced, clears a relative floor ~10%)** | Separately-monetized-plus-disclosed alone (admits Salesforce and every software company); relative floor alone (excludes Amazon) | Microsoft, Alphabet, Amazon, Oracle admitted. **Meta and Salesforce rejected.** Floor is uncalibrated | **Yes** |
| 5 | **Role of `τ`** | **Demote to three roles**: Tier 1 safe harbour, Tier 3 Route B floor, published diagnostic. Never a universal gate | Eliminate entirely (discards the best evidence where it exists); restore as gate (2D's failure) | Ratio survives only where disclosed and only in bounded roles | **Yes** |
| 6 | **Robotics scope** | **Material dependence on learned perception or policy.** Teleoperation and deterministic automation excluded | "Primary source of economic value" (excludes Symbotic, not objectively assessable); include all robotics (admits Fanuc) | Symbotic and Mobileye admitted; **Fanuc, ABB, Intuitive Surgical excluded. Admits warehouse robotics as a category** | **Yes** |
| 7 | **Semiconductor scope** | **Cut at the tool boundary (E2).** Components and their manufacture in; equipment, materials, EDA, IP out | Include semicap (then materials, then chemicals → semiconductor index) | Keeps the universe recognizable. **Side-effect: removes ASML, Arm, and much of Europe/Japan/UK exposure (§17)** | **Yes** |
| 8 | **Hyperscaler treatment** | **Tier 3 Route A**, with Tier 2 secondary tags for captive accelerator design. Run rates admissible as scale evidence, not as ratio numerators | Exclude (2D); Tier 2 primary (misstates their economic role) | Microsoft, Alphabet, Amazon admitted; **Meta still excluded** for having no external AI platform at scale | **Yes** |
| 9 | **Datacenter / energy boundary** | **Outside UGAI (E3), with a narrow dedicated-accelerator-cooling door gated on disclosed materiality** | Include datacenter operators and power (→ infrastructure index); exclude cooling absolutely | **Equinix and Constellation Energy excluded; Vertiv insufficient evidence.** Blocks the infrastructure-dilution failure | **Yes** |
| 10 | **Photonics / networking boundary** | **Deployment-location test**: inside AI compute clusters qualifies; carrier, transport and campus do not | Include all datacenter networking; exclude optics entirely | Arista, Credo, Astera admitted; telecom equipment excluded; diversified optics contested on Prong B | **Yes** |
| 11 | **Tier weighting** | **None.** Tiers affect eligibility and attribution only | Tier multipliers, budgets, tier caps, fixed allocations | Weights remain reproducible from capitalization alone; no cliff at tier boundaries | **Yes — confirm default** |
| 12 | **Primary tier assignment** | **One primary tier + secondary tags.** Tier 1 takes precedence; otherwise the tier of the largest qualifying activity | Multi-tier membership (double counting); strict Tier 1→2→3 ordering (misplaces Amazon in Tier 2) | Membership deterministic; attribution still rich | **Yes** |
| 13 | **`c` feasibility** | **Hold `c` = 8% provisionally.** Retain `n × c ≥ 1` as a published launch gate | `c` = 10%; no cap | Both feasible now. 8% binds on perhaps 5–8 issuers. **Final choice needs the concentration test on licensed float data** | **Yes** |
| 14 | **5/10/40** | **Diagnostic only**, published with `1/Σwᵢ²`, top-1 and top-5 | Binding; omit | Top-heavy universe makes it worth measuring; no evidence yet that the single cap fails | **Yes** |
| 15 | **China/HK sampling** | **Sample Baidu, Alibaba, Tencent, SMIC against the tier tests before the amendment PR** | Leave unassessed | Otherwise the venue register records an availability decision without knowing whether eligible constituents are being excluded | **Yes** |
| 16 | **Disclosure of surprising exclusions** | **Publish worked examples for Meta, ASML and Equinix in the methodology's limitations** | Leave to reader inference | The three most likely reader challenges answered pre-emptively, by rule | **Yes** |

---

## 24. Recommended Phase 3

**The tiered model succeeds.** It produces a universe large enough to weight, restores `c` feasibility, keeps thematic eligibility separate from investability and weighting, and survives deliberate attempts to break it (§7). It does not collapse into a technology index: it rejects nine of the sampled issuers on stated rules, including four that a "vibes" approach would have admitted (Meta, ASML, Salesforce, Constellation Energy).

**Recommended Phase 3: the methodology amendment PR.**

Apply §21 to `ai-equity-universe.md` (restructure to 0.3.0-draft) and §22 to `ugai.md` (0.2.0-draft), codifying only the founder-approved rows of §23, with no effective date on either. No schema, no ingestion, no engine, no migration.

**Two things to do inside that phase, both small:**

1. **Sample China and Hong Kong first** (register row 15) — a few hours, and it changes what §21's venue section should say.
2. **Verify the four `M`-confidence and the highest-stakes `L`-confidence rows** against primary filings before codifying — specifically Symbotic (robotics precedent), SoundHound (condition 4), Oracle (Route A), Arm and Astera Labs. The rules should not be written against unverified issuer facts even though the rules themselves do not depend on them.

**Explicitly still later:** vendor and licensing outreach (Phase 4, gated on the venue register and the disclosure position); the rights-schema extension for storage, redistribution granularity and post-termination retention (Phase 5, and the first thing built); point-in-time universe research tooling; the security master.

**One honest caveat.** 2E resolves the eligibility failure and nothing else. **Every 2C blocker stands**: no equity data, no licences, three licensing layers, per-venue cost, the retention requirement, and the FX gap on TWD. UGAI is now a methodology that *could* publish if it had data and rights — which it does not. The amendment PR is therefore the right next step precisely because it is the only one that does not require money.

---

## Appendix — evidence retrieved this phase

Retrieved 16 September 2026. Sources verified this phase; Phase 2D's sample carries its own bibliography.

- **Salesforce**, Q4 FY2026 results (8-K exhibit 99.1) — https://www.sec.gov/Archives/edgar/data/1108524/000110852426000056/crm-q4fy26xexhibit991.htm ; press release — https://s205.q4cdn.com/626266368/files/doc_financials/2026/q4/CRM-Q4-FY26-Earnings-Press-Release.pdf — Agentforce ARR $800M (+169% YoY); Agentforce and Data 360 ARR > $2.9B including Informatica Cloud $1.1B; company-defined "Data Cloud and AI ARR".
- **Meta** — Llama API in limited free preview; revenue-sharing with model hosts reported in secondary coverage only; Meta AI subscription discussed not established; $1.4T-by-2035 generative-AI figure from a court filing (a forecast). Sources: https://www.constellationr.com/blog-news/insights/meta-launches-llama-api-meta-ai-app ; https://techcrunch.com/2025/04/30/meta-forecasted-it-would-make-1-4t-in-revenue-from-generative-ai-by-2035
- **Super Micro**, Form 10-K FY2025 (FY ended 30 Jun 2025) — https://www.sec.gov/Archives/edgar/data/1375365/000137536525000027/smci-20250630.htm ; https://s204.q4cdn.com/707617056/files/doc_financials/2025/ar/2025-Form-10K.pdf — net sales $21,972M (+46.6%), growth attributed to GPU servers, HPC and rack-scale solutions; server and storage systems 97% of net sales.
- **Arista Networks**, Q4 and year-end 2025 results — https://investors.arista.com/Communications/Press-Releases-and-Events/Press-Release-Detail/2026/Arista-Networks-Inc--Reports-Fourth-Quarter-and-Year-End-2025-Financial-Results/default.aspx ; https://www.arista.com/en/company/news/press-release/23416-pr-20260212 — FY2025 revenue $9B; AI back-end and front-end Ethernet; FY2026 AI Fabrics target ≥ $3.5B (forward-looking).
- **Symbotic**, FY2025 results — https://ir.symbotic.com/news-releases/news-release-details/symbotic-reports-fourth-quarter-and-fiscal-year-2025-results ; https://ir.symbotic.com/node/10446/pdf ; 10-K summary — https://www.stocktitan.net/sec-filings/SYM/10-k-symbotic-inc-files-annual-report-b238fde66e2e.html — "A.I.-powered robotic and software platform"; machine vision and AI-driven decision-making for variable conditions; $22.5B backlog; GreenBox JV ≥ $7.5B of system purchases.
- **Vertiv**, 2025 results and coverage — https://investors.vertiv.com/overview/default.aspx ; https://www.datacenterfrontier.com/machine-learning/article/55357689/ — ~$10.2B 2025 revenue, ~$15B backlog, liquid cooling more than doubled in Q1 2025; **no separately disclosed liquid-cooling revenue**.
- **Constellation Energy** — 20-year Microsoft agreement reported at $16bn; 20-year Meta PPA for the 1.1 GW Clinton Clean Energy Center; ~1 GW of nuclear uprates. Sources: https://www.constellationr.com/insights/news/constellation-energy-microsoft-ink-nuclear-power-pact-ai-data-center ; https://www.datacenterdynamics.com/en/news/constellation-energy-doubles-down-on-ai-data-center-strategy/

**Carried from Phase 2D (verified there):** NVIDIA FY2026 10-K (Data Center multi-workload, no AI figure); Broadcom FY2025 10-K and results (no full-year AI figure; $63,887M revenue); TSMC 2025 (HPC 58%); Microsoft FY2026 10-K (no AI line); AMD FY2025 (Data Center $16.6B incl. EPYC); Intel FY2025 (DCAI combined); Micron FY2025 ($37.4B; HBM in call remarks); Palantir FY2025 ($4,475.4M; Gotham/Foundry/Apollo/AIP); C3.ai FY2026; CoreWeave FY2025 ($5,130M); SoundHound FY2025 ($168.9M); BigBear.ai FY2025 ($127.7M; FAA IT services; 22.3% GM).

**Not verified this phase and marked `Low` confidence in §14:** SK hynix, Samsung, Marvell, Astera Labs, Credo, Coherent, Besi/ASMPT, Dell, HPE, Oracle, Adobe, ServiceNow, Mobileye, Intuitive Surgical, Fanuc, Arm, ASML and Applied Materials disclosure specifics. Their rows demonstrate rule behaviour, not findings about those issuers.
