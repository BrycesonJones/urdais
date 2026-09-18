# Urdais Map Facilities

**Methodology version 1.0.0 — approved, effective 17 September 2026.**

This methodology governs the map, which is a sourced geographic record of the
physical infrastructure underlying the AI economy. It is not an index
methodology: nothing here is calculated, there is no level, no divisor and no
calculation calendar. What it versions is the set of rules deciding which
physical facilities Urdais records, what it records about them, and which of
them appear as public dots.

Every rule below is implemented and enforced. Where a rule is a database
constraint or a commit-time trigger, this document says so, because a
methodology whose rules live only in prose can drift from the system without
either being visibly wrong.

## 1. What the map covers

Four categories, and only these four:

- `data_center` — a named physical data-centre campus or facility.
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
site or system. Not recorded:

- a cloud **region** without a named campus — a region is a service boundary,
  not a building;
- a corporate office, headquarters or directory listing;
- an announcement of intent with no identified site;
- a portfolio of colocation buildings admitted wholesale because one is
  relevant;
- a candidate that appears only in aggregator listings.

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

A landlord and its tenant are two entities. A campus and a named cluster inside
it are two entities. A second phase of one campus is the same entity unless a
source isolates it.

## 4. Source hierarchy and evidence

Evidence is recorded **per claim**, never per record: a document supports the
statements listed against it and no others. A press release that states an
address has not thereby stated a GPU count.

Preference order:

1. the operator's or owner's own facility page or press release;
2. a regulatory or government record — a filing, permit, planning document,
   utility filing or economic-development authority announcement;
3. reputable secondary press, as corroboration.

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
- `secondary_corroboration` — industry press or financial press.

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

## 5. Location and coordinate precision

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
published.

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

## 9. Publication eligibility

A facility record exists independently of whether it is shown. A researched
facility with no coordinates is a legitimate row; it is simply never a dot.
"Unmapped" is a publication state, not an infrastructure category, and it is not
on the public legend.

A record is published only when all of the following hold:

1. it is map-eligible under section 5;
2. its verification date is present, and within the staleness horizon of section 10
   at read time;
3. its confidence is `high` or `medium`;
4. its lifecycle status is not `cancelled` or `retired`;
5. at least one cited document supports a `location` or `coordinates` claim —
   a dot is a positional assertion, so a document must have made it;
6. if it is power infrastructure, section 6 is satisfied;
7. it names the methodology version under which it was approved.

Conditions 1, 2 (presence), 3, 4 and 7 are check constraints; 5 and 6 are
commit-time triggers; the horizon in 2 is applied by the read path.

Records that fail a condition they could plausibly meet are held as
`review_required` and wait for a person. Records that cannot be placed at all
are held as `research`.

## 10. Verification and staleness

Every record carries a last-verified date. A published record whose verification
is older than **365 days** leaves the public map and stays in the database.

Facilities change slowly — a campus does not move — so this is a guard against
an abandoned dataset rather than a freshness requirement. It is deliberately
generous, and it is applied when reading rather than written into the row, so
that a record returns to the map when it is re-verified rather than needing
repair.

## 11. Corrections

A facility is corrected in place: it is a slowly-changing reference record, not
an observation in a series, and there is nothing to reprocess. An import
addresses a facility by its stable research key and replaces that facility's
aliases, evidence, claims and facts wholesale, so a source removed from the
dataset is removed from the database.

Withdrawing a published facility is a state change to `withdrawn`, which a
dataset file cannot request: it is an operator decision about a live surface.

## 12. What this methodology does not do

It does not calculate anything, publish a level, or define an instrument. It
does not govern the source-terms review that applies to commercial data feeds.
It does not decide which facilities are economically significant — only which
are recorded, and which are shown.
