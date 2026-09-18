# The map's facility foundation

**Status: internal architecture document. Not routed publicly, not registered in the docs catalog.** Written 17 September 2026 when the map stopped drawing demo points (Phase 2); §"The complete dataset" added the same day when the whole research package was projected and dry-run (Phase 3); §"Methodology 2.0.0" the same day when the data-centre scope opened. The public methodology is `docs/methodology/map-facilities.md`; this document describes the implementation that enforces it.

How a researched facility becomes a dot, and what stops one that should not.

Before this phase the map drew a hard-coded list from the client bundle. It now
draws published rows from the database, through the same path every other Urdais
dataset uses: a canonical record, its evidence, and a publication decision kept
separate from both.

```
reviewed research (Markdown)
  → import document (JSON, versioned)
    → contract validation      structure, vocabulary, ranges, dates
      → import plan            duplicates, relationship targets, publication eligibility
        → dry-run report       errors and review candidates, written nowhere
          → one transaction    facilities, aliases, evidence, claims, facts, relationships
            → public read      published + placeable + current (+ the power rule)
              → GeoJSON        the existing MapLibre engine, unchanged
```

## The three rules the schema exists to hold

**A record that exists is not a record that publishes.** A facility Urdais has
researched but cannot place — no coordinates, or only a city centroid — is a
real row with real evidence that simply never becomes a dot. The alternative,
which the demo data modelled, was an "Unmapped" category on the public legend: a
data-quality state wearing the clothes of an infrastructure type. Publication is
now a column on the facility, and "Unmapped" is gone from the public map.

**Shared coordinates are not a duplicate.** LUMI sits inside CSC Kajaani and
reports the same latitude and longitude; so do JUPITER and Jülich, Prometheus
and New Albany, Horizon 1 and Childress. Those are eight entities, not four.
Nothing in the schema or the importer merges on position or on name similarity.

**A power station is on this map because of what it powers.** A published
`power_infrastructure` facility must have an evidenced `supplies_power_to` edge
into a data center, GPU cluster or fab. The rule is a commit-time trigger, and
it is repeated in the public query so a publication cannot outlive the
relationship that justified it.

## Schema

`supabase/migrations/20260917260000_map_facility_foundation.sql`, six tables in
the `reference` schema, RLS enabled with no policies like every other table.

| Table | What it holds |
| --- | --- |
| `reference.facilities` | The canonical record: research key, name, category, owner, operator, lifecycle, address parts, position and its precision and method, publication state, confidence, review notes, dates. |
| `reference.facility_aliases` | Other names and source-native identifiers (`alias`, `former_name`, `source_identifier`). Deduplication input only. |
| `reference.facility_evidence` | One source document: publisher, title, URL, document type, publication date, verification state. Optional links to `reference.source_interfaces` and `pipeline.source_retrievals`. |
| `reference.facility_evidence_claims` | What each document supports, field by field. |
| `reference.facility_facts` | Megawatts, accelerator platforms, process nodes. `evidence_id` is NOT NULL. |
| `reference.facility_relationships` | Directed, typed, evidenced edges. |

Two shared predicates keep the write gate and the read filter from drifting:

- `reference.facility_is_map_eligible(lat, lon, precision)` — a position exists
  and is better than a city centroid. Used by the publication check constraint
  and by the public query.
- `reference.facility_is_compute_category(category)` — what counts as compute
  for the power rule.

### Why facility evidence is its own table

The existing source registry models *interfaces* Urdais reads repeatedly — an
offer API, a price catalog. A county air permit fetched once is not one of
those, and creating a provider plus an interface row for each of the research
package's 124 source URLs would fill the registry with things nothing will ever
poll. So `facility_evidence` carries its own document identity and links into
the registry only where a registered interface genuinely produced the document.
Both links are optional and neither is invented.

### Why facts are rows with a mandatory source

The research methodology's own rule is "do not attach GPU or MW facts to a
source that does not support them". `facility_facts.evidence_id` is `NOT NULL`,
so a megawatt figure cannot be stored at all without naming the document that
states it. Category-specific values live here rather than as forty
mostly-null columns on the facility.

## Publication rules

