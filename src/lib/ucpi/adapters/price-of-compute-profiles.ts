/**
 * What Urdais itself knows about the sellers named by the Price of Compute
 * dataset, from its own Phase 1 and Phase 2 provider research (12 September
 * 2026) and its own reading of the sellers' terms. The aggregator supplies a
 * price; it does not supply topology, tenancy or legal identity, and none of
 * those is inferred from it here.
 *
 * A seller without a per-accelerator class established from Urdais evidence
 * carries minimumGpuCount null and is excluded as MINIMUM_TOPOLOGY_UNKNOWN. A
 * seller whose product is a whole node carries 8 and is excluded as
 * WHOLE_NODE_REQUIRED. Nothing here lowers a gate; it records evidence.
 */

import type { PocSellerProfile, PocSellerProfiles } from "@/lib/ucpi/adapters/price-of-compute";

export type PocSellerEvidence = Omit<PocSellerProfile, "entityId"> & { slug: string };

export const POC_SELLER_EVIDENCE_2026_09_14: readonly PocSellerEvidence[] = [
  { slug: "runpod", kind: "vertically_integrated_cloud", minimumGpuCount: 1, topologyEvidence: "Runpod GPU catalog: single-GPU H100 SXM pods; minPodGpuCount field (Phase 1/2 research, 12 September 2026)", tenancyGrade: "documented", tenancyEvidence: "Runpod documentation: Secure Cloud pods run on dedicated hardware in vetted data centres (Phase 2 research); the dataset's on_demand row is Secure Cloud, community priced separately", legalNameEvidenced: true },
  { slug: "lambda", kind: "vertically_integrated_cloud", minimumGpuCount: 1, topologyEvidence: "Lambda instance type gpu_1x_h100_sxm5 (Phase 1 research, 12 September 2026)", tenancyGrade: "ambiguous", tenancyEvidence: "Lambda documentation does not state whether a 1x instance shares its host; question sent in-thread, unanswered", legalNameEvidenced: true },
  { slug: "hyperstack", kind: "vertically_integrated_cloud", minimumGpuCount: 1, topologyEvidence: "Hyperstack pricing surface lists H100 SXM per accelerator with per-GPU host resources (Phase 1 research, 12 September 2026)", tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: true },
  { slug: "nebius", kind: "vertically_integrated_cloud", minimumGpuCount: 1, topologyEvidence: "Nebius pricing surface lists HGX H100 on-demand per GPU-hour from a single accelerator (Phase 1 research, 12 September 2026)", tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false },
  { slug: "voltagepark", kind: "vertically_integrated_cloud", minimumGpuCount: 1, topologyEvidence: "Voltage Park: on-demand offered from 1 to 1016 GPUs (Phase 1 research, 12 September 2026)", tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: true },
  { slug: "coreweave", kind: "vertically_integrated_cloud", minimumGpuCount: 8, topologyEvidence: "CoreWeave H100 HGX sold as a whole node at a stated count of 8 (Phase 1 research); a per-accelerator figure is a node price divided by eight", tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false },
  { slug: "azure", kind: "hyperscaler", minimumGpuCount: 8, topologyEvidence: "Azure ND H100 v5 is an eight-accelerator instance; a per-accelerator figure is a node price divided by eight", tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false },
  { slug: "vast", kind: "marketplace_aggregate", minimumGpuCount: null, topologyEvidence: null, tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false },
  { slug: "massedcompute", kind: "reseller", minimumGpuCount: null, topologyEvidence: null, tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false },
  { slug: "datacrunch", kind: "vertically_integrated_cloud", minimumGpuCount: null, topologyEvidence: null, tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false },
  { slug: "denvr", kind: "vertically_integrated_cloud", minimumGpuCount: null, topologyEvidence: null, tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false },
];

/** Binds the evidence to market entity ids; a slug absent from `entityIdBySlug` is left unmapped and cannot participate. */
export function pocSellerProfiles(entityIdBySlug: ReadonlyMap<string, string>, evidence: readonly PocSellerEvidence[] = POC_SELLER_EVIDENCE_2026_09_14): PocSellerProfiles {
  const out = new Map<string, PocSellerProfile>();
  for (const e of evidence) {
    const entityId = entityIdBySlug.get(e.slug);
    if (entityId === undefined) continue;
    out.set(e.slug, { entityId, kind: e.kind, minimumGpuCount: e.minimumGpuCount, topologyEvidence: e.topologyEvidence, tenancyGrade: e.tenancyGrade, tenancyEvidence: e.tenancyEvidence, legalNameEvidenced: e.legalNameEvidenced });
  }
  return out;
}
