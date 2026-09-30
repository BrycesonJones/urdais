-- Paid access, phase 5: the Stripe billing layer.
--
-- Three tables in `identity`, and no change to `premium_entitlements`. Phase 1
-- left that table already able to say `source = 'stripe'` with the subscription
-- id in `external_reference`, so billing drives the entitlement primitive that
-- already exists rather than introducing a second way to be entitled.
--
-- ## Why `identity` and not a new `billing` schema
--
-- The reason Phase 1 gave for `identity` applies unchanged: these rows describe
-- people rather than markets, and a read-path role granted `reference` and
-- `pipeline` must not be able to see who subscribes. A `billing` schema would
-- need the same revokes, the same default privileges and the same service_role
-- grants, and would isolate nothing further -- every one of these tables joins to
-- `identity.accounts` on every useful query. One boundary, not two.
--
-- ## The three tables, and why each exists separately
--
--   billing_customers      account <-> Stripe Customer, one row per account.
--   billing_subscriptions  the Stripe Subscription and the state Urdais reads.
--   billing_events         which Stripe events have been processed.
--
-- They are not one table because they have different cardinalities and different
-- lifetimes: an account has exactly one Customer forever, may have several
-- Subscriptions over time, and accumulates events without bound.
--
-- ## `livemode` on every row
--
-- Stripe's own flag, stored rather than inferred. It is the record that a row
-- came from test Stripe, so a test subscription can never be mistaken for a paid
-- one after a credential change -- and a deployment reading the wrong mode's rows
-- is detectable instead of silent. A subscription that claims one mode while its
-- customer claims the other is rejected by constraint.
--
-- ## Security
--
-- Identical to Phase 1 and asserted at the end of this migration: internal
-- schema, RLS on with no policies, nothing granted to `anon` or `authenticated`
-- at any level, `service_role` the only role that reaches these tables. No
-- existing policy, grant or table is modified.

-- ---------------------------------------------------------------------------
-- Account <-> Stripe Customer
-- ---------------------------------------------------------------------------

create table identity.billing_customers (
  -- The account, and the primary key. One Stripe Customer per Urdais account is
  -- enforced here rather than by application discipline: two Customers for one
  -- account means two payment methods, two invoice histories, and a subscription
  -- the reader cannot find. `on conflict (account_id) do nothing` then makes
  -- concurrent first-checkouts safe without a lock.
  account_id         uuid primary key
                       references identity.accounts (id) on delete cascade,

  stripe_customer_id text not null
                       constraint billing_customers_stripe_id_nonempty check (btrim(stripe_customer_id) <> ''),

  -- Stripe's own flag for the environment this Customer belongs to.
  livemode           boolean not null,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- The reverse direction too: one Customer must not be shared by two accounts,
  -- which would let one reader's subscription entitle another.
  constraint billing_customers_stripe_id_unique unique (stripe_customer_id),

  -- Redundant given the line above, and present so a subscription can name both
  -- columns in one foreign key -- which is what actually enforces that a
  -- subscription and its customer share a Stripe environment.
  constraint billing_customers_stripe_id_livemode_unique unique (stripe_customer_id, livemode)
);

comment on table identity.billing_customers is
  'Account <-> Stripe Customer, one row each way. The stable relationship is account id <-> customer id; email is never the key, because a Stripe email change must not redefine Urdais identity.';

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------

