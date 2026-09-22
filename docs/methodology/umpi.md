# UMPI-DRAM Spot Methodology

**Status: deferred, version 0.1.0-draft. Not the UMPI V1 launch methodology. Publication blocked pending a licensed source.** Prepared 22 September 2026; deferred 22 September 2026.

> **UMPI V1 launched on a different architecture. See [UMPI-KR DRAM](/docs/methodology/umpi-kr-dram).**

This document is preserved unchanged below because it is still a correct specification — of a product Urdais cannot currently license. Phase 2B established that the source carrying these six instruments does not permit public commercial display of its prices, and Phase 2B-R established that **no open source prices these instruments at all**: no government statistic splits DRAM by generation, density, organization, speed bin or branded-versus-eTT grade. So this specification is not blocked on effort or on a better question — it is blocked on a right that has not been granted, and it stays on the shelf until one is.

**What that means concretely.** This is not UMPI V1, it is not production-ready, it is not the default public methodology for UMPI, and its six instrument identifiers are reserved to it rather than reused elsewhere. It becomes live work again only if Urdais obtains written rights permitting public commercial display of a spot board's prices. Nothing about its gates is weakened by being deferred.

The rest of this document is the specification as it stood, retained in full.

---

This document defines **UMPI-DRAM Spot** as a DRAM spot price product. It establishes no right, approves no vendor, creates no observation, and carries no effective date. Every memory value currently visible in the Urdais product is demo data and is not published under this or any methodology version.

This document follows the principles of the [Urdais methodology framework](/docs/methodology). It is written so that an engineer can implement UMPI-DRAM Spot the day a licence clears, and so that nobody can implement it before then by accident.

**Three states are distinguished throughout and are not the same thing: methodology-defined, backend-implementable, and publishable.** This draft makes UMPI-DRAM Spot the first two. The third is a rights question, and the answer today is no.

## Output Identity

| Field | Value |
| --- | --- |
| Output | UMPI-DRAM Spot |
| Family | UMPI, the Urdais Memory Price Index |
| Kind | Price product, one published value per canonical instrument |
| Instruments | Six DRAM chips, fixed by this version |
| Market | Spot |
| Native unit | USD per chip |
| Cadence | Business-day session, one published value per source business day |
| Methodology version | 0.1.0-draft |
| Publication state | **Blocked pending licensed source** |
| Effective date | None. A draft carries no production effective date |

UMPI-DRAM Spot is not an index level. It has no base date, no base value, no divisor, and no weights. It is a set of six separately published prices, each measuring one object. **There is no UMPI headline number**, no composite, and no average across instruments; a mean of a branded DDR4 chip and an eTT chip is not a quantity.

## Output Definition

> **UMPI-DRAM Spot measures the recurring spot-market price of a defined DRAM chip, in United States dollars per chip, as observed from an eligible spot-market source.**

Three words in that sentence carry the whole product and each is defined below: **spot**, **chip**, and **eligible**.

### The priced object: a chip

A **DRAM chip** is the packaged semiconductor memory device corresponding to the generation, density, organization, speed bin and grade named by the instrument. It is the commercial component that eligible spot sources quote, that module makers buy loose and mount; it is not the module they sell afterwards, and it is not the bare silicon inside it.

Five objects are routinely confused in memory pricing, and UMPI prices exactly the first:

| Object | What it is | In UMPI V1 |
| --- | --- | --- |
| **DRAM chip / packaged IC** | The commercial memory component of a stated density and organization, quoted by the eligible spot source | **The priced object** |
| **Semiconductor die** | The silicon inside the packaged device. Relevant to density terminology, and not separately quoted by any eligible source | Not separately priced |
| **DIMM / module** | An assembly of several memory devices on a PCB, sold by capacity | Not priced. A different product with a different market |
| **Gigabyte of module capacity** | A normalization over a module | Not priced, not derived, not displayed |
| **Wafer** | The semiconductor substrate carrying many fabricated dies before singulation | Not priced. Not observed by any eligible source |