A facility may be `research`, `review_required`, `published` or `withdrawn`.
Only `published` reaches the map, and only if all of the following hold.

Row-level check constraints:

- a position exists and its precision is `building`, `campus` or `street`;
- `last_verified_date` is set;
- confidence is `high` or `medium`;
- lifecycle status is not `cancelled` or `retired`.

Commit-time (deferred constraint triggers, since an importer writes a facility
before its evidence):

- at least one evidence record;
- at least one claim on `location` or `coordinates` — a dot is a positional
  claim, so a document must have made it;
- for `power_infrastructure`, an evidenced `supplies_power_to` edge into a
  compute facility. Deleting that edge, or the evidence behind it, fails as
  loudly as never having had it.

Read-path only:

- `last_verified_date` within `FACILITY_VERIFICATION_HORIZON_DAYS` (365).
  Facilities change slowly, so this is a guard against an abandoned dataset
  rather than a freshness requirement. The database only insists the date
  exists; the horizon is applied when reading, and a record that falls outside
  it stays in the database and leaves the map.

## Relationship semantics

Each edge is stored once, in its canonical direction. The research package lists
many edges twice; an inverse is a way of reading a row, not a second row, so
there is no `hosts` and no `powered_by`.

| Type | Direction | Meaning |
| --- | --- | --- |
| `hosted_by` | tenant/cluster → campus | A GPU cluster or tenant inside a data center. |
| `supplies_power_to` | generator → load | A documented energy link. The only type that gates power publication. |
| `packaging_for` | packaging site → wafer fab | Backend versus front-end of one company. |
| `same_campus` | unordered | One site, two entities. |
| `same_program` | unordered | One company or programme, different sites. |
| `expansion_of` | later phase → earlier | A phase of an existing facility. |

The two unordered types are protected by a unique index on the unordered pair,
so the same pair cannot be stored in both directions. Relationships are never
inferred from shared coordinates; they come from the research file's own
relationship table, with the document behind each one.

## The import contract

`src/lib/facilities/contract.ts`, version **`urdais.map.facility-import/1`**.
The Markdown research package stays the human system of record; this JSON is the
machine contract projected from it.

The version is checked exactly, not by range: a tolerant reader's failure mode
here is a silently dropped field — a source, a relationship, a coordinate
precision — and a dropped field is what turns a sourced dataset into an asserted
one.

**The unknown rule.** A value Urdais does not know is `null`, or the key is
absent; the two are identical and both are accepted. A placeholder is not: an
empty string, `"N/A"`, `"unknown"`, `"TBD"`, `"-"` are all rejected with the
path that carries them. Arrays default to empty.

```jsonc
{
  "contractVersion": "urdais.map.facility-import/1",
  "datasetName": "…",
  "researchDocument": "URDAIS_MAP_RESEARCH_PHASE_1.md",
  "generatedAt": "2026-09-17",
  "facilities": [
    {
      "researchKey": "csc-kajaani-lumi-host",     // kebab-case, stable, the import identity
      "canonicalName": "CSC Kajaani Data Center (LUMI host)",
      "category": "data_center | gpu_compute_cluster | semiconductor_fab | power_infrastructure",
      "ownerName": null, "operatorName": null,
      "aliases": [{ "alias": "…", "kind": "alias|former_name|source_identifier", "authority": null }],
      "location": {
        "streetAddress": null, "locality": null, "adminArea": null,
        "countryName": null, "countryCode": "FI",
        "latitude": 64.2319866, "longitude": 27.691477,
        "coordinatePrecision": "building|campus|street|city",
        "coordinateMethod": "official_record|documented_address_geocode|campus_centroid|city_centroid",
        "coordinateNotes": null
      },
      "lifecycle": { "status": null, "announcedDate": null, "constructionStartDate": null, "operationalDate": null },
      "facts": [{ "key": "critical_it_capacity_mw", "numericValue": 400, "unit": "MW",
                  "evidenceUrl": "…", "notes": null }],
      "evidence": [{ "publisher": "…", "title": "…", "url": "https://…",
                     "documentType": "company_facility_page|company_press_release|sec_filing|government_record|permit|planning|utility_filing|industry_press",
                     "publishedOn": null, "verificationState": "unverified|human_verified|disputed",
                     "claims": [{ "field": "location", "statement": "Tehdaskatu 15, 87100 Kajaani" }] }],
      "quality": { "confidence": "high|medium|low", "lastVerifiedDate": "2026-09-17", "reviewNotes": [] },
      "requestedPublicationState": "research | review_required | published"
    }
  ],
  "relationships": [
    { "fromResearchKey": "lumi-supercomputer", "toResearchKey": "csc-kajaani-lumi-host",
      "type": "hosted_by", "evidenceUrl": "…", "notes": "…" }
  ]
}
```

