/**
 * Power Analytics demo data: one deterministic grid-infrastructure data
 * graph and the views derived from it.
 *
 *   Power markets (the seven UEPI wholesale markets, same ids and regions)
 *     ↓
 *   Load / capacity observations   → Power Delivery Gap, Transmission Headroom
 *   Interconnection observations   → Interconnection Queue
 *   Infrastructure observations    → Grid Buildout Velocity
 *   Flexibility assumptions        → Flexible Capacity
 *
 * Every number the page shows is computed here; nothing is typed into the
 * UI. Values are closed-form deterministic demo shapes anchored at
 * MOCK_AS_OF and are not real grid statistics. The foundational
 * distinction throughout: deliverable capacity is what transmission,
 * substations, and interconnection can physically serve, not what
 * generators could produce.
 */

import { MARKETS } from "@/data/mock/market-detail";
import { MOCK_AS_OF } from "@/data/mock/ucpi";
import type {
  BuildoutMetric,
  BuildoutMetricId,
  FlexibilityAssumption,
  FlexibilityScenario,
  HeadroomRow,
  HeadroomState,
  InfrastructureObservation,
  InterconnectionObservation,
  LoadObservation,
  PowerMarket,
  QueueMode,
  QueueRow,
} from "@/types/power-analytics";

export const POWER_ANALYTICS_AS_OF = MOCK_AS_OF;

/* ---------- Markets, shared with UEPI ---------- */

/** The organised markets, taken from UEPI's Wholesale Power instruments so ids, names, and regions never drift. */
export const POWER_MARKETS: PowerMarket[] = (() => {
  const uepi = MARKETS.find((market) => market.symbol === "UEPI");
  if (!uepi) throw new Error("UEPI market is required for Power Analytics");
  return uepi.families.flatMap((family) =>
    family.instruments.map((instrument) => ({
      id: instrument.id,
      name: instrument.shortLabel,
      regionLabel: instrument.regionLabel ?? "",
    })),
  );
})();

export function findPowerMarket(marketId: string): PowerMarket {
  const market = POWER_MARKETS.find((candidate) => candidate.id === marketId);
  if (!market) throw new Error(`Unknown power market: ${marketId}`);
  return market;
}

/* ---------- Per-market demo parameters ---------- */

type MarketProfile = {
  /** Peak load and deliverable capacity at the start of 2024, GW. */
  load2024: number;
  capacity2024: number;
  /** Annual growth of observed load through today, and of forecast demand after. */
  loadGrowth: number;
  forecastGrowth: number;
  /** Annual growth of deliverable capacity: the pace of physical buildout. */
  capacityGrowth: number;
  /** Seasonal peak amplitude and a phase (0–3, quarter of the peak). */
  seasonalAmplitude: number;
  peakQuarter: number;
  queue: { load: number; loadWait: number; generation: number; generationWait: number };
  /** Latest-year buildout: GW, circuit-miles, GVA, months. */
  buildout: { capacityGw: number; miles: number; substationGva: number; transformerMonths: number };
  flexibility: FlexibilityAssumption;
};

