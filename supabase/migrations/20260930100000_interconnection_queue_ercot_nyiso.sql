-- IQ-3: ERCOT's published archive and NYISO's two queues.
--
-- Three additions, each forced by something the two sources actually do.
--
-- ERCOT is the first market whose history must be *accumulated* rather than read out of the
-- current file. It publishes a monthly workbook and keeps every one of them: 99 artifacts across
-- 93 report periods, six of which are corrections republished as separate files. A snapshot
-- therefore needs to say which period it describes and whether it is a correction of one, so that
-- a corrected June 2023 can supersede the original June 2023 without either artifact being lost.
--
-- NYISO is the first market that publishes a load interconnection queue, and it classifies those
-- loads by end use — including a distinct code for AI data centres. That is a real vocabulary and
-- it gets a real table, populated only from codes the source itself publishes.
--
-- What is deliberately NOT added is a presence table. "Was request X in snapshot Y" is already
-- answerable: every retrieval writes one raw record per source row, carrying both the snapshot and
-- the native queue id, and the existing index serves the lookup. A second structure recording the
-- same fact would be a second thing to keep true.

-- ------------------------------------------------------------------ snapshots gain a period

alter table pipeline.interconnection_queue_snapshots
  -- The period the artifact describes, which is not when it was published: ERCOT's August 2026
  -- report is published in September. Null for sources that publish no period.
  add column report_period date,
  -- True when the publisher reissued an artifact for a period it had already reported.
  add column is_correction boolean not null default false,
  -- The publisher's own document identity in its archive, where it has one.
  add column native_document_id text,
  add column archive_metadata jsonb
    constraint interconnection_snapshots_archive_metadata_object
    check (archive_metadata is null or jsonb_typeof(archive_metadata) = 'object');

comment on column pipeline.interconnection_queue_snapshots.report_period is
  'The period the artifact reports on, distinct from when it was published. A correction shares its period with the artifact it corrects; both are retained.';

create index interconnection_snapshots_period_idx
  on pipeline.interconnection_queue_snapshots (source_interface_id, report_period);

-- Presence at scale: 99 ERCOT artifacts of ~1,800 rows each is ~178,000 raw records, and the
-- question asked of them is always "which snapshots held this queue id".
create index raw_interconnection_presence_idx
  on pipeline.raw_interconnection_queue_records (native_queue_id, snapshot_id);

-- ------------------------------------------------------------------ load end use

create table reference.interconnection_load_end_uses (
  code        text primary key
                constraint interconnection_load_end_uses_code_lower
                check (code = lower(btrim(code)) and code <> ''),
  label       text not null
                constraint interconnection_load_end_uses_label_nonempty check (btrim(label) <> ''),
  notes       text,
  created_at  timestamptz not null default now()
);

comment on table reference.interconnection_load_end_uses is
  'What a load interconnection request intends to power, normalized from codes the publisher itself assigns. Never inferred from a project name.';

insert into reference.interconnection_load_end_uses (code, label, notes) values
  ('data_center_ai', 'Data centre, AI', 'The publisher distinguishes an AI or high-density computing data centre. NYISO code DAT-AI.'),
  ('data_center', 'Data centre', 'A data centre the publisher did not further classify. NYISO codes DAT and DAT-CM.'),
  ('manufacturing', 'Manufacturing', 'Industrial or manufacturing load. NYISO M- prefixed codes.'),
  ('research', 'Research', 'Research and development load. NYISO code RD.'),
  ('other', 'Other', 'An end use the publisher named and this vocabulary does not split out.'),
  ('unknown', 'Unknown', 'The publisher published no end use, or one this pipeline has not mapped.');

alter table pipeline.interconnection_request_observations
  -- The publisher's own code, always. The normalized value groups; it never replaces.
  add column native_end_use text,
  add column load_end_use text references reference.interconnection_load_end_uses (code) on delete restrict,
  -- An end use belongs to a load request. A generator does not have one.
  add constraint interconnection_observations_end_use_is_load
    check (load_end_use is null or request_class in ('load', 'mixed'));

create index interconnection_observations_end_use_idx
  on pipeline.interconnection_request_observations (load_end_use) where is_latest;

-- The confirmation trigger must also refuse silent edits to the two new evidence fields.
create or replace function pipeline.allow_only_interconnection_confirmation()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'interconnection observations are append-only' using errcode = 'restrict_violation';
  end if;
  if new.request_id is distinct from old.request_id
     or new.observation_ordinal is distinct from old.observation_ordinal
     or new.observation_hash is distinct from old.observation_hash
     or new.first_snapshot_id is distinct from old.first_snapshot_id
     or new.first_raw_record_id is distinct from old.first_raw_record_id
     or new.lifecycle_stage is distinct from old.lifecycle_stage
     or new.native_status is distinct from old.native_status
     or new.requested_on is distinct from old.requested_on
     or new.actual_in_service_on is distinct from old.actual_in_service_on
     or new.withdrawn_on is distinct from old.withdrawn_on
     or new.native_end_use is distinct from old.native_end_use
     or new.load_end_use is distinct from old.load_end_use then
    raise exception 'an interconnection observation may not be edited; record a new observation'
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------ the two sources

