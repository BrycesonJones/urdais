-- Methodology and instrument lineage.
--
--   methodology  -> methodology_version
--   instrument   -> instrument_spec_version -> (parent) methodology_version
--
-- The markdown documents under docs/methodology remain the authoritative
-- methodology. These rows identify versions and record the document each one
-- corresponds to; they do not restate methodology content.

create table reference.methodologies (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique
                  constraint methodologies_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null,
  document_path text not null,
  created_at    timestamptz not null default now()
);

comment on table reference.methodologies is
  'A methodology family owned by Urdais, e.g. the UCPI compute price index family. The document is authoritative; this row identifies it.';

create table reference.methodology_versions (
  id              uuid primary key default gen_random_uuid(),
  methodology_id  uuid not null references reference.methodologies (id) on delete restrict,
  version         text not null
                    constraint methodology_versions_version_format check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[a-z]+)?$'),
  status          text not null
                    constraint methodology_versions_status_allowed check (status in ('draft', 'approved', 'superseded', 'retired')),
  document_path   text not null,
  content_hash    text
                    constraint methodology_versions_hash_format check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  effective_from  date,
  effective_to    date,
  created_at      timestamptz not null default now(),
  unique (methodology_id, version),
  constraint methodology_versions_interval_ordered
    check (effective_from is null or effective_to is null or effective_to >= effective_from),
  -- A draft carries no production effective date. This is a methodology rule,
  -- not a convenience: publishing under a draft is prohibited.
  constraint methodology_versions_draft_has_no_effective_date
    check (status <> 'draft' or (effective_from is null and effective_to is null))
);

comment on table reference.methodology_versions is
  'One version of a methodology document. content_hash is the SHA-256 of the markdown at the commit the version was recorded from. Drafts never carry an effective date.';

create index methodology_versions_methodology_idx
  on reference.methodology_versions (methodology_id, version);

create table reference.instruments (
  id                uuid primary key default gen_random_uuid(),
  symbol            text not null unique
                      constraint instruments_symbol_format check (symbol ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'),
  name              text not null,
  category          text not null
                      constraint instruments_category_allowed check (category in ('compute_price')),
  methodology_id    uuid not null references reference.methodologies (id) on delete restrict,
  output_unit       text not null,
  output_currency   char(3) not null
                      constraint instruments_currency_format check (output_currency ~ '^[A-Z]{3}$'),
  lifecycle_status  text not null
                      constraint instruments_lifecycle_allowed
                      check (lifecycle_status in ('proposed', 'launch_blocked', 'live', 'suspended', 'retired')),
  created_at        timestamptz not null default now()
);

comment on table reference.instruments is
  'A published or proposed Urdais instrument, e.g. UCPI-H100-SXM. The output unit is the economic unit of the published value, never an index level.';

create table reference.instrument_spec_versions (
  id                      uuid primary key default gen_random_uuid(),
  instrument_id           uuid not null references reference.instruments (id) on delete restrict,
  methodology_version_id  uuid not null references reference.methodology_versions (id) on delete restrict,
  version                 text not null
                            constraint instrument_spec_versions_version_format check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[a-z]+)?$'),
  status                  text not null
                            constraint instrument_spec_versions_status_allowed check (status in ('draft', 'approved', 'superseded', 'retired')),
  document_path           text not null,
  content_hash            text
                            constraint instrument_spec_versions_hash_format check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  effective_from          date,
  effective_to            date,
  created_at              timestamptz not null default now(),
  unique (instrument_id, version),
  constraint instrument_spec_versions_interval_ordered
    check (effective_from is null or effective_to is null or effective_to >= effective_from),
  constraint instrument_spec_versions_draft_has_no_effective_date
    check (status <> 'draft' or (effective_from is null and effective_to is null))
);

comment on table reference.instrument_spec_versions is
  'One version of a child specification. Always references the parent methodology version it was written against.';

create index instrument_spec_versions_instrument_idx
  on reference.instrument_spec_versions (instrument_id, version);

-- A spec version must reference a version of its own instrument's methodology.
create or replace function reference.check_spec_version_parent()
returns trigger
language plpgsql
as $$
declare
  instrument_methodology uuid;
  version_methodology uuid;
begin
  select methodology_id into instrument_methodology from reference.instruments where id = new.instrument_id;
  select methodology_id into version_methodology from reference.methodology_versions where id = new.methodology_version_id;
  if instrument_methodology is distinct from version_methodology then
    raise exception 'instrument spec version must reference a version of the instrument''s own methodology'
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger instrument_spec_versions_parent_check
  before insert or update on reference.instrument_spec_versions
  for each row execute function reference.check_spec_version_parent();

alter table reference.methodologies             enable row level security;
alter table reference.methodology_versions      enable row level security;
alter table reference.instruments               enable row level security;
alter table reference.instrument_spec_versions  enable row level security;
