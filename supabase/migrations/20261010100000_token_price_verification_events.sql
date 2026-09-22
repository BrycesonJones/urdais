-- A durable record of a person having checked a provider's published price.
--
-- Token Price freshness asks "how long since anyone looked?", and until now it
-- answered from `pipeline.token_price_benchmarks.calculated_at`. That is the
-- wrong column, and the reason is structural rather than a slip.
--
-- The methodology records a canonical observation only when a source price
-- changes, and a benchmark point exists only at a real calculation event. So a
-- person who re-reads an unchanged page correctly writes no observation and
-- correctly freezes no new point. `ingest.ts` goes further and keys a
-- `manual_verified` retrieval by artifact hash alone, deliberately, so that
-- re-reading a byte-identical page does not manufacture a second retrieval
-- either. Every one of those decisions is right. Together they mean an
-- unchanged human review left **no durable trace anywhere**, and the watchdog
-- therefore reported a provider as unreviewed no matter how recently someone
-- had actually read its page.
--
-- The fix is not to loosen any of those rules -- each exists to stop Urdais
-- manufacturing history -- but to record the thing that actually happened. A
-- verification is its own event: a person, an instant, a statement of what was
-- checked, and the price or withholding state that statement was made about.
-- It is not a price, not an observation and not a calculation, so it gets its
-- own table rather than a forged row in someone else's.
--
-- This table records operations facts and provenance only. It contains no
-- price, grants no collection right, and changes no source's rights state:
-- automated retrieval of every token-pricing surface remains exactly as
-- blocked as it was.

create table pipeline.token_price_verifications (
  id                    uuid primary key default gen_random_uuid(),
  provider_id           uuid not null references reference.providers (id) on delete restrict,
  source_interface_id   uuid not null references reference.source_interfaces (id) on delete restrict,

  -- Replaying one verification must not record it twice. The key is the
  -- verification's own identity -- provider, instant, verifier, statement --
  -- so a genuinely new review on a later date is a new event even when every
  -- published price is unchanged, which is the case this table exists for.
  idempotency_key       text not null unique,

  verified_by           text not null
                          constraint token_price_verifications_verifier_present
                          check (length(btrim(verified_by)) > 0),
  verified_at           timestamptz not null,
  evidence              text not null
                          constraint token_price_verifications_evidence_present
                          check (length(btrim(evidence)) > 0),

  -- A verification is a person reading a page. There is no other mode, and the
  -- constraint says so rather than leaving the column open to a future writer
  -- who finds 'automated' convenient.
  acquisition_mode      text not null default 'manual_verified'
                          constraint token_price_verifications_manual_only
                          check (acquisition_mode = 'manual_verified'),
  verification_purpose  text not null
                          constraint token_price_verifications_purpose_allowed
                          check (verification_purpose in ('research', 'production')),

  -- The retained artifact the person read, and its hash. Null only where a
  -- verification predates artifact retention.
  source_retrieval_id   uuid references pipeline.source_retrievals (id) on delete restrict,
  artifact_sha256       text,

  -- What the verification was made about: the provider's currently valid state.
  -- A verification of nothing is not evidence of anything, so the state is
  -- recorded alongside the attestation rather than inferred later.
  observed_state        text not null
                          constraint token_price_verifications_state_allowed
                          check (observed_state in ('value', 'withheld')),
  benchmark_id          uuid references pipeline.token_price_benchmarks (id) on delete restrict,
  benchmark_model_id    uuid references reference.models (id) on delete restrict,
  methodology_version   text not null,

  created_at            timestamptz not null default now(),

  -- A verification of a published value names the model it was made about. A
  -- verification of a withholding must not, because the withheld provider may
  -- have no designation at all -- DeepSeek has none, which is why it is
  -- withheld -- and naming a plausible model would manufacture the designation
  -- the methodology declined to make.
  constraint token_price_verifications_state_shape check (
    (observed_state = 'value' and benchmark_model_id is not null)
    or (observed_state = 'withheld' and benchmark_model_id is null)
  )
);

create index token_price_verifications_freshness_idx
  on pipeline.token_price_verifications (provider_id, verified_at desc);

