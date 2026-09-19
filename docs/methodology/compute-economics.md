# Compute Economics: Payback

**Status:** Production methodology<br>
**Version:** 1.0.0<br>
**Effective date:** 2026-09-18

## Purpose

Compute Economics estimates the simple payback period for one accelerator. It combines a current released Urdais listed-GPU rental-price observation with explicit, user-adjustable operating assumptions. It does not measure an operator's realized return and does not forecast prices.

## Observed input

The only observed economic input is the latest released price for a supported canonical `UCPI-*-LISTED` instrument, expressed in USD per accelerator-hour. The page reads the same production UCPI series contract used by the listed-GPU market pages. It also displays the observation date, calculation-window cutoff, publication timestamp, participant and source counts, market breadth, attribution, methodology version, and instrument-specification version supplied by that contract.

No synthetic curve, interpolated tenor, mock price, catalog fallback, or browser-generated market observation is permitted in this path. If a supported released price cannot be read, Payback is unavailable.

## Scenario assumptions

Every input other than the current rental price is marked **Assumption** and is user-adjustable:

- accelerator acquisition cost in USD;
- utilization as a fraction of annual hours;
- electricity price in USD per kWh;
- accelerator power draw in kW;
- hosting cost in USD per available GPU-hour; and
- other operating cost in USD per utilized GPU-hour.

The displayed defaults are scenario starting points, not Urdais observations, quotes, operator telemetry, or forecasts. Hosting is charged for all 8,760 hours because the default represents reserved rack, cooling, network, and infrastructure availability. Electricity and other variable operating costs are charged only during utilized hours.

## Calculation

Let:

- `P` be the observed price in USD per GPU-hour;
- `u` be utilization from 0 through 1;
- `H = 8,760` hours per year;
- `A` be acquisition cost;
- `W` be power draw in kW;
- `E` be electricity price in USD per kWh;
- `F` be hosting cost per available GPU-hour; and
- `O` be other operating cost per utilized GPU-hour.

The calculator uses:

```text
gross annual revenue = P × u × H
annual electricity cost = W × E × u × H
annual hosting cost = F × H
annual other operating cost = O × u × H
annual operating cost = electricity + hosting + other
annual net cash flow = gross revenue − operating cost
payback years = A ÷ annual net cash flow
```

Payback is reported only when annual net cash flow is positive. A zero or negative result is shown as **No finite payback**; it is not coerced to zero, infinity, or a misleading numeric value.

## Freshness and unavailable states

Freshness follows the daily UCPI calculation schedule. A released observation for calculation date D is usable until the next daily observation, D+1, reaches its publication deadline. Under the current calendar that is D+3 at midnight UTC. At or after that deadline, the older price remains visible and is labeled stale, but Urdais does not calculate Payback from it.

The page also withholds Payback when the production database is unavailable, no supported canonical listed-GPU price has been released, or the released record lacks a usable price or publication timestamp. No demo result is substituted.

## Sensitivity

The sensitivity view recalculates the same formula at utilization levels from 40% through 100% in 10-percentage-point increments. The current observed rental price and every other displayed assumption remain fixed. These points are modeled scenarios, not historical observations and not a forecast.

## Reproduction and limitations

A displayed result can be reproduced from the observed price, the six displayed assumption values, the equations above, and 8,760 hours per year. Simple payback ignores financing, taxes, depreciation, residual value, downtime beyond the utilization assumption, revenue or cost escalation, transaction costs, and hardware failure. It should not be treated as investment advice.

> Payback is a modeled scenario using current observed compute rental pricing and user-configurable economic assumptions. It is not an observed operator return and is not a forecast of future compute prices.
