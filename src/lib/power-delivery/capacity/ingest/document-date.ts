/**
 * When a workbook says it was last written.
 *
 * Some publishers date their release in the URL path or on the cover sheet; others date nothing a
 * parser can reach, and the only timestamp in the artifact is the one the Office package writes
 * into docProps/core.xml. That timestamp is inside the bytes, so it is stable across retrievals of
 * the same file and a vintage keyed on it does not drift. It is a save time, not an editorial
 * publication time, which is why callers record it at day precision.
 */

import { readZipDirectory, readZipMember } from "@/lib/power-delivery/planning/xlsx/zip";
import { CapacitySourceFormatError, type CapacitySourceKey } from "@/lib/power-delivery/capacity/ingest/types";

const CORE_PART = "docProps/core.xml";
const MODIFIED = /<dcterms:modified[^>]*>([^<]+)<\/dcterms:modified>/;

export function documentModifiedAt(body: Buffer, source: CapacitySourceKey): Date {
  const entry = readZipDirectory(body).get(CORE_PART);
  if (entry === undefined) {
    throw new CapacitySourceFormatError(source, `the workbook has no ${CORE_PART}, so it states no date of its own`);
  }
  const matched = MODIFIED.exec(readZipMember(body, entry).toString("utf8"));
  if (matched === null) {
    throw new CapacitySourceFormatError(source, `${CORE_PART} states no dcterms:modified`);
  }
  const at = new Date(matched[1]!);
  if (Number.isNaN(at.getTime())) {
    throw new CapacitySourceFormatError(source, `${CORE_PART} states an unreadable date "${matched[1]}"`);
  }
  return at;
}

/** The same timestamp truncated to the day it names, which is as precise as a save time is honest. */
export function documentModifiedDay(body: Buffer, source: CapacitySourceKey): { iso: string; day: string } {
  const at = documentModifiedAt(body, source);
  const day = at.toISOString().slice(0, 10);
  return { iso: `${day}T00:00:00Z`, day };
}