-- Append-only, like every other evidence table here, and with no supersession
-- path at all: a benchmark can be corrected because it is an interpretation, but
-- an attestation is a record of something a person did at a moment, and a
-- statement that can be edited afterwards is not evidence. A mistaken
-- verification is answered by making a new, correct one.
create trigger token_price_verifications_append_only
  before update or delete on pipeline.token_price_verifications
  for each row execute function pipeline.forbid_mutation();

alter table pipeline.token_price_verifications enable row level security;

comment on table pipeline.token_price_verifications is
  'One human verification event: a person read a provider''s own published pricing surface at an instant and stated what they checked. The source of truth for Token Price verification freshness. Carries no price and grants no collection right.';

comment on column pipeline.token_price_verifications.observed_state is
  'The provider''s valid state at the moment of verification: a published value, or a recorded withholding. A withholding that someone checked is verified, not absent.';

comment on column pipeline.token_price_verifications.idempotency_key is
  'Identity of the verification itself. Replaying the same provider, instant, verifier and statement inserts nothing; a genuinely later review inserts a new event even when no price moved.';

-- Backfill: the verifications that already happened.
--
-- These events are not invented here. Every one of them is materialised from a
-- `manual_verified` production retrieval that already carries the verifier, the
-- statement and the instant -- the record was simply kept in a shape freshness
-- could not read. `completed_at` is the verification instant the operator
-- command wrote; nothing is rounded, shifted or fabricated to make an age look
-- better.
insert into pipeline.token_price_verifications (
  provider_id, source_interface_id, idempotency_key, verified_by, verified_at, evidence,
  verification_purpose, source_retrieval_id, artifact_sha256,
  observed_state, benchmark_id, benchmark_model_id, methodology_version
)
select
  si.provider_id,
  r.source_interface_id,
  'token-verification:backfill:' || r.id::text,
  coalesce(
    nullif(btrim(substring(r.verification_evidence from 'verified by (.+?) at [0-9]{4}-')), ''),
    'unattributed (materialised from retrieval ' || r.id::text || ')'
  ),
  r.completed_at,
  r.verification_evidence,
  r.retrieval_purpose,
  r.id,
  r.response_hash,
  b.calculation_status,
  b.id,
  b.benchmark_model_id,
  b.methodology_version
from pipeline.source_retrievals r
join reference.source_interfaces si on si.id = r.source_interface_id
-- The provider's active benchmark or withholding. A retrieval with neither
-- behind it is not backfilled: a verification event that names no state would
-- be exactly the stray evidence the freshness rule refuses to trust.
join lateral (
  select b.id, b.calculation_status, b.benchmark_model_id, b.methodology_version
    from pipeline.token_price_benchmarks b
   where b.provider_id = si.provider_id and b.superseded_by_id is null
   order by b.calculated_at desc, b.id
   limit 1
) b on true
where r.acquisition_mode = 'manual_verified'
  and r.retrieval_purpose = 'production'
  and r.verification_evidence is not null
on conflict (idempotency_key) do nothing;

do $$
declare
  providers_with_benchmarks integer;
  providers_with_events     integer;
  fabricated                integer;
begin
  select count(distinct provider_id) into providers_with_benchmarks
    from pipeline.token_price_benchmarks where superseded_by_id is null;

  select count(distinct provider_id) into providers_with_events
    from pipeline.token_price_verifications;

  -- Every provider that has a frozen state must come out of this migration with
  -- an event behind it. Otherwise the new freshness source would report a
  -- provider as never verified on the day it was introduced, which is the same
  -- silence this replaces, wearing the opposite sign.
  if providers_with_events <> providers_with_benchmarks then
    raise exception 'backfill left % of % providers without a verification event',
      providers_with_benchmarks - providers_with_events, providers_with_benchmarks;
  end if;

  -- The backfill copies instants; it must never invent one in the future.
  select count(*) into fabricated
    from pipeline.token_price_verifications v
    join pipeline.source_retrievals r on r.id = v.source_retrieval_id
   where v.verified_at <> r.completed_at;
  if fabricated <> 0 then
    raise exception '% backfilled verification(s) do not carry their retrieval''s own instant', fabricated;
  end if;

  raise notice 'token price verification events: % provider(s) carry durable human verification', providers_with_events;
end
$$;