insert into reference.source_interfaces
  (id, provider_id, slug, name, source_class, canonical_url, is_machine_readable,
   access_class, production_access_state, terms_review_state, data_use_terms_state,
   written_agreement_required, terms_evidence, notes)
select v.id, p.id, v.slug, v.name, 'interconnection_queue', v.canonical_url, true,
       'public_unauthenticated', v.production_state, v.terms_state, v.data_use_state, false,
       jsonb_build_object('reviewed_on', '2026-09-21',
         'research', 'IQ-1 interconnection queue source reconnaissance',
         'documents', jsonb_build_array(jsonb_build_object('title', v.terms_title, 'url', v.terms_url, 'note', v.terms_note))),
       v.notes
from (values
  ('99000000-0000-4000-8300-000000000004'::uuid, 'ercot-planning', 'ercot-gis-report',
   'ERCOT Generator Interconnection Status Report',
   'https://www.ercot.com/mp/data-products/data-product-details?id=PG7-200-ER',
   'production_review_pending', 'permitted', 'permitted',
   'ERCOT Terms of Use', 'https://www.ercot.com/help/terms',
   'Section 5 permits raw public data to be used, reproduced and redistributed in compilations, charts and analyses.',
   'A monthly workbook on the ERCOT Market Information System, report type 15933, retained back to December 2018. Large and small generator project details, plus monthly inactive, cancellation and commissioning deltas. Capacity is reported on a net-change basis for repowering and may be negative. The workbook publishes no actual commercial operation date; it publishes energization and synchronization milestones.'),
  ('99000000-0000-4000-8300-000000000005'::uuid, 'nyiso', 'nyiso-interconnection-queue',
   'NYISO Interconnection Queue',
   'https://www.nyiso.com/interconnections',
   'research_usable', 'under_review', 'under_review',
   'NYISO Terms of Use', 'https://www.nyiso.com/legal-notice',
   'NYISO asserts copyright in its materials and does not publish an affirmative reuse grant.',
   'A dated monthly workbook carrying the generation queue, cluster projects, withdrawn and in-service sheets, and a separate Load Projects sheet. The load sheet classifies each request by end use, including a distinct code for AI data centres. Project status is a numeric code whose legend is printed in a note row rather than published as a table.')
) as v(id, provider_slug, slug, name, canonical_url, production_state, terms_state, data_use_state,
       terms_title, terms_url, terms_note, notes)
join reference.providers p on p.slug = v.provider_slug
on conflict (slug) do nothing;

-- ERCOT's terms carry an affirmative grant; NYISO's do not. Neither classification is changed
-- from what IQ-1 recorded, and NYISO stays ambiguous under the founder-accepted-risk policy.
with policy (interface_slug, classification, attribution_text, conditions, unresolved_issue, terms_url, note) as (values
  ('ercot-gis-report', 'reusable_with_attribution_or_conditions',
   'Source: Electric Reliability Council of Texas, Inc., Generator Interconnection Status Report.',
   'Credit ERCOT as the source, and carry the report''s own statement that it is for planning purposes only. Never present a queued capacity as available supply.',
   'Counsel to confirm that ERCOT Terms of Use section 5 reaches individual queue records republished in a commercial product.',
   'https://www.ercot.com/help/terms',
   'ERCOT is the only queue source of five with an affirmative reuse grant.'),
  ('nyiso-interconnection-queue', 'ambiguous_requires_legal_review',
   'Source: New York Independent System Operator, Inc., Interconnection Queue.',
   'Attribute NYISO wherever a queue value is displayed, and never present a queue MW as available capacity.',
   'NYISO asserts copyright in its materials and publishes no affirmative reuse grant. Counsel to determine whether that reaches individual queue records.',
   'https://www.nyiso.com/legal-notice',
   'Published under the Urdais founder-accepted-risk policy while the question above is open.')
)
insert into reference.source_use_permissions
  (source_interface_id, purpose_code, rights_classification, disposition,
   attribution_required, attribution_text, conditions, unresolved_issue,
   terms_document_url, reviewed_by, reviewed_on, effective_from, notes)
select s.id, u.code, policy.classification, 'permitted',
       u.is_public, case when u.is_public then policy.attribution_text end,
       case when u.is_public then policy.conditions end,
       policy.unresolved_issue, policy.terms_url,
       'Urdais research', date '2026-09-21', timestamptz '2026-09-21T00:00:00Z', policy.note
from policy
join reference.source_interfaces s on s.slug = policy.interface_slug
cross join reference.source_use_purposes u
where u.code in ('internal_retention', 'interconnection_queue_retention',
                 'interconnection_queue_calculation',
                 'public_interconnection_queue_display',
                 'public_interconnection_queue_derived_metric_display');