A fact's `evidenceUrl` and a relationship's `evidenceUrl` must match evidence on
the owning (`from`) facility. `withdrawn` is not requestable: taking a facility
off the map is an operator decision about a live surface, not something a
dataset file asserts.

## The importer

```bash
npm run map:import                                   # dry run, the sample dataset
npm run map:import -- --file data/map/other.json     # dry run, another file
DATABASE_URL=… npm run map:import -- --write         # persist, one transaction
```

**A dry run is the default and the only thing that happens without `--write`.**
A dot is a claim that a named company operates a named facility at a named
place; the cost of reading a plan is seconds, the cost of a bad write is a wrong
claim on a public surface. A dry run with `DATABASE_URL` set is better than one
without: it reads the research keys already stored so a relationship may point
at a facility from an earlier batch. It still writes nothing.

Output is one JSON object — counts, errors, review candidates, and a batch
digest that is stable across key order, so a re-import can be recognised as the
same batch. Exit code 1 means the plan has errors and nothing was written.

**Errors stop the batch.** Duplicate research key; relationship source or target
absent from both the batch and the database; relationship citing a document that
is not evidence on its source facility; the same edge twice (or a symmetric edge
in both directions); a facility asking to publish that does not qualify; power
infrastructure asking to publish with no evidenced compute link. Nothing partial
is written and nothing is silently downgraded — a record that asks to publish
and cannot is a dataset bug to fix, not a row to demote quietly.

**Review candidates change nothing.** Shared coordinates; similar names; an
alias that names another facility; city-level precision; unresolved research
notes; no human-verified evidence; no sourced capacity facts; a verification
past the horizon. The importer reports them and acts on none of them. In
particular there is no code path anywhere in the importer that merges two
records.

## The public read path

`src/lib/facilities/read/` → `/api/map/facilities` and the `/map` page.

The page is a server component: it calls `facilityMapSurface()`, projects the
model to `UrdaisMapPoint[]`, and passes them down. There is no client fetch and
no loading state. `/api/map/facilities` serves the same model as a typed API.

Both validate the response on the way out (`validatePublicFacilities`) and
answer 500 rather than serve a dot with no source, a city centroid, a leaked
internal field, or a stale verification. An unconfigured or unreachable database
serves an empty map with a reason — never a fallback to sample points.

What crosses: id (the research key), name, category, position and precision, a
composed one-line address, owner, operator, lifecycle status, last-verified
date, and the cited sources. What does not: review notes, confidence,
publication state, coordinate notes, and every unpublished row.

## The sample dataset

`data/map/facilities-sample.v1.json` — 18 of the research package's 78
facilities, chosen to exercise the architecture rather than to cover the world:
all four categories; four sources on one facility; two host/cluster pairs at
identical coordinates; a nuclear station with its evidenced compute link; a
gas plant whose link is evidenced but which has no coordinates, so it stays a
research record; aliases including a permit identifier; building, campus and
street precision; operational, expansion, under-construction and planned
lifecycles; and four records that persist and are deliberately not published.

Fugaku is excluded on purpose: the research package flags it as CPU-based
(A64FX) and a mismatch for the GPU Compute Cluster category. It stays in
research.

### Importing it

```bash
npm run db:start && npm run db:reset && npm run db:migrate    # a local database
npm run map:import                                            # read the plan
DATABASE_URL=postgresql://postgres@localhost:54329/urdais_local npm run map:import -- --write
npm run db:test                                               # the schema's own fixtures
```

The write is idempotent: a second `--write` over an unchanged file reports every
facility as `unchanged` and leaves the database identical.

