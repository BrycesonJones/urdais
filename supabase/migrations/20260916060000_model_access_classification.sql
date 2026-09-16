-- Open-weight vs Proprietary: evidence-backed model access classification, and the UTVI
-- identity bridge the volume panel needs.
--
-- Two tables, and the reasons they are shaped this way are the Phase 4A findings:
--
--   1. Classification attaches to an exact canonical model *version*, never to a lab, a
--      provider, a family or a name. Production already holds the counterexample: Alibaba
--      ships `qwen3.8-27b` and `qwen3.8-max` under one brand and one version number, and they
--      are very likely different classes. A schema keyed on anything coarser would make that
--      distinction unrepresentable.
--
--   2. Classification changes, and the old answer was not wrong. A model released API-only may
--      have its weights published a year later. So a class is superseded rather than updated,
--      and carries the date from which it is true -- which is what lets a historical statement
--      stay defensible after the world moves.
--
--   3. `unknown` is a first-class value, not an absent row. "Urdais has not established this"
--      is a fact about Urdais worth recording with its own evidence note, and it is reported
--      publicly as Unclassified rather than being quietly absorbed into either class.

-- ------------------------------------------------------------------ access classification

create table reference.model_access_classes (
  id               uuid primary key default gen_random_uuid(),
  model_id         uuid not null references reference.models (id) on delete restrict,

  -- The internal taxonomy. Richer than the public rollup on purpose: restricted and
  -- non-commercial weights are not equivalent to unrestricted ones, and a schema that could
  -- not tell them apart would force the methodology to assert an equivalence the licences
  -- themselves deny.
  access_class     text not null
                     constraint model_access_classes_class_allowed
                     check (access_class in (
                       'open_weights_unrestricted',
                       'open_weights_restricted',
                       'open_weights_noncommercial',
                       'api_only_closed_weights',
                       'unknown',
                       'not_applicable'
                     )),

  -- What kind of artifact establishes it, strongest first in the methodology's hierarchy.
  evidence_type    text not null
                     constraint model_access_classes_evidence_type_allowed
                     check (evidence_type in (
                       'weight_license',
                       'publisher_weight_repository',
                       'publisher_model_card',
                       'release_documentation',
                       'official_repository',
                       'official_pricing_or_access_page',
                       'no_evidence_found'
                     )),
  evidence_url     text,
  evidence_note    text not null
                     constraint model_access_classes_note_nonempty
                     check (btrim(evidence_note) <> ''),
  -- The licence's name, never its text. A name is a citable fact; the text is someone's work.
  license_name     text,
  publisher        text,

  verified_at      date not null,
  verified_by      text not null
                     constraint model_access_classes_verifier_nonempty
                     check (btrim(verified_by) <> ''),
  -- From when this classification is true. Not the verification date: weights published in
  -- March and verified in September were open from March.
  effective_from   date not null,

  -- Recorded when a third party disagrees, so the disagreement is visible rather than lost.
  corroboration    text,

  superseded_by_id uuid references reference.model_access_classes (id) on delete restrict
                     deferrable initially deferred,
  superseded_at    timestamptz,
  supersession_reason text,
  created_at       timestamptz not null default now(),

  constraint model_access_classes_supersession_together
    check ((superseded_by_id is null and superseded_at is null and supersession_reason is null)
           or (superseded_by_id is not null and superseded_at is not null and supersession_reason is not null)),

  -- An open-weight claim requires a locatable artifact. Failing to find weights is not
  -- evidence that none exist, so `no_evidence_found` may only ever support `unknown`.
  constraint model_access_classes_open_requires_artifact
    check (access_class not in ('open_weights_unrestricted', 'open_weights_restricted', 'open_weights_noncommercial')
           or (evidence_url is not null
               and evidence_type in ('weight_license', 'publisher_weight_repository', 'publisher_model_card', 'release_documentation', 'official_repository'))),
  -- Proprietary is a positive finding too: the measured version is offered as hosted access
  -- with no official downloadable weights. Absence of a search result is not that finding.
  constraint model_access_classes_closed_requires_positive_evidence
    check (access_class <> 'api_only_closed_weights' or evidence_type <> 'no_evidence_found'),
  constraint model_access_classes_unknown_has_no_license
    check (access_class <> 'unknown' or license_name is null)
);

comment on table reference.model_access_classes is
  'Whether a canonical model version publishes downloadable weights, on the publisher''s own evidence. Keyed to an exact model version because one lab ships both open and closed products under one brand. Superseded rather than updated, because a model released API-only may have weights published later and the earlier classification was not wrong.';

-- One live classification per model. The invariant the read layer depends on.
create unique index model_access_classes_active_idx
  on reference.model_access_classes (model_id)
  where superseded_by_id is null;

create index model_access_classes_class_idx
  on reference.model_access_classes (access_class) where superseded_by_id is null;

-- ------------------------------------------------------------------ UTVI identity bridge
--
-- Phase 4A's blocking finding: `utvi_model_observations.model_id` is null on every row, so
-- nothing connects OpenRouter's permaslugs to canonical models and volume cannot be grouped
-- by anything but lab. This is the same evidenced-link shape `capability_model_links` uses
-- for Epoch, for the same reason and with the same refusals.

create table reference.utvi_model_links (
  id                       uuid primary key default gen_random_uuid(),
  -- Verbatim, exactly as the source publishes it. Equality against this column is the only
  -- join permitted: no case folding, no date-suffix stripping, no variant merging.
  source_model_permaslug   text not null unique
                             constraint utvi_model_links_permaslug_nonempty
                             check (btrim(source_model_permaslug) <> ''),
  model_id                 uuid references reference.models (id) on delete restrict,
  link_state               text not null
                             constraint utvi_model_links_state_allowed
                             check (link_state in ('evidenced', 'ambiguous', 'unmapped', 'not_applicable')),
  evidence                 text not null
                             constraint utvi_model_links_evidence_nonempty
                             check (btrim(evidence) <> ''),
  linked_by                text not null,
  linked_at                timestamptz not null default now(),
  created_at               timestamptz not null default now(),

  constraint utvi_model_links_evidenced_has_model
    check (link_state <> 'evidenced' or model_id is not null),
  constraint utvi_model_links_unevidenced_has_no_model
    check (link_state = 'evidenced' or model_id is null)
);

comment on table reference.utvi_model_links is
  'Maps an OpenRouter permaslug, verbatim, to a canonical Urdais model. Only evidenced links may be grouped by access class; ambiguous, unmapped and not_applicable keep the volume and refuse the join, so a stealth or unrecognised identifier contributes to an explicit Unclassified residual rather than to either public class.';

create index utvi_model_links_model_idx on reference.utvi_model_links (model_id) where model_id is not null;
create index utvi_model_links_state_idx on reference.utvi_model_links (link_state);

alter table reference.model_access_classes enable row level security;
alter table reference.utvi_model_links     enable row level security;

-- ------------------------------------------------------------------ methodology governance

insert into reference.methodologies (id, slug, name, document_path) values
  ('4a000000-0000-4000-8000-000000000010', 'open-weight-proprietary',
   'Urdais Open-weight vs Proprietary', 'docs/methodology/open-weight-proprietary.md')
on conflict (slug) do nothing;
