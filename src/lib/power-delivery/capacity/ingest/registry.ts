/**
 * Which capacity sources PD-4C collects, and what each one does not give.
 *
 * Two kinds of gap are recorded here rather than left as silence. A blocked source is one Urdais
 * cannot collect at all. A deferred metric is one inside a source that is collected: the artifact
 * is read, the rest of it is stored, and the named quantity is not, with the reason attached. The
 * second kind matters more, because an absence inside a source that otherwise worked is exactly
 * the absence a reader would assume was an oversight.
 *
 * Nothing here is filled from a neighbouring market, a prior year, or a secondary account of the
 * numbers. A metric that could not be read stays unread.
 */

import { caisoCapacityAdapter } from "@/lib/power-delivery/capacity/ingest/adapters/caiso";
import { ercotCapacityAdapter } from "@/lib/power-delivery/capacity/ingest/adapters/ercot";
import { isoneCapacityAdapter } from "@/lib/power-delivery/capacity/ingest/adapters/isone";
import type { CapacityAdapter, CapacitySourceKey } from "@/lib/power-delivery/capacity/ingest/types";

export const CAPACITY_ADAPTERS: Record<string, CapacityAdapter> = {
  ercot: ercotCapacityAdapter,
  caiso: caisoCapacityAdapter,
  "iso-ne": isoneCapacityAdapter,
};

export const INGESTIBLE_CAPACITY_SOURCES = Object.keys(CAPACITY_ADAPTERS);

export type CapacityDeferral = {
  source: CapacitySourceKey;
  /** The publisher's own name for what is missing. */
  metric: string;
  quantityKind: "capability" | "requirement" | "constraint" | "resource_quantity";
  /** format: not machine-readable. absent: not in the artifact. methodology: reading it would be a decision. */
  kind: "format" | "absent" | "methodology";
  artifactUrl: string | null;
  reason: string;
  unblockedBy: string;
};

export const CAPACITY_DEFERRALS: CapacityDeferral[] = [
  {
    source: "caiso",
    metric: "Maximum Import Capability",
    quantityKind: "constraint",
    kind: "format",
    artifactUrl: "https://www.caiso.com/documents/iso-maximum-resource-adequacy-import-capability-for-year-2026.pdf",
    reason:
      "CAISO publishes the import capability allocation only as a PDF, with the branch-group values "
      + "laid out as a table drawn on the page. Recovering them would mean reconstructing table "
      + "structure from text positioning, which is not a deterministic extraction, and PD-4C does not "
      + "transcribe numbers by hand into a parser.",
    unblockedBy:
      "A CAISO-published workbook or CSV of the branch-group import capability, or a PDF table "
      + "extractor whose output can be verified cell by cell against the document.",
  },
  {
    source: "caiso",
    metric: "Net Qualifying Capacity, as a system or local-area total",
    quantityKind: "capability",
    kind: "methodology",
    artifactUrl: "https://www.caiso.com/documents/final-net-qualifying-capacity-report-for-compliance-year-2026.xlsx",
    reason:
      "The NQC report is per resource and states no total. Every resource-month it does state is "
      + "stored as evidence with its deliverability status attached. A total would be an Urdais "
      + "aggregation across full-capacity, partial, interim and energy-only resources, which is a "
      + "methodology decision rather than a value CAISO published, so no capability component is created.",
    unblockedBy:
      "An approved NQC aggregation methodology, or a CAISO-published area total. The stored evidence "
      + "is what such a methodology would read.",
  },
  {
    source: "caiso",
    metric: "Local Capacity Requirement",
    quantityKind: "requirement",
    kind: "absent",
    artifactUrl: null,
    reason:
      "The local capacity requirement is set in the annual Local Capacity Technical Study, a separate "
      + "publication from the NQC report, and PD-4C registered only the NQC source. Reading an LCR out "
      + "of a different document under this source's vintage would attribute it to a report that does "
      + "not contain it.",
    unblockedBy: "Registering the Local Capacity Technical Study as its own source interface, with its own rights determination.",
  },
  {
    source: "iso-ne",
    metric: "Existing Qualified Capacity",
    quantityKind: "capability",
    kind: "absent",
    artifactUrl: "https://www.iso-ne.com/static-assets/documents/2016/12/summary_of_historical_icr_values.xlsx",
    reason:
      "The ICR summary states requirements and network limits and contains no qualified capacity "
      + "column. ISO-NE publishes qualified capacity in the auction qualification reports, which are "
      + "a different release on a different schedule. Taking a capability figure from one and filing "
      + "it under this vintage would claim the two were stated together.",
    unblockedBy: "Registering an ISO-NE capacity qualification report as its own source interface.",
  },
  {
    source: "iso-ne",
    metric: "The column headed ICAP",
    quantityKind: "capability",
    kind: "absent",
    artifactUrl: "https://www.iso-ne.com/static-assets/documents/2016/12/summary_of_historical_icr_values.xlsx",
    reason:
      "The workbook has a column headed only \"ICAP\", with no definition anywhere in it. Whether it "
      + "is a qualified capability or an installed capacity requirement decides whether it is supply "
      + "or obligation, and the two would enter a delivery gap with opposite signs. It is kept as "
      + "evidence with its cell reference so the question can be settled without re-reading the file.",
    unblockedBy: "An ISO-NE definition of the column, at which point it is a classification change and not a new retrieval.",
  },
  {
    source: "ercot",
    metric: "Zonal and DC-tie capacity",
    quantityKind: "capability",
    kind: "absent",
    artifactUrl: "https://www.ercot.com/files/docs/2025/12/19/CapacityDemandandReservesReport_December2025.xlsx",
    reason:
      "The CDR states capacity for the ERCOT balancing authority as a whole. ERCOT has no capacity "
      + "zones in the resource-adequacy sense and the report defines no subarea, so none is created. "
      + "DC-tie ratings are interconnection ratings rather than an accredited contribution and are "
      + "deliberately not added to a capability figure.",
    unblockedBy: "Nothing: this is what the CDR says, and the absence is correct.",
  },
];

export function capacityAdapter(key: string): CapacityAdapter | null {
  return CAPACITY_ADAPTERS[key] ?? null;
}

export function capacityDeferrals(key: string): CapacityDeferral[] {
  return CAPACITY_DEFERRALS.filter((deferral) => deferral.source === key);
}