**An instrument's density is stated in gigabits of device density, never in gigabytes of module capacity.** `16Gb` denotes the density of the DRAM device in gigabits, not module capacity in gigabytes. A `16GB` module is a different product whose name differs by one character, which is exactly why this sentence exists. The organizations in the instrument definitions make the arithmetic explicit: `2Gx8` is 2G addresses × 8 bits = 16 gigabits, `1Gx8` is 8 gigabits, `512Mx8` is 4 gigabits.

Density is the one place where the silicon matters to this document: `16Gb`, `8Gb` and `4Gb` are gigabits of die density inside the packaged device, which is why the term survives here and nowhere else in the definition. This methodology makes no claim about how a die is fabricated, what process node produced it, what its yield or bin distribution is, or what it costs to make. Those are not observed by any source this product may use, and Phase 1B establishes no evidence for them.

### The unit: USD per chip

> **One unit = one DRAM chip matching the instrument's canonical generation, density, organization, speed bin and grade, quoted in United States dollars.**

The unit is the source's own native quotation unit: eligible spot sources quote dollars per piece for exactly this object, so no conversion, bit-normalization or currency translation occurs between observation and publication.

- The official print is **never** converted to USD per gigabyte, USD per gigabit, USD per bit, or USD per module.
- Two instruments' prices are **never** normalized against each other by density to produce a per-bit series. A per-bit view is a different product and would need its own methodology version.
- The display caption may be reader-friendly, but the canonical unit recorded against every observation and every published value is `USD/chip`. The generic `$ / part` used by the current demo surface is **not** the methodology unit and is superseded by this document.

## Canonical Instruments

Six instruments constitute the V1 production family. Each is a distinct economic object; none is a view of another.

| Instrument | Generation | Density | Organization | Speed bin | Grade | Market | Native unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DDR5 16Gb | DDR5 | 16 Gb | 2Gx8 | 4800/5600 | Branded / Major | Spot | USD / chip |
| DDR4 16Gb | DDR4 | 16 Gb | 2Gx8 | 3200 | Branded / Major | Spot | USD / chip |
| DDR4 8Gb | DDR4 | 8 Gb | 1Gx8 | 3200 | Branded / Major | Spot | USD / chip |
| DDR4 16Gb eTT | DDR4 | 16 Gb | 2Gx8 | Not separately established | eTT | Spot | USD / chip |
| DDR4 8Gb eTT | DDR4 | 8 Gb | 1Gx8 | Not separately established | eTT | Spot | USD / chip |
| DDR3 4Gb | DDR3 | 4 Gb | 512Mx8 | 1600/1866 | Branded / Major | Spot | USD / chip |

**Where an attribute is recorded as not separately established, no value is invented.** The two eTT instruments are quoted by grade and organization and are not separately binned by speed in the evidence Phase 1B collected. An eligible source that does bin them does not thereby change these instruments; admitting a speed-binned eTT instrument would be a new instrument under a new version.

Five attributes are **mandatory identity**: an observation that cannot be resolved to a generation, density, organization, grade and market is not an observation of any UMPI instrument. Speed bin is mandatory where the instrument states one.

### Grade: what eTT means, and why it is a separate instrument

**eTT means effectively tested**: unmarked, value-grade DRAM sold without a vendor brand, typically to module makers who brand the finished module themselves.

- eTT is a **market grade**, not a JEDEC generation, not a process variant, and not a temperature specification.
- eTT is a property of how the chip reaches the market, so its vendor mix is unknown and unmarked **by construction**. This methodology describes an eTT instrument as unmarked eTT chip as surveyed by the eligible source, and never as a qualified part from a named manufacturer.

> **Branded and eTT observations are never combined, averaged, substituted or interpolated into one another, for any reason, including a matching generation and density.**

This is not a fastidiousness rule. On the spot board Phase 1B inspected on 21 September 2026, the branded DDR4 16Gb session average was $85.00 and the eTT line for the same generation and density was $13.35. A series that mixed them would move on grade composition and report it as price. Those figures are third-party research evidence recorded in Phase 1B; they are not Urdais observations and never become published values.

### Manufacturer

The V1 branded instruments are **not split by manufacturer**. Eligible spot sources print one branded/Major line per instrument, treating qualified chips from the major vendors as substitutes in the channel. That is the market convention for a spot chip, and Urdais adopts it rather than asserting a vendor split no source publishes. It is explicitly **not** a claim that vendors are substitutes in OEM qualification, which is a different market this product does not measure.