const PROFILES: Record<string, MarketProfile> = {
  "power-pjm": {
    load2024: 150, capacity2024: 186, loadGrowth: 0.045, forecastGrowth: 0.085, capacityGrowth: 0.018, seasonalAmplitude: 0.06, peakQuarter: 2,
    queue: { load: 64, loadWait: 48, generation: 262, generationWait: 60 },
    buildout: { capacityGw: 4.2, miles: 1180, substationGva: 9.6, transformerMonths: 34 },
    flexibility: { marketId: "power-pjm", interruptibleLoadGw: 9.5, batteryShiftableLoadGw: 5.2 },
  },
  "power-ercot": {
    load2024: 85, capacity2024: 106, loadGrowth: 0.07, forecastGrowth: 0.11, capacityGrowth: 0.035, seasonalAmplitude: 0.09, peakQuarter: 2,
    queue: { load: 71, loadWait: 52, generation: 190, generationWait: 30 },
    buildout: { capacityGw: 5.1, miles: 1650, substationGva: 8.8, transformerMonths: 30 },
    flexibility: { marketId: "power-ercot", interruptibleLoadGw: 8.8, batteryShiftableLoadGw: 6.4 },
  },
  "power-caiso": {
    load2024: 47, capacity2024: 59, loadGrowth: 0.025, forecastGrowth: 0.04, capacityGrowth: 0.015, seasonalAmplitude: 0.07, peakQuarter: 2,
    queue: { load: 18, loadWait: 36, generation: 121, generationWait: 48 },
    buildout: { capacityGw: 1.9, miles: 420, substationGva: 4.1, transformerMonths: 36 },
    flexibility: { marketId: "power-caiso", interruptibleLoadGw: 3.1, batteryShiftableLoadGw: 4.6 },
  },
  "power-miso": {
    load2024: 120, capacity2024: 139, loadGrowth: 0.03, forecastGrowth: 0.055, capacityGrowth: 0.012, seasonalAmplitude: 0.05, peakQuarter: 2,
    queue: { load: 32, loadWait: 40, generation: 142, generationWait: 44 },
    buildout: { capacityGw: 2.8, miles: 960, substationGva: 6.3, transformerMonths: 33 },
    flexibility: { marketId: "power-miso", interruptibleLoadGw: 6.2, batteryShiftableLoadGw: 2.9 },
  },
  "power-iso-ne": {
    load2024: 24, capacity2024: 27.5, loadGrowth: 0.02, forecastGrowth: 0.035, capacityGrowth: 0.01, seasonalAmplitude: 0.05, peakQuarter: 0,
    queue: { load: 6, loadWait: 30, generation: 25, generationWait: 38 },
    buildout: { capacityGw: 0.6, miles: 140, substationGva: 1.4, transformerMonths: 35 },
    flexibility: { marketId: "power-iso-ne", interruptibleLoadGw: 1.3, batteryShiftableLoadGw: 1.1 },
  },
  "power-nyiso": {
    load2024: 31, capacity2024: 37, loadGrowth: 0.025, forecastGrowth: 0.04, capacityGrowth: 0.012, seasonalAmplitude: 0.06, peakQuarter: 2,
    queue: { load: 9, loadWait: 34, generation: 31, generationWait: 42 },
    buildout: { capacityGw: 0.9, miles: 210, substationGva: 2.2, transformerMonths: 35 },
    flexibility: { marketId: "power-nyiso", interruptibleLoadGw: 1.8, batteryShiftableLoadGw: 1.5 },
  },
  "power-spp": {
    load2024: 52, capacity2024: 63.5, loadGrowth: 0.04, forecastGrowth: 0.07, capacityGrowth: 0.02, seasonalAmplitude: 0.06, peakQuarter: 2,
    queue: { load: 21, loadWait: 38, generation: 92, generationWait: 40 },
    buildout: { capacityGw: 2.1, miles: 880, substationGva: 3.9, transformerMonths: 32 },
    flexibility: { marketId: "power-spp", interruptibleLoadGw: 3.4, batteryShiftableLoadGw: 2.0 },
  },
};

