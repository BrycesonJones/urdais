# Urdais Map Facilities

**Methodology version 2.1.0 — approved, effective 18 September 2026.**
Supersedes 2.0.0. Versions 1.0.0 and 2.0.0 remain identifiable with their own
content hashes and effective intervals.

This methodology governs the map, which is a sourced geographic record of the
physical infrastructure underlying the compute economy. It is not an index
methodology: nothing here is calculated, there is no level, no divisor and no
calculation calendar. What it versions is the set of rules deciding which
physical facilities Urdais records, what it records about them, and which of
them appear as public dots.

## What changed in 2.1.0

The map now distinguishes a fully approved `published` facility from a
map-safe public `research` facility. Research is a verification state, never a
fifth infrastructure category. A research record can appear only when the read
path can independently establish its resolved identity, valid category,
non-city position, current check date, live lifecycle and admissible positioning
evidence. `review_required` and `withdrawn` remain internal-only.

This is a minor version because it does not change which physical facilities
are in scope, the four categories, coordinate semantics, evidence tiers or the
full publication approval gate. It lets a safe, explicitly labelled research
record be visible before enrichment and final approval are complete.

## What changed in 2.0.0, and why it was a major version

Under 1.0.0 a data centre belonged on this map if it mattered to AI. That was
the right first cut and it is the wrong long-run rule, because it made the map a
picture of *what Urdais already knew about AI* rather than of the physical layer
AI is built on. A conventional colocation hall that converts to GPUs next year
was invisible until the day it converted, and then appeared as though it had
been built overnight.

So the data-centre inclusion criterion is now **existence**:

> All verifiable physical data centres are in scope. AI relevance is enrichment,
> not an inclusion criterion.

That changes the population rather than the handling of a rule, which is why it
is a major version rather than an amendment. Three consequences run through the
sections below: AI relevance becomes a separately evidenced property (section
4a); structured directories become admissible for discovery, under a tier rule
that stops one directory entry from placing a dot (sections 4 and 5); and
nothing outside `data_center` broadens at all (section 9).

Every rule below is implemented and enforced. Where a rule is a database
constraint or a commit-time trigger, this document says so, because a
methodology whose rules live only in prose can drift from the system without
either being visibly wrong.

## 1. What the map covers

Four categories, and only these four:

- `data_center` — a physical facility or campus that exists primarily to house
  computing, storage, networking, cloud, hosting, colocation, HPC, AI or other
  substantial IT infrastructure. See section 2 for what that includes and
  excludes.
- `gpu_compute_cluster` — a named accelerator fleet or AI supercomputer, whether
  or not it has its own address.
- `semiconductor_fab` — a leading-edge logic, memory or advanced-packaging
  facility in the AI supply chain.
- `power_infrastructure` — electrical generation or grid infrastructure,
  admissible only under section 6.

The public label for `gpu_compute_cluster` is "GPU Compute Cluster". The
category was named `compute_cluster` before version 1.0.0; that value is retired
and is refused by the database.

A machine that is not accelerator-based is not a GPU compute cluster whatever
its standing. The question is architecture, not importance.

## 2. Inclusion and exclusion

A facility is recorded when a cited source identifies it as a specific physical
site or system.

### 2.1 Data centres

**A data centre is in scope when there is sufficient evidence that a specific
physical facility or campus exists primarily to house computing, storage,
networking, cloud, hosting, colocation, HPC, AI or other substantial IT
infrastructure. AI relevance is not required.**

In scope, among others: hyperscale data centres; cloud-provider data centres;
colocation and carrier-neutral facilities; wholesale data centres; enterprise
data centres that are identifiable physical facilities; sovereign and government
data centres where publicly documented; HPC and supercomputing host facilities;
GPU-cloud host data centres; purpose-built AI data centres; data-centre
campuses; and major carrier hotels where the facility materially functions as a
data centre. Operational, under construction, and planned or announced
facilities are all in scope, the last where a real physical site has been
sufficiently identified.

A facility qualifies even when no GPU hardware is documented, no AI tenant is
documented, capacity is unknown, the operator or customer mix is unknown, or it
currently serves conventional cloud and enterprise workloads.

**Not** recorded, whatever its relationship to computing:

- ordinary corporate offices, headquarters and software-company offices;
- server rooms inside office buildings, and network closets;
- telecom points of presence that are not materially data-centre facilities;
- cloud regions or availability zones with no identifiable physical facility, and
  generic geographic cloud labels — a region is a service boundary, not a
  building, and existence is never inferred from a region name;
