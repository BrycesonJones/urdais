-- UCPI: a publication requires approved versions, enforced by the database.
--
-- UCPI 0.1.2-draft and the UCPI-LISTED-GPU specification both state that no
-- child may publish until the family methodology and the child specification
-- carry approved versions, and that a value computed before then is a labelled
-- candidate. Until now nothing enforced it: pipeline.check_regional_publication
-- refused a simulation run and checked the deadline, and the application gate
-- compared version strings without asking where those versions stood. A run
-- carrying a draft specification could therefore be published.
--
-- The calculation is untouched. A run may still be computed and its regional
-- observation recorded under a draft version; that is exactly what a candidate
-- is. Only the release is refused, and it is refused independently of the
-- application, so a future caller cannot reintroduce the path by mistake.

create or replace function pipeline.check_regional_publication()
returns trigger
language plpgsql
as $$
declare
  deadline timestamptz;
  kind text;
  spec_status text;
  methodology_status text;
begin
  select r.publication_deadline, r.run_kind, isv.status, mv.status
    into deadline, kind, spec_status, methodology_status
    from pipeline.regional_observations o
    join pipeline.calculation_runs r on r.id = o.run_id
    join reference.instrument_spec_versions isv on isv.id = r.instrument_spec_version_id
    join reference.methodology_versions mv on mv.id = r.methodology_version_id
   where o.id = new.regional_observation_id;

  if kind = 'simulation' then
    raise exception 'a simulation run is never published' using errcode = 'check_violation';
  end if;

  if methodology_status is distinct from 'approved' then
    raise exception 'the methodology version of this run is %, not approved; a value computed under a draft is a candidate, not a publication', coalesce(methodology_status, 'absent')
      using errcode = 'check_violation';
  end if;

  if spec_status is distinct from 'approved' then
    raise exception 'the instrument specification version of this run is %, not approved; a value computed under a draft is a candidate, not a publication', coalesce(spec_status, 'absent')
      using errcode = 'check_violation';
  end if;

  if (new.published_at < deadline and new.publication_status <> 'published')
     or (new.published_at >= deadline and new.publication_status <> 'delayed') then
    raise exception 'publication status % disagrees with the deadline %', new.publication_status, deadline
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on table pipeline.regional_publications is
  'The release of a regional observation. Published if released before the run''s publication deadline, Delayed otherwise; the status is checked against the deadline, not trusted. A simulation run cannot be published, and neither can a run whose methodology version or instrument specification version is not approved.';

-- Nothing is published, and this migration approves nothing.
do $$
declare
  n integer;
begin
  select count(*) into n from pipeline.regional_publications;
  if n <> 0 then raise exception 'a publication exists; this guard was added after a release'; end if;
  -- Scoped to the UCPI family: UBWI 1.2.0 is legitimately approved and publishes through
  -- its own table, which this trigger does not touch.
  select count(*) into n
    from reference.methodology_versions mv
    join reference.methodologies m on m.id = mv.methodology_id
   where m.slug like 'ucpi%' and mv.status = 'approved';
  if n <> 0 then raise exception 'a UCPI methodology version is approved, which this migration must never do'; end if;
  select count(*) into n
    from reference.instrument_spec_versions isv
    join reference.instruments i on i.id = isv.instrument_id
   where i.symbol like 'UCPI%' and isv.status = 'approved';
  if n <> 0 then raise exception 'a UCPI instrument specification version is approved, which this migration must never do'; end if;
  select count(*) into n from reference.instruments where symbol = 'UCPI-H100-SXM' and lifecycle_status = 'launch_blocked';
  if n <> 1 then raise exception 'UCPI-H100-SXM is no longer launch_blocked'; end if;
end
$$;
