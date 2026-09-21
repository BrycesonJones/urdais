/**
 * Minimal PDFs, built byte by byte, so the reader can be tested against files whose exact
 * contents are known rather than only against publishers' artifacts.
 *
 * Test-only. It writes the structures the real reports turned out to use — Flate streams, object
 * streams, form XObjects, one-byte and two-byte fonts — including the ones that previously broke
 * the reader, so a regression has somewhere to fail.
 */

import { deflateSync } from "node:zlib";

export type FixtureFont = {
  /** Resource name as the content stream refers to it, without the slash. */
  resource: string;
  /** A composite font addresses glyphs by two-byte code. */
  composite?: boolean;
  /** Character code to the text it stands for. Omit for a font with no ToUnicode map. */
  toUnicode?: Map<number, string>;
  /**
   * What the ToUnicode codespace range claims, which is not always the truth. Real files written
   * by Word declare <0000> <FFFF> on plain one-byte fonts.
   */
  declaredCodespaceBytes?: 1 | 2;
};

export type FixturePage = {
  /** Raw content stream operators. */
  content: string;
  fonts?: FixtureFont[];
  /** Form XObjects this page may invoke with `Do`. */
  forms?: { resource: string; content: string; fonts?: FixtureFont[] }[];
};

export type FixtureOptions = {
  /** Compress content streams with Flate. */
  compress?: boolean;
  /** Put the catalog and page objects inside an object stream, as PDF 1.5 files do. */
  useObjectStream?: boolean;
  /** Claim the document is encrypted. */
  encrypted?: boolean;
};

const hex2 = (n: number): string => n.toString(16).toUpperCase().padStart(2, "0");
const hex4 = (n: number): string => n.toString(16).toUpperCase().padStart(4, "0");

function toUnicodeCMap(font: FixtureFont): string {
  const width = font.declaredCodespaceBytes ?? (font.composite === true ? 2 : 1);
  const pad = width === 2 ? hex4 : hex2;
  const entries = [...(font.toUnicode ?? new Map<number, string>()).entries()];
  const chars = entries.map(([code, text]) => {
    const destination = [...text].map((ch) => hex4(ch.charCodeAt(0))).join("");
    return `<${font.composite === true ? hex4(code) : pad(code)}> <${destination}>`;
  });
  return [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CMapName /Fixture-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange",
    width === 2 ? "<0000> <FFFF>" : "<00> <FF>",
    "endcodespacerange",
    `${chars.length} beginbfchar`,
    ...chars,
    "endbfchar",
    "endcmap",
    "CMapName currentdict /CMap defineresource pop end end",
  ].join("\n");
}