- content-delivery edge nodes with no meaningful facility identity;
- an individual rack or cage inside another data centre;
- proposed concepts with no identifiable physical project or site;
- directory entries that cannot be corroborated as real facilities;
- a duplicate building or campus created only because several directories name
  one site differently.

### 2.2 Everything else

The other three categories keep their 1.0.0 rules unchanged; see section 9.

### 2.3 The rejection register

Exclusions are recorded rather than forgotten: the rejected-candidate register
(`data/map/rejected-candidates.v1.json`) keeps each rejected candidate, the
reason, and the research date, so a later pass cannot silently re-add one
without new evidence.

## 3. Entity granularity

One row per distinct infrastructure entity, not per building.

A GPU cluster inside a data centre is its own entity and shares the host's
coordinates. So does a power station beside the campus it feeds. **Shared
coordinates are never evidence of a duplicate**, and nothing in the system
merges records on position, on name similarity, or on an alias collision. Those
resemblances are reported for a person to read and act on nowhere else.

A campus and a named cluster inside it are two entities, connected by
`hosted_by`: Applied Digital Polaris Forge 1 is the data centre, the CoreWeave
deployment inside it is the GPU compute cluster. A second phase of one campus is
the same entity unless a source isolates it.

A landlord and its tenant, however, do **not** become two `data_center` entities
for one physical building. The building is one data centre; the tenant's
presence is an operator or relationship fact about it, or — where the tenant's
deployment is itself evidenced as a named system — a `gpu_compute_cluster`
hosted by it.

Two further rules, both about not over-fitting the unit:

- a multi-building campus may be one entity where the operator presents it as
  one campus, and separate entities where sources clearly distinguish the
  buildings. A campus is not automatically exploded into its buildings;
- independently named sites are not collapsed into a metro-level entity.

## 4. Source hierarchy and evidence

Evidence is recorded **per claim**, never per record: a document supports the
statements listed against it and no others. A press release that states an
address has not thereby stated a GPU count.

Documents carry a tier, which is how much weight one of them can hold on its
own.

**Tier 1 — primary and authoritative.** The operator's or owner's own facility
page or announcement; an SEC or regulatory filing; a government record; a
permit; a planning or zoning record; a utility or regulatory filing; an
economic-development agency announcement.

**Tier 2 — strong corroboration.** A reputable industry publication, established
business press, authoritative trade press, or a property or development record.

**Tier 3 — discovery and provisional evidence.** Established data-centre
directories, peering databases, mapping databases, commercial directories and
other structured aggregators.

### Directories

2.0.0 admits Tier 3 sources, because a global data-centre inventory cannot be
built from operator pages alone: directories are how you find out that a
facility exists at all. They are also stale, duplicated and sometimes wrong
about where a building is, so what they may do is bounded:

- a directory **may** establish a candidate, propose aliases, and propose an
  address for corroboration;
- a directory **may not**, on its own, place a public dot. See section 5.

**The corroboration rule.** A facility's position is admissible for publication
when it is claimed by at least one Tier 1 or Tier 2 document, **or** by at least
two Tier 3 documents from *independent publishers*. Two independent directories
are required rather than two directory rows because directories copy from one
another, and one lead wearing two names is still one lead. This is a commit-time
trigger, not a convention.

Where corroboration is reasonably obtainable it should be obtained. Where it is
not — a small operator with no facility page, in a market no trade press covers
— two independent directories agreeing on a street address is sufficient, and
that is a deliberate choice: the alternative is a map that omits everything
outside the markets the trade press follows.

A geocoder is a positioning tool, not a fact source: it never supports
ownership, capacity or status.

Research assistants and language models are not sources. The documents they
locate are.

### Citation class and rights

Evidence is classified from its document type:

- `public_primary_evidence` — a company facility page or a company press
  release.
- `government_evidence` — an SEC filing, a government record, a permit, a
  planning document, a utility filing, or an economic-development announcement.
- `secondary_corroboration` — industry press, financial press, or a property
  record.
- `structured_directory` — a data-centre directory, peering database or other
  structured aggregator.

Citing a fact from such a document and linking to it is ordinary attribution.
It is **not** the thing Urdais's source-terms review exists for, and it does not
pass through the licensing gate that governs commercial price and data feeds:
that gate exists because those feeds' *values* are redistributed, and a facility
citation redistributes nothing.

What Urdais persists is the derived fact, the provenance metadata, the mapping
of claims to sources, and the link. Substantial source content is not copied.

