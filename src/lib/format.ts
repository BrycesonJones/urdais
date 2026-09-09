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
