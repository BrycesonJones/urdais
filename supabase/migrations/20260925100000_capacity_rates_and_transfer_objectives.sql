-- PD-4D: two things PJM and NYISO state that PD-4B had no way to hold.
--
-- Both were found by reading the live artifacts. Neither changes a table's shape.

-- ------------------------------------------------- 1. a requirement stated as a rate

-- PD-4B assumed every capacity quantity is an amount of power, and constrained units to MW and
-- GW accordingly. Two of the most important numbers these markets publish are not amounts:
-- PJM's Installed Reserve Margin and Forecast Pool Requirement are proportions of a forecast
-- peak, and NYISO's Locational Capacity Requirements and transmission security floors are
-- published as percentages of a locality's peak and never as megawatts at all.
--
-- The alternative was to multiply each rate by a peak load and store the product. That would be
-- Urdais arithmetic filed as a publisher's statement, and it would bake in whichever peak forecast
-- happened to be at hand. Storing the rate as the rate keeps the source's own words.
--
-- Nothing becomes comparable by this: the combination rules already refuse to add two values
-- with different units, so a percentage can never be summed with a megawatt.

alter table pipeline.grid_capacity_components
  drop constraint grid_capacity_components_unit_allowed;
alter table pipeline.grid_capacity_components
  add constraint grid_capacity_components_unit_allowed
  check (unit in ('MW', 'GW', 'percent'));

alter table pipeline.grid_constraint_values
  drop constraint grid_constraint_values_unit_allowed;
alter table pipeline.grid_constraint_values
  add constraint grid_constraint_values_unit_allowed
  check (unit in ('MW', 'GW', 'percent'));

-- A derived result stays in megawatts. A conclusion Urdais publishes about deliverable capacity
-- is an amount of power; if a future methodology needs to state a rate, that is a decision to
-- make then and not a door to leave open now.

comment on column pipeline.grid_capacity_components.unit is
  'MW or GW for an amount of power; percent for a requirement the publisher states as a proportion of forecast peak, such as an installed reserve margin or a locational capacity requirement. Values in different units are never combined.';

-- --------------------------------------- 2. the transfer a locality is required to be able to make

-- PJM publishes, for each locational deliverability area, both a Capacity Emergency Transfer
-- Objective and a Capacity Emergency Transfer Limit, and the whole locational test is whether the
-- limit exceeds the objective. The limit is what the network permits and already belongs in the
-- constraint layer. The objective is an obligation: the transfer capability the area is required
-- to have, which is a requirement about a place and not a limit on a boundary.
--
-- Without its own code it collides with the area's reliability requirement on the live-row index,
-- because under PD-4B's vocabulary both are simply "a requirement about this locality".

insert into reference.capacity_component_kinds (code, display_name, description) values
  ('capacity_transfer_requirement', 'Capacity transfer requirement',
   'The transfer capability a locality is required to have in order to meet its reliability criterion, such as PJM''s Capacity Emergency Transfer Objective. It is an obligation about a place, not a limit on a boundary; the matching limit belongs in pipeline.grid_constraint_values.')
on conflict (code) do nothing;