Where Urdais's intended use of a particular source does raise a rights question
— a paywalled or licence-bound publication, or any source whose content rather
than whose facts would be reproduced — that source is listed in
`data/map/source-rights-register.v1.json` and is reported by every dry run until
a person resolves it. Sources under the existing `reference.source_interfaces`
terms controls stay under them; this methodology does not relax them.

## 4a. AI relevance

AI relevance is **enrichment, assessed separately, and never an inclusion
criterion**. A data centre is on the map because it exists; what it runs is a
different question with its own evidence, and a facility with no AI evidence at
all is an ordinary, publishable record.

Four states, because the two ways of knowing nothing are different facts:

- `documented_ai` — a source explicitly connects the facility to AI training or
  inference, a GPU deployment, an AI cloud, an AI tenant, or a named GPU
  cluster.
- `ai_capable_or_high_density` — a source explicitly markets or documents
  high-density, liquid-cooled, HPC or GPU-ready capability, but no specific AI
  deployment is evidenced.
- `no_documented_ai` — a real data centre, verified, whose reviewed sources
  provide no AI-specific evidence. **This does not mean the facility cannot
  support AI.** It means only that Urdais currently has no evidence of AI use.
- `unknown` — AI relevance has not yet been researched sufficiently.

Both positive states require at least one cited `ai_relevance` claim, enforced
by a commit-time trigger: a classification is a claim about the world and needs
a document, exactly as a megawatt figure does. The negative and unresearched
states require none, because neither asserts anything about the facility.

**AI capability is never inferred from size**, from power draw, from an
operator's other sites, or from a metro's reputation. Where cooling or density
capability is documented, it is recorded as a `cooling` claim and the facts it
supports, not as an assumption about workload.

Nothing in this section gates publication. A `data_center` publishes with
`ai_relevance` set to `unknown` exactly as readily as with `documented_ai`.

## 5. Location and coordinate precision

A public dot makes a physical-location claim, so something must have made it.
Evidence for a position, in preference order:

