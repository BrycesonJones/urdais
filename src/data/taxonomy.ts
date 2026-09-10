/**
 * Static homepage taxonomy: what Urdais measures.
 *
 * Editorial content only. These are example series and units, not live
 * values, and the list is not a database model. Order is intentional;
 * domains are categories, not rankings, so they carry no numbering.
 */

export type MeasurementDomain = {
  domain: string;
  description: string;
  examples: string[];
};

export const MEASUREMENT_DOMAINS: MeasurementDomain[] = [
  {
    domain: "Compute",
    description: "Price of computational capacity",
    examples: ["$/GPU-hour", "$/PFLOP-hour", "H100 · H200 · B200"],
  },
  {
    domain: "Memory",
    description: "Price of high-performance memory",
    examples: ["$/GB", "$/GB/s", "HBM3E · HBM4"],
  },
  {
    domain: "Photonics",
    description: "Price of moving information",
    examples: ["$/Gbps", "Transceivers", "Optical bandwidth"],
  },
  {
    domain: "Energy / Power",
    description: "Price of powering computation",
    examples: ["$/kWh", "$/MWh", "Regional pricing"],
  },
  {
    domain: "AI Chips",
    description: "Price of computation hardware",
    examples: ["$/accelerator", "Performance/$", "Availability"],
  },
  {
    domain: "Model Economics",
    description: "Price of machine intelligence",
    examples: ["$/1M input tokens", "$/1M output tokens", "Inference cost"],
  },
  {
    domain: "Crypto",
    description: "Native monetary markets of the Information Age",
    examples: ["BTC purchasing power", "Network economics"],
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
