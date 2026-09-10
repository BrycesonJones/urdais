/**
 * Static homepage taxonomy: what Urdais measures.
 *
 * Editorial content only. These are example series and units, not live
 * values, and the list is not a database model. Order is intentional.
 */

export type MeasurementDomain = {
  number: string;
  domain: string;
  description: string;
  examples: string[];
};

export const MEASUREMENT_DOMAINS: MeasurementDomain[] = [
  {
    number: "01",
    domain: "Compute",
    description: "Price of computational capacity",
    examples: ["$/GPU-hour", "$/PFLOP-hour", "H100 · H200 · B200"],
  },
  {
    number: "02",
    domain: "Memory",
    description: "Price of high-performance memory",
    examples: ["$/GB", "$/GB/s", "HBM3E · HBM4"],
  },
  {
    number: "03",
    domain: "Photonics",
    description: "Price of moving information",
    examples: ["$/Gbps", "Transceivers", "Optical bandwidth"],
  },
  {
    number: "04",
    domain: "Energy / Power",
    description: "Price of powering computation",
    examples: ["$/kWh", "$/MWh", "Regional pricing"],
  },
  {
    number: "05",
    domain: "AI Chips",
    description: "Price of computation hardware",
    examples: ["$/accelerator", "Performance/$", "Availability"],
  },
  {
    number: "06",
    domain: "Model Economics",
    description: "Price of machine intelligence",
    examples: ["$/1M input tokens", "$/1M output tokens", "Inference cost"],
  },
  {
    number: "07",
    domain: "Crypto",
    description: "Native monetary markets of the Information Age",
    examples: ["BTC purchasing power", "Network economics", "Stablecoins"],
  },
];

/** Cross-cutting dimensions applied across the domains above. */
export const MEASUREMENT_DIMENSIONS = [
  "Price",
  "Capacity",
  "Performance",
  "Region",
  "Service quality",
  "Volatility",
] as const;