1. official coordinates;
2. an official street address;
3. a government, permit or planning address;
4. an operator-published campus location;
5. a strong secondary-source address;
6. a corroborated established-directory address (section 4's corroboration rule);
7. a clearly identifiable named facility feature from a mapping source.

Never used: an arbitrary city or metro centroid; a guessed industrial park; a
nearby company office; or another facility's coordinates merely because a
relationship exists between them.

Coordinates are recorded at the precision the evidence supports, and the
precision is recorded with them.

- `building` — a specific building, or a geocoded street address that resolves
  to one.
- `campus` — a site or campus centroid, including a named industrial feature
  matching the campus.
- `street` — a street-level geocode of a published address.
- `city` — a city centroid.

Coordinates are never fabricated, and a city centroid is never promoted to a
position: placing a dot at a city centroid asserts that a facility stands in the
middle of a town. **`city` precision is not map-eligible.** Nor is a record with
no coordinates at all.

Map eligibility is one expression, `reference.facility_is_map_eligible`, used
both by the publication constraint and by the public read query, so the write
gate and the read filter cannot drift apart.

**A documented street address that has not yet been geocoded is a valid
canonical research record.** It keeps its precision, it keeps its evidence, and
it waits for a position rather than being discarded or given one. Two records in
the current dataset are exactly this.

## 6. Power infrastructure

Generation is on this map because of what it powers, or not at all.

A `power_infrastructure` record may be **published** only where a cited document
establishes a material relationship to compute: an evidenced `supplies_power_to`
edge into a `data_center`, `gpu_compute_cluster` or `semiconductor_fab`. A
power-purchase agreement matching a company's load across a market is not such a
relationship unless it names a facility this dataset holds.

The rule is a deferred constraint trigger, checked at commit, and is repeated in
the public read query: a publication cannot outlive the relationship that
justified it. Removing the edge or its evidence fails as loudly as never having
had it.

Generic generation is recorded as research where the research supports it, and
never published.

## 7. Lifecycle and dates

`announced`, `planned`, `under_construction`, `operational`, `expansion`,
`suspended`, `cancelled`, `retired`, or null where the sources do not support a
status. A date is recorded only where a cited source supports it.

A `cancelled` or `retired` facility is not current infrastructure and is not
published as an active facility. Where such a record is retained, it is retained
under the ordinary publication rules, which exclude it from the map.

**A planned or announced facility may be published** once its physical site is
sufficiently identified under section 5. The map is physical-infrastructure
intelligence, not a register of currently operational capacity, and a site with
a permit and an address is a fact about the world before its first rack arrives.

## 8. Relationships

Directed and evidenced. Each edge is stored once, in its canonical direction; an
inverse is a way of reading a row, not a second row.

- `hosted_by` — from the tenant or cluster, to the campus it sits in.
- `supplies_power_to` — from the generator, to the load.
- `packaging_for` — from the packaging site, to the wafer fab.
- `same_campus` — an unordered pair: one site, two entities.
- `same_program` — an unordered pair: one company or programme, different sites.
- `expansion_of` — from the later phase, to the earlier one.

Relationships are never inferred from proximity or shared coordinates. An edge
with no document behind it is an inference: it is recorded where the research
asserts it, and it cannot gate a publication.

## 9. The other three categories do not broaden

The 2.0.0 expansion applies to `data_center` and to nothing else.

- **GPU compute cluster** still requires evidence of an identifiable physical
  compute system or deployment. Generic GPU availability in a cloud region is
  not a mapped cluster, and a machine that is not accelerator-based is not one
  whatever its standing.
- **Semiconductor fab** keeps its AI and compute supply-chain relevance rule
  unchanged. Broadening it to all semiconductor manufacturing would be a
  separate decision, and is not made here.
- **Power infrastructure** keeps the strict rule of section 6 exactly. Urdais
  does not map power plants; it maps the ones a document ties to compute.

## 10. Public-map eligibility and publication approval

A facility record exists independently of whether it is shown. A researched
facility with no coordinates is a legitimate row; it is simply never a dot.
"Unmapped" is a publication state, not an infrastructure category, and it is not
on the public legend.

A `published` record is fully approved only when all of the following hold:

1. it is map-eligible under section 5;
2. its verification date is present, and within the staleness horizon of section 11
   at read time;
3. its confidence is `high` or `medium`;
4. its lifecycle status is not `cancelled` or `retired`;
5. its positioning evidence is admissible under section 4 — at least one Tier 1
   or Tier 2 document claiming a `location` or `coordinates`, or two Tier 3
   documents from independent publishers;
6. if it is power infrastructure, section 6 is satisfied;
7. it names the methodology version under which it was approved.

Conditions 1, 2 (presence), 3, 4 and 7 are check constraints; 5 and 6 are
commit-time triggers; the horizon in 2 is applied by the read path.

A `research` record may also appear on the public map, labelled **Research**,
when the read path establishes conditions 1, 2, 4, 5 and 6. It must have at
least one evidence document, and no unresolved identity or entity-grain issue
may be present; such a record belongs in `review_required`. Research visibility
does not imply final approval, does not require complete capacity, AI relevance,
owner or operator enrichment, and does not assign a methodology version to the
row. The current read methodology supplies the safety gate each time it is
served.

**What is never required of a data centre:** AI relevance, capacity, cooling
detail, tenant identity, or a complete owner and operator. A facility whose
identity and position are resolved publishes without any of them.

Records with a contradiction, ambiguous position, or unresolved identity are
held as `review_required` and wait for a person. A record without a position
may remain `research` in the canonical database, but it does not appear on the
map. Rejected candidates remain outside the facility table in the rejection
register.

## 11. Verification and staleness

Every public-map record carries a last-checked date. A verified or research
record whose date is older than **365 days** leaves the public map and stays in
the database.

Facilities change slowly — a campus does not move — so this is a guard against
an abandoned dataset rather than a freshness requirement. It is deliberately
generous, and it is applied when reading rather than written into the row, so
that a record returns to the map when it is re-verified rather than needing
repair.

## 12. Corrections

A facility is corrected in place: it is a slowly-changing reference record, not
an observation in a series, and there is nothing to reprocess. An import
addresses a facility by its stable research key and replaces that facility's
aliases, evidence, claims and facts wholesale, so a source removed from the
dataset is removed from the database.

Withdrawing a published facility is a state change to `withdrawn`, which a
dataset file cannot request: it is an operator decision about a live surface.

## 13. What this methodology does not do

### Versioning

1.0.0 governed the first published facilities and is superseded, not retired: it
keeps its own content hash and its own effective interval, so the rules those
records were approved under stay identifiable. A facility published under 1.0.0
continues to name 1.0.0 until an import re-approves it, and no migration
restamps a record.

### Scope

It does not calculate anything, publish a level, or define an instrument. It
does not govern the source-terms review that applies to commercial data feeds.
It does not decide which facilities are economically significant — only which
are recorded, and which are shown.
