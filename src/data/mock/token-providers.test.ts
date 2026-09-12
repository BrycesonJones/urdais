import { describe, expect, it } from "vitest";

import { TOKEN_INSTRUMENTS } from "@/data/mock/market-detail";
import { MODEL_ROSTER } from "@/data/mock/model-economics";
import {
  findTokenLab,
  TOKEN_LABS,
  TOKEN_LABS_SORTED,
  tokenInstrumentId,
} from "@/data/mock/token-providers";

describe("token provider catalog", () => {
  it("lists each lab once and sorts selectors by display name", () => {
    const ids = TOKEN_LABS.map((lab) => lab.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TOKEN_LABS_SORTED.map((lab) => lab.name)).toEqual(
      [...TOKEN_LABS].map((lab) => lab.name).sort((a, b) => a.localeCompare(b, "en")),
    );
  });

  it("treats xAI as the provider and Grok as the model family", () => {
    const xai = findTokenLab("xai");
    expect(xai).toMatchObject({ id: "xai", name: "xAI", modelFamily: "Grok" });
    expect(TOKEN_LABS.some((lab) => lab.name === "Grok")).toBe(false);
    expect(tokenInstrumentId("xai")).toBe("tokens-xai");
  });

  it("exposes an xAI token-price instrument on the shared Tokens family", () => {
    const instrument = TOKEN_INSTRUMENTS.find((entry) => entry.id === "tokens-xai");
    expect(instrument).toMatchObject({
      id: "tokens-xai",
      shortLabel: "xAI",
      symbol: "xAI",
      unit: "$/1M tokens",
    });
  });
});

describe("model roster", () => {
  it("resolves every model to a catalog lab, including the Grok family", () => {
    for (const model of MODEL_ROSTER) {
      const lab = findTokenLab(model.labId);
      expect(lab, `unknown lab for ${model.id}`).toBeDefined();
      expect(model.labName).toBe(lab?.name);
      expect(model.modelFamily).toBe(lab?.modelFamily);
    }

    const grok = MODEL_ROSTER.filter((model) => model.labId === "xai");
    expect(grok.map((model) => model.modelName)).toEqual(["Grok 4.6", "Grok 4.3"]);
    expect(grok.every((model) => model.modelFamily === "Grok")).toBe(true);
    expect(grok.every((model) => model.labName === "xAI")).toBe(true);
    expect(grok.every((model) => model.accessClass === "proprietary")).toBe(true);
  });

  it("uses official standard Grok input/output rates for blended prices", () => {
    const grok46 = MODEL_ROSTER.find((model) => model.id === "grok-4-6");
    const grok43 = MODEL_ROSTER.find((model) => model.id === "grok-4-3");
    // Standard (< 200k prompt) rates from https://docs.x.ai/developers/models
    expect(grok46?.blendedPrice).toBe((2.0 + 6.0) / 2);
    expect(grok43?.blendedPrice).toBe((1.25 + 2.5) / 2);
  });
});
