/**
 * Shared normalization: dates, technologies, and the two rules that protect the product's honesty.
 *
 * The rules are `operationalStage` and the refusal to infer a hybrid from a fuel string. Both
 * exist because the plausible-looking shortcut is wrong in a way nobody would notice downstream.
 */

import type { LifecycleStage, RequestClass, Technology } from "@/lib/interconnection-queue/types";

/** ISO date from the several shapes the three publishers use, or null. Never a guess. */
export function isoDate(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.trim();
  if (value === "") return null;
  // ISO-8601, with or without a time component.
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/.exec(value);
  if (iso !== null) return validDate(`${iso[1]}-${iso[2]}-${iso[3]}`);
  // US M/D/YYYY, as SPP and CAISO text cells use.
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (us !== null) {
    return validDate(`${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`);
  }
  return null;
}

function validDate(candidate: string): string | null {
  const [year, month, day] = candidate.split("-").map(Number) as [number, number, number];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // A publisher's "no date" sentinel. ERCOT writes 1-1-1900; the others write dates near it when
  // a legacy record was migrated. Anything before the first organised market is not a real date.
  if (year < 1960 || year > 2200) return null;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/** An Excel serial date, which CAISO's workbook stores for every date column. */
export function excelSerialDate(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const serial = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(serial) || serial <= 0) return null;
  // Excel's epoch is 1899-12-30 once its fictional 1900 leap day is accounted for.
  const ms = Math.round(serial * 86_400_000) + Date.UTC(1899, 11, 30);
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return validDate(date.toISOString().slice(0, 10));
}

export function trimmed(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.trim();
  return value === "" ? null : value;
}

/** A finite number from a source cell, or null. An unparseable value is deferred, never zeroed. */
export function numeric(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const value = raw.trim().replace(/,/g, "");
  if (value === "" || !/^-?\d*\.?\d+(?:[eE][-+]?\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const TECHNOLOGY_TERMS: readonly (readonly [RegExp, Technology])[] = [
  [/\boffshore\s*wind\b|\bosw\b/i, "wind"],
  [/\bwind\b|\bwt\b/i, "wind"],
  [/\bphotovolta|solar\b|\bpv\b|\bsun\b/i, "solar"],
  [/\bbatter|\bstorage\b|\bbess\b|\bbat\b|\bes\b/i, "battery_storage"],
  [/\bnuclear\b|\bnuc\b/i, "nuclear"],
  [/\bcoal\b/i, "coal"],
  [/\bgeothermal\b/i, "geothermal"],
  [/\bbiomass\b|\bwood\b|\blandfill\b/i, "biomass"],
  [/pumped[-\s]*storage|\bhydro\b|\bwater\b/i, "hydro"],
  [/natural\s*gas|\bmethane\b|\bgas\b|combined\s*cycle|combustion\s*turbine|\bcc\b|\bct\b|\bgt\b/i, "natural_gas"],
];

/**
 * A normalized family for one native label. Returns null when nothing matches, so the caller can
 * defer it rather than quietly filing it under `other_generation`.
 *
 * This maps a *single* component's label. It never returns `hybrid`: whether a request comprises
 * more than one resource is a structural fact about the source's encoding, not something to read
 * out of a string. A label like "DFO NG" is one dual-fuel machine, and treating it as two
 * resources would invent a battery that does not exist.
 */
export function technologyFor(label: string | null): Technology | null {
  const value = trimmed(label);
  if (value === null) return null;
  for (const [pattern, technology] of TECHNOLOGY_TERMS) {
    if (pattern.test(value)) return technology;
  }
  return null;
}

/** The class implied by the resource families a request comprises. */
export function requestClassFor(technologies: readonly Technology[]): RequestClass {
  const distinct = [...new Set(technologies)];
  if (distinct.length === 0) return "unknown";
  if (distinct.includes("transmission")) return distinct.length === 1 ? "transmission" : "mixed";
  if (distinct.includes("load")) return distinct.length === 1 ? "load" : "mixed";
  const generating = distinct.filter((technology) => technology !== "battery_storage" && technology !== "unknown");
  const hasStorage = distinct.includes("battery_storage");
  if (hasStorage && generating.length > 0) return "mixed";
  if (hasStorage) return "storage";
  if (generating.length > 0) return "generation";
  return "unknown";
}

/**
 * The one place a stage may become `operational`.
 *
 * A proposed commercial operation date in the past is not evidence that a project is operating;
 * it is evidence that a project is late, which is the overwhelmingly common case in every queue
 * IQ-1 inspected. Operational requires the publisher to say so — an in-service status or an
 * actual in-service date — and this function is the only route to that stage.
 */
export function operationalStage(input: {
  nativeSaysOperational: boolean;
  actualInServiceOn: string | null;
}): LifecycleStage | null {
  if (input.nativeSaysOperational || input.actualInServiceOn !== null) return "operational";
  return null;
}
