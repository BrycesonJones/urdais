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

  it("counts commercially usable downloadable weights as open-weight", () => {
    // A revenue threshold or an attribution obligation still leaves a model that can be
    // self-hosted and sold from, which is the thing the section measures.
    expect(publicClassOf("open_weights_unrestricted")).toBe("open_weight");
    expect(publicClassOf("open_weights_restricted")).toBe("open_weight");
  });

  it("does not count non-commercial weights as open-weight", () => {
    // Downloadable, and barred from the paid inference whose volume and price are compared.
    // Counting it here would place it inside a commercial comparison it is excluded from.
    expect(publicClassOf("open_weights_noncommercial")).toBe("unclassified");
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
