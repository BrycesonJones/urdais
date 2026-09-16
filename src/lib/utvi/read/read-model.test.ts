import { describe, expect, it } from "vitest";

import { attributionFor, isRequiredCitation, renderCitation, UTVI_CITATION_TEMPLATE } from "@/lib/utvi/attribution";
import { buildReadModel, validatePublicUtvi, type PublicationRow } from "@/lib/utvi/read/read-model";
import { UtviContractError } from "@/lib/utvi/types";

const AS_OF = "2026-09-16T01:00:33.578Z";
const CITATION = `Source: OpenRouter (openrouter.ai/rankings), as of ${AS_OF}.`;

function publication(date: string, value: string, overrides: Partial<PublicationRow> = {}): PublicationRow {
  return {
    calculationDate: date,
    valueTokensPerDay: value,
    settlementState: "final",
    revisionNumber: 1,
    methodologyVersion: "1.0.0",
    universeDescriptor: "Public model traffic on the OpenRouter marketplace",
    sourceAttribution: CITATION,
    publishedAt: "2026-09-16T02:00:00.000Z",
    sourceAsOf: AS_OF,
    ...overrides,
  };
}

describe("the required citation", () => {
  it("interpolates as_of into the documented template, not a paraphrase of it", () => {
    expect(renderCitation(AS_OF)).toBe(CITATION);
    expect(UTVI_CITATION_TEMPLATE).toBe("Source: OpenRouter (openrouter.ai/rankings), as of {as_of}.");
  });

  it("refuses to render a citation with a hole in it", () => {
    expect(() => renderCitation(null)).toThrow(UtviContractError);
    expect(() => renderCitation("")).toThrow(UtviContractError);
    expect(() => renderCitation("not a timestamp")).toThrow(UtviContractError);
  });

  it("recognises the required form and rejects a helpful rewording of it", () => {
    expect(isRequiredCitation(CITATION)).toBe(true);
    expect(isRequiredCitation("Data from OpenRouter.")).toBe(false);
    expect(isRequiredCitation("Source: OpenRouter (openrouter.ai/rankings).")).toBe(false);
    expect(isRequiredCitation(UTVI_CITATION_TEMPLATE)).toBe(false);
  });

  it("carries the licence name and url, which the grant's one condition depends on", () => {
    const attribution = attributionFor(AS_OF);
    expect(attribution.licenseUrl).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(attribution.licenseName).toContain("CC BY 4.0");
    expect(attribution.sourceUrl).toBe("https://openrouter.ai/rankings");
  });
});

describe("the read model", () => {
  it("says why there is no snapshot rather than serving an empty object", () => {
    const model = buildReadModel([]);
    expect(model.snapshot).toBeNull();
    expect(model.unavailableReason).toBe("no UTVI value has been published");
  });

  it("takes the latest date as the snapshot and keeps the series in date order", () => {
    const model = buildReadModel([
      publication("2026-09-14", "18120484812487"),
      publication("2026-09-13", "16730791173422"),
      publication("2026-09-15", "17750400225262", { settlementState: "provisional" }),
    ]);
    expect(model.series.map((p) => p.date)).toEqual(["2026-09-13", "2026-09-14", "2026-09-15"]);
    expect(model.snapshot).toMatchObject({
      tokensPerDay: "17750400225262",
      asOfDate: "2026-09-15",
      settlementState: "provisional",
      unit: "tokens/day",
      symbol: "UTVI",
    });
  });

  it("carries the frozen universe descriptor, not today's configuration", () => {
    const model = buildReadModel([
      publication("2026-09-15", "100", { universeDescriptor: "the universe as it was then" }),
    ]);
    expect(model.snapshot!.universe).toBe("the universe as it was then");
  });

  it("serves a value as a decimal string, so a token count is not rounded by JSON", () => {
    const model = buildReadModel([publication("2026-09-15", "17750400225262")]);
    expect(model.snapshot!.tokensPerDay).toBe("17750400225262");
    // The same number as a JSON double would be fine today and is not the contract.
    expect(typeof model.snapshot!.tokensPerDay).toBe("string");
  });

  it("computes only the changes its history reaches, and nulls the rest", () => {
    const model = buildReadModel([
      publication("2026-09-14", "16730791173422"),
      publication("2026-09-15", "18120484812487"),
    ]);
    const changes = model.snapshot!.changePercent;
    expect(changes["1D"]).toBeCloseTo(8.3062, 3);
    expect(changes["1W"]).toBeNull();
    expect(changes["1M"]).toBeNull();
    expect(changes["1Y"]).toBeNull();
  });

  it("refuses to serve a value whose citation is not the required one", () => {
    const model = buildReadModel([
      publication("2026-09-15", "100", { sourceAttribution: "Data courtesy of OpenRouter" }),
    ]);
    expect(model.snapshot).toBeNull();
    expect(model.unavailableReason).toContain("required citation");
    // The series is still returned: the history is not wrong, the headline's credit is.
    expect(model.series).toHaveLength(1);
  });

  it("reports a revision number so a superseded point is distinguishable from a first print", () => {
    const model = buildReadModel([publication("2026-09-15", "100", { revisionNumber: 3 })]);
    expect(model.snapshot!.revisionNumber).toBe(3);
  });
});

describe("the public contract", () => {
  const valid = () => JSON.parse(JSON.stringify(buildReadModel([publication("2026-09-15", "17750400225262")])));

  it("passes a well-formed response", () => {
    expect(validatePublicUtvi(valid())).toEqual([]);
  });

  it("passes an absent snapshot that says why", () => {
    expect(validatePublicUtvi(JSON.parse(JSON.stringify(buildReadModel([]))))).toEqual([]);
  });

  it("fails an absent snapshot with no reason", () => {
    expect(validatePublicUtvi({ snapshot: null, series: [], unavailableReason: "" })).toContain(
      "an absent snapshot must say why",
    );
  });

  it("fails a value that is not a decimal integer string", () => {
    const body = valid();
    body.snapshot.tokensPerDay = 17750400225262;
    expect(validatePublicUtvi(body)).toContain("tokensPerDay must be a decimal integer string");
  });

  it("fails a response with no universe descriptor, which must accompany every value", () => {
    const body = valid();
    body.snapshot.universe = "";
    expect(validatePublicUtvi(body)).toContain("the covered universe must be published with the value");
  });

  it("fails a response whose attribution is missing a field or is a paraphrase", () => {
    const missing = valid();
    delete missing.snapshot.attribution.licenseUrl;
    expect(validatePublicUtvi(missing)).toContain("attribution.licenseUrl is required");

    const paraphrased = valid();
    paraphrased.snapshot.attribution.citation = "From OpenRouter";
    expect(validatePublicUtvi(paraphrased)).toContain("attribution.citation is not the source's required citation");
  });

  it("fails a change that arrived as a string or a non-finite number", () => {
    const stringly = valid();
    stringly.snapshot.changePercent["1D"] = "0";
    expect(validatePublicUtvi(stringly)).toContain("changePercent.1D must be a number or null");

    const infinite = valid();
    infinite.snapshot.changePercent["1D"] = Number.POSITIVE_INFINITY;
    // JSON.stringify turns Infinity into null, so this is constructed after serialisation —
    // which is the only way it could reach a validator at all.
    expect(validatePublicUtvi(infinite)).toContain("changePercent.1D is not finite");
  });

  it("accepts a null change, which is how an unavailable comparison must arrive", () => {
    const body = valid();
    body.snapshot.changePercent["1Y"] = null;
    expect(validatePublicUtvi(body)).toEqual([]);
  });
});
