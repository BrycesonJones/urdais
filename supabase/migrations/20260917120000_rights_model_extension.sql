-- Rights model extension: a permission grant becomes able to say what it actually grants.
--
-- Until now a grant carried three booleans -- collection, index use, content syndication --
-- and that was adequate while every source was a public statistical compiler or a provider's
-- own price page. It is not adequate for a commercial market-data agreement, and the two axes
-- it cannot express are exactly the two UGAI's reproducibility commitment depends on:
--
--   storage                    may Urdais retain the inputs at all, and for how long
--   post-termination retention may Urdais keep them after the agreement ends
--
-- `ugai.md` states that licensing may constrain publication but never retention: if Urdais
-- cannot retain the inputs behind an observation it cannot prove that observation, and the
-- lineage commitment is void. A source requiring deletion of the audit trail on termination is
-- therefore disqualified regardless of price, and that is a fact the schema should be able to
-- hold rather than a sentence in a document.
--
-- The publication axis is split for the same reason. "Index use" conflated calculating an index
-- with publishing one, and the research found vendors that permit the first and forbid the
-- second, and vendors that permit a derived product while forbidding retention of the inputs
-- that produced it. One boolean cannot represent that, so publication is now recorded per
-- output: the level, the constituents, the weights, the membership changes.
--
-- Three design decisions worth stating:
--
--   1. `covers_index_use` is kept, not replaced. It is read by UCPI's daily run, the Model
--      Frontier store and the UTVI store, and by four SQL tests. Renaming it would break
--      production code to no benefit in this migration. It remains the coarse legacy gate;
--      `covers_index_calculation` is the precise successor and is backfilled from it.
--
--   2. False means "not established by review", not "prohibited". This matches the registry's
--      existing `not_reviewed` philosophy: the absence of a recorded right is the absence of
--      evidence, and a later review can assert it. Only `termination_obligation` records a
--      positive prohibition.
--
--   3. `rights_layer` exists because a vendor grant otherwise looks like full coverage. A
--      vendor may licence its own data and convey nothing about the exchange whose prices it
--      redistributes. Recording which layer of the chain a grant covers is what stops the two
--      being confused later, when nobody remembers which conversation produced the row.

alter table reference.permission_grants
  -- Use axes. Collection already exists; these say what may happen to what was collected.
  add column covers_internal_use                  boolean not null default false,
  add column covers_index_calculation             boolean not null default false,

  -- Retention axes. The reason this migration exists.
  add column covers_storage                       boolean not null default false,
  add column covers_historical_retention          boolean not null default false,
  add column covers_post_termination_retention    boolean not null default false,
  add column covers_historical_reconstruction     boolean not null default false,

  -- Publication axes, one per published output, because they are licensed separately.
  add column covers_index_level_publication       boolean not null default false,
  add column covers_constituent_publication       boolean not null default false,
  add column covers_weight_publication            boolean not null default false,
  add column covers_membership_change_publication boolean not null default false,

  -- Redistribution of the underlying values. Expected false throughout: UGAI withholds prices,
  -- share counts and float factors by default and offers that withholding in negotiation.
  add column covers_raw_redistribution            boolean not null default false,

  -- Which layer of the chain vendor -> exchange -> index rights -> display this grant covers.
  add column rights_layer                         text not null default 'publisher'
                                                    constraint permission_grants_rights_layer_allowed
                                                    check (rights_layer in (
                                                      'publisher', 'vendor', 'exchange', 'regulator', 'issuer', 'other'
                                                    )),

  -- The disqualifying fact, made queryable rather than left in prose.
  add column termination_obligation               text not null default 'unspecified'
                                                    constraint permission_grants_termination_obligation_allowed
                                                    check (termination_obligation in (
                                                      'none', 'cease_use', 'delete_all', 'delete_except_derived', 'unspecified'
                                                    )),

  -- Where retention is permitted but time-bounded.
  add column retention_limit                      interval,

  -- A grant is rarely global. Venues are recorded as ISO 10383 MICs; null means unscoped.
  add column covered_venues                       text[],

  -- Evidence, on the same convention the source registry already uses: identify the document
  -- and quote the sentence the determination rests on; never store the document.
  add column terms_document_hash                  text
                                                    constraint permission_grants_terms_hash_format
                                                    check (terms_document_hash is null or terms_document_hash ~ '^[0-9a-f]{64}$'),
  add column decisive_clause                      text,
  add column reviewed_by                          text,
  add column reviewed_on                          date;

-- A grant cannot simultaneously promise post-termination retention and oblige deletion of
-- everything. This is the Phase 4 disqualifier expressed as arithmetic rather than advice.
alter table reference.permission_grants
  add constraint permission_grants_retention_not_contradictory
    check (not (covers_post_termination_retention and termination_obligation = 'delete_all'));

-- A level that may not be calculated cannot be published. The converse is not constrained:
-- calculating without publishing is an ordinary internal use.
alter table reference.permission_grants
  add constraint permission_grants_publication_requires_calculation
    check (not covers_index_level_publication or covers_index_calculation);

