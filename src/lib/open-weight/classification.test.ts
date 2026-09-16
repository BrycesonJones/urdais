import { describe, expect, it } from "vitest";

import {
  MODEL_ACCESS_CLASSES,
  PUBLIC_ACCESS_CLASSES,
  publicClassOf,
} from "@/lib/open-weight/classification";

describe("the public fold", () => {
  it("is total over the internal taxonomy", () => {
    // Every class the database may hold has an answer. A class added to the check constraint
    // without a fold would otherwise throw at read time, in production, on a real request.
    for (const accessClass of MODEL_ACCESS_CLASSES) {
      expect(PUBLIC_ACCESS_CLASSES).toContain(publicClassOf(accessClass));
    }
  });

  it("counts restricted and non-commercial weights as open-weight", () => {
    // The question is whether the publisher released the weights. Both of these did.
    expect(publicClassOf("open_weights_restricted")).toBe("open_weight");
    expect(publicClassOf("open_weights_noncommercial")).toBe("open_weight");
    expect(publicClassOf("open_weights_unrestricted")).toBe("open_weight");
  });

  it("counts only hosted-access models as proprietary", () => {
    expect(publicClassOf("api_only_closed_weights")).toBe("proprietary");
  });

  it("never lets an unestablished answer become a claim", () => {
    // The failure this prevents: an unresearched model quietly counted as proprietary, which
    // would make the open-weight share look smaller the less work Urdais had done.
    expect(publicClassOf("unknown")).toBe("unclassified");
    expect(publicClassOf("not_applicable")).toBe("unclassified");
  });

  it("throws on a class it does not recognise rather than defaulting", () => {
    // A silent default would route a class nobody has thought about into a published number.
    expect(() => publicClassOf("open_weights_probably")).toThrow(/unrecognised access class/);
    expect(() => publicClassOf("")).toThrow();
  });
});
