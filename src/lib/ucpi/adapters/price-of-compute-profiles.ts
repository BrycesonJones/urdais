/**
 * What Urdais itself knows about the sellers named by the Price of Compute
 * dataset, from its own research of the sellers' public price surfaces and
 * terms. The aggregator supplies a price; it does not supply topology, tenancy
 * or legal identity, and none of those is inferred from it here.
 *
 * Evidence is snapshotted and dated. A snapshot is never edited once a
 * candidate has been interpreted under it; new evidence is a new snapshot, so
 * every historical interpretation stays reproducible from its retrieval and
 * the snapshot it used.
 *
 * Topology is per upstream SKU: a seller that sells one GPU per accelerator
 * may sell another only as a whole node. A SKU absent from a seller's topology
 * map is MINIMUM_TOPOLOGY_UNKNOWN for that seller; a minimum of 8 is
 * WHOLE_NODE_REQUIRED. Nothing here lowers a gate; it records evidence.
 */

import type { PocSellerProfile, PocSellerProfiles, PocSellerTopology } from "@/lib/ucpi/adapters/price-of-compute";

// `useRefused` is optional here and required on the profile: a snapshot recorded before any
// refusal existed stays valid and unedited, and binding fills the absence with null.
export type PocSellerEvidence = Omit<PocSellerProfile, "entityId" | "topology" | "useRefused"> & {
  slug: string;
  topology: Readonly<Record<string, PocSellerTopology>>;
  useRefused?: string | null;
};

const RUNPOD_H100 = "Runpod GPU catalog: single-GPU H100 SXM pods; minPodGpuCount field (Phase 1/2 research, 12 September 2026)";
const RUNPOD_TENANCY = "Runpod documentation: Secure Cloud pods run on dedicated hardware in vetted data centres (Phase 2 research); the dataset's on_demand row is Secure Cloud, community priced separately";
const LAMBDA_TENANCY = "Lambda documentation does not state whether a 1x instance shares its host; question sent in-thread, unanswered";
const RUNPOD_USE_REFUSED =
  "Runpod Support, 2026-09-14: refused approval of systematic retrieval of catalog, pricing and availability data for the purpose of building a compilation, and of use of that data as an input to a commercial market-data product. A decision about the intended use, not the retrieval mechanism. Preserved in docs/architecture/sources/runpod-permission-denied.md.";

/**
 * The snapshot the first H100 candidate was interpreted under (UCPI-H100-SXM-LISTED
 * 0.1.1-draft, calculation date 2026-09-14). Frozen: H100 SXM topology only.
 */
export const POC_SELLER_EVIDENCE_2026_09_14: readonly PocSellerEvidence[] = [
  { slug: "runpod", kind: "vertically_integrated_cloud", topology: { "H100-SXM": { minimumGpuCount: 1, evidence: RUNPOD_H100 } }, tenancyGrade: "documented", tenancyEvidence: RUNPOD_TENANCY, legalNameEvidenced: true },
  { slug: "lambda", kind: "vertically_integrated_cloud", topology: { "H100-SXM": { minimumGpuCount: 1, evidence: "Lambda instance type gpu_1x_h100_sxm5 (Phase 1 research, 12 September 2026)" } }, tenancyGrade: "ambiguous", tenancyEvidence: LAMBDA_TENANCY, legalNameEvidenced: true },
  { slug: "hyperstack", kind: "vertically_integrated_cloud", topology: { "H100-SXM": { minimumGpuCount: 1, evidence: "Hyperstack pricing surface lists H100 SXM per accelerator with per-GPU host resources (Phase 1 research, 12 September 2026)" } }, tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: true },
  { slug: "nebius", kind: "vertically_integrated_cloud", topology: { "H100-SXM": { minimumGpuCount: 1, evidence: "Nebius pricing surface lists HGX H100 on-demand per GPU-hour from a single accelerator (Phase 1 research, 12 September 2026)" } }, tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false },
  { slug: "voltagepark", kind: "vertically_integrated_cloud", topology: { "H100-SXM": { minimumGpuCount: 1, evidence: "Voltage Park: on-demand offered from 1 to 1016 GPUs (Phase 1 research, 12 September 2026)" } }, tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: true },
  { slug: "coreweave", kind: "vertically_integrated_cloud", topology: { "H100-SXM": { minimumGpuCount: 8, evidence: "CoreWeave H100 HGX sold as a whole node at a stated count of 8 (Phase 1 research); a per-accelerator figure is a node price divided by eight" } }, tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false },
  { slug: "azure", kind: "hyperscaler", topology: { "H100-SXM": { minimumGpuCount: 8, evidence: "Azure ND H100 v5 is an eight-accelerator instance; a per-accelerator figure is a node price divided by eight" } }, tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false },
  { slug: "vast", kind: "marketplace_aggregate", topology: {}, tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false },
  { slug: "massedcompute", kind: "reseller", topology: {}, tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false },
  { slug: "datacrunch", kind: "vertically_integrated_cloud", topology: {}, tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false },
  { slug: "denvr", kind: "vertically_integrated_cloud", topology: {}, tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false },
];

