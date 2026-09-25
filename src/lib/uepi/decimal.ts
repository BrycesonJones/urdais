/**
 * Exact decimal arithmetic for UEPI prices.
 *
 * Prices travel as decimal strings and are summed as scaled integers, because the alternative does
 * not reproduce. Binary floating point cannot represent 0.1, so a mean of 24 cent-denominated
 * prices computed in `number` depends on the order of the additions in the last bits -- and the
 * released value carries a SHA-256 of its own inputs precisely so that anyone can recompute it and
 * get the same answer. "Close enough" would make that digest a decoration.
 *
 * Small and local on purpose: the repository has no decimal dependency, and UEPI needs exactly
 * three operations.
 */

import { UepiDomainError } from "@/lib/uepi/types";

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export type Decimal = {
  /** The value as an integer scaled by 10^scale. */
  readonly units: bigint;
  readonly scale: number;
};

export function parseDecimal(value: string): Decimal {
  const text = value.trim();
  if (!DECIMAL_PATTERN.test(text)) {
    throw new UepiDomainError(`'${value}' is not a decimal number`);
  }
  const negative = text.startsWith("-");
  const digits = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = digits.split(".");
  const units = BigInt(`${whole}${fraction}`) * (negative ? -1n : 1n);
  return { units, scale: fraction.length };
}

function rescale(value: Decimal, scale: number): bigint {
  if (scale < value.scale) throw new UepiDomainError("cannot rescale a decimal downwards without rounding");
  return value.units * 10n ** BigInt(scale - value.scale);
}

export function formatDecimal({ units, scale }: Decimal): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = scale === 0 ? "" : `.${digits.slice(digits.length - scale)}`;
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

/**
 * The arithmetic mean of decimal values, rounded half-up (away from zero on a tie) to `places`.
 *
 * Half-up away from zero rather than banker's rounding, so that a negative day and a positive day
 * of the same magnitude round symmetrically. Wholesale prices are signed, and a rounding rule that
 * treats the two signs differently would put a systematic bias into a series that crosses zero.
 */
export function meanDecimal(values: readonly string[], places: number): string {
  if (values.length === 0) throw new UepiDomainError("the mean of no observations is not a number");
  if (!Number.isInteger(places) || places < 0) throw new UepiDomainError(`${places} is not a decimal place count`);

  const parsed = values.map(parseDecimal);
  const scale = parsed.reduce((widest, value) => Math.max(widest, value.scale), 0);
  const total = parsed.reduce((sum, value) => sum + rescale(value, scale), 0n);

  // Scale the numerator up to the requested precision *before* dividing, so the division is the
  // only place rounding happens and it happens once.
  const numerator = total * 10n ** BigInt(places);
  const denominator = BigInt(values.length) * 10n ** BigInt(scale);
  const negative = (numerator < 0n) !== (denominator < 0n);
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;

  const quotient = absNumerator / absDenominator;
  const remainder = absNumerator % absDenominator;
  const rounded = remainder * 2n >= absDenominator ? quotient + 1n : quotient;

  return formatDecimal({ units: negative ? -rounded : rounded, scale: places });
}

/** A decimal string as a `number`, for display and for comparisons that are not the published value. */
export function decimalToNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new UepiDomainError(`'${value}' is not a finite number`);
  return parsed;
}
