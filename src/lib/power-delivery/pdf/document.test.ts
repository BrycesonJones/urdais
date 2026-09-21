import { describe, expect, it } from "vitest";

import { PdfDocument, squeeze } from "@/lib/power-delivery/pdf/document";
import { buildFixturePdf, showCodes, showText, type FixtureFont } from "@/lib/power-delivery/pdf/fixture-pdf";
import { PdfFormatError } from "@/lib/power-delivery/pdf/objects";

/** A one-byte font that maps the printable ASCII a report uses. */
function asciiFont(resource: string, extra: Partial<FixtureFont> = {}): FixtureFont {
  const toUnicode = new Map<number, string>();
  for (let code = 0x20; code <= 0x7e; code += 1) toUnicode.set(code, String.fromCharCode(code));
  return { resource, toUnicode, ...extra };
}

const textOf = (pdf: Buffer, page = 1): string => squeeze(PdfDocument.open(pdf).pageText(page));

describe("PDF text layer", () => {
  it("reads a string a page draws", () => {
    const pdf = buildFixturePdf([{ content: showText("F1", "ICR 31,059 MW"), fonts: [asciiFont("F1")] }]);
    expect(textOf(pdf)).toBe("ICR31,059MW");
  });

  it("reads Flate-compressed content", () => {
    const pdf = buildFixturePdf(
      [{ content: showText("F1", "IRM 24.5%"), fonts: [asciiFont("F1")] }],
      { compress: true },
    );
    expect(textOf(pdf)).toBe("IRM24.5%");
  });

  it("finds pages stored inside an object stream", () => {
    // PDF 1.5 files put the catalog and page dictionaries in a compressed object stream, where a
    // scan for "N 0 obj" cannot see them.
    const pdf = buildFixturePdf(
      [{ content: showText("F1", "LCR 86.4%"), fonts: [asciiFont("F1")] }],
      { compress: true, useObjectStream: true },
    );
    const document = PdfDocument.open(pdf);
    expect(document.pageCount).toBe(1);
    expect(squeeze(document.pageText(1))).toBe("LCR86.4%");
  });

  it("keeps pages in order", () => {
    const pdf = buildFixturePdf([
      { content: showText("F1", "first"), fonts: [asciiFont("F1")] },
      { content: showText("F1", "second"), fonts: [asciiFont("F1")] },
      { content: showText("F1", "third"), fonts: [asciiFont("F1")] },
    ]);
    const document = PdfDocument.open(pdf);
    expect(document.pageCount).toBe(3);
    expect([1, 2, 3].map((page) => squeeze(document.pageText(page)))).toEqual(["first", "second", "third"]);
  });

  it("follows a form XObject into the table inside it", () => {
    // A table pasted into a report is routinely a form XObject with its own resources. A reader
    // that stops at the page content sees the prose and none of the numbers.
    const pdf = buildFixturePdf([{
      content: `${showText("F1", "Table 2 shows the CETL:")}\n/X1 Do`,
      fonts: [asciiFont("F1")],
      forms: [{ resource: "X1", content: showText("F2", "MAAC 2715"), fonts: [asciiFont("F2")] }],
    }]);
    expect(textOf(pdf)).toBe("Table2showstheCETL:MAAC2715");
  });

  it("reads a two-byte composite font", () => {
    const font: FixtureFont = {
      resource: "C1", composite: true,
      toUnicode: new Map([[1, "8"], [2, "2"], [3, "."], [4, "6"], [5, "%"]]),
    };
    const pdf = buildFixturePdf([{ content: showCodes("C1", [1, 2, 3, 4, 5]), fonts: [font] }]);
    expect(textOf(pdf)).toBe("82.6%");
  });

  it("believes the font, not a codespace range that overstates the code width", () => {
    // The regression this file exists for. Word emits a ToUnicode CMap declaring a <0000> <FFFF>
    // codespace on a plain one-byte TrueType font. Trusting that declaration reads every pair of
    // letters as one unmapped glyph, which turns a whole document into replacement characters.
    const pdf = buildFixturePdf([{
      content: showText("F1", "LCRs are 86.4% for New York City"),
      fonts: [asciiFont("F1", { declaredCodespaceBytes: 2 })],
    }]);
    const text = textOf(pdf);
    expect(text).toBe("LCRsare86.4%forNewYorkCity");
    expect(text).not.toContain("�");
  });

  it("marks a character it cannot map rather than guessing one", () => {
    const font: FixtureFont = { resource: "F1", toUnicode: new Map([[0x41, "A"]]) };
    const pdf = buildFixturePdf([{ content: showText("F1", "AZA"), fonts: [font] }]);
    expect(textOf(pdf)).toBe("A�A");
  });

  it("separates words a TJ array spaces apart", () => {
    const pdf = buildFixturePdf([{
      content: "BT /F1 12 Tf 72 720 Td [(Net) -400 (ICR) -20 (30,050)] TJ ET",
      fonts: [asciiFont("F1")],
    }]);
    // The -400 displacement is a word gap; the -20 is kerning inside one word.
    expect(PdfDocument.open(pdf).pageText(1).replace(/\s+/g, " ").trim()).toBe("Net ICR30,050");
  });

  it("refuses a file that is not a PDF", () => {
    expect(() => PdfDocument.open(Buffer.from("PK this is a zip")))
      .toThrow(PdfFormatError);
  });

  it("refuses an encrypted document rather than returning nothing", () => {
    const pdf = buildFixturePdf([{ content: showText("F1", "secret"), fonts: [asciiFont("F1")] }], { encrypted: true });
    expect(() => PdfDocument.open(pdf)).toThrow(/encrypted/);
  });

  it("refuses a page that does not exist", () => {
    const pdf = buildFixturePdf([{ content: showText("F1", "only page"), fonts: [asciiFont("F1")] }]);
    expect(() => PdfDocument.open(pdf).pageText(2)).toThrow(/no page 2/);
  });
});