const SELLER_PAGES = "seller price surface retrieved 2026-09-14T01:45Z, preserved under docs/research/providers";

/**
 * The GPU-family snapshot of 14 September 2026 (evening): per-SKU topology from
 * each seller's own price surface, and legal identity where a contracting entity
 * is named in the seller's own terms. Used for every interpretation after the
 * first H100 candidate.
 */
export const POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY: readonly PocSellerEvidence[] = [
  {
    slug: "runpod", kind: "vertically_integrated_cloud", tenancyGrade: "documented", tenancyEvidence: RUNPOD_TENANCY, legalNameEvidenced: true,
    topology: {
      "H100-SXM": { minimumGpuCount: 1, evidence: RUNPOD_H100 },
      "H200-SXM": { minimumGpuCount: 1, evidence: `Runpod pricing page lists H200 141 GB per GPU with per-GPU vCPU and RAM (Secure Cloud $4.59/hr); ${SELLER_PAGES}` },
      "B200": { minimumGpuCount: 1, evidence: `Runpod pricing page lists B200 180 GB per GPU with per-GPU vCPU and RAM (Secure Cloud $6.79/hr); ${SELLER_PAGES}` },
      "A100-SXM-80GB": { minimumGpuCount: 1, evidence: `Runpod pricing page lists A100 SXM 80 GB per GPU with per-GPU vCPU and RAM (Secure Cloud $1.59/hr); ${SELLER_PAGES}` },
      "RTX-5090": { minimumGpuCount: 1, evidence: `Runpod pricing page lists RTX 5090 32 GB per GPU with per-GPU vCPU and RAM (Secure Cloud $0.99/hr); ${SELLER_PAGES}` },
    },
  },
  {
    slug: "lambda", kind: "vertically_integrated_cloud", tenancyGrade: "ambiguous", tenancyEvidence: LAMBDA_TENANCY, legalNameEvidenced: true,
    topology: {
      "H100-SXM": { minimumGpuCount: 1, evidence: `Lambda pricing page: 1x H100 SXM $4.29, 2x $4.19, 4x $4.09, 8x $3.99 per GPU-hour; ${SELLER_PAGES}`, quantityTiered: true },
      "B200": { minimumGpuCount: 1, evidence: `Lambda pricing page: 1x B200 SXM6 $6.99, 2x $6.89, 4x $6.79, 8x $6.69 per GPU-hour; ${SELLER_PAGES}`, quantityTiered: true },
      "A100-SXM-80GB": { minimumGpuCount: 8, evidence: `Lambda pricing page lists A100 SXM 80 GB only as 8x instances ($2.79 per GPU-hour); ${SELLER_PAGES}` },
      "A100-SXM-40GB": { minimumGpuCount: 1, evidence: `Lambda pricing page: 1x A100 SXM 40 GB $1.99 per GPU-hour; ${SELLER_PAGES}` },
    },
  },
  {
    slug: "hyperstack", kind: "vertically_integrated_cloud", tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: true,
    topology: {
      "H100-SXM": { minimumGpuCount: 1, evidence: `Hyperstack pricing page lists H100 SXM per GPU with max pCPUs and RAM per GPU ($3.20/hr on its own surface); ${SELLER_PAGES}` },
      "H200-SXM": { minimumGpuCount: 1, evidence: `Hyperstack pricing page lists H200 SXM per GPU with max pCPUs and RAM per GPU ($3.99/hr); ${SELLER_PAGES}` },
      "B200": { minimumGpuCount: 1, evidence: `Hyperstack pricing page lists B200 per GPU with max pCPUs and RAM per GPU ($6.00/hr); ${SELLER_PAGES}` },
      "A100-SXM-80GB": { minimumGpuCount: 1, evidence: `Hyperstack pricing page lists A100 SXM 80 GB per GPU with max pCPUs and RAM per GPU ($1.60/hr on its own surface); ${SELLER_PAGES}` },
    },
  },
  {
    slug: "datacrunch", kind: "vertically_integrated_cloud", tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: true,
    topology: {
      "H100-SXM": { minimumGpuCount: 1, evidence: `Verda pricing page: 1x H100 SXM5 80GB instance ($3.25 per GPU-hour); ${SELLER_PAGES}` },
      "H200-SXM": { minimumGpuCount: 1, evidence: `Verda pricing page: 1x H200 SXM5 141GB instance ($4.20 per GPU-hour); ${SELLER_PAGES}` },
      "B200": { minimumGpuCount: 1, evidence: `Verda pricing page: 1x B200 SXM6 180GB instance ($6.23 per GPU-hour); ${SELLER_PAGES}` },
      "A100-SXM-80GB": { minimumGpuCount: 1, evidence: `Verda pricing page: 1x A100 SXM4 80GB instance ($1.74 per GPU-hour); ${SELLER_PAGES}` },
      "A100-SXM-40GB": { minimumGpuCount: 1, evidence: `Verda pricing page: 1x A100 SXM4 40GB instance ($1.25 per GPU-hour); ${SELLER_PAGES}` },
    },
  },
  { slug: "voltagepark", kind: "vertically_integrated_cloud", tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: true, topology: { "H100-SXM": { minimumGpuCount: 1, evidence: "Voltage Park: on-demand offered from 1 to 1016 GPUs (Phase 1 research, 12 September 2026)" } } },
  { slug: "nebius", kind: "vertically_integrated_cloud", tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false, topology: { "H100-SXM": { minimumGpuCount: 1, evidence: "Nebius pricing surface lists HGX H100 on-demand per GPU-hour from a single accelerator (Phase 1 research, 12 September 2026)" } } },
  {
    slug: "massedcompute", kind: "reseller", tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false,
    topology: {
      "H100-SXM": { minimumGpuCount: 1, evidence: `Massed Compute pricing page: H100 SXM5 (80GB) x1 $2.89/hr; ${SELLER_PAGES}` },
      "B200": { minimumGpuCount: 8, evidence: `Massed Compute pricing page lists B200 SXM6 only as x8 ($43.46/hr for the node); the dataset's $5.43 is that node price divided by eight; ${SELLER_PAGES}` },
      "A100-SXM-80GB": { minimumGpuCount: 1, evidence: `Massed Compute pricing page: A100 SXM4 (80GB) x1 $1.38/hr; ${SELLER_PAGES}` },
      "H200-NVL": { minimumGpuCount: 1, evidence: `Massed Compute pricing page: H200 NVL (141GB) x1 $3.62/hr; ${SELLER_PAGES}` },
    },
  },
  {
    slug: "denvr", kind: "vertically_integrated_cloud", tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false,
    topology: {
      "H100-SXM": { minimumGpuCount: 8, evidence: `Denvr pricing page lists H100 SXM as 8-GPU nodes ($3.87 / GPU); ${SELLER_PAGES}` },
      "A100-SXM-80GB": { minimumGpuCount: 8, evidence: `Denvr pricing page lists A100 SXM 80 GB as 8-GPU nodes ($2.45 / GPU); ${SELLER_PAGES}` },
      "A100-SXM-40GB": { minimumGpuCount: 8, evidence: `Denvr pricing page lists A100 SXM 40 GB as 8-GPU nodes ($1.45 / GPU); ${SELLER_PAGES}` },
    },
  },
  {
    slug: "coreweave", kind: "vertically_integrated_cloud", tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false,
    topology: {
      "H100-SXM": { minimumGpuCount: 8, evidence: "CoreWeave H100 HGX sold as a whole node at a stated count of 8 (Phase 1 research); a per-accelerator figure is a node price divided by eight" },
      "H200-SXM": { minimumGpuCount: 8, evidence: "CoreWeave HGX H200 sold as a whole node at a stated count of 8 (Phase 1 research)" },
      "B200": { minimumGpuCount: 8, evidence: "CoreWeave HGX B200 sold as a whole node at a stated count of 8 (Phase 1 research)" },
    },
  },
  {
    slug: "azure", kind: "hyperscaler", tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false,
    topology: {
      "H100-SXM": { minimumGpuCount: 8, evidence: "Azure ND H100 v5 is an eight-accelerator instance; a per-accelerator figure is a node price divided by eight" },
      "A100-SXM-80GB": { minimumGpuCount: 8, evidence: "Azure ND A100 v4 is an eight-accelerator instance; a per-accelerator figure is a node price divided by eight" },
      "A100-SXM-40GB": { minimumGpuCount: 8, evidence: "Azure ND96asr A100 v4 is an eight-accelerator instance; a per-accelerator figure is a node price divided by eight" },
    },
  },
  { slug: "vast", kind: "marketplace_aggregate", tenancyGrade: "unknown", tenancyEvidence: null, legalNameEvidenced: false, topology: {} },
];

