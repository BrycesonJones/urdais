-- UBWI daily publication cadence.
--
-- UBWI publishes at most one point per UTC day. Every other identity in this pipeline is
-- already content-keyed and therefore already idempotent -- a wealth vintage by its rule
-- version, reference date and observed subtotal; a numerator observation by its block
-- height and observed instant; a calculation by its vintage, observation and methodology
-- version; a publication by its calculation, via a unique constraint. What none of those
-- express is the cadence itself: two runs that each read a *different* numerator
-- observation on the same day would pass every one of them and produce two points for one
-- intended daily observation.
--
-- The application checks the date before it writes, and that handles a retry, a
-- redeployment or an operator rerun. It cannot handle two runs that overlap in time,
-- because both would read an empty day and both would then insert. This index can. The
-- loser of that race gets a unique violation, and the run converges on the winner's point
-- instead of adding a second.
--
-- Scoped to non-superseded rows for the same reason `ubwi_publications_current_idx` is: a
-- correction is a supersession, and a superseded point must not keep its day occupied
-- against the point that replaces it.
--
-- The expression is immutable -- `timezone(text, timestamptz)` is, where a bare
-- `timestamptz::date` would not be -- so it is indexable, and it reads the UTC calendar
-- date of `published_at`, which is the canonical UBWI chronology. The daily identity and
-- the chart's x-axis are therefore the same timestamp, and cannot drift into two
-- different notions of which day a point belongs to.

create unique index ubwi_publications_daily_idx
  on pipeline.ubwi_publications (((published_at at time zone 'utc')::date))
  where superseded_by_id is null;

comment on index pipeline.ubwi_publications_daily_idx is
  'At most one non-superseded UBWI publication per UTC day. The cadence is one real observation per day; two overlapping runs converge here rather than both inserting.';

-- The existing history must already satisfy it: this is a statement about what has been
-- published, not only about what may be published next.
do $$
declare n integer;
begin
  select count(*) into n
    from (
      select (published_at at time zone 'utc')::date as d
        from pipeline.ubwi_publications
       where superseded_by_id is null
       group by 1
      having count(*) > 1
    ) duplicates;
  if n <> 0 then
    raise exception 'UBWI already holds more than one non-superseded publication on % UTC day(s)', n;
  end if;
end
$$;