/** Build a PDF whose pages draw exactly the content given. */
export function buildFixturePdf(pages: FixturePage[], options: FixtureOptions = {}): Buffer {
  const objects = new Map<number, Buffer>();
  let next = 1;
  const reserve = (): number => next++;

  const body = (text: string): Buffer => Buffer.from(text, "latin1");
  const stream = (dictEntries: string, data: Buffer): Buffer => {
    const compressed = options.compress === true;
    const payload = compressed ? deflateSync(data) : data;
    const filter = compressed ? " /Filter /FlateDecode" : "";
    return Buffer.concat([
      body(`<< ${dictEntries}${filter} /Length ${payload.length} >>\nstream\n`),
      payload,
      body("\nendstream"),
    ]);
  };

  const fontObject = (font: FixtureFont): number => {
    const id = reserve();
    let toUnicodeRef = "";
    if (font.toUnicode !== undefined) {
      const cmapId = reserve();
      objects.set(cmapId, stream("", body(toUnicodeCMap(font))));
      toUnicodeRef = ` /ToUnicode ${cmapId} 0 R`;
    }
    const descriptor = font.composite === true
      ? "/Type /Font /Subtype /Type0 /BaseFont /Fixture /Encoding /Identity-H"
      : "/Type /Font /Subtype /TrueType /BaseFont /Fixture /Encoding /WinAnsiEncoding";
    objects.set(id, body(`<< ${descriptor}${toUnicodeRef} >>`));
    return id;
  };

  const resourcesFor = (fonts: FixtureFont[], forms: { resource: string; id: number }[]): string => {
    const fontRefs = fonts.map((font) => `/${font.resource} ${fontObject(font)} 0 R`).join(" ");
    const formRefs = forms.map((form) => `/${form.resource} ${form.id} 0 R`).join(" ");
    const parts = [
      fontRefs === "" ? "" : `/Font << ${fontRefs} >>`,
      formRefs === "" ? "" : `/XObject << ${formRefs} >>`,
    ].filter((part) => part !== "");
    return `<< ${parts.join(" ")} >>`;
  };

  const pagesId = reserve();
  const pageIds: number[] = [];
  for (const page of pages) {
    const forms = (page.forms ?? []).map((form) => {
      const id = reserve();
      const resources = resourcesFor(form.fonts ?? [], []);
      objects.set(id, stream(`/Type /XObject /Subtype /Form /Resources ${resources}`, body(form.content)));
      return { resource: form.resource, id };
    });
    const contentId = reserve();
    objects.set(contentId, stream("", body(page.content)));
    const pageId = reserve();
    objects.set(pageId, body(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792]`
      + ` /Resources ${resourcesFor(page.fonts ?? [], forms)} /Contents ${contentId} 0 R >>`,
    ));
    pageIds.push(pageId);
  }
  objects.set(pagesId, body(
    `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
  ));
  const catalogId = reserve();
  objects.set(catalogId, body(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`));

  // Objects that may live inside an object stream: those without stream data of their own.
  const inObjectStream = new Set<number>();
  if (options.useObjectStream === true) {
    for (const [id, data] of objects) {
      if (!data.toString("latin1", 0, 400).includes("stream")) inObjectStream.add(id);
    }
  }

  const chunks: Buffer[] = [body("%PDF-1.5\n")];
  const emit = (id: number, data: Buffer): void => {
    chunks.push(body(`${id} 0 obj\n`), data, body("\nendobj\n"));
  };
  for (const [id, data] of objects) {
    if (!inObjectStream.has(id)) emit(id, data);
  }
  if (inObjectStream.size > 0) {
    const members = [...inObjectStream];
    let offset = 0;
    const header: string[] = [];
    const payloads: Buffer[] = [];
    for (const id of members) {
      const data = objects.get(id)!;
      header.push(`${id} ${offset}`);
      payloads.push(data, body(" "));
      offset += data.length + 1;
    }
    const headerText = body(`${header.join(" ")}\n`);
    const data = Buffer.concat([headerText, ...payloads]);
    const objStmId = reserve();
    emit(objStmId, stream(`/Type /ObjStm /N ${members.length} /First ${headerText.length}`, data));
  }
  if (options.encrypted === true) chunks.push(body("trailer\n<< /Encrypt 99 0 R >>\n"));
  chunks.push(body("%%EOF\n"));
  return Buffer.concat(chunks);
}

/** A content stream that shows one string with the given font resource. */
export function showText(resource: string, text: string): string {
  const escaped = text.replace(/([\\()])/g, "\\$1");
  return `BT /${resource} 12 Tf 72 720 Td (${escaped}) Tj ET`;
}

/**
 * A content stream that draws one line per text-positioning move, which is how a real report
 * produces the line breaks a reader sees. A newline inside a single string literal would be a
 * character the font has no glyph for; these are moves, not characters.
 */
export function showLines(resource: string, lines: readonly string[]): string {
  const drawn = lines.map((line) => {
    const escaped = line.replace(/([\\()])/g, "\\$1");
    return `0 -14 Td (${escaped}) Tj`;
  }).join("\n");
  return `BT /${resource} 12 Tf 72 720 Td\n${drawn}\nET`;
}

/** A content stream that shows two-byte codes, as a composite font requires. */
export function showCodes(resource: string, codes: readonly number[]): string {
  return `BT /${resource} 12 Tf 72 720 Td <${codes.map(hex4).join("")}> Tj ET`;
}
