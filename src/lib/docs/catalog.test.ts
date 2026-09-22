import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { docHref, docPages, findDoc } from "@/lib/docs/catalog";

describe("shared methodology pages", () => {
  const universe = findDoc("methodology/ai-equity-universe");

  it("registers the AI Equity Universe under Methodology, directly after the overview", () => {
    expect(universe).toMatchObject({ section: "Methodology", file: "methodology/ai-equity-universe.md" });
    const overview = docPages.findIndex((page) => page.slug === "methodology");
    expect(docPages[overview + 1]).toBe(universe);
    expect(docHref(universe!.slug)).toBe("/docs/methodology/ai-equity-universe");
  });

  it("is linked from the methodology overview, which stays the canonical framework page", () => {
    const overview = readFileSync(path.join(process.cwd(), "docs", "methodology.md"), "utf8");
    expect(overview).toContain(`](${docHref(universe!.slug)})`);
    const draft = readFileSync(path.join(process.cwd(), "docs", universe!.file), "utf8");
    expect(draft).toContain("](/docs/methodology)");
    expect(draft.match(/^# /gm)).toHaveLength(1);
  });
});

describe("compute price methodology", () => {
  const ucpi = findDoc("methodology/ucpi");
  const uavi = findDoc("methodology/uavi");

  it("registers UCPI under Methodology, after the equity outputs", () => {
    expect(ucpi).toMatchObject({ section: "Methodology", file: "methodology/ucpi.md" });
    expect(docPages[docPages.indexOf(uavi!) + 1]).toBe(ucpi);
    expect(docHref(ucpi!.slug)).toBe("/docs/methodology/ucpi");
  });

  it("links UCPI to the framework and is linked from the overview", () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), "docs", file), "utf8");
    const ucpiDoc = read(ucpi!.file);
    expect(ucpiDoc).toContain("](/docs/methodology)");
    expect(ucpiDoc.match(/^# /gm)).toHaveLength(1);
    expect(read("methodology.md")).toContain(`](${docHref(ucpi!.slug)})`);
  });

  it("is a family parent, not a child instrument specification", () => {
    const ucpiDoc = readFileSync(path.join(process.cwd(), "docs", ucpi!.file), "utf8");
    expect(ucpiDoc).toContain("version 0.1.2-draft");
    expect(ucpiDoc).toContain("0.1.1-draft, 13 September 2026");
    expect(ucpiDoc).toContain("0.1.0-draft, 12 September 2026");
    expect(ucpiDoc).not.toMatch(/^#+ .*UCPI-H100/m);
  });

  it("owns the calculation calendar with an exact half-open UTC window", () => {
    const ucpiDoc = readFileSync(path.join(process.cwd(), "docs", ucpi!.file), "utf8");
    expect(ucpiDoc).toContain("### The calculation calendar and cutoff");
    expect(ucpiDoc).toContain("`[D 00:00:00 UTC, D+1 00:00:00 UTC)`");
    expect(ucpiDoc).toContain("last complete reconfirmation before the cutoff");
    expect(ucpiDoc).toContain("The publication deadline for `D` is `D+2 00:00:00 UTC`");
    expect(ucpiDoc).not.toContain("The calculation cutoff, the publication target, and the publication deadline are **unresolved**");
  });

  it("owns the participant-count rule and reserves Limited for availability", () => {
    const ucpiDoc = readFileSync(path.join(process.cwd(), "docs", ucpi!.file), "utf8");
    expect(ucpiDoc).toContain("### Participant count and market breadth");
    expect(ucpiDoc).toContain("**Minimum** means the value rests on exactly two independent capacity sources");
    expect(ucpiDoc).toContain("A single participant's price is not a market price");
    expect(ucpiDoc).toContain("reserved for the availability state of an input");
    expect(ucpiDoc).toContain("The participant count is not a numerical gate above the structural floor");
  });
});

describe("compute price child specifications", () => {
  const child = findDoc("methodology/ucpi-h100-sxm");
  const ucpi = findDoc("methodology/ucpi");

  it("registers UCPI-H100-SXM under Methodology, directly after its parent family", () => {
    expect(child).toMatchObject({ section: "Methodology", file: "methodology/ucpi-h100-sxm.md" });
    expect(docPages[docPages.indexOf(ucpi!) + 1]).toBe(child);
    expect(docHref(child!.slug)).toBe("/docs/methodology/ucpi-h100-sxm");
  });

  it("links the child to its parent family and the parent back to the child", () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), "docs", file), "utf8");
    const childDoc = read(child!.file);
    expect(childDoc).toContain(`](${docHref(ucpi!.slug)})`);
    expect(childDoc.match(/^# /gm)).toHaveLength(1);
    expect(read(ucpi!.file)).toContain(`](${docHref(child!.slug)})`);
  });

  it("is a draft that states its launch is blocked and labels research prices", () => {
    const childDoc = readFileSync(path.join(process.cwd(), "docs", child!.file), "utf8");
    expect(childDoc).toContain("version 0.1.4-draft");
    expect(childDoc).toContain("Launch blocked");
    expect(childDoc).toContain("Research snapshot only");
    expect(childDoc).toContain("0.1.3-draft, 13 September 2026");
    expect(childDoc).toContain("0.1.2-draft, 13 September 2026");
    expect(childDoc).toContain("0.1.1-draft, 13 September 2026");
    expect(childDoc).toContain("0.1.0-draft, 12 September 2026");
  });

  it("keeps parameter decisions in the child and adopts the parent's market-breadth rule without restating thresholds", () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), "docs", file), "utf8");
    const childDoc = read(child!.file);
    expect(childDoc).toContain("Stage Criteria: P0, P1, and P2");
    expect(childDoc).toContain("Ingestion Field Contract");
    expect(childDoc).toContain("MARKET_BREADTH_MINIMUM");
    expect(childDoc).toContain("No numerical publication gate remains open for launch");
    expect(childDoc).toContain("host-memory floor of 80 GB per accelerator");
    expect(childDoc).toContain("canonical-quantity selection");
    expect(childDoc).toContain("no price or availability evidence is carried across calculation dates at launch");
    expect(childDoc).not.toContain("Four numerical publication gates");
    expect(childDoc).toContain("**Requires a parent decision**: none.");
    expect(read(ucpi!.file)).toContain("version 0.1.2-draft");
  });

  it("routed pages may use markdown tables, and every one of them is well formed", () => {
    // The renderer supports pipe tables, so the constraint is no longer "none" but "parseable":
    // a header row, a separator row directly beneath it, and a consistent column count.
    let tables = 0;
    for (const page of docPages) {
      const lines = readFileSync(path.join(process.cwd(), "docs", page.file), "utf8").split("\n");
      const columns = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").length;

      for (const [i, line] of lines.entries()) {
        if (!line.trimStart().startsWith("|")) continue;
        const previous = lines[i - 1] ?? "";
        if (previous.trimStart().startsWith("|")) continue; // a body row; its header was checked

        const separator = lines[i + 1] ?? "";
        expect(separator.trim(), `${page.file}:${i + 2} separator`).toMatch(/^\|(\s*:?-{3,}:?\s*\|)+$/);
        expect(columns(separator), `${page.file}:${i + 1} column count`).toBe(columns(line));
        tables += 1;
      }
    }
    // The assertion only means something if documents actually exercise it.
    expect(tables).toBeGreaterThan(0);
  });
});