create table identity.billing_subscriptions (
  -- Stripe's id is the primary key. Urdais does not mint an id for a record it
  -- does not own, and keying on Stripe's makes webhook upserts trivially
  -- idempotent.
  stripe_subscription_id text primary key
                           constraint billing_subscriptions_id_nonempty check (btrim(stripe_subscription_id) <> ''),

  account_id             uuid not null
                           references identity.accounts (id) on delete cascade,

  stripe_customer_id     text not null,

  -- Stripe's own subscription status, stored verbatim. Checked against the full
  -- set Stripe documents rather than only the ones that grant access: a status
  -- this build has never heard of must fail the constraint loudly here instead of
  -- being silently coerced into something that might grant premium. The mapping
  -- from status to entitlement lives in one place, src/lib/billing/subscription-state.ts.
  status                 text not null
                           constraint billing_subscriptions_status_allowed
                           check (status in (
                             'incomplete', 'incomplete_expired', 'trialing', 'active',
                             'past_due', 'canceled', 'unpaid', 'paused'
                           )),

  -- Which Price the subscription is actually on, so a reader billed on a
  -- superseded Price is visible rather than assumed.
  stripe_price_id        text not null
                           constraint billing_subscriptions_price_nonempty check (btrim(stripe_price_id) <> ''),

  -- Stripe keeps `status = 'active'` through a period the customer has paid for
  -- even once they have asked to cancel. This column is recorded for operators
  -- and for the UI; it is deliberately NOT part of the entitlement decision, so
  -- asking to cancel cannot revoke access that has been paid for.
  cancel_at_period_end   boolean not null default false,

  current_period_end     timestamptz,
  canceled_at            timestamptz,
  ended_at               timestamptz,

  livemode               boolean not null,

  -- The `created` timestamp of the most recent Stripe event applied to this row.
  -- Stripe does not guarantee delivery order, so an older event arriving after a
  -- newer one must not overwrite fresher state. Compared before every write; see
  -- src/lib/billing/store.ts.
  last_event_at          timestamptz,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint billing_subscriptions_ended_ordered
    check (ended_at is null or canceled_at is null or ended_at >= canceled_at),

  -- A subscription and its customer must belong to the same Stripe environment.
  -- A CHECK cannot see another table, so the mode is carried into the foreign key
  -- itself: a test subscription cannot attach to a live customer, which is the one
  -- billing error with no clean remedy after the fact.
  constraint billing_subscriptions_customer_fk
    foreign key (stripe_customer_id, livemode)
    references identity.billing_customers (stripe_customer_id, livemode)
);

comment on table identity.billing_subscriptions is
  'One row per Stripe Subscription, keyed by Stripe''s own id so webhook upserts are idempotent. `status` is Stripe''s verbatim; the status -> entitlement policy lives in src/lib/billing/subscription-state.ts. `cancel_at_period_end` is recorded but never revokes access.';

comment on column identity.billing_subscriptions.last_event_at is
  'The `created` time of the newest Stripe event applied here. Guards against out-of-order webhook delivery overwriting fresh state with stale state.';

create index billing_subscriptions_account_idx on identity.billing_subscriptions (account_id);
create index billing_subscriptions_customer_idx on identity.billing_subscriptions (stripe_customer_id);

-- Finding the subscriptions that should be granting access, which is the query
-- reconciliation runs and the request path never does.
create index billing_subscriptions_entitling_idx on identity.billing_subscriptions (account_id)
  where status in ('active', 'trialing');

-- ---------------------------------------------------------------------------
-- The processed-event ledger
-- ---------------------------------------------------------------------------

create table identity.billing_events (
  -- Stripe's event id, and the primary key. That is the whole idempotency
  -- mechanism: inserting the id is what claims the event, so a duplicate
  -- delivery loses the insert rather than being detected by a prior read. A
  -- check-then-act would race with Stripe's own concurrent retries.
  stripe_event_id text primary key
                    constraint billing_events_id_nonempty check (btrim(stripe_event_id) <> ''),

  event_type      text not null
                    constraint billing_events_type_nonempty check (btrim(event_type) <> ''),

  livemode        boolean not null,

  -- Stripe's own creation time for the event, not ours. Used for ordering.
  stripe_created_at timestamptz not null,

  -- Which subscription, when the event concerned one. Nullable: not every handled
  -- event names a subscription, and a FK here would make the ledger unable to
  -- record an event about an object Urdais chose not to store.
  stripe_subscription_id text,

  processed_at    timestamptz not null default now()
);

comment on table identity.billing_events is
  'Every Stripe event this application has processed, keyed by Stripe''s event id. Append-only: the primary key insert is the idempotency claim, so a replayed delivery cannot be processed twice. Enforced append-only by trigger -- an updatable ledger is not a ledger.';

create index billing_events_subscription_idx on identity.billing_events (stripe_subscription_id)
  where stripe_subscription_id is not null;
create index billing_events_processed_idx on identity.billing_events (processed_at);

-- An audit ledger that can be edited records nothing. Phase 4's `news_articles`
-- established this pattern in this repository.
create or replace function identity.billing_events_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'identity.billing_events is append-only (attempted %)', tg_op;
end;
$$;

create trigger billing_events_no_update
  before update or delete on identity.billing_events
  for each row execute function identity.billing_events_append_only();