insert into reference.permission_grants
  (id, source_interface_id, grant_kind, reference, covers_collection, covers_index_use,
   covers_internal_use, covers_storage, covers_historical_retention, covers_historical_reconstruction,
   rights_layer, attribution_required, attribution_text, effective_from, evidence, reviewed_by, reviewed_on)
select v.id, s.id, 'provider_terms', v.reference, true, false, true, true, true, true,
       'publisher', true, sup.attribution_text, timestamptz '2026-09-21T00:00:00Z',
       v.evidence, 'Urdais research', date '2026-09-21'
from (values
  ('99000000-0000-4000-8400-000000000004'::uuid, 'ercot-gis-report',
   'ERCOT Terms of Use section 5, reviewed 2026-09-21.',
   'ERCOT permits raw public data to be used, reproduced and redistributed in compilations, charts and analyses. Historical retention is supported by ERCOT publishing and retaining the archive itself.'),
  ('99000000-0000-4000-8400-000000000005'::uuid, 'nyiso-interconnection-queue',
   'NYISO legal notice, reviewed 2026-09-21; copyright asserted, no reuse grant established.',
   'No affirmative reuse grant was found. Collection proceeds under the Urdais founder-accepted-risk policy; the classification remains ambiguous_requires_legal_review.')
) as v(id, slug, reference, evidence)
join reference.source_interfaces s on s.slug = v.slug
join lateral (select attribution_text from reference.source_use_permissions
               where source_interface_id = s.id and purpose_code = 'public_interconnection_queue_display' limit 1) sup on true
on conflict (id) do nothing;

update reference.source_use_permissions sup
   set permission_grant_id = g.id
  from reference.permission_grants g
 where g.source_interface_id = sup.source_interface_id
   and sup.permission_grant_id is null
   and g.id in ('99000000-0000-4000-8400-000000000004', '99000000-0000-4000-8400-000000000005');

-- Both publish monthly, and neither should be judged by a continuous feed's threshold. A monthly
-- publisher that is three days quiet is simply between releases.
insert into reference.interconnection_source_monitors
  (source_interface_id, expected_cadence, stale_after_hours, rationale)
select s.id, 'monthly', v.hours, v.rationale
from (values
  ('ercot-gis-report', 1128,
   'ERCOT publishes the GIS report monthly, a few days after the month it reports on, and stamps each document on the MIS. Forty-seven days allows a full month plus the publication lag before the archive itself is suspect.'),
  ('nyiso-interconnection-queue', 1128,
   'NYISO dates each workbook in its filename and posts roughly monthly. The same forty-seven day window applies, since a missed month is the first real signal.')
) as v(slug, hours, rationale)
join reference.source_interfaces s on s.slug = v.slug
on conflict (source_interface_id) do nothing;

-- ------------------------------------------------------------------ assertions

do $$
declare n integer;
begin
  select count(*) into n from pipeline.interconnection_domain_violations();
  if n <> 0 then raise exception 'the queue domain is wired to the capacity domain in % place(s)', n; end if;

  select count(*) into n from reference.source_interfaces
   where slug in ('ercot-gis-report', 'nyiso-interconnection-queue')
     and source_class = 'interconnection_queue';
  if n <> 2 then raise exception 'expected two new queue interfaces, found %', n; end if;

  -- ERCOT is the only queue source with an affirmative grant; the rest stay ambiguous.
  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where s.slug = 'ercot-gis-report'
     and sup.rights_classification <> 'reusable_with_attribution_or_conditions';
  if n <> 0 then raise exception 'the ERCOT queue source was recorded with the wrong classification'; end if;

  select count(*) into n from reference.source_use_permissions sup
    join reference.source_interfaces s on s.id = sup.source_interface_id
   where s.slug = 'nyiso-interconnection-queue'
     and sup.rights_classification <> 'ambiguous_requires_legal_review';
  if n <> 0 then raise exception 'the NYISO queue source was relabelled'; end if;

  -- Monthly sources must not inherit a continuous source's threshold.
  select count(*) into n from reference.interconnection_source_monitors m
    join reference.source_interfaces s on s.id = m.source_interface_id
   where s.slug in ('ercot-gis-report', 'nyiso-interconnection-queue')
     and (m.expected_cadence <> 'monthly' or m.stale_after_hours < 720);
  if n <> 0 then raise exception 'a monthly queue source carries a sub-monthly staleness threshold'; end if;

  select count(*) into n from reference.interconnection_load_end_uses;
  if n <> 6 then raise exception 'expected six load end uses, found %', n; end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'pipeline' and table_name like 'interconnection%'
     and column_name in ('capacity_mw', 'queue_mw', 'mw');
  if n <> 0 then raise exception 'a generic MW column exists in the queue domain'; end if;
end $$;

alter table reference.interconnection_load_end_uses enable row level security;