## The complete dataset

Phase 3 projected the whole research package. The pieces:

| File | What it is |
| --- | --- |
| `data/map/facilities.v1.json` | All 78 researched facilities in the contract. Generated; do not hand-edit. |
| `data/map/facilities-sample.v1.json` | The eighteen Phase 2 records, curated by hand. The projector treats them as authoritative and copies them through verbatim. |
| `data/map/rejected-candidates.v1.json` | The 38 candidates an earlier pass examined and rejected, with reasons. |
| `data/map/source-rights-register.v1.json` | The source domains whose use raises a question. Everything not listed is clear by class. |
| `scripts/map/research-parser.ts` | Reads the Markdown. Returns the research's own strings and decides nothing. |
| `scripts/map/project-research.ts` | Turns those strings into the contract under the rules documented in its header. |

```bash
npm run map:project            # regenerate the dataset and the rejection register
npm run map:project -- --check # project and report, writing nothing
npm run map:import             # dry-run the complete dataset
```

The projector is deterministic and idempotent: running it on an unchanged
research package produces a byte-identical dataset. That is what makes the
projection auditable — a reviewer can regenerate it and diff rather than trusting
that sixty records were transcribed correctly.

Three rules in the projector do the real work, and its header explains each:
claim fields are derived from the claim text against the record's own location
strings; a fact is emitted only when a cited source's claims state its value;
and the publication state is decided from the rules rather than copied from the
research's `map_ingest_ready` flag.

The current review queue and the open decisions are in
`docs/operations/map-phase-3-dataset-review.md`.

### The methodology link

`supabase/migrations/20260917270000_map_facility_methodology.sql` registers the
`map-facilities` methodology and approves version 1.0.0
(`docs/methodology/map-facilities.md`), and adds
`reference.facilities.methodology_version_id`, which a published record must
carry. The importer resolves the approved version from the database at write
time rather than taking it from the dataset file: which rules govern a
publication is an operational fact about a deployment, not something a dataset
asserts about itself. A batch that would publish with no approved version fails
before the transaction opens.

The same migration adds the `economic_development` and `financial_press`
evidence types the research package uses, and
`reference.facility_evidence_citation_class`, which separates ordinary factual
citation from the content redistribution that source-terms review governs.

It also drops the foundation migration's
`facilities_precision_needs_coordinates_or_is_absent` constraint. That constraint
allowed a precision without coordinates only for `city`, which was true of the
sample and false of the package: two records know their street and were never
geocoded. Recording that is more useful than discarding it, and the invariant
that matters — coordinates always carry a precision — is unaffected.

## Methodology 2.0.0: the data-centre scope

`supabase/migrations/20260917280000_map_data_center_scope_v2.sql`. The inclusion
criterion for `data_center` became existence rather than AI relevance, which
changes the population rather than the handling of a rule — hence a major
version. The public rules are in `docs/methodology/map-facilities.md`; what
follows is what enforces them.

**AI relevance** is a column on `reference.facilities`, not a fact row, because
facts require an `evidence_id` and two of the four states are assertions about
Urdais's own knowledge rather than about the facility: `no_documented_ai` (we
looked, the sources are silent) and `unknown` (nobody looked) have no document
behind them by definition, and collapsing them would lose the distinction the
enrichment exists to carry. The two positive states do have documents behind
them, and a deferred trigger insists on it: `documented_ai` or
`ai_capable_or_high_density` requires at least one cited `ai_relevance` claim.
Nothing about AI relevance gates publication in either direction.

**Source tiers** are `reference.facility_evidence_source_tier(document_type)`:
tier 1 primary and authoritative, tier 2 strong corroboration, tier 3 structured
directory. An unrecognised type falls to tier 3, which is the cautious
direction — it may discover and may not place.

**The directory rule** lives in `assert_facility_publishable`. A published
facility needs positioning evidence that is either one tier 1–2 document or two
tier 3 documents *from different publishers*. Counting publishers rather than
rows is deliberate: directories copy from each other, so two rows from one
directory are one lead wearing two names. `hasAdmissiblePositioning` in
`domain.ts` is the same rule for the importer, which reports it as an error
naming the record rather than as a trigger failure at commit.