-- ---------------------------------------------------------------------------
-- Housekeeping and security
-- ---------------------------------------------------------------------------

create trigger billing_customers_touch_updated_at
  before update on identity.billing_customers
  for each row execute function identity.touch_updated_at();

create trigger billing_subscriptions_touch_updated_at
  before update on identity.billing_subscriptions
  for each row execute function identity.touch_updated_at();

-- Stated explicitly as well as covered by the schema default privileges Phase 1
-- set, for the reason Phase 1 gave: a silent privilege miss here reads as "not a
-- subscriber", which is the one failure mode that must never happen by accident.
grant select, insert, update, delete on identity.billing_customers to service_role;
grant select, insert, update, delete on identity.billing_subscriptions to service_role;
grant select, insert on identity.billing_events to service_role;

alter table identity.billing_customers     enable row level security;
alter table identity.billing_subscriptions enable row level security;
alter table identity.billing_events        enable row level security;

do $$
declare n integer;
begin
  -- RLS on all three, and still no policy anywhere in the schema.
  select count(*) into n from pg_tables
   where schemaname = 'identity'
     and tablename in ('billing_customers', 'billing_subscriptions', 'billing_events')
     and rowsecurity;
  if n <> 3 then raise exception 'the billing tables do not all have row level security enabled (found %)', n; end if;

  select count(*) into n from pg_policies where schemaname = 'identity';
  if n <> 0 then raise exception 'identity schema has % policies; the model is RLS-on with no policies', n; end if;

  -- The public roles must still reach nothing.
  if has_schema_privilege('anon', 'identity', 'usage')
     or has_schema_privilege('authenticated', 'identity', 'usage') then
    raise exception 'anon or authenticated has usage on the identity schema';
  end if;

  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'identity' and grantee in ('anon', 'authenticated', 'PUBLIC');
  if n <> 0 then raise exception 'the identity tables grant % privileges to a public role', n; end if;

  -- One Customer per account, and one account per Customer. Both directions.
  select count(*) into n from information_schema.key_column_usage
   where table_schema = 'identity' and table_name = 'billing_customers'
     and constraint_name = 'billing_customers_pkey';
  if n <> 1 then raise exception 'billing_customers is not keyed on the account alone (% columns)', n; end if;

  select count(*) into n from information_schema.table_constraints
   where table_schema = 'identity' and table_name = 'billing_customers'
     and constraint_name = 'billing_customers_stripe_id_unique' and constraint_type = 'UNIQUE';
  if n <> 1 then raise exception 'billing_customers does not make the Stripe customer id unique'; end if;

  -- The entitlement model must be untouched: still one row per account, still no
  -- product or tier column. Phase 5 drives that table; it does not reshape it.
  select count(*) into n from information_schema.columns
   where table_schema = 'identity' and table_name = 'premium_entitlements'
     and column_name in ('product', 'product_id', 'tier', 'plan');
  if n <> 0 then raise exception 'the premium entitlement gained a product or tier column'; end if;

  select count(*) into n from information_schema.key_column_usage
   where table_schema = 'identity' and table_name = 'premium_entitlements'
     and constraint_name = 'premium_entitlements_pkey';
  if n <> 1 then raise exception 'the premium entitlement key is no longer the account alone (% columns)', n; end if;

  -- The mode must be inside the subscription -> customer foreign key, not merely
  -- documented. Two columns, or a test subscription can reference a live customer.
  select count(*) into n from information_schema.key_column_usage
   where table_schema = 'identity' and table_name = 'billing_subscriptions'
     and constraint_name = 'billing_subscriptions_customer_fk';
  if n <> 2 then raise exception 'the subscription -> customer foreign key does not carry livemode (% columns)', n; end if;

  -- The ledger must refuse to be rewritten.
  select count(*) into n from information_schema.triggers
   where trigger_schema = 'identity' and event_object_table = 'billing_events'
     and trigger_name = 'billing_events_no_update';
  if n < 1 then raise exception 'billing_events has no append-only trigger'; end if;

  -- And this migration must not have touched the data platform.
  if to_regclass('reference.methodology_versions') is null or to_regclass('pipeline.normalized_observations') is null then
    raise exception 'a data platform table vanished; this migration should not have touched it';
  end if;
end $$;