function profile(marketId: string): MarketProfile {
  const found = PROFILES[marketId];
  if (!found) throw new Error(`No Power Analytics profile for ${marketId}`);
  return found;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
/** Small deterministic wobble so demo lines are not perfectly smooth. */
const wobble = (seed: number, index: number, amplitude: number) => amplitude * Math.sin(seed + index * 1.7) * Math.cos(seed * 0.5 + index * 0.9);

/* ---------- Load and deliverable capacity ---------- */

export const TIMELINE_START_YEAR = 2024;
export const TIMELINE_END_YEAR = 2031;
/** The forecast horizon the headline delivery gap is quoted at. */
export const DELIVERY_GAP_HORIZON_YEAR = 2030;

const quarterStart = (year: number, quarter: number) => Date.UTC(year, quarter * 3, 1) / 1000;

/**
 * Quarterly observations per market from 2024 through 2031. Quarters at or
 * before today carry observed load; later quarters carry forecast demand,
 * which grows faster than observed load because it includes large loads
 * now waiting in the queue. Deliverable capacity grows at the market's
 * buildout pace throughout.
 */
export const LOAD_OBSERVATIONS: LoadObservation[] = POWER_MARKETS.flatMap((market, marketIndex) => {
  const p = profile(market.id);
  const rows: LoadObservation[] = [];
  let index = 0;
  let lastActual = p.load2024;
  for (let year = TIMELINE_START_YEAR; year <= TIMELINE_END_YEAR; year++) {
    for (let quarter = 0; quarter < 4; quarter++) {
      const time = quarterStart(year, quarter);
      const yearsFrom2024 = year - TIMELINE_START_YEAR + quarter / 4;
      const seasonal = 1 + p.seasonalAmplitude * Math.cos((2 * Math.PI * (quarter - p.peakQuarter)) / 4);
      const capacity = p.capacity2024 * (1 + p.capacityGrowth) ** yearsFrom2024;
      const historical = time <= POWER_ANALYTICS_AS_OF;
      let actual: number | null = null;
      let forecast: number | null = null;
      if (historical) {
        actual = p.load2024 * (1 + p.loadGrowth) ** yearsFrom2024 * seasonal * (1 + wobble(marketIndex + 1, index, 0.015));
        lastActual = actual / seasonal;
      } else {
        const quartersAhead = (time - POWER_ANALYTICS_AS_OF) / (91.25 * 86_400);
        forecast = lastActual * (1 + p.forecastGrowth) ** (quartersAhead / 4) * seasonal;
      }
      rows.push({
        time,
        marketId: market.id,
        actualLoadGw: actual === null ? null : round1(actual),
        forecastLoadGw: forecast === null ? null : round1(forecast),
        deliverableCapacityGw: round1(capacity),
      });
      index++;
    }
  }
  return rows;
});

/** One point of the aggregate delivery picture across all seven markets. */
export type DeliveryPoint = {
  time: number;
  actualLoadGw: number | null;
  forecastLoadGw: number | null;
  deliverableCapacityGw: number;
  /** forecast − capacity when positive, else 0; null before the forecast begins. */
  deliveryGapGw: number | null;
};

/** The hero series: every market summed by quarter. */
export const DELIVERY_SERIES: DeliveryPoint[] = (() => {
  const byTime = new Map<number, LoadObservation[]>();
  for (const row of LOAD_OBSERVATIONS) byTime.set(row.time, [...(byTime.get(row.time) ?? []), row]);
  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, rows]) => {
      const sum = (pick: (row: LoadObservation) => number | null) => {
        const values = rows.map(pick);
        return values.every((value) => value === null) ? null : round1(values.reduce<number>((total, value) => total + (value ?? 0), 0));
      };
      const actual = sum((row) => row.actualLoadGw);
      const forecast = sum((row) => row.forecastLoadGw);
      const capacity = sum((row) => row.deliverableCapacityGw)!;
      return {
        time,
        actualLoadGw: actual,
        forecastLoadGw: forecast,
        deliverableCapacityGw: capacity,
        deliveryGapGw: forecast === null ? null : round1(Math.max(0, forecast - capacity)),
      };
    });
})();

/** The last quarter with observed load: the "today" boundary on the chart. */
export const TODAY_POINT: DeliveryPoint = [...DELIVERY_SERIES].reverse().find((point) => point.actualLoadGw !== null)!;

/** Delivery gap at the horizon year's final quarter: forecast demand minus deliverable capacity. */
export const HORIZON_DELIVERY_GAP = (() => {
  const point = DELIVERY_SERIES.find((candidate) => candidate.time === quarterStart(DELIVERY_GAP_HORIZON_YEAR, 3))!;
  return { year: DELIVERY_GAP_HORIZON_YEAR, gapGw: point.deliveryGapGw ?? 0, forecastLoadGw: point.forecastLoadGw ?? 0, deliverableCapacityGw: point.deliverableCapacityGw };
})();

/* ---------- Interconnection queue ---------- */

export const QUEUE_YEARS = [2022, 2023, 2024, 2025, 2026] as const;