Two document types were added for this work: `property_record` (tier 2) and
`facility_directory` (tier 3), plus the `ai_relevance` and `cooling` claim
fields.

**The contract went to `/2`,** and the build reads `/1` as well. The asymmetry
is the original guarantee kept: a *later* document read by an older build drops
fields silently, which is what the version check exists to prevent; an *earlier*
document drops nothing, because every /2 addition is optional. What is refused
is a /1 document that uses a /2 field, naming the field and the version it
needs. The Phase 2 and Phase 3 datasets still declare `/1` and were not
rewritten.

**Nothing restamps a record.** The migration touches no facility row. An import
stamps the approved version at write time, so a record re-approved under new
rules moves from 1.0.0 to 2.0.0 — and the importer reports each one in
`result.restamped` rather than letting it pass as an ordinary edit.

**1.0.0 is superseded, not retired.** It keeps its own content hash and its own
effective interval, so the rules the first published facilities were approved
under stay readable.

## Turning the research Markdown into production JSON

For whoever extends the sample toward the full 78. The Markdown is the system of
record; the JSON is projected from it, never the other way round.

1. **Work from §4, the per-facility evidence records**, not from §3's summary
   tables. §4 carries the aliases, the coordinate provenance, the per-source
   claim lists and the unresolved questions; §3 does not.
2. **Map the fields.** Stable research ID → `researchKey`. Canonical name →
   `canonicalName`. Category → `category`, translating the research's
   `gpu_compute_cluster` straight through (the app no longer has
   `compute_cluster`). Owner/operator → `ownerName` / `operatorName`, split on
   `owner=` / `operator=`. Location line → the `location` parts. Coordinate
   precision and its parenthesised method → `coordinatePrecision` and
   `coordinateMethod`. Lifecycle status and the three dates → `lifecycle`.
   Confidence, last verified date and unresolved questions → `quality`.
3. **Claims need a field.** The research lists "claims supported by this source"
   as free text. Assign each one a `claim_field` honestly: an address is
   `location` or `coordinates`, a megawatt figure is `capacity`, a GPU model is
   `compute_hardware`, a tenancy is `compute_relationship`. Where a statement
   supports nothing in the record, leave it out rather than forcing a field.
4. **Facts are opt-in, and cite one source.** Only record a number the source's
   own claim list states. Where the source hedges ("approximately 24,000"),
   record the figure and put the hedge in the fact's `notes` — do not silently
   promote it to a count.
5. **Relationships come from §5**, deduplicated to the canonical direction and
   dropped where the research's `related` type carries no semantics worth
   storing. Each one needs an `evidenceUrl` that is evidence on the `from`
   facility; without one it cannot gate a publication.
6. **Publication state is a judgement, not a field to copy.** `map_ingest_ready`
   in §8 is a useful filter, but a record only asks for `published` when it has
   a position better than a city centroid, a document that placed it, and — for
   power — an evidenced compute link. Everything else asks for `research`.
7. **Do not "fix" uncertain research.** Preserve the ambiguity in `reviewNotes`;
   the importer reports every note as a review candidate.
8. **Never invent a value.** Unknown is `null`. A city centroid is not a
   position. Grok is not a source; the company pages, filings, permits and
   government records it found are.

Then run a dry run, read every error and every review candidate, and only then
`--write`.

## Tests

- `supabase/tests/390_map_facility_foundation.sql` — the constraints and the
  commit-time triggers, each fixture writing a wrong row and expecting refusal.
- `src/lib/facilities/contract.test.ts` — structure, vocabulary, ranges, dates,
  placeholders, the version check.
- `src/lib/facilities/import/plan.test.ts` — errors versus review candidates,
  the power rule, relationship resolution, and that no resemblance merges
  anything.
- `src/lib/facilities/import/persist.test.ts` — one transaction, rollback on any
  failure, idempotence, addressing by research key alone.
- `src/lib/facilities/read/*.test.ts` — the query's filters and the response
  contract.
- `src/lib/facilities/sample-dataset.test.ts` — the shipped sample as a dataset,
  and its path through the existing map converter and legend filter.
