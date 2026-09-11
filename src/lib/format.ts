/** Number formatting for market values. Locale is fixed so server and client output match. */

const LOCALE = "en-US";

// U+2212 minus sign: typographically correct and announced as "minus".
const MINUS = "−";

export function formatNumber(value: number, fractionDigits = 2): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Always-signed number, e.g. "+0.06" or "−0.90". Zero renders without a sign. */
export function formatSigned(value: number, fractionDigits = 2): string {
  const magnitude = formatNumber(Math.abs(value), fractionDigits);
  if (value > 0) return `+${magnitude}`;
  if (value < 0) return `${MINUS}${magnitude}`;
  return magnitude;
}

/** Always-signed percentage, e.g. "+2.55%". */
export function formatPercent(value: number, fractionDigits = 2): string {
  return `${formatSigned(value, fractionDigits)}%`;
}

/** Date (and time for intraday points) in UTC, e.g. "Sep 4, 2026, 14:15 UTC". */
export function formatTimestamp(unixSeconds: number, withTime: boolean): string {
  const date = new Date(unixSeconds * 1000);
  const formatted = new Intl.DateTimeFormat(LOCALE, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
  return withTime ? `${formatted} UTC` : formatted;
}

/** Value with its unit in compact form: "$2.41" for dollar units, "184.21 pts" otherwise. */
export function formatValueWithUnit(value: number, unit: string, fractionDigits = 2): string {
  if (unit.startsWith("$")) return `$${formatNumber(value, fractionDigits)}`;
  return `${formatNumber(value, fractionDigits)} ${unit}`;
}

/** Axis tick label: dollar units carry the sign and at least two decimals; others are bare numbers. */
export function formatAxisValue(value: number, fractionDigits: number, unit: string): string {
  if (unit.startsWith("$")) return `$${formatNumber(value, Math.max(2, fractionDigits))}`;
  return formatNumber(value, fractionDigits);
}

/** Last-updated line, e.g. "Sep 4, 2026 · 16:00 UTC". */
export function formatUpdatedAt(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const day = new Intl.DateTimeFormat(LOCALE, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat(LOCALE, {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${day} · ${time} UTC`;
}

/** Large counts in K / M / B / T form, e.g. 14.82T. Values below a thousand keep two decimals. */
export function formatCompact(value: number, fractionDigits = 2): string {
  const abs = Math.abs(value);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) return `${formatNumber(value / size, fractionDigits)}${suffix}`;
  }
  return formatNumber(value, fractionDigits);
}