/**
 * The production snapshot from 15 September 2026, the day UCPI-LISTED-GPU 1.0.0 was approved.
 *
 * It differs from the 14 September snapshot in exactly one fact, and that fact is not about
 * hardware: Runpod refused Urdais the intended use in writing on 14 September 2026, and a
 * refusal of the use is not cured by receiving the same listed price through Price of Compute.
 * Runpod is therefore excluded from every listed series under the family's seller-refusal rule.
 *
 * The 14 September snapshot is left exactly as it was. The candidate of that date was
 * interpreted under it and stays reproducible from it; this is a new snapshot, not an edit.
 */
export const POC_SELLER_EVIDENCE_2026_09_15: readonly PocSellerEvidence[] = POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY.map((e) =>
  e.slug === "runpod" ? { ...e, useRefused: RUNPOD_USE_REFUSED } : e,
);

/** Binds a snapshot to market entity ids; a slug absent from `entityIdBySlug` is left unmapped and cannot participate. */
export function pocSellerProfiles(entityIdBySlug: ReadonlyMap<string, string>, evidence: readonly PocSellerEvidence[] = POC_SELLER_EVIDENCE_2026_09_15): PocSellerProfiles {
  const out = new Map<string, PocSellerProfile>();
  for (const e of evidence) {
    const entityId = entityIdBySlug.get(e.slug);
    if (entityId === undefined) continue;
    out.set(e.slug, { entityId, kind: e.kind, topology: new Map(Object.entries(e.topology)), tenancyGrade: e.tenancyGrade, tenancyEvidence: e.tenancyEvidence, legalNameEvidenced: e.legalNameEvidenced, useRefused: e.useRefused ?? null });
  }
  return out;
}
