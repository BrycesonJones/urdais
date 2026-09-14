/**
 * The UCPI LISTED GPU family registry: every listed on-demand GPU instrument
 * Urdais defines, as configuration. Adding a listed GPU is a registry entry, a
 * child specification document, a migration row and recorded seller evidence,
 * not new collector code.
 *
 * Each entry fixes the economic instrument (vendor, model, form factor, memory
 * where it distinguishes products) and the upstream SKUs, per technical source,
 * that denote it. A vendor SKU that maps to no entry is unsupported and its
 * observations fail identity; a vendor SKU that denotes a different physical
 * product (H200 NVL, A100 PCIe, A100 40 GB) is never collapsed into a sibling.
 */

import { PRICE_OF_COMPUTE_SLUG } from "@/lib/ucpi/adapters/price-of-compute";

export type GpuFormFactor = "SXM" | "PCIe" | "NVL";

/** What an observation must show to be this instrument's hardware. memoryGb null means memory does not distinguish products for this model. */
export type GpuIdentityRequirement = {
  vendor: "NVIDIA";
  model: string;
  formFactor: GpuFormFactor;
  memoryGb: number | null;
};

export type ListedGpuInstrument = {
  symbol: string;
  displayName: string;
  /** Short GPU label for a market list, e.g. "H100 SXM". */
  gpuLabel: string;
  identity: GpuIdentityRequirement;
  /** Upstream SKUs per technical source slug that denote exactly this instrument. */
  upstreamSkus: Readonly<Record<string, readonly string[]>>;
  /** Routed specification document (docs catalog slug) and its current draft version. */
  docSlug: string;
  specVersion: string;
  /** Model-specific notes that the child specification also states. */
  notes: readonly string[];
};

/** Behaviour shared by every listed GPU instrument; the family specification, not the child, owns these. */
export const LISTED_FAMILY = {
  methodology: "UCPI-LISTED-GPU",
  /** Routed family specification document. */
  docSlug: "methodology/ucpi-listed-gpu",
  observationType: "indicative_or_list_price",
  procurementModes: ["on_demand"],
  regionScope: "listed_provider_wide",
  spec: "listed",
  fullDeviceRequired: true,
  topologyClass: "per_accelerator_allocation",
} as const;

/** Copy shown wherever a listed price is presented. */
export const LISTED_AVAILABILITY_CAVEAT = "Listed prices do not guarantee current capacity availability.";

/** The family's structural floor: fewer than two independent participants is not a market price. */
export const LISTED_MINIMUM_PARTICIPANTS = 2;

export const LISTED_GPU_INSTRUMENTS: readonly ListedGpuInstrument[] = [
  {
    symbol: "UCPI-H100-SXM-LISTED",
    displayName: "UCPI H100 SXM Listed",
    gpuLabel: "H100 SXM",
    identity: { vendor: "NVIDIA", model: "H100", formFactor: "SXM", memoryGb: 80 },
    upstreamSkus: { [PRICE_OF_COMPUTE_SLUG]: ["H100-SXM"] },
    docSlug: "methodology/ucpi-h100-sxm-listed",
    specVersion: "0.1.2-draft",
    notes: ["H100 PCIe and H100 NVL are different instruments."],
  },
  {
    symbol: "UCPI-H200-SXM-LISTED",
    displayName: "UCPI H200 SXM Listed",
    gpuLabel: "H200 SXM",
    identity: { vendor: "NVIDIA", model: "H200", formFactor: "SXM", memoryGb: 141 },
    upstreamSkus: { [PRICE_OF_COMPUTE_SLUG]: ["H200-SXM"] },
    docSlug: "methodology/ucpi-h200-sxm-listed",
    specVersion: "0.1.0-draft",
    notes: ["H200 NVL is a different physical product and is not this instrument."],
  },
  {
    symbol: "UCPI-B200-LISTED",
    displayName: "UCPI B200 Listed",
    gpuLabel: "B200",
    identity: { vendor: "NVIDIA", model: "B200", formFactor: "SXM", memoryGb: null },
    upstreamSkus: { [PRICE_OF_COMPUTE_SLUG]: ["B200"] },
    docSlug: "methodology/ucpi-b200-listed",
    specVersion: "0.1.0-draft",
    notes: [
      "The B200 accelerator as sold in HGX B200 systems (SXM6 module). Sellers label device memory 180 GB or 192 GB for the same part, so memory does not gate identity.",
      "GB200 and GB300 NVL platforms are different products and are never admitted as B200 observations.",
    ],
  },
  {
    symbol: "UCPI-A100-SXM4-80GB-LISTED",
    displayName: "UCPI A100 SXM4 80GB Listed",
    gpuLabel: "A100 SXM4 80GB",
    identity: { vendor: "NVIDIA", model: "A100", formFactor: "SXM", memoryGb: 80 },
    upstreamSkus: { [PRICE_OF_COMPUTE_SLUG]: ["A100-SXM-80GB"] },
    docSlug: "methodology/ucpi-a100-sxm4-80gb-listed",
    specVersion: "0.1.0-draft",
    notes: ["A100 SXM4 40 GB, A100 PCIe 80 GB and A100 PCIe 40 GB are different instruments."],
  },
  {
    symbol: "UCPI-RTX-5090-LISTED",
    displayName: "UCPI RTX 5090 Listed",
    gpuLabel: "RTX 5090",
    identity: { vendor: "NVIDIA", model: "RTX 5090", formFactor: "PCIe", memoryGb: 32 },
    upstreamSkus: { [PRICE_OF_COMPUTE_SLUG]: ["RTX-5090"] },
    docSlug: "methodology/ucpi-rtx-5090-listed",
    specVersion: "0.1.0-draft",
    notes: ["A consumer card rented as a whole device. Virtualized slices, shared hosts and serverless products are excluded by the family's full-device and service-product rules."],
  },
];

export function listedInstrument(symbol: string): ListedGpuInstrument | undefined {
  return LISTED_GPU_INSTRUMENTS.find((i) => i.symbol === symbol);
}

/** The instrument an upstream SKU denotes on a technical source, or undefined when the SKU is unsupported. */
export function listedInstrumentForSku(sourceSlug: string, sku: string): ListedGpuInstrument | undefined {
  return LISTED_GPU_INSTRUMENTS.find((i) => (i.upstreamSkus[sourceSlug] ?? []).includes(sku));
}

/** Public presentation of any UCPI instrument: what a market list shows beside the number. */
export type InstrumentPresentation = {
  symbol: string;
  displayName: string;
  gpu: { vendor: string; model: string; formFactor: GpuFormFactor; memoryGb: number | null; label: string };
  observationType: "listed" | "accessible";
  procurementMode: "on_demand";
};

export function instrumentPresentation(symbol: string): InstrumentPresentation {
  const listed = listedInstrument(symbol);
  if (listed) {
    return { symbol, displayName: listed.displayName, gpu: { ...listed.identity, label: listed.gpuLabel }, observationType: "listed", procurementMode: "on_demand" };
  }
  if (symbol === "UCPI-H100-SXM") {
    return { symbol, displayName: "UCPI H100 SXM", gpu: { vendor: "NVIDIA", model: "H100", formFactor: "SXM", memoryGb: 80, label: "H100 SXM" }, observationType: "accessible", procurementMode: "on_demand" };
  }
  throw new Error(`unknown instrument ${symbol}`);
}
