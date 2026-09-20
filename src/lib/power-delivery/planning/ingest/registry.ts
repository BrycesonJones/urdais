/**
 * Which planning sources PD-3C can collect, and why the others cannot.
 *
 * A source that is not ingestible is declared here with its reason rather than omitted, so that
 * "we have no NYISO data" is a recorded fact with an explanation attached instead of an absence
 * someone later mistakes for an oversight. A blocked source produces no rows; it is never
 * approximated from a neighbouring market, a prior year, or a secondary account of the numbers.
 */

import { cecAdapter } from "@/lib/power-delivery/planning/ingest/adapters/cec";
import { ercotAdapter } from "@/lib/power-delivery/planning/ingest/adapters/ercot";
import { isoneAdapter } from "@/lib/power-delivery/planning/ingest/adapters/isone";
import { pjmAdapter } from "@/lib/power-delivery/planning/ingest/adapters/pjm";
import type { PlanningAdapter, PlanningSourceKey } from "@/lib/power-delivery/planning/ingest/types";

export const PLANNING_ADAPTERS: Record<string, PlanningAdapter> = {
  ercot: ercotAdapter,
  pjm: pjmAdapter,
  cec: cecAdapter,
  isone: isoneAdapter,
};

export type PlanningSourceBlocker = {
  source: PlanningSourceKey;
  marketSlug: string;
  sourceInterfaceSlug: string;
  /** rights: Urdais may not use it. format: Urdais cannot read it deterministically. */
  kind: "rights" | "format" | "methodology";
  artifactUrl: string | null;
  reason: string;
  unblockedBy: string;
};

export const PLANNING_SOURCE_BLOCKERS: PlanningSourceBlocker[] = [
  {
    source: "nyiso",
    marketSlug: "nyiso",
    sourceInterfaceSlug: "nyiso-gold-book",
    kind: "format",
    artifactUrl: "https://www.nyiso.com/documents/20142/2226333/2026-Gold-Book-Public.pdf",
    reason:
      "The 2026 Gold Book is published as a PDF and NYISO exposes no machine-readable companion "
      + "for the load forecast tables: the Gold Book landing page and the Gold Book resources page "
      + "return no workbook, and the document library is rendered client-side with no static asset "
      + "listing. Recovering Baseline, Higher Demand and Lower Demand peaks would require "
      + "reconstructing table structure from PDF text positioning, which is not a deterministic "
      + "extraction, and PD-3C does not transcribe numbers by hand into a parser.",
    unblockedBy:
      "A NYISO-published workbook or CSV of the Gold Book load tables, or a PDF table extractor "
      + "whose output can be verified cell by cell against the document.",
  },
  {
    source: "spp",
    marketSlug: "spp",
    sourceInterfaceSlug: "spp-resource-adequacy-report",
    kind: "format",
    artifactUrl: "https://spp.org/documents/76932/2026%20spp%20summer%20resource%20adequacy%20report.pdf",
    reason:
      "The 2026 Summer Resource Adequacy Report is a 43-page PDF and SPP publishes no workbook of "
      + "its Net Peak Demand tables; the load-responsible-entity submissions behind them are not "
      + "public at all. The same deterministic-extraction objection applies as for NYISO. SPP "
      + "would in any case remain internal-only: its rights determination prohibits public display "
      + "without express written authorization, which Urdais does not hold.",
    unblockedBy:
      "An SPP-published workbook of the seasonal Net Peak Demand tables. Publication additionally "
      + "requires express written authorization from SPP.",
  },
  {
    source: "miso",
    marketSlug: "miso",
    sourceInterfaceSlug: "miso-long-term-load-forecast",
    kind: "rights",
    artifactUrl: null,
    reason:
      "Out of scope for PD-3C by instruction, and blocked on two independent grounds already "
      + "recorded in PD-3B: the MISO website terms forbid publication, distribution and derivative "
      + "works, and the public artifact is a set of growth-rate trajectories rather than a vintaged "
      + "year-by-year MW series at balancing-authority grain.",
    unblockedBy: "Written permission from MISO, and a first-party vintaged MW demand series.",
  },
];

export function planningAdapter(key: string): PlanningAdapter | null {
  return PLANNING_ADAPTERS[key] ?? null;
}

export function planningBlocker(key: string): PlanningSourceBlocker | null {
  return PLANNING_SOURCE_BLOCKERS.find((blocker) => blocker.source === key) ?? null;
}

export const INGESTIBLE_PLANNING_SOURCES = Object.keys(PLANNING_ADAPTERS);
