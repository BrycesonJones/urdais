-- Two gaps PD-4B's vocabulary had, both found by reading the live artifacts rather than by
-- inspection: an interface that leaves the market, and requirements a market states more than one
-- of. Neither changes a table's shape; one relaxes a constraint that ruled out a case PD-4B had
-- already declared legal, the other adds words to a vocabulary built to be extended.

-- ------------------------------------------------------------ 1. an interface to somewhere outside the market.
--
-- PD-4B admitted 'external_tie' as an interface kind and then made it unbuildable: every
-- interface had to name at least one locality inside the market, and both ends had to differ,
-- which a tie to New York or Hydro-Quebec cannot satisfy because its far end is not a locality
-- Urdais models at all. ISO New England publishes total transfer capability across exactly those
-- ties in the same table as its internal ones, so the gap is not hypothetical.
--
-- The counterparty is named as text rather than modelled as a subarea because it is outside the
-- balancing authority this interface belongs to, and a subarea row would claim Urdais knows its
-- internal structure. A locality inside the market stays a foreign key; nothing here weakens that.

alter table reference.grid_interfaces
  add column external_counterparty text
    constraint grid_interfaces_counterparty_nonempty
    check (external_counterparty is null or btrim(external_counterparty) <> '');

comment on column reference.grid_interfaces.external_counterparty is
  'The neighbouring control area or system on the far side of an external tie, named as the publisher names it. Null for every interface whose both ends are inside this market.';

-- Only a tie that leaves the market may name a counterparty.
alter table reference.grid_interfaces
  add constraint grid_interfaces_counterparty_is_external
  check (external_counterparty is null or interface_kind = 'external_tie');

-- An interface still has to lead somewhere: a locality inside this market, a named counterparty
-- outside it, or both.
alter table reference.grid_interfaces
  drop constraint grid_interfaces_has_an_end;
alter table reference.grid_interfaces
  add constraint grid_interfaces_has_an_end
  check (from_subarea_id is not null or to_subarea_id is not null or external_counterparty is not null);

-- Two named localities still may not be the same one; two absent ends are no longer a collision.
alter table reference.grid_interfaces
  drop constraint grid_interfaces_ends_differ;
alter table reference.grid_interfaces
  add constraint grid_interfaces_ends_differ
  check (from_subarea_id is null or to_subarea_id is null or from_subarea_id <> to_subarea_id);


-- ---------------------------------------------- 2. requirements a market states more than one of

-- ISO New England states, for one commitment period, an installed capacity requirement and a
-- second one net of tie benefits; and for one capacity zone, three different local obligations at
-- once. PD-4B had a single code for each pair, so the second value of every pair collided with the
-- first on the live-row index -- correctly, because under the old vocabulary they really did claim
-- to be the same quantity. They are not: a gross requirement and a net one differ by exactly the
-- credits under dispute, and a sourcing requirement, a resource adequacy requirement and a
-- transmission security requirement are three different studies with three different answers.
--
-- Vocabulary rows, not schema. Nothing existing is renamed or repointed.

insert into reference.capacity_component_kinds (code, display_name, description) values
  ('net_reserve_requirement', 'Net reserve requirement',
   'A reserve or capacity requirement stated net of credits the market deducts from it, such as interconnection capability credits. Never the same row as the gross requirement.'),
  ('local_sourcing_requirement', 'Local sourcing requirement',
   'The minimum capacity that must be located inside an import-constrained locality.'),
  ('transmission_security_requirement', 'Transmission security requirement',
   'A locality obligation derived from a transmission security analysis rather than from a resource adequacy study.'),
  ('tie_benefit', 'Tie benefit',
   'Capacity a market credits to itself for an interconnection with a neighbouring system. Recorded as its own kind because it is the quantity most often double-counted: it is netted out of a requirement rather than added to accredited capability.')
on conflict (code) do nothing;

-- A tie benefit is inherently about a boundary, so it has to be allowed to name one. The rule
-- otherwise stands: a locality-scoped quantity still may not claim an interface.
alter table pipeline.grid_capacity_components
  drop constraint grid_capacity_components_interface_is_a_transfer;
alter table pipeline.grid_capacity_components
  add constraint grid_capacity_components_interface_is_a_transfer
  check (grid_interface_id is null
         or component_kind in ('import_capability', 'export_capability', 'transfer_capability', 'tie_benefit'));