/** Yearly queue history per market; earlier years are scaled back from the latest so the view can become a trend later. */
export const INTERCONNECTION_OBSERVATIONS: InterconnectionObservation[] = POWER_MARKETS.flatMap((market) => {
  const q = profile(market.id).queue;
  return QUEUE_YEARS.map((year, index) => {
    const yearsBack = QUEUE_YEARS.length - 1 - index;
    return {
      year,
      marketId: market.id,
      queuedLoadGw: round1(q.load * 0.62 ** yearsBack),
      queuedGenerationGw: round1(q.generation * 0.88 ** yearsBack),
      medianLoadWaitMonths: Math.round(q.loadWait - 4 * yearsBack),
      medianGenerationWaitMonths: Math.round(q.generationWait - 2 * yearsBack),
    };
  });
});

export const QUEUE_LATEST_YEAR = QUEUE_YEARS[QUEUE_YEARS.length - 1];

/** Markets ranked by queued GW for the chosen queue, from the latest observation. */
export function queueRanking(mode: QueueMode): QueueRow[] {
  return INTERCONNECTION_OBSERVATIONS.filter((row) => row.year === QUEUE_LATEST_YEAR)
    .map((row) => ({
      market: findPowerMarket(row.marketId),
      queuedGw: mode === "load" ? row.queuedLoadGw : row.queuedGenerationGw,
      medianWaitMonths: mode === "load" ? row.medianLoadWaitMonths : row.medianGenerationWaitMonths,
    }))
    .sort((a, b) => b.queuedGw - a.queuedGw);
}

/* ---------- Transmission headroom ---------- */

/** Headroom % thresholds: below TIGHT is tight, below MODERATE is moderate, otherwise available. */
export const HEADROOM_TIGHT_PERCENT = 6;
export const HEADROOM_MODERATE_PERCENT = 12;

function headroomState(percent: number): HeadroomState {
  if (percent < HEADROOM_TIGHT_PERCENT) return "tight";
  if (percent < HEADROOM_MODERATE_PERCENT) return "moderate";
  return "available";
}

/**
 * Headroom = deliverable capacity − peak load at the latest observed
 * quarter, and headroom % = headroom ÷ deliverable capacity. This is room
 * on the wires, not unused generation. Ranked by headroom %, tightest first.
 */
export const HEADROOM_ROWS: HeadroomRow[] = POWER_MARKETS.map((market) => {
  const latest = LOAD_OBSERVATIONS.filter((row) => row.marketId === market.id && row.time === TODAY_POINT.time)[0]!;
  const loadGw = latest.actualLoadGw!;
  const headroomGw = round1(latest.deliverableCapacityGw - loadGw);
  const headroomPercent = (headroomGw / latest.deliverableCapacityGw) * 100;
  return { market, loadGw, deliverableCapacityGw: latest.deliverableCapacityGw, headroomGw, headroomPercent, state: headroomState(headroomPercent) };
}).sort((a, b) => a.headroomPercent - b.headroomPercent);

/* ---------- Grid buildout ---------- */

export const BUILDOUT_YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026] as const;

/** Yearly buildout per market: additions ramp up towards the latest year; transformer lead times lengthen. */
export const INFRASTRUCTURE_OBSERVATIONS: InfrastructureObservation[] = POWER_MARKETS.flatMap((market, marketIndex) => {
  const b = profile(market.id).buildout;
  return BUILDOUT_YEARS.map((year, index) => {
    const yearsBack = BUILDOUT_YEARS.length - 1 - index;
    const ramp = 0.9 ** yearsBack * (1 + wobble(marketIndex + 11, index, 0.08));
    return {
      year,
      marketId: market.id,
      transmissionCapacityAddedGw: round1(b.capacityGw * ramp),
      transmissionMilesAdded: Math.round(b.miles * ramp),
      substationCapacityAddedGva: round1(b.substationGva * ramp),
      transformerLeadTimeMonths: Math.round(b.transformerMonths - 2.2 * yearsBack + wobble(marketIndex + 23, index, 1.5)),
    };
  });
});

