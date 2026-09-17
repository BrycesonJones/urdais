import { describe, expect, it } from "vitest";

import {
  FxContractError,
  crossRate,
  identityRate,
  invertRate,
  resolveUsdPerUnit,
  type SourceRate,
} from "@/lib/ugai/fx/derive";

// The real ECB euro reference rates for 2026-09-17: one euro buys `rate` of the quoted currency.
const ecb: SourceRate[] = [
  { baseCurrency: "USD", quoteCurrency: "EUR", rate: "1.1481", fixingDate: "2026-09-17" },
  { baseCurrency: "JPY", quoteCurrency: "EUR", rate: "178.75", fixingDate: "2026-09-17" },
  { baseCurrency: "HKD", quoteCurrency: "EUR", rate: "9.0071", fixingDate: "2026-09-17" },
];

describe("FX derivation", () => {
  it("treats the base currency as an identity, not an observation", () => {
    const usd = identityRate("USD", "2026-09-17");
    expect(usd.rate).toBe("1");
    expect(usd.derivation).toBe("identity");
    // No source, because 1 USD per USD is arithmetic. Claiming a source would put a fiction in
    // the lineage.
    expect(usd.components).toEqual([]);
  });

  it("crosses through the bridge in the direction the methodology requires", () => {
    const jpy = crossRate(ecb[0]!, ecb[1]!);
    expect(jpy.baseCurrency).toBe("USD");
    expect(jpy.quoteCurrency).toBe("JPY");
    // 1.1481 / 178.75
    expect(jpy.rate.startsWith("0.00642293706293706293")).toBe(true);
    expect(jpy.crossViaCurrency).toBe("EUR");
    expect(jpy.components).toHaveLength(2);
  });

  it("keeps both legs, so a derived rate can be re-checked without the source", () => {
    const hkd = crossRate(ecb[0]!, ecb[2]!);
    expect(hkd.components.map((c) => `${c.baseCurrency}/${c.quoteCurrency}`)).toEqual([
      "USD/EUR",
      "HKD/EUR",
    ]);
  });

  it("refuses legs quoted against different bridges", () => {
    const odd: SourceRate = { baseCurrency: "JPY", quoteCurrency: "GBP", rate: "190", fixingDate: "2026-09-17" };
    expect(() => crossRate(ecb[0]!, odd)).toThrow(/share no bridge currency/);
  });

  it("refuses legs from different fixing dates", () => {
    const stale: SourceRate = { ...ecb[1]!, fixingDate: "2026-09-16" };
    expect(() => crossRate(ecb[0]!, stale)).toThrow(/dated 2026-09-17 and 2026-09-16/);
  });

  it("inverts exactly once, and says so", () => {
    const twdPerUsd: SourceRate = { baseCurrency: "TWD", quoteCurrency: "USD", rate: "30.5", fixingDate: "2026-09-17" };
    const usdPerTwd = invertRate(twdPerUsd);
    expect(usdPerTwd.baseCurrency).toBe("USD");
    expect(usdPerTwd.quoteCurrency).toBe("TWD");
    expect(usdPerTwd.rate.startsWith("0.0327868852459016393")).toBe(true);
    expect(usdPerTwd.derivation).toBe("inverted");
    // Inverting twice restores the original, which is why a single inversion has to be visible
    // in the record rather than inferred from the numbers.
    const back = invertRate({ ...twdPerUsd, baseCurrency: "USD", quoteCurrency: "TWD", rate: usdPerTwd.rate });
    expect(Math.abs(Number(back.rate) - 30.5)).toBeLessThan(1e-20);
    expect(back.baseCurrency).toBe("TWD");
  });

  it("rejects a zero or malformed rate rather than producing an infinity", () => {
    expect(() => invertRate({ baseCurrency: "TWD", quoteCurrency: "USD", rate: "0", fixingDate: "2026-09-17" }))
      .toThrow(FxContractError);
    expect(() => invertRate({ baseCurrency: "TWD", quoteCurrency: "USD", rate: "-1", fixingDate: "2026-09-17" }))
      .toThrow(/not a decimal rate literal/);
    expect(() => invertRate({ baseCurrency: "TWD", quoteCurrency: "USD", rate: "NaN", fixingDate: "2026-09-17" }))
      .toThrow(/not a decimal rate literal/);
  });
});

describe("resolving USD per unit", () => {
  it("returns the euro leg directly, because ECB already publishes USD per EUR", () => {
    const eur = resolveUsdPerUnit("EUR", ecb, "2026-09-17");
    expect(eur?.rate).toBe("1.1481");
    expect(eur?.derivation).toBe("direct");
  });

  it("crosses for a currency ECB quotes against the euro", () => {
    expect(resolveUsdPerUnit("JPY", ecb, "2026-09-17")?.derivation).toBe("cross");
  });

  it("returns null for a currency with no route, instead of substituting a neighbour", () => {
    // This is the live TWD position: the ECB publishes no New Taiwan dollar reference rate, so
    // there is no leg to cross and a calculation that needs one must stop.
    expect(resolveUsdPerUnit("TWD", ecb, "2026-09-17")).toBeNull();
  });

  it("will not reach across fixing dates to find a route", () => {
    expect(resolveUsdPerUnit("JPY", ecb, "2026-09-18")).toBeNull();
  });
});
