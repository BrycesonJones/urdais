-- PD-3D: knowing whether Urdais is serving the latest official planning vintage.
--
-- Operational power has an age threshold: an EIA-930 hour that is two days old is stale, full
-- stop. A planning forecast has no such property. ERCOT's April 2025 Adjusted LTLF was the
-- current official forecast throughout 2026 because ERCOT had not finalised a replacement, and a
-- rule that called it stale after ninety days would have been wrong every day it fired.
--
-- Currentness here is a comparison, not a clock:
--
--     is the vintage Urdais serves the latest vintage the publisher has released,
--     as of the last time Urdais successfully looked?
--
-- That needs two things the schema did not have. A monitor says where to look, how often, and
-- what it means for a source to be unwatchable. A check is the evidence of one look: what was
-- found, when, and with what result. Both exist so that "current" is a claim Urdais can show its
-- working for, rather than an assumption that nothing has changed since ingestion.

create table reference.planning_source_monitors (
  id                    uuid primary key default gen_random_uuid(),
  source_interface_id   uuid not null unique references reference.source_interfaces (id) on delete restrict,
  grid_area_id          uuid not null references reference.grid_areas (id) on delete restrict,
  -- The page or asset path a check reads. Not the artifact: the artifact is what a check finds.
  discovery_url         text not null,
  discovery_method      text not null
                          constraint planning_monitors_method_allowed
                          check (discovery_method in ('html_listing', 'asset_probe', 'manual')),
  expected_cadence      text not null
                          constraint planning_monitors_cadence_allowed
                          check (expected_cadence in ('annual', 'semiannual', 'biennial', 'irregular', 'unknown')),
  -- How long a successful check stays good for. Past it, currentness is not a claim Urdais can
  -- make: it does not know what the publisher has done since.
  check_interval        interval not null
                          constraint planning_monitors_interval_positive check (check_interval > interval '0'),
  monitoring_state      text not null
                          constraint planning_monitors_state_allowed
                          check (monitoring_state in ('active', 'blocked')),
  blocked_kind          text
                          constraint planning_monitors_blocked_kind_allowed
                          check (blocked_kind in ('rights', 'format', 'methodology')),
  blocked_reason        text,
  notes                 text,
  created_at            timestamptz not null default now(),
  -- A blocked monitor says why; an active one has nothing to say about being blocked.
  constraint planning_monitors_blocked_states_its_reason check (
    (monitoring_state = 'blocked'
      and blocked_kind is not null and blocked_reason is not null and btrim(blocked_reason) <> '')
    or (monitoring_state = 'active' and blocked_kind is null and blocked_reason is null)
  )
);

comment on table reference.planning_source_monitors is
  'Where to look for a newer release of one planning source, how often, and whether the source is watchable at all. A blocked monitor is a recorded decision, not an absence.';
comment on column reference.planning_source_monitors.check_interval is
  'How long one successful check remains authoritative. Currentness is unknown past it, because Urdais has not looked since.';

-- One look at one source. Append-only: the record of what Urdais knew and when is the whole
-- point, and a later check is a new row rather than an edit to the last one.
create table pipeline.planning_source_checks (
  id                         uuid primary key default gen_random_uuid(),
  source_interface_id        uuid not null references reference.source_interfaces (id) on delete restrict,
  -- The retrieval this check was made through, where the check reached the source at all.
  retrieval_id               uuid references pipeline.source_retrievals (id) on delete restrict,
  checked_at                 timestamptz not null,
  outcome                    text not null
                               constraint planning_checks_outcome_allowed check (outcome in ('succeeded', 'failed')),
  checker_version            text not null
                               constraint planning_checks_version_nonempty check (btrim(checker_version) <> ''),
  checked_url                text not null,
  response_status            integer
                               constraint planning_checks_status_range
                               check (response_status is null or (response_status between 100 and 599)),
  -- What the source turned out to be offering.
  discovered_vintage_key     text,
  discovered_published_at    timestamptz,
  discovered_published_at_precision text
                               constraint planning_checks_precision_allowed
                               check (discovered_published_at_precision is null
                                      or discovered_published_at_precision in ('year', 'month', 'day', 'minute')),
  discovered_artifact_url    text,
  discovered_artifact_hash   text
                               constraint planning_checks_artifact_hash_format
                               check (discovered_artifact_hash is null or discovered_artifact_hash ~ '^[0-9a-f]{64}$'),
  evidence                   jsonb not null default '{}'::jsonb
                               constraint planning_checks_evidence_object check (jsonb_typeof(evidence) = 'object'),
  error                      text,
  created_at                 timestamptz not null default now(),
  -- A successful check found a release and can name it; a failed one says what went wrong.
  constraint planning_checks_success_names_a_vintage check (
    (outcome = 'succeeded' and discovered_vintage_key is not null and btrim(discovered_vintage_key) <> '' and error is null)
    or (outcome = 'failed' and error is not null and btrim(error) <> '')
  )
);