function aggregateByYear(pick: (row: InfrastructureObservation) => number, reduce: "sum" | "mean"): { year: number; value: number }[] {
  return BUILDOUT_YEARS.map((year) => {
    const values = INFRASTRUCTURE_OBSERVATIONS.filter((row) => row.year === year).map(pick);
    const total = values.reduce((sum, value) => sum + value, 0);
    return { year, value: round1(reduce === "sum" ? total : total / values.length) };
  });
}

/** The four buildout measures, aggregated across the seven markets. Additions sum; lead time is the mean. */
export const BUILDOUT_METRICS: BuildoutMetric[] = [
  {
    id: "transfer-capacity",
    label: "Transfer capacity",
    unit: "GW added / year",
    description: "Transmission transfer capacity added each year: the most direct measure of network expansion.",
    lowerIsBetter: false,
    points: aggregateByYear((row) => row.transmissionCapacityAddedGw, "sum"),
  },
  {
    id: "circuit-miles",
    label: "Circuit miles",
    unit: "miles added / year",
    description: "Transmission circuit-miles energised each year.",
    lowerIsBetter: false,
    points: aggregateByYear((row) => row.transmissionMilesAdded, "sum"),
  },
  {
    id: "substations",
    label: "Substations",
    unit: "GVA added / year",
    description: "Substation transformation capacity added each year, in GVA, so facilities of different sizes are not counted as equals.",
    lowerIsBetter: false,
    points: aggregateByYear((row) => row.substationCapacityAddedGva, "sum"),
  },
  {
    id: "transformer-lead-time",
    label: "Transformer lead time",
    unit: "months",
    description: "Modelled lead time to procure major grid transformers, averaged across markets. Lower is better.",
    lowerIsBetter: true,
    points: aggregateByYear((row) => row.transformerLeadTimeMonths, "mean"),
  },
];

export function findBuildoutMetric(id: BuildoutMetricId): BuildoutMetric {
  return BUILDOUT_METRICS.find((metric) => metric.id === id)!;
}

/* ---------- Flexible capacity ---------- */

export const FLEXIBILITY_ASSUMPTIONS: FlexibilityAssumption[] = POWER_MARKETS.map((market) => profile(market.id).flexibility);

export const FLEXIBILITY_SCENARIO_HOURS = [0, 25, 50, 100, 150, 200] as const;
/** The scenario quoted in the headline. */
export const FLEXIBILITY_HEADLINE_HOURS = 100;
/**
 * Diminishing returns: the share of a market's flexible load that unlocks
 * capacity is 1 − e^(−hours/τ). Most constrained hours are few, so the first
 * flexible hours unlock the most; τ sets how quickly that saturates.
 */
const FLEXIBILITY_SATURATION_HOURS = 90;

const unlockShare = (hours: number) => 1 - Math.exp(-hours / FLEXIBILITY_SATURATION_HOURS);

/** Capacity unlocked across all markets when large loads can flex for the given hours per year. */
export function flexibilityScenario(flexibleHoursPerYear: number): FlexibilityScenario {
  const share = unlockShare(flexibleHoursPerYear);
  const interruptibleGw = round1(FLEXIBILITY_ASSUMPTIONS.reduce((sum, row) => sum + row.interruptibleLoadGw, 0) * share);
  // Batteries shift energy rather than shed it, so they are modelled at a modest discount.
  const batteryGw = round1(FLEXIBILITY_ASSUMPTIONS.reduce((sum, row) => sum + row.batteryShiftableLoadGw, 0) * share * 0.8);
  return { flexibleHoursPerYear, interruptibleGw, batteryGw, unlockedGw: round1(interruptibleGw + batteryGw) };
}

export const FLEXIBILITY_SCENARIOS: FlexibilityScenario[] = FLEXIBILITY_SCENARIO_HOURS.map(flexibilityScenario);

/** A denser curve for drawing, sampled every 5 hours. */
export const FLEXIBILITY_CURVE: FlexibilityScenario[] = Array.from({ length: 41 }, (_, index) => flexibilityScenario(index * 5));

export const FLEXIBILITY_HEADLINE: FlexibilityScenario = flexibilityScenario(FLEXIBILITY_HEADLINE_HOURS);
