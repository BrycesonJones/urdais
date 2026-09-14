/**
 * Normalization to the canonical public unit: USD / 1M tokens.
 *
 * Source-native currency and denominator are retained. Conversion is explicit.
 * A non-USD price without a recorded FX source is refused, never silently
 * converted. Incompatible units (per-hour storage, per-image, per-minute) are
 * refused rather than forced into USD/1M.
 */

import { CANONICAL_CURRENCY, CANONICAL_DENOMINATOR_TOKENS, CANONICAL_UNIT } from "@/lib/tokens/dimensions";

export type NativeTokenPrice = {
  price: number;
  currency: string;
  denominatorTokens: number;
};

export type FxConversion = {
  rate: number;
  source: string;
  asOf: string;
  /** ISO 4217 of the rate quote, always the native currency per 1 USD or documented. */
  quotedAs: "native_per_usd" | "usd_per_native";
};

export type CanonicalTokenPrice = {
  priceUsdPer1m: number;
  currency: typeof CANONICAL_CURRENCY;
  denominatorTokens: typeof CANONICAL_DENOMINATOR_TOKENS;
  unit: typeof CANONICAL_UNIT;
  native: NativeTokenPrice;
  fx: FxConversion | null;
};

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite number ≥ 0`);
  }
}

export function scaleTo1mTokens(price: number, denominatorTokens: number): number {
  assertFiniteNonNegative(price, "price");
  if (!Number.isInteger(denominatorTokens) || denominatorTokens <= 0) {
    throw new Error("denominatorTokens must be a positive integer");
  }
  return price * (CANONICAL_DENOMINATOR_TOKENS / denominatorTokens);
}

function applyFx(nativeUsdEquivalent: number, currency: string, fx: FxConversion | null): { usd: number; fx: FxConversion | null } {
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error(`currency '${currency}' is not ISO 4217`);
  }
  if (code === CANONICAL_CURRENCY) {
    if (fx) throw new Error("USD prices must not carry an FX conversion");
    return { usd: nativeUsdEquivalent, fx: null };
  }
  if (!fx) {
    throw new Error(
      `refusing silent conversion of ${code} to USD: record fx.source, fx.rate, fx.asOf, and fx.quotedAs`,
    );
  }
  if (!fx.source.trim()) throw new Error("FX source is required for a non-USD conversion");
  if (!Number.isFinite(fx.rate) || fx.rate <= 0) throw new Error("FX rate must be a positive finite number");
  const usd = fx.quotedAs === "usd_per_native" ? nativeUsdEquivalent * fx.rate : nativeUsdEquivalent / fx.rate;
  return { usd, fx };
}

export function normalizeToUsdPer1m(native: NativeTokenPrice, fx: FxConversion | null = null): CanonicalTokenPrice {
  const per1mNative = scaleTo1mTokens(native.price, native.denominatorTokens);
  const converted = applyFx(per1mNative, native.currency, fx);
  return {
    priceUsdPer1m: converted.usd,
    currency: CANONICAL_CURRENCY,
    denominatorTokens: CANONICAL_DENOMINATOR_TOKENS,
    unit: CANONICAL_UNIT,
    native: {
      price: native.price,
      currency: native.currency.trim().toUpperCase(),
      denominatorTokens: native.denominatorTokens,
    },
    fx: converted.fx,
  };
}
