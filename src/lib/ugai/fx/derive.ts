/**
 * Deriving the rate UGAI needs from the rates sources publish.
 *
 * The methodology fixes the orientation: `X_i,t` is USD per one unit of the price currency,
 * "never inverted per currency". No source publishes that for most currencies. The ECB publishes
 * euro reference rates — one euro buys `rate` units of the quoted currency — so USD per JPY is
 * (USD per EUR) / (JPY per EUR), and Taiwan's central bank publishes TWD per USD, which has to be
 * inverted.
 *
 * Every function here returns the components alongside the rate. A derived rate without its legs
 * is unauditable, and an inversion applied in the wrong direction produces a number that still
 * looks like an exchange rate — which is the entire reason this module exists rather than a
 * division written inline at the call site.
 *
 * Rates are strings in and strings out. The database column is `numeric` and a double cannot hold
 * 1.1481 exactly; the arithmetic here is done in a decimal type and the result is rendered at a
 * precision the database re-checks on insert.
 */

export class FxContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FxContractError";
  }
}

/** A rate as some source published it: `rate` units of base per one unit of quote. */
export type SourceRate = {
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  fixingDate: string;
};

export type DerivedRate = {
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  fixingDate: string;
  derivation: "identity" | "direct" | "inverted" | "cross";
  crossViaCurrency: string | null;
  /** The legs this was computed from, in the order the arithmetic used them. */
  components: SourceRate[];
};

const SCALE = 28n;
const SCALE_FACTOR = 10n ** SCALE;

/** Parse a decimal literal into a scaled integer. Rejects anything that is not a positive decimal. */
function toScaled(literal: string, context: string): bigint {
  const value = literal.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new FxContractError(`${context}: '${literal}' is not a decimal rate literal`);
  }
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > Number(SCALE)) {
    throw new FxContractError(`${context}: '${literal}' has more precision than the rate scale`);
  }
  const scaled = BigInt(whole + fraction.padEnd(Number(SCALE), "0"));
  if (scaled === 0n) throw new FxContractError(`${context}: a rate of zero is not an exchange rate`);
  return scaled;
}

function fromScaled(scaled: bigint): string {
  const whole = scaled / SCALE_FACTOR;
  const fraction = (scaled % SCALE_FACTOR).toString().padStart(Number(SCALE), "0").replace(/0+$/, "");
  return fraction === "" ? whole.toString() : `${whole}.${fraction}`;
}

/** USD per USD is one. Arithmetic, not an observation, so it carries no source. */
export function identityRate(currency: string, fixingDate: string): DerivedRate {
  return {
    baseCurrency: currency,
    quoteCurrency: currency,
    rate: "1",
    fixingDate,
    derivation: "identity",
    crossViaCurrency: null,
    components: [],
  };
}

/**
 * Invert a published rate.
 *
 * Used where a source publishes the pair the wrong way round for UGAI — TWD per USD, when what is
 * needed is USD per TWD. The component is returned so a reader can see that exactly one inversion
 * was applied; applying two would restore the original number and lose nothing visible.
 */
export function invertRate(leg: SourceRate): DerivedRate {
  const scaled = toScaled(leg.rate, `${leg.baseCurrency}/${leg.quoteCurrency}`);
  return {
    baseCurrency: leg.quoteCurrency,
    quoteCurrency: leg.baseCurrency,
    rate: fromScaled((SCALE_FACTOR * SCALE_FACTOR) / scaled),
    fixingDate: leg.fixingDate,
    derivation: "inverted",
    crossViaCurrency: null,
    components: [leg],
  };
}

/**
 * Cross two legs quoted against a common bridge currency.
 *
 * `USD per JPY = (USD per EUR) / (JPY per EUR)`. Both legs must be quoted against the same bridge
 * and dated to the same fixing, and both conditions are checked rather than assumed: a cross
 * assembled from yesterday's leg is a plausible rate for the wrong day, and a cross assembled
 * against the wrong bridge is a plausible rate for nothing at all.
 */
export function crossRate(baseLeg: SourceRate, quoteLeg: SourceRate): DerivedRate {
  if (baseLeg.quoteCurrency !== quoteLeg.quoteCurrency) {
    throw new FxContractError(
      `cannot cross ${baseLeg.baseCurrency}/${baseLeg.quoteCurrency} with ${quoteLeg.baseCurrency}/${quoteLeg.quoteCurrency}: the legs share no bridge currency`,
    );
  }
  if (baseLeg.fixingDate !== quoteLeg.fixingDate) {
    throw new FxContractError(
      `cannot cross legs dated ${baseLeg.fixingDate} and ${quoteLeg.fixingDate}`,
    );
  }
  if (baseLeg.baseCurrency === quoteLeg.baseCurrency) {
    throw new FxContractError(`crossing ${baseLeg.baseCurrency} with itself yields nothing`);
  }
  const base = toScaled(baseLeg.rate, `${baseLeg.baseCurrency}/${baseLeg.quoteCurrency}`);
  const quote = toScaled(quoteLeg.rate, `${quoteLeg.baseCurrency}/${quoteLeg.quoteCurrency}`);
  return {
    baseCurrency: baseLeg.baseCurrency,
    quoteCurrency: quoteLeg.baseCurrency,
    rate: fromScaled((base * SCALE_FACTOR) / quote),
    fixingDate: baseLeg.fixingDate,
    derivation: "cross",
    crossViaCurrency: baseLeg.quoteCurrency,
    components: [baseLeg, quoteLeg],
  };
}

/**
 * Resolve USD per one unit of `currency` from a set of published legs.
 *
 * Returns null rather than guessing when no route exists. That is the TWD case today: the ECB
 * publishes no New Taiwan dollar reference rate, so there is no leg to cross and no rate to
 * return, and a calculation that needs one must stop rather than substitute a neighbour.
 */
export function resolveUsdPerUnit(
  currency: string,
  legs: readonly SourceRate[],
  fixingDate: string,
  bridge = "EUR",
): DerivedRate | null {
  if (currency === "USD") return identityRate("USD", fixingDate);

  const dated = legs.filter((l) => l.fixingDate === fixingDate);

  // A source that already publishes USD per this currency needs nothing done to it.
  const direct = dated.find((l) => l.baseCurrency === "USD" && l.quoteCurrency === currency);
  if (direct) return { ...direct, derivation: "direct", crossViaCurrency: null, components: [direct] };

  // A source publishing this currency per USD is inverted.
  const reversed = dated.find((l) => l.baseCurrency === currency && l.quoteCurrency === "USD");
  if (reversed) return invertRate(reversed);

  // Otherwise cross through the bridge, if both legs exist.
  const baseLeg = dated.find((l) => l.baseCurrency === "USD" && l.quoteCurrency === bridge);
  const quoteLeg = dated.find((l) => l.baseCurrency === currency && l.quoteCurrency === bridge);
  if (currency === bridge && baseLeg) {
    return { ...baseLeg, derivation: "direct", crossViaCurrency: null, components: [baseLeg] };
  }
  if (baseLeg && quoteLeg) return crossRate(baseLeg, quoteLeg);
  return null;
}