describe("compute price sibling specifications", () => {
  const listed = findDoc("methodology/ucpi-h100-sxm-listed");
  const child = findDoc("methodology/ucpi-h100-sxm");
  const ucpi = findDoc("methodology/ucpi");

  it("registers UCPI-H100-SXM-LISTED under Methodology, directly after the child it is a sibling of", () => {
    expect(listed).toMatchObject({ section: "Methodology", file: "methodology/ucpi-h100-sxm-listed.md" });
    expect(docPages[docPages.indexOf(child!) + 1]).toBe(listed);
  });

  it("links to the parent and the child, states it is a different economic object, and is approved at 1.0.0", () => {
    const doc = readFileSync(path.join(process.cwd(), "docs", listed!.file), "utf8");
    expect(doc).toContain(`](${docHref(ucpi!.slug)})`);
    expect(doc).toContain(`](${docHref(child!.slug)})`);
    expect(doc.match(/^# /gm)).toHaveLength(1);
    expect(doc).toContain("version 1.0.0, effective 15 September 2026");
    // The drafts stay in the version history as lineage.
    expect(doc).toContain("0.1.2-draft, 14 September 2026");
    expect(doc).toContain("SELLER_LEGAL_IDENTITY_UNRESOLVED");
    expect(doc).toContain("different economic object");
    expect(doc).toContain("listed prices, not guaranteed availability");
    expect(doc).toContain("never a participant");
    expect(doc).toContain("listed, provider-wide");
  });
});

describe("listed GPU family specifications", () => {
  const family = findDoc("methodology/ucpi-listed-gpu");
  const h100Listed = findDoc("methodology/ucpi-h100-sxm-listed");
  const children = [
    "methodology/ucpi-h200-sxm-listed",
    "methodology/ucpi-b200-listed",
    "methodology/ucpi-a100-sxm4-80gb-listed",
    "methodology/ucpi-rtx-5090-listed",
  ] as const;

  it("registers the reusable listed-GPU specification after the H100 listed sibling, then the four new children", () => {
    expect(family).toMatchObject({ section: "Methodology", file: "methodology/ucpi-listed-gpu.md" });
    expect(docPages[docPages.indexOf(h100Listed!) + 1]).toBe(family);
    for (const [i, slug] of children.entries()) {
      expect(findDoc(slug)).toMatchObject({ section: "Methodology", file: `${slug}.md` });
      expect(docPages[docPages.indexOf(family!) + 1 + i]?.slug).toBe(slug);
    }
  });

  it("each listed GPU child cites the family specification and is approved at 1.0.0, with its draft lineage retained", () => {
    const familyDoc = readFileSync(path.join(process.cwd(), "docs", family!.file), "utf8");
    expect(familyDoc).toContain("version 1.0.0, effective 15 September 2026");
    expect(familyDoc).toContain("0.1.0-draft, 14 September 2026");
    expect(familyDoc).toContain("listed on-demand");
    expect(familyDoc).toContain("never a participant");
    for (const slug of children) {
      const doc = readFileSync(path.join(process.cwd(), "docs", findDoc(slug)!.file), "utf8");
      expect(doc).toContain(`](${docHref(family!.slug)})`);
      expect(doc).toContain("version 1.0.0, effective 15 September 2026");
      expect(doc).toContain("0.1.0-draft, 14 September 2026");
      expect(doc.match(/^# /gm)).toHaveLength(1);
    }
  });

  it("the family specification carries the seller-refusal rule, and the accessible child is untouched by it", () => {
    const familyDoc = readFileSync(path.join(process.cwd(), "docs", family!.file), "utf8");
    expect(familyDoc).toContain("SELLER_USE_REFUSED");
    // The point of the rule: an intermediary does not launder a refusal of the use.
    expect(familyDoc).toContain("does not cure such a refusal");
    // The accessible-price child is a different track and stays blocked.
    const accessible = readFileSync(path.join(process.cwd(), "docs", findDoc("methodology/ucpi-h100-sxm")!.file), "utf8");
    expect(accessible).toContain("Launch blocked");
    expect(accessible).not.toContain("version 1.0.0");
  });
});

describe("Bitcoin wealth index methodology", () => {
  const ubwi = findDoc("methodology/ubwi");
  const tokenPrice = findDoc("methodology/token-price");

  it("registers UBWI under Methodology, after the token price benchmark", () => {
    expect(ubwi).toMatchObject({ section: "Methodology", file: "methodology/ubwi.md" });
    expect(docPages[docPages.indexOf(tokenPrice!) + 1]).toBe(ubwi);
    expect(docHref(ubwi!.slug)).toBe("/docs/methodology/ubwi");
  });

  it("links to the framework and is linked from the methodology overview", () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), "docs", file), "utf8");
    const doc = read(ubwi!.file);
    expect(doc).toContain("](/docs/methodology)");
    expect(doc.match(/^# /gm)).toHaveLength(1);
    expect(read("methodology.md")).toContain(`](${docHref(ubwi!.slug)})`);
  });

  it("states its unit, its exclusions, its modelled share and its publication gate", () => {
    const doc = readFileSync(path.join(process.cwd(), "docs", ubwi!.file), "utf8");
    expect(doc).toContain("Version 1.0.0");
    expect(doc).toContain("Total Global Wealth");
    // The term is named once, only to prohibit it, and never used as a label.
    expect(doc.match(/global wealth supply/gi)).toHaveLength(1);
    expect(doc).toContain('"Global wealth supply" is not used anywhere in Urdais');
    expect(doc).toContain("Human capital is excluded");
    expect(doc).toContain("Asset-class market values are never summed");
    // The modelled share is never hidden, and the document says so in those words.
    expect(doc).toContain("Modelled wealth is never described as observed");
    expect(doc).toContain("estimate calibrated to observed economies, not a census of world wealth");
    expect(doc).toContain("Publication Gates");
    // The gate is stated as a refusal that is not relaxed to produce a number.
    expect(doc).toContain("The gate is never relaxed to make a calculation pass");
  });
});

describe("memory price methodology", () => {
  const umpi = findDoc("methodology/umpi");
  const read = (file: string) => readFileSync(path.join(process.cwd(), "docs", file), "utf8");

  it("registers UMPI-DRAM Spot under Methodology and links it both ways with the framework", () => {
    expect(umpi).toMatchObject({ section: "Methodology", file: "methodology/umpi.md" });
    expect(docHref(umpi!.slug)).toBe("/docs/methodology/umpi");
    const doc = read(umpi!.file);
    expect(doc).toContain("](/docs/methodology)");
    expect(doc.match(/^# /gm)).toHaveLength(1);
    expect(read("methodology.md")).toContain(`](${docHref(umpi!.slug)})`);
  });

  it("is a draft with no effective date, whose publication is blocked on rights rather than on definition", () => {
    const doc = read(umpi!.file);
    expect(doc).toContain("version 0.1.0-draft");
    expect(doc).toContain("Publication blocked pending a licensed source");
    expect(doc).toContain("blocked pending licensed source");
    expect(doc).toContain("0.1.0-draft, 22 September 2026");
    // A draft carries no production effective date; the database constraint says so too.
    expect(doc).toContain("**No effective date**");
    expect(doc).not.toMatch(/Status: approved/);
  });

  it("fixes the priced object as a packaged chip and the unit as USD per chip", () => {
    const doc = read(umpi!.file);
    expect(doc).toContain("A **DRAM chip** is the packaged semiconductor memory device");
    expect(doc).toContain("USD per chip");
    expect(doc).toContain("`USD/chip`");
    expect(doc).toContain(
      "One unit = one DRAM chip matching the instrument's canonical generation, density, organization, speed bin and grade",
    );
    // The generic demo unit is named once, to supersede it.
    expect(doc).toContain("`$ / part`");
    expect(doc).toContain("never** converted to USD per gigabyte, USD per gigabit, USD per bit, or USD per module");
    // The priced object is the commercial component, never the silicon or the unit it is sold by.
    expect(doc).not.toContain("USD per die");
    expect(doc).not.toContain("USD / die");
    expect(doc).not.toContain("USD/die");
  });

  it("keeps density a gigabit device concept and separates the chip from the die, the module and the wafer", () => {
    const doc = read(umpi!.file);
    // `die` is still correct terminology for silicon density; the ban is on pricing in it, not on the word.
    expect(doc).toContain("gigabits of device density, never in gigabytes of module capacity");
    expect(doc).toContain("`16Gb` denotes the density of the DRAM device in gigabits, not module capacity in gigabytes");
    expect(doc).toContain("gigabits of die density inside the packaged device");
    expect(doc).toContain("| **DRAM chip / packaged IC** |");
    expect(doc).toContain("| **Semiconductor die** |");
    expect(doc).toContain("| **DIMM / module** |");
    expect(doc).toContain("| **Wafer** |");
    // The conflation the correction removed: a die is not "one packaged memory component".
    expect(doc).not.toMatch(/\*\*Die \/ chip\*\*/);
  });

  it("carries the six canonical DRAM instruments with their qualifiers, and keeps branded and eTT apart", () => {
    const doc = read(umpi!.file);
    for (const instrument of ["DDR5 16Gb", "DDR4 16Gb", "DDR4 8Gb", "DDR4 16Gb eTT", "DDR4 8Gb eTT", "DDR3 4Gb"]) {
      expect(doc, instrument).toContain(`| ${instrument} |`);
    }
    for (const organization of ["2Gx8", "1Gx8", "512Mx8"]) {
      expect(doc, organization).toContain(organization);
    }
    expect(doc).toContain("| Spot | USD / chip |");
    expect(doc).toContain("effectively tested");
    expect(doc).toContain("Branded and eTT observations are never combined");
    expect(doc).toContain("Not separately established");
  });

  it("separates spot from contract, withholds HBM, and refuses proxies and reproductions as instrument sources", () => {
    const doc = read(umpi!.file);
    expect(doc).toContain("UMPI V1 is DRAM Spot");
    expect(doc).toContain("`UMPI-DRAM Contract`");
    expect(doc).toContain("are not production UMPI V1 price instruments");
    expect(doc).toContain("HBM4 commercial availability does not establish a production price");
    expect(doc).toContain("never mapped onto a UMPI instrument identity");
    expect(doc).toContain("do-not-ingest-for-production-price");
    expect(doc).toContain("does not cure the upstream restriction");
  });

  it("states the rights gates, including the two a price product is most often launched without", () => {
    const doc = read(umpi!.file);
    expect(doc).toContain("No gate is satisfied by silence");
    for (const gate of ["G1 Access / retrieval", "G2 Storage", "G3 Calculation", "G4 Derived publication", "G5 Historical retention"]) {
      expect(doc, gate).toContain(gate);
    }
    // Raw republication is a separate right, required here because V1 publishes a source's own figure.
    expect(doc).toContain("the raw-republication right is required in addition to G4");
    expect(doc).toContain("A contractual restriction is never broadened beyond its text");
    // Calculating a percentage over two licensed closes does not launder the price underneath it.
    expect(doc).toContain("Calculating the 1D close-to-close change does not change this");
    expect(doc).toContain("remains subject to the raw-republication right");
    expect(doc).toContain("G5 Historical retention");
  });

  it("names the Urdais calculation the 1D close-to-close change, distinctly from any source field", () => {
    const doc = read(umpi!.file);
    expect(doc).toContain("business-day session cadence");
    expect(doc).toContain("The V1 canonical change is the 1D close-to-close change");
    expect(doc).toContain("1D_change = (close_t \u2212 close_{t\u22121}) / close_{t\u22121}");
    expect(doc).toContain("The product label for this quantity is `1D`");
    expect(doc).toContain("It is never `today`");
    // The rename exists so a vendor's own "session change" field cannot be mistaken for this one.
    expect(doc).toContain("A price desk may publish its own field called a session change");
    expect(doc).not.toContain("canonical change is the session change");
    expect(doc).not.toContain("session_change");
  });

  it("keeps the gap rules that stop a missing session from becoming a flat print", () => {
    const doc = read(umpi!.file);
    expect(doc).toContain("The change is **withheld**, never displayed as zero");
    expect(doc).toContain("no zero-change point is created");
    expect(doc).toContain("Nothing is interpolated across it");
    expect(doc).toContain("The last eligible session of the source business day");
    expect(doc).toContain("No history is generated from demo or deterministic series");
  });
});

describe("open-data memory price methodology", () => {
  const kr = findDoc("methodology/umpi-kr-dram");
  const spot = findDoc("methodology/umpi");
  const read = (file: string) => readFileSync(path.join(process.cwd(), "docs", file), "utf8");

  it("registers UMPI-KR DRAM under Methodology, directly after the spot document it replaces as V1", () => {
    expect(kr).toMatchObject({ section: "Methodology", file: "methodology/umpi-kr-dram.md" });
    expect(docPages[docPages.indexOf(spot!) + 1]).toBe(kr);
    expect(docHref(kr!.slug)).toBe("/docs/methodology/umpi-kr-dram");
    const doc = read(kr!.file);
    expect(doc).toContain("](/docs/methodology)");
    expect(doc.match(/^# /gm)).toHaveLength(1);
    expect(read("methodology.md")).toContain(`](${docHref(kr!.slug)})`);
  });

  it("is a new draft lineage with no effective date, and says why it is not a version bump", () => {
    const doc = read(kr!.file);
    expect(doc).toContain("version 0.1.0-draft");
    expect(doc).toContain("**No effective date**");
    expect(doc).toContain("Why a new lineage rather than a version bump");
    expect(doc).toContain("0.1.0-draft, 22 September 2026");
    expect(doc).not.toMatch(/Status: approved/);
  });

  it("publishes two monthly index-point series with a MoM change, and no daily semantics anywhere", () => {
    const doc = read(kr!.file);
    expect(doc).toContain("`UMPI-KR-DRAM-PPI`");
    expect(doc).toContain("`UMPI-KR-DRAM-EXPORT-UV`");
    expect(doc).toContain("| Unit, both | Index points |");
    expect(doc).toContain("| Cadence, both | Monthly |");
    expect(doc).toContain("The canonical change is MoM");
    expect(doc).toContain("MoM_t = (value_t \u2212 value_{t\u22121}) / value_{t\u22121}");
    expect(doc).toContain("Never `1D`, never `session`, never `today`");
    expect(doc).toContain("no interpolation of any kind");
    // The new V1 prices no chips. The test targets what the document *declares* as its own
    // unit and universe, not any mention of the old ones: the surface requirements have to be
    // able to say "remove USD/chip", and the deferred spot product has to remain nameable.
    expect(doc).not.toMatch(/Published unit \| USD/);
    expect(doc).not.toMatch(/Native unit \| USD ?\/ ?chip/);
    expect(doc).toContain("Remove `USD/chip`, `1D`, `today` and the branded/eTT family selector");
    expect(doc).toContain("the six Phase 2A chip instruments under new names");
    expect(doc).toContain("do not inherit those identifiers");
    // No generation, density or grade universe is claimed by the new series.
    expect(doc).toContain("Not branded versus eTT");
    expect(doc).toContain("BOK surveys **one DRAM commodity**");
  });

  it("keeps the price index and the unit-value index separate, and never blends them", () => {
    const doc = read(kr!.file);
    expect(doc).toContain("The PPI / UV distinction, frozen");
    expect(doc).toContain("| Kind | **Price index** | **Unit-value index** |");
    expect(doc).toContain("never averaged, blended, chained, spliced, or used to impute one another");
    // The mix warning is a property of the series, not optional presentation.
    expect(doc).toContain("A unit value is not a price");
    expect(doc).toContain("trade unit-value index");
    expect(doc).toContain("mix warning");
  });

  it("records the verified source identifiers and the rebasing rule", () => {
    const doc = read(kr!.file);
    expect(doc).toContain("404Y016");
    expect(doc).toContain("30911201AA");
    expect(doc).toContain("2020=100");
    expect(doc).toContain("8542321010");
    expect(doc).toContain("expDlr");
    expect(doc).toContain("expWgt");
    expect(doc).toContain("uv_usd_per_kg_t = expDlr_t / expWgt_t");
    expect(doc).toContain("The base is the calendar-year 2020 aggregate unit value");
    // An item code alone is ambiguous across BOK tables; the methodology must say so.
    expect(doc).toContain("(stat_code, item_code, cycle)");
  });

  it("requires attribution for both agencies and bans every proprietary source from V1", () => {
    const doc = read(kr!.file);
    expect(doc).toContain("Bank of Korea");
    expect(doc).toContain("Korea Customs Service");
    expect(doc).toContain("출처가 한국은행임을 반드시 밝혀야 하며");
    expect(doc).toContain("이용허락범위 제한 없음");
    expect(doc).toContain("## Prohibited sources");
    for (const banned of ["TrendForce", "MOTIE", "CFM", "KITA", "Digi-Key", "UN Comtrade", "Aggregators"]) {
      expect(doc, banned).toContain(banned);
    }
    expect(doc).toContain("A restriction on a figure attaches to the figure, not to the page it is read from");
  });

  it("preserves the spot architecture as deferred rather than deleting or rewriting it", () => {
    // The deferred document still exists, still carries its own version, and is still readable.
    const doc = read(spot!.file);
    expect(doc).toContain("Status: deferred");
    expect(doc).toContain("Not the UMPI V1 launch methodology");
    expect(doc).toContain(`](${docHref(kr!.slug)})`);
    expect(doc).toContain("version 0.1.0-draft");
    // Its substance survives: the six instruments and their unit are still specified there.
    expect(doc).toContain("DDR4 16Gb eTT");
    expect(doc).toContain("USD per chip");
    // And the new methodology points back at it without reviving it.
    expect(read(kr!.file)).toContain(`](${docHref(spot!.slug)})`);
    expect(read(kr!.file)).toContain("deferred, not deleted");
  });
});

describe("internal research and architecture artifacts", () => {
  const internalDirs = ["research", "architecture"] as const;

  /** Every markdown file under `dir`, recursively, as a docs-relative path. */
  const markdownUnder = (dir: string): string[] => {
    const walk = (relative: string): string[] =>
      readdirSync(path.join(process.cwd(), "docs", relative), { withFileTypes: true }).flatMap((entry) => {
        const child = `${relative}/${entry.name}`;
        if (entry.isDirectory()) return walk(child);
        return entry.name.endsWith(".md") ? [child] : [];
      });
    return walk(dir);
  };

  it("are never registered in the public docs catalog, at any depth", () => {
    const routed = docPages.map((page) => page.file);
    for (const dir of internalDirs) {
      expect(routed.some((file) => file.startsWith(`${dir}/`))).toBe(false);
      for (const file of markdownUnder(dir)) {
        expect(routed).not.toContain(file);
      }
    }
  });

  it("exist, are markdown, and each carries a single title marking it unrouted", () => {
    for (const dir of internalDirs) {
      const files = markdownUnder(dir);
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const doc = readFileSync(path.join(process.cwd(), "docs", file), "utf8");
        expect(doc.match(/^# /gm)).toHaveLength(1);
        expect(doc).toContain("not registered in the docs catalog");
      }
    }
  });

  it("covers nested internal documents, not only top-level files", () => {
    const all = internalDirs.flatMap((dir) => markdownUnder(dir));
    expect(all).toContain("architecture/sources/terms-review.md");
    expect(all.some((file) => file.split("/").length > 2)).toBe(true);
  });
});

describe("supabase configuration", () => {
  const config = readFileSync(path.join(process.cwd(), "supabase", "config.toml"), "utf8");

  it("keeps the internal reference and pipeline schemas out of the exposed API schemas", () => {
    const match = config.match(/^schemas = \[(.*)\]$/m);
    expect(match).not.toBeNull();
    const exposed = (match?.[1] ?? "").split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean);
    expect(exposed).toEqual(["public", "graphql_public"]);
    expect(exposed).not.toContain("reference");
    expect(exposed).not.toContain("pipeline");
  });

  it("targets the same PostgreSQL major version as the hosted development project", () => {
    expect(config).toMatch(/^major_version = 17$/m);
  });

  it("commits no credential", () => {
    expect(config).not.toMatch(/service_role|password\s*=\s*"[^"]+"|eyJ[A-Za-z0-9_-]{20,}/);
  });
});

describe("output methodology pages", () => {
  const ugai = findDoc("methodology/ugai");
  const uavi = findDoc("methodology/uavi");
  const universe = findDoc("methodology/ai-equity-universe");

  it("registers UGAI under Methodology, directly after its parent universe", () => {
    expect(ugai).toMatchObject({ section: "Methodology", file: "methodology/ugai.md" });
    expect(docPages[docPages.indexOf(universe!) + 1]).toBe(ugai);
    expect(docHref(ugai!.slug)).toBe("/docs/methodology/ugai");
  });

  it("links UGAI to and from the parent universe and the framework", () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), "docs", file), "utf8");
    const ugaiDoc = read(ugai!.file);
    expect(ugaiDoc).toContain(`](${docHref(universe!.slug)})`);
    expect(ugaiDoc).toContain("](/docs/methodology)");
    expect(ugaiDoc.match(/^# /gm)).toHaveLength(1);
    expect(read(universe!.file)).toContain(`](${docHref(ugai!.slug)})`);
    expect(read("methodology.md")).toContain(`](${docHref(ugai!.slug)})`);
  });

  it("registers UAVI under Methodology, directly after its sibling UGAI", () => {
    expect(uavi).toMatchObject({ section: "Methodology", file: "methodology/uavi.md" });
    expect(docPages[docPages.indexOf(ugai!) + 1]).toBe(uavi);
    expect(docHref(uavi!.slug)).toBe("/docs/methodology/uavi");
  });

  it("links UAVI to its parent universe, its sibling, and the framework", () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), "docs", file), "utf8");
    const uaviDoc = read(uavi!.file);
    expect(uaviDoc).toContain(`](${docHref(universe!.slug)})`);
    expect(uaviDoc).toContain(`](${docHref(ugai!.slug)})`);
    expect(uaviDoc).toContain("](/docs/methodology)");
    expect(uaviDoc.match(/^# /gm)).toHaveLength(1);
    expect(read(universe!.file)).toContain(`](${docHref(uavi!.slug)})`);
    expect(read(ugai!.file)).toContain(`](${docHref(uavi!.slug)})`);
    expect(read("methodology.md")).toContain(`](${docHref(uavi!.slug)})`);
  });
});

describe("power delivery methodology pages", () => {
  const capacity = findDoc("methodology/deliverable-capacity");
  const gap = findDoc("methodology/power-delivery-gap");
  const read = (file: string) => readFileSync(path.join(process.cwd(), "docs", file), "utf8");
  const digest = (file: string) =>
    createHash("sha256").update(readFileSync(path.join(process.cwd(), "docs", file))).digest("hex");

  it("registers both approved documents, so their production routes exist", () => {
    // The route sets dynamicParams = false: an unregistered slug is a hard 404, and the live
    // delivery-gap chart links to one of these.
    expect(capacity).toMatchObject({ section: "Methodology", file: "methodology/deliverable-capacity.md" });
    expect(gap).toMatchObject({ section: "Methodology", file: "methodology/power-delivery-gap.md" });
    expect(docHref(capacity!.slug)).toBe("/docs/methodology/deliverable-capacity");
    expect(docHref(gap!.slug)).toBe("/docs/methodology/power-delivery-gap");
  });

  it("resolves both source files, each approved at 1.0.0 with a single title", () => {
    for (const page of [capacity!, gap!]) {
      const doc = read(page.file);
      expect(doc.match(/^# /gm)).toHaveLength(1);
      expect(doc).toContain("version 1.0.0");
    }
  });

  /**
   * The bytes of these two documents are the `content_hash` of approved methodology versions
   * already applied to production. Registering a document for routing must not change it, so the
   * digests are asserted against the migrations that bound them rather than against constants.
   */
  it("leaves both documents byte-identical to what production approved", () => {
    const bound = [
      { page: capacity!, migration: "20260927100000_deliverable_capacity_methodology_1_0_0.sql" },
      { page: gap!, migration: "20260928100000_delivery_gap.sql" },
    ];
    for (const { page, migration } of bound) {
      const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", migration), "utf8");
      expect(sql, `${page.file} digest is not the one ${migration} approved`).toContain(digest(page.file));
    }
  });

  it("states the coverage that makes these documents worth routing", () => {
    expect(read(gap!.file)).toMatch(/Positive means forecast demand exceeds approved planning capacity/);
    expect(read(gap!.file)).toContain("`public_gap_eligible`");
    expect(read(capacity!.file)).toContain("`approved_result`");
  });
});