-- Weights and constituents are narrower publications of the same index; publishing either
-- presupposes the level may be published. Membership changes are treated the same way.
alter table reference.permission_grants
  add constraint permission_grants_detail_publication_requires_level
    check (
      (not covers_constituent_publication and not covers_weight_publication
        and not covers_membership_change_publication)
      or covers_index_level_publication
    );

-- MICs are four alphanumeric characters. An empty array is a scoping mistake rather than a
-- statement, so it is rejected; null means the grant is not venue-scoped.
--
-- A CHECK constraint may not contain a subquery, so the array is validated by an immutable
-- function. This is the standard workaround and stays a pure function of its argument.
create or replace function reference.all_valid_mics(venues text[])
returns boolean
language sql
immutable
as $$
  -- cardinality, not array_length: array_length(array[]::text[], 1) is null rather than 0, a
  -- null makes the whole expression null, and a CHECK only rejects false. An empty array would
  -- otherwise slip through the constraint meant to reject it.
  select venues is null
      or (cardinality(venues) >= 1
          and not exists (select 1 from unnest(venues) as mic where mic !~ '^[A-Z0-9]{4}$'));
$$;

comment on function reference.all_valid_mics(text[]) is
  'True when every element is a well-formed ISO 10383 MIC and the array is non-empty, or the array is null. Used by permission_grants.covered_venues, which a CHECK cannot validate directly because CHECK forbids subqueries.';

alter table reference.permission_grants
  add constraint permission_grants_covered_venues_are_mics
    check (reference.all_valid_mics(covered_venues));

-- Backfill, stated as the two inferences it is.
--
--   covers_index_calculation := covers_index_use
--       A direct semantic mapping. The legacy flag meant "this grant permits using the data in
--       an Urdais index", which is the calculation right.
--
--   covers_internal_use := covers_collection
--       Collection was always reviewed for a purpose, and a grant permitting retrieval has
--       never meant retrieval without use.
--
-- Everything else stays false: not prohibited, not established. The existing rows are public
-- statistical compilers and provider terms pages whose retention and publication axes have
-- never been reviewed, and inventing an answer here would be exactly the fabrication the
-- registry exists to prevent.
update reference.permission_grants
   set covers_index_calculation = covers_index_use,
       covers_internal_use      = covers_collection;

comment on column reference.permission_grants.covers_internal_use is
  'The data may be used internally for Urdais purposes. Backfilled from covers_collection: retrieval has never been reviewed as retrieval without use.';
comment on column reference.permission_grants.covers_index_calculation is
  'The data may be used to calculate an Urdais index. The precise successor to covers_index_use, which is retained because production code still reads it.';
comment on column reference.permission_grants.covers_storage is
  'The data may be retained beyond the immediate calculation. False means not established by review, not prohibited.';
comment on column reference.permission_grants.covers_historical_retention is
  'Historical values may be retained as a series, not merely the latest observation.';
comment on column reference.permission_grants.covers_post_termination_retention is
  'Retained data survives the end of the agreement. UGAI cannot prove a published observation without this, so a source that refuses it cannot supply a published index value.';
comment on column reference.permission_grants.covers_historical_reconstruction is
  'Retained inputs may be used to restate, audit, correct, and answer challenges to values already published.';
comment on column reference.permission_grants.covers_index_level_publication is
  'The derived index level and its percentage changes may be published.';
comment on column reference.permission_grants.covers_constituent_publication is
  'Constituent names may be published.';
comment on column reference.permission_grants.covers_weight_publication is
  'Exact as-of constituent weights may be published. Recorded separately because it is the output most often restricted, and because ugai.md makes its publication conditional on exactly this right.';
comment on column reference.permission_grants.covers_membership_change_publication is
  'Additions, deletions and rebalance changes may be published with their effective dates.';
comment on column reference.permission_grants.covers_raw_redistribution is
  'The underlying values themselves may be republished. Expected false: UGAI withholds prices, share counts and float factors by default.';
comment on column reference.permission_grants.rights_layer is
  'Which layer of the chain vendor -> exchange -> index rights -> display this grant covers. A vendor grant conveys nothing about the exchange whose prices it redistributes, and recording the layer is what keeps the two from being confused.';
comment on column reference.permission_grants.termination_obligation is
  'What must happen to retained data when the agreement ends. delete_all is disqualifying for any source feeding a published index value.';
comment on column reference.permission_grants.retention_limit is
  'How long retention is permitted where it is time-bounded. Null with covers_storage true means unbounded.';
comment on column reference.permission_grants.covered_venues is
  'ISO 10383 MICs this grant is scoped to. Null means unscoped; an empty array is rejected as a scoping mistake.';
comment on column reference.permission_grants.terms_document_hash is
  'SHA-256 of the terms document the determination rests on, on the same convention as the source registry.';
comment on column reference.permission_grants.decisive_clause is
  'The sentence the determination rests on, quoted verbatim. A paraphrase is not evidence.';
comment on column reference.permission_grants.reviewed_by is
  'Who made the determination.';
comment on column reference.permission_grants.reviewed_on is
  'When the determination was made.';