comment on table pipeline.planning_source_checks is
  'One freshness check against one planning source, kept as evidence. Currentness is derived from these rows, never from an in-memory scrape that nobody can audit afterwards.';

create index planning_source_checks_latest_idx
  on pipeline.planning_source_checks (source_interface_id, checked_at desc);
create index planning_source_checks_success_idx
  on pipeline.planning_source_checks (source_interface_id, checked_at desc) where outcome = 'succeeded';

create trigger planning_source_checks_append_only
  before update or delete on pipeline.planning_source_checks
  for each row execute function pipeline.forbid_mutation();

revoke update, delete, truncate on pipeline.planning_source_checks from service_role;

alter table reference.planning_source_monitors enable row level security;
alter table pipeline.planning_source_checks     enable row level security;

-- ------------------------------------------------------------------------------ V1 monitors
--
-- The four collectable sources are watched where their own canonical artifacts are published.
-- The three that are not collectable get a monitor too, carrying the reason: a market with no
-- data should say why it has none rather than look like an oversight.

insert into reference.planning_source_monitors
  (source_interface_id, grid_area_id, discovery_url, discovery_method, expected_cadence,
   check_interval, monitoring_state, blocked_kind, blocked_reason, notes)
select s.id, a.id, v.discovery_url, v.discovery_method, v.cadence, v.check_interval,
       v.state, v.blocked_kind, v.blocked_reason, v.notes
from (values
  ('ercot-long-term-load-forecast', 'ercot',
   'https://www.ercot.com/gridinfo/load/forecast', 'html_listing', 'annual', interval '30 days',
   'active', null::text, null::text,
   'Anchored on the canonical LTLF artifacts themselves, not on the newest dated file on the page. ERCOT publishes seasonal adjustment workbooks, Batch Zero material and audit updates alongside the forecast, and none of those is a replacement vintage.'),
  ('pjm-load-forecast-report', 'pjm',
   'https://www.pjm.com/planning/resource-adequacy-planning/load-forecast-dev-process', 'html_listing', 'annual', interval '30 days',
   'active', null, null,
   'The report year is in the artifact filename, so the latest release is the highest year PJM links.'),
  ('cec-california-energy-demand-forecast', 'caiso',
   'https://www.energy.ca.gov/data-reports/california-energy-planning-library/forecasts-and-system-planning/demand-side-3', 'html_listing', 'biennial', interval '30 days',
   'active', null, null,
   'Anchored on the CED peak forecast form for the CAISO balancing authority area. A statewide CED update that does not reissue that form is not a CAISO replacement.'),
  ('iso-ne-celt-report', 'iso-ne',
   'https://www.iso-ne.com/static-assets/documents/100035/', 'asset_probe', 'annual', interval '30 days',
   'active', null, null,
   'The CELT landing page renders client-side, so the check probes ISO-NE''s own canonical asset path for the next report year rather than parsing a listing that is not in the HTML.'),
  ('nyiso-gold-book', 'nyiso',
   'https://www.nyiso.com/load-capacity-data-report-gold-book-', 'manual', 'annual', interval '365 days',
   'blocked', 'format',
   'The Gold Book is published as a PDF with no machine-readable companion, so there is nothing to ingest and nothing a check could compare an ingested vintage against.',
   'Unblocked by a NYISO-published workbook or CSV of the load tables.'),
  ('spp-resource-adequacy-report', 'spp',
   'https://spp.org/', 'manual', 'semiannual', interval '365 days',
   'blocked', 'format',
   'The seasonal Resource Adequacy report is a PDF with no workbook counterpart. Publication would additionally require express written authorization from SPP, which Urdais does not hold.',
   'Blocked on extraction and, independently, on rights.'),
  ('miso-long-term-load-forecast', 'miso',
   'https://www.misoenergy.org/planning/', 'manual', 'irregular', interval '365 days',
   'blocked', 'rights',
   'The MISO website terms forbid publication, distribution and derivative works, and the public artifact is a set of growth-rate trajectories rather than a vintaged year-by-year MW series.',
   'Blocked on rights and, independently, on methodology.')
) as v(slug, market, discovery_url, discovery_method, cadence, check_interval, state, blocked_kind, blocked_reason, notes)
join reference.source_interfaces s on s.slug = v.slug
join reference.grid_areas a on a.slug = v.market;

do $$
declare n integer;
begin
  select count(*) into n from reference.planning_source_monitors;
  if n <> 7 then raise exception 'expected seven planning source monitors, found %', n; end if;
  select count(*) into n from reference.planning_source_monitors where monitoring_state = 'active';
  if n <> 4 then raise exception 'expected four active planning monitors, found %', n; end if;
  -- A monitor must not contradict the registry: a production-blocked interface is not watchable.
  select count(*) into n from reference.planning_source_monitors m
    join reference.source_interfaces s on s.id = m.source_interface_id
   where m.monitoring_state = 'active' and s.production_access_state = 'production_blocked';
  if n <> 0 then raise exception '% active monitor(s) watch a production-blocked interface', n; end if;
end $$;