## Published Surface

For each of the six instruments, V1 publishes:

- the current value, in USD per chip;
- the 1D close-to-close change against the immediately preceding published close, defined under [Change calculation](#docs-change-calculation);
- the observation timestamp of the value, carried from the source and never rounded to a date boundary;
- the methodology version and the source attribution the licence requires.

V1 does **not** publish: an intraday tape, a composite or headline UMPI value, a per-bit or per-gigabyte series, a cross-instrument average, a contract price, an HBM price, a high/low range, or any value for a day on which no eligible session was published.

**The current memory surface is demo data and is out of scope for this phase.** No frontend change is made by this document. The changes the surface requires before any UMPI value may be published are recorded under [Required product changes before launch](#docs-required-product-changes-before-launch).

## Underlying Data Structure

Four stages, in the framework's separation of data stages:

| Stage | Content |
| --- | --- |
| Raw | One source session print, exactly as published, with its retrieval record and the artifact it was read from |
| Normalized | That print resolved to one canonical instrument, one market, one native currency and one native unit, with its source session identity |
| Calculated | The published close for a source business day, and the 1D close-to-close change derived from consecutive closes |
| Published | The value served for an instrument, bound to its methodology version and its rights state |

A published value must be reconstructible from its stored observations without re-contacting the source. Where the source's licence does not permit retaining the observations that would make that possible, the product is not publishable; see [Rights and publication gates](#docs-rights-and-publication-gates).

## Observation Definition

An **eligible UMPI-DRAM Spot observation** is a single value for a single canonical instrument, from a single source session. It must contain or resolve every field below; an observation missing any of them is not admitted, and no field is defaulted, inferred or backfilled.

| Field | Requirement |
| --- | --- |
| Canonical instrument | Resolves to exactly one of the six V1 instruments on all mandatory identity attributes |
| Observation timestamp | The source's own publication or session timestamp, with its timezone, stored exactly and never rounded |
| Source | The registered source interface the value was obtained from |
| Session identity | The source's own session or publication identity, where the source publishes more than one value per business day |
| Market | `spot`. A contract, channel or retail observation is not an observation of this product |
| Native currency | USD |
| Native unit | USD per chip |
| Observed value | The value as published, at the source's own precision. No rounding before storage |
| Value kind | One of the kinds below, recorded explicitly, never assumed |
| Provenance | Retrieval time, the artifact or response the value was read from, and its hash |
| Methodology version | The version in force on the observation's own date |
| Rights state | The source's collection and data-use states, sufficient for the intended use at the time of use |

### Value kinds, and what UMPI V1 actually consumes

These are different economic objects and this methodology never treats them as interchangeable:

| Value kind | What it is |
| --- | --- |
| Exchange trade | A concluded transaction reported by a venue that settles it |
| Individual quote | One counterparty's stated price for one instrument |
| Bid / ask | An offer to buy or to sell, unmatched |
| Survey session average | A price desk's constructed average over a survey of market participants for one session |
| Derived benchmark | A calculation over other observations, by the source or by Urdais |

> **UMPI-DRAM Spot V1 consumes a recurring spot-market survey or benchmark session value. There is no DRAM exchange, no settlement, and no last-sale tape.**

A published UMPI value is therefore never described as a traded price, a settlement price, a last sale, or an exchange print. Where the source describes its own method — for example, as an average based primarily on transaction prices for mainstream items with bid and ask used for thin ones — that description is carried into the attribution rather than replaced by a cleaner-sounding one.

**One series carries one value kind from one source lineage.** Two price desks surveying the same instrument do not print the same number, and a series that silently alternated between them would report desk composition as price movement. Combining sources into one instrument's series requires a combination rule, and this version contains none: V1 binds each instrument to a single source lineage, and a second source may be stored as validation but never merged into the published series.

## Methodology

For an instrument on a source business day:

1. Admit every eligible observation for that instrument whose session timestamp falls within the source's own published business day, in the source's published timezone.
2. Discard nothing on the basis of level. There is no outlier rule, no smoothing, no winsorization and no filter on the published value: a survey average is already a constructed statistic, and a second filter over it would measure Urdais, not the market.
3. The **published close** for that business day is the value of the **last eligible session** of that day, by the source's own session ordering. Earlier sessions are retained as canonical observations and are not published as separate values.
4. The published value for the instrument is its most recent published close.
5. The 1D close-to-close change is computed under [Change calculation](#docs-change-calculation).

No arithmetic is applied between the source's published figure and the Urdais published value. That is a deliberate property of V1 and it has a direct rights consequence, stated in [Rights and publication gates](#docs-rights-and-publication-gates).

## Spot and contract are separate products

> **UMPI V1 is DRAM Spot. Spot, contract and channel observations are never mixed into one series.**

| Market | What it is | Status in V1 |
| --- | --- | --- |
| **Spot** | The broker and module-maker channel for loose chips, surveyed per session on business days | **This product** |
| **Contract** | Negotiated supply between makers and OEMs, surveyed monthly, frequently on modules rather than chips and sometimes on a different organization for a same-named density | Out of scope. A future `UMPI-DRAM Contract` product under its own methodology |
| **Distributor / channel retail** | Catalog prices to end buyers | Out of scope, and not a price for this object |

These are different economic markets whose prices disagree materially for the same nominal density; Phase 1B records a same-period spot and contract figure for one instrument differing by nearly a factor of two. A single number labelled `DDR4 16Gb` without its market stated would be false, so the market is a mandatory identity attribute of every instrument and every observation.

Spot is also not a proxy for the price of AI memory. It measures the channel market for conventional DRAM chips. This methodology makes no claim that it tracks server, hyperscaler or accelerator memory procurement.

## HBM status in V1

> **HBM3, HBM3E and HBM4 are not production UMPI V1 price instruments. HBM price publication in V1 is withheld, and the HBM family is research-preview at most.**

HBM remains part of the conceptual memory product architecture. What it lacks is not importance but an observation:

- Commercial HBM exists, including HBM4: Phase 1B records commercial shipment announcements from all three major suppliers during 2026.
- No recurring public HBM transaction or contract price tape was identified.
- Public HBM dollar-per-gigabyte figures in circulation are analyst estimates, customs-derived unit values, or arithmetic performed by third parties on aggregates. None is a market price.
- Generation alone is not an instrument. The same generation ships at different capacities per stack, different stack heights and different vendors, which are different products at different prices.

Three rules follow and are binding on this version:

1. **HBM4 commercial availability does not establish a production price.** That shipments exist is a fact about the product market. A price requires an observation, and none exists.
2. **No synthetic HBM price is defined, derived, modelled or displayed** — not from customs unit values, not from issuer revenue, not from analyst commentary, and not by interpolating between sparse points.
3. **A future HBM price product requires a methodology amendment under its own version**, not an extension of this one. At minimum, a canonical HBM instrument would have to fix generation, capacity per stack, stack height, and vendor where the source splits it, and would have to state whether the licensed series is an ASP, a survey estimate or an observed transaction. Until such a source exists, nothing is defined here for it.

## Public proxy data

Government customs statistics, manufacturer filings, issuer ASP percentage disclosures and comparable public signals may later serve as **validation, directional indicators, nowcasts, weighting inputs, or separate relative indices under their own methodology**.

> **They are never mapped onto a UMPI instrument identity unless they measure that canonical instrument.**

Specifically, and without exception in this version:

- A national customs unit value for a memory tariff heading is **not** `DDR5 16Gb`. It is an average over a heading that mixes generations, densities, grades and often product classes.
- A customs value for a heading covering multi-chip packages or HBM is **not** an `HBM3E` price per gigabyte. It is a blended per-piece or per-kilogram unit value over a heading.
- An issuer's disclosed percentage change in average selling price is **not** an absolute price level, and no sequence of percentage changes is chained into one.

Any such series, if published at all, is published as its own quantity with its own name, unit and methodology — never under a UMPI instrument identity and never on the same axis as a UMPI price.

## Source Specification

This methodology is **source-neutral at the level of the product definition**: it defines the economic object, the eligible observation and the source requirements, and binds a specific source at approval time rather than in the definition. UMPI-DRAM Spot is not defined as any one vendor's number.

That neutrality is not a claim of independence from the evidence. **Phase 1B established that the current instrument taxonomy corresponds closely to a specific commercial DRAM spot board**, down to the organizations, speed bins and the branded-versus-eTT split. The instrument definitions in this document are qualified against that board's conventions, and that provenance is stated rather than obscured. Any source meeting the requirements below may back the product; the taxonomy came from somewhere, and this is where.

### Source eligibility

A source is eligible only if all of the following hold, each on evidence rather than on expectation:

| # | Requirement |
| --- | --- |
| S1 | **Instrument correspondence.** It publishes values that resolve to the canonical instruments on every mandatory identity attribute, without Urdais inferring an attribute the source does not state |
| S2 | **Recurrence.** It publishes on a regular business-day session cadence, not occasionally and not on request |
| S3 | **Session identity.** Each value carries the source's own session or publication identity and timestamp |
| S4 | **Native unit and currency.** It quotes USD per chip for the instrument, without Urdais converting from another object |
| S5 | **Stated method.** It documents what its values represent, so the value kind is recorded from the source rather than assumed |
| S6 | **Retained history.** Its own published history is retrievable, so a Urdais series can be reproduced and audited |
| S7 | **Original source.** It is the desk that constructs the value, not a reproduction of another desk's |
| S8 | **Rights.** Every gate in the next section is affirmatively resolved in writing for the intended use |

**Technical retrievability is not eligibility.** That a page can be fetched, a file downloaded or a table parsed answers none of S1 through S8. A source that is trivially collectible and contractually barred is barred.

### The aggregator rule

> **Third-party sites that reconstruct, aggregate or republish another desk's memory prices are on a do-not-ingest-for-production-price list.** Phase 1B identifies several by name in the research record.

They fail S7, and using them would fail S8 twice over: **ingesting a downstream reproduction does not cure the upstream restriction it reproduces.** A restriction on a desk's prices attaches to those prices, not to the page they are read from. Such a site may become admissible only if it establishes both independent rights and original-source provenance, which is a new evidence question, not a workaround.

## Rights and publication gates

Urdais assesses every source on the two-axis discipline recorded in the source registry — whether retrieval is permitted, and whether use of what is retrieved is permitted — and this product refines the second axis into four distinct questions, because for a price product they resolve differently.

> **No gate is satisfied by silence. Ambiguity is a blocked or under-review state, not a permission.**

| Gate | Question | Consequence if unresolved |
| --- | --- | --- |
| **G1 Access / retrieval** | May Urdais obtain the observations by the intended mechanism, at the intended frequency? | No collection |
| **G2 Storage** | May Urdais retain the observations required to reproduce its publications? | No collection, because an unreproducible publication is not permitted by this framework |
| **G3 Calculation** | May Urdais use the observations to calculate its own benchmark or output? | No calculation |
| **G4 Derived publication** | May Urdais publicly display the resulting UMPI values, commercially? | No publication |
| **G5 Historical retention** | May Urdais retain the observations needed to reproduce already-published UMPI values after the subscription or licence ends? | **No launch.** A published history that becomes unreproducible on termination fails the framework's reproducibility and historical-integrity principles |

Two further rules govern how these gates are read:

- **A contractual restriction is never broadened beyond its text.** A bar on republishing raw data is not a bar on publishing a calculation; a bar on one use is not a bar on another. The gates are resolved against what the licence says, clause by clause, with the clause recorded.
- **Raw-data republication is a separate right.** It is required only where Urdais publishes a source's datum, and it is not automatically required by G4.

### Which right V1 actually needs, stated plainly

The distinction above has a specific and uncomfortable consequence for this product, and it is better stated in the methodology than discovered at launch:

- Where a published UMPI value is a Urdais calculation over observations that reproduces no single source datum, **G4 is the operative gate** and raw republication is not required.
- **Where a published UMPI value equals a single source's published figure — which is exactly what [Methodology](#docs-methodology) specifies for V1, since no arithmetic is applied — the published value is that source's datum, and the raw-republication right is required in addition to G4.**

**Calculating the 1D close-to-close change does not change this.** That change is a genuine Urdais calculation over two licensed closes, and G3 is the gate it sits behind. It is computed *from* the published price; it does not replace it, and publishing a percentage alongside a price does not convert that price into an independently owned Urdais series. The price value remains the source's datum and remains subject to the raw-republication right.

V1 is therefore gated on G1, G2, G3, G4, G5 **and** raw republication, for the source that backs it. If a licence grants derived publication but withholds raw republication, V1 as defined here is not publishable from that source, and the honest options are to change the source or to change the product into one that publishes a genuine calculation. Publishing a licensed desk's figure under a Urdais name and calling the relabelling a derivation is not one of the options.

### Current licensing state

**No current UMPI instrument has a production-ready source.** Phase 1B establishes that the six DRAM instruments are commercially observable, that every observed source bars reproduction, derivative works or publication without written permission, and that no written permission is on file. Outreach has been sent to several memory data providers and no response is recorded; sending a request grants nothing.

Accordingly:

> **UMPI-DRAM Spot publication state is `blocked pending licensed source`.** Ingestion, collection, storage and publication are all blocked. This state is a property of the sources, not of this methodology: the methodology may be complete, reviewed and even approved while the product remains unpublishable.

No source is named as production-approved by this document, and no source becomes approved by being described in it.

## Ingestion Contract

This section is the specification an implementer builds against **after** a licence clears. **No part of it is authorization to build now.**

A licensed source adapter must produce, per instrument per session, exactly the fields in [Observation Definition](#docs-observation-definition), and must satisfy:

| # | Requirement |
| --- | --- |
| I1 | **Fail closed.** An observation that cannot be resolved to a canonical instrument on every mandatory attribute is rejected and recorded as rejected, never coerced into the nearest instrument |
| I2 | **No fabrication.** A missing session produces no row. Nothing is carried forward as a new observation, interpolated, or generated to fill a gap |
| I3 | **Native fidelity.** The source's value, precision, timestamp and timezone are stored as published |
| I4 | **Idempotence.** Re-reading a session that has already been recorded confirms it and creates no second observation |
| I5 | **Provenance.** Every observation stores the artifact it was read from and that artifact's hash |
| I6 | **Rights binding.** An observation records the rights state under which it was collected, and production publication requires that state to satisfy every gate above at the time of use |
| I7 | **Source separation.** Observations from different sources are stored as different lineages and are never merged into one instrument series under this version |

## Stored Outputs

To support publication and historical explanation, the production system must retain, for as long as a value derived from them is published:

- every admitted raw session observation, with provenance;
- the resolved canonical instrument and market for each;
- the published close per instrument per source business day, and which session produced it;
- every published value with its methodology version, its source lineage, and its publication timestamp;
- every rejection, with its reason;
- the rights evidence in force at the time of collection and at the time of publication.

Retention of these outputs beyond a licence term is gate **G5**, and it is a launch gate rather than an operational preference.

## Validation / Quality Rules

| Rule | Behaviour |
| --- | --- |
| Instrument resolution | An unresolvable observation is rejected, recorded, and never approximated |
| Unit and currency | A value not natively in USD per chip for the instrument is rejected. No conversion path exists in V1 |
| Market | A non-spot observation is rejected |
| Grade | A branded observation never satisfies an eTT instrument, or the reverse |
| Duplicate session | The same instrument and session recorded twice is one observation, not two |
| Missing session | No value, no point, no substitute. The previously published value continues to be shown with its own original timestamp and is never restamped |
| Stale value | The age of the published value against its own timestamp is disclosed on the surface; a stale value is labelled, never refreshed by republication |
| Implausible value | Recorded and flagged for review, never silently dropped and never silently corrected. There is no automatic outlier rule |
| Sparse history | A series with one observation has one point and no change |

## Cadence

> **UMPI-DRAM Spot V1 has a business-day session cadence. It is not a continuously traded tape and is never described as real-time.**

- An eligible source may publish several sessions per business day. All are retained; the last of the day is the published close.
- Weekends, source holidays and any day without an eligible session produce **no observation and no published value**. They are not zero-change days.
- A missed session is a gap, not a flat print. Nothing is interpolated across it.
- Observation timestamps are preserved as published, in the source's timezone, and stored to the instant. The source business day is the source's own, not a Urdais calendar day and not UTC midnight.

## Change calculation

The word **today** used by the current generic surface is not this product's change definition and must not be used for it.

> **The V1 canonical change is the 1D close-to-close change: the published close against the immediately preceding published close for the same instrument, same source lineage, and same methodology version.**

```
1D_change = (close_t − close_{t−1}) / close_{t−1}
```

where `close_t` is the current published close and `close_{t−1}` is the one published before it, whenever that was.

**The name is deliberate.** A price desk may publish its own field called a session change, computed over its own sessions under its own rules. The 1D close-to-close change is **a Urdais calculation over two published closes**, it is never a source field passed through, and the two are never presented as the same quantity.

| Question | Rule |
| --- | --- |
| Which two observations are compared | Two consecutive **published closes** of the same instrument — never two intraday sessions, never a close against a mid-day session, never two different sources |
| Weekends and holidays | No close is produced, so no change is produced. The next change compares across the gap, and the elapsed interval is disclosed alongside it |
| A missed session | If the source publishes no eligible session for a business day, there is no close for that day. The change is not computed against an assumed unchanged value, and no zero-change point is created |
| Multiple same-day sessions | All eligible sessions are **retained** as observations. Only the last is published, and only published closes enter the change |
| The published daily close | The last eligible session of the source business day, by the source's own session ordering |
| No prior close | The change is **withheld**, never displayed as zero |
| Across a source or methodology-version change | The change is **withheld** across the boundary, because the two values are not the same economic object measured the same way |

The product label for this quantity is `1D`, in line with the label already used elsewhere in Urdais for a daily compute price. It is never `today`, because the two compared closes are frequently not from today and the day before.

## Historical series

Historical UMPI points may be published only where **all** of the following hold:

1. the historical source observations are licensed for the intended use, including their retention (G2, G5);
2. Urdais retains enough lineage to reproduce each published point from stored observations;
3. each point conforms to the methodology version in force on its own date.

And, without exception:

- **No history is generated from demo or deterministic series.** The roughly 1,300 daily DRAM points and 900 daily HBM points currently in the demo surface are not history and must never be promoted, converted or migrated into production.
- **No backfill by interpolation, smoothing or carry-forward.** A day with no eligible observation has no point, in history exactly as in the present.
- **No silent rewriting of published history.** If instrument eligibility, a source binding or a definition changes, the change takes effect from its own effective date; previously published values remain attributable to the version that produced them, and any correction is recorded as a correction.

## Lineage and Reproducibility

Published UMPI value → methodology version → published close → admitted session observation → source artifact and its hash → original source.

Every published value must be explainable in those terms without re-contacting the source. Where a licence would prevent retaining any link in that chain, the value is not publishable — which is why G2 and G5 are launch gates rather than operational details.

## Publication and Revision Behavior

- **Publication requires an approved methodology version and a source whose rights satisfy every gate.** Both. Neither substitutes for the other.
- **Production is fail-closed.** Where the requirements are not met, no value is published and no substitute, estimate, placeholder or demo value is shown in its place.
- **A withheld value is recorded with its reason.** "Nobody has looked" and "we looked, and it may not be published" are different statements and a reader is entitled to know which applies.
- **Revisions.** Where an eligible source revises a session it has already published, the revision is stored as a distinct observation with its own timestamp, the affected close is recomputed under the version in force on its original date, and the correction is recorded. Revisions do not silently overwrite a published value.
- **Attribution** is published in the form the licence requires, on every surface that displays a value derived from that source.

## Frozen decisions

This version freezes the following. Each is binding on implementation and none may be relaxed by an implementer; changing any of them requires a new methodology version.

| # | Decision |
| --- | --- |
| 1 | **UMPI V1 is DRAM Spot.** The product is the spot-market price of defined DRAM chips |
| 2 | **The formal native unit is USD per chip**, not the generic `$ / part`, not USD per gigabyte, not USD per bit, and not USD per module |
| 3 | **The six existing DRAM instruments survive**, each qualified by generation, density, organization, speed bin where established, grade and market |
| 4 | **Spot and contract are separate products.** A future `UMPI-DRAM Contract` requires its own methodology; observations are never mixed |
| 5 | **HBM is withheld in V1**, research-preview at most, with no published price |
| 6 | **HBM4 commercial availability does not establish a production price** |
| 7 | **No interpolation of sparse or non-daily memory data**, in history or in the present |
| 8 | **Public customs and issuer proxies never become UMPI instrument observations** |
| 9 | **Aggregated downstream reproductions do not cure upstream rights restrictions** |
| 10 | **Production ingestion remains blocked on written rights** — all five gates, plus raw republication for a single-source print |
| 11 | **Historical-retention rights (G5) are a launch gate**, not a later concern |
| 12 | **The surface's `today` change semantics must become source- and cadence-aware** before any UMPI value is published |

## Required product changes before launch

Recorded here because they are conditions of publication, not undertaken in this phase. No frontend, database or ingestion change is made by this document.

| # | Change | Why |
| --- | --- | --- |
| P1 | The market header's `today` label must become source- and cadence-aware, showing `1D` for this product | Decision 12. Two consecutive closes are frequently not today and yesterday |
| P2 | The DRAM family unit caption must reflect USD per chip | Decision 2. A reader-friendly caption is permitted; the canonical unit is not |
| P3 | The demo memory series must not be the production series, and no demo point may be promoted | [Historical series](#docs-historical-series) |
| P4 | HBM instruments must display as withheld or research-preview with a stated reason, not as a price | Decisions 5 and 6 |
| P5 | Intraday charting must not be offered for this product | [Cadence](#docs-cadence). There is no tape, and intraday sessions are retained rather than published |

## Research record

The evidence behind this document is recorded, and stays recorded, as research rather than methodology:

- `docs/research/memory-pricing/source-shortlist.md` — the 14 September 2026 memory source study.
- `docs/research/memory-pricing/umpi-phase-1b.md` — the 21 September 2026 production instrument validation: the instrument audit, the priced-object and grade findings, HBM price-observability, the spot-versus-contract comparison, the rights matrix and the engineering gate.
- `docs/research/memory-pricing/umpi-phase-1b-matrix.json` — its machine-readable matrix.
- `docs/architecture/sources/memory-photonics-outreach-tracker.md` and `memory-photonics-permission-requests.md` — the outreach record.

Those documents are evidence. Where a figure appears in them it is third-party research evidence gathered to test this methodology, never a Urdais observation and never a published value. **This methodology contains only the decisions needed to define the product**; it does not restate the research, and the research does not define the product.

## Methodology Version

**0.1.0-draft.** Status `draft`. **No effective date**, by the framework's rule that a draft carries none and that publication under a draft is prohibited.

Approval to `1.0.0` is a separate decision requiring, at minimum: a source that satisfies every gate in writing, a recorded binding of that source to each instrument, and the retention and reproducibility guarantees this document requires. Approval of this methodology would not by itself make UMPI publishable, and publication of a UMPI value would not by itself approve a source.

An approved version is never edited in place. A change to an approved version is made by superseding it with a successor version, so that values stay attributable to the rules that produced them.

## Version History

**0.1.0-draft, 22 September 2026.** First definition of UMPI-DRAM Spot. Fixes the product as DRAM spot; defines the priced object as a packaged DRAM chip and the native unit as USD per chip, superseding the generic `$ / part`, while keeping `16Gb` as gigabits of die density rather than module capacity; freezes the six canonical instruments with their organizations, speed bins and grades, and separates branded from eTT as distinct instruments that are never combined; defines the eligible observation, its mandatory fields and the value-kind taxonomy, and states that V1 consumes a recurring survey or benchmark session value rather than an exchange tape; separates spot from contract as different products; withholds HBM and records that HBM4 shipments do not establish a price; bars public customs and issuer proxies from instrument identity and bars aggregated downstream reproductions as sources; defines the business-day session cadence, the published daily close and the 1D close-to-close change, and records that the surface's `today` semantics must change before launch; sets the five rights gates and records that a single-source print additionally requires raw republication. No source is approved, no observation is created, and no production effective date is established.
