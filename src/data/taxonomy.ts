/**
 * Static homepage taxonomy: what Urdais measures.
 *
 * Editorial content only. These are example series and units, not live
 * values, and the list is not a database model. Order is intentional;
 * domains are categories, not rankings, so they carry no numbering.
 */

import { COMPUTE_ANALYTICS_HREF, MODEL_ECONOMICS_HREF, POWER_ANALYTICS_HREF } from "@/lib/routes";

export type MeasurementDomain = {
  domain: string;
  description: string;
  examples: string[];
  /** Set once a domain has a real analytical destination; the row becomes a link. */
  href?: string;
};

export const MEASUREMENT_DOMAINS: MeasurementDomain[] = [
  {
    domain: "Compute",
    description: "Price of computational capacity",
    examples: ["$/GPU-hour", "$/PFLOP-hour", "H100 · H200 · B200"],
    href: COMPUTE_ANALYTICS_HREF,
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
    href: POWER_ANALYTICS_HREF,
  },
  {
    domain: "Chips & Accelerators",
    description: "Price of advanced compute hardware",
    examples: ["$/accelerator", "Performance/$", "Availability"],
  },
  {
    domain: "Model Economics",
    description: "Price of machine intelligence",
    examples: ["$/1M input tokens", "$/1M output tokens", "Inference cost"],
    href: MODEL_ECONOMICS_HREF,
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
