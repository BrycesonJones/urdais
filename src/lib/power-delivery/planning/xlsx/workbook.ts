/**
 * The spreadsheet half of an XLSX reader: sheets, shared strings, merged ranges, and cells
 * addressed the way a locator addresses them.
 *
 * It is deliberately small and deliberately strict. Every planning adapter records the sheet and
 * cell a number came out of, so the reader's job is to preserve addresses exactly and to refuse
 * anything it does not understand rather than return a plausible-looking empty cell. A publisher
 * who renames a sheet or moves a column should break the run, not quietly produce fewer points.
 *
 * Dates are not converted. No planning value PD-3 reads is a date, and a serial number silently
 * rendered as a date is the classic way a spreadsheet import goes wrong.
 */

import { readZipDirectory, readZipMember, type ZipEntry } from "@/lib/power-delivery/planning/xlsx/zip";

export class XlsxFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxFormatError";
  }
}

export type XlsxCell = {
  /** The A1-style address, which is what the raw record stores as its locator. */
  ref: string;
  column: string;
  row: number;
  /** Text for strings, the literal numeric text for numbers. Null for a present but empty cell. */
  value: string | null;
  kind: "number" | "shared_string" | "inline_string" | "formula_string" | "boolean" | "error" | "empty";
};

export type XlsxRow = { row: number; cells: Map<string, XlsxCell> };

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'",
};

export function decodeXmlText(value: string): string {
  return value
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => ENTITIES[entity]!)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    // Excel escapes control characters it cannot represent; _x000D_ is a carriage return.
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)));
}

/** Concatenate every text run in one shared-string item, which is how Excel stores rich text. */
function sharedStringText(item: string): string {
  const runs = [...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXmlText(match[1]!));
  return runs.join("");
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match === null ? null : decodeXmlText(match[1]!);
}

export function splitCellRef(ref: string): { column: string; row: number } {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (match === null) throw new XlsxFormatError(`unreadable cell reference ${ref}`);
  return { column: match[1]!, row: Number(match[2]!) };
}

export function columnToIndex(column: string): number {
  let index = 0;
  for (const character of column) index = index * 26 + (character.charCodeAt(0) - 64);
  return index;
}

export function indexToColumn(index: number): string {
  let remaining = index;
  let column = "";
  while (remaining > 0) {
    const modulo = (remaining - 1) % 26;
    column = String.fromCharCode(65 + modulo) + column;
    remaining = Math.floor((remaining - modulo) / 26);
  }
  return column;
}

export type XlsxSheet = {
  name: string;
  /** The part name inside the archive, retained so provenance can name the exact part. */
  part: string;
  rows: XlsxRow[];
  /** Merged ranges in A1 notation. A merged range carries its value in the top-left cell only. */
  merges: string[];
};

export class XlsxWorkbook {
  private constructor(
    private readonly buffer: Buffer,
    private readonly entries: Map<string, ZipEntry>,
    private readonly sharedStrings: string[],
    /** Sheet name in workbook order, mapped to its part name. */
    private readonly sheetParts: Map<string, string>,
  ) {}

  static open(buffer: Buffer): XlsxWorkbook {
    const entries = readZipDirectory(buffer);
    const read = (name: string): string | null => {
      const entry = entries.get(name);
      return entry === undefined ? null : readZipMember(buffer, entry).toString("utf8");
    };
    const workbook = read("xl/workbook.xml");
    if (workbook === null) throw new XlsxFormatError("not an XLSX workbook: xl/workbook.xml is missing");
    const relationships = read("xl/_rels/workbook.xml.rels") ?? "";
    const targets = new Map<string, string>();
    for (const match of relationships.matchAll(/<Relationship\b[^>]*\/?>/g)) {
      const id = attribute(match[0], "Id");
      const target = attribute(match[0], "Target");
      if (id !== null && target !== null) {
        targets.set(id, target.startsWith("/") ? target.slice(1) : target.startsWith("xl/") ? target : `xl/${target}`);
      }
    }
    const sheetParts = new Map<string, string>();
    for (const match of workbook.matchAll(/<sheet\b[^>]*\/?>/g)) {
      const name = attribute(match[0], "name");
      const id = attribute(match[0], "r:id") ?? attribute(match[0], "id");
      if (name === null || id === null) continue;
      const part = targets.get(id);
      if (part === undefined) throw new XlsxFormatError(`sheet ${name} has no resolvable part`);
      sheetParts.set(name, part);
    }
    if (sheetParts.size === 0) throw new XlsxFormatError("workbook declares no sheets");

    const sharedXml = read("xl/sharedStrings.xml");
    const sharedStrings = sharedXml === null
      ? []
      : [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => sharedStringText(match[1]!));
    return new XlsxWorkbook(buffer, entries, sharedStrings, sheetParts);
  }

  sheetNames(): string[] {
    return [...this.sheetParts.keys()];
  }

  hasSheet(name: string): boolean {
    return this.sheetParts.has(name);
  }

  /** Fails closed: a renamed or removed sheet is a source-format change, not an empty result. */
  sheet(name: string): XlsxSheet {
    const part = this.sheetParts.get(name);
    if (part === undefined) {
      throw new XlsxFormatError(`workbook has no sheet named "${name}"; it has ${this.sheetNames().join(", ")}`);
    }
    const entry = this.entries.get(part);
    if (entry === undefined) throw new XlsxFormatError(`sheet ${name} points at missing part ${part}`);
    const xml = readZipMember(this.buffer, entry).toString("utf8");
    return { name, part, rows: this.parseRows(xml), merges: this.parseMerges(xml) };
  }

  private parseMerges(xml: string): string[] {
    const block = /<mergeCells\b[^>]*>([\s\S]*?)<\/mergeCells>/.exec(xml);
    if (block === null) return [];
    return [...block[1]!.matchAll(/<mergeCell\b[^>]*\bref="([^"]+)"/g)].map((match) => match[1]!);
  }

  private parseRows(xml: string): XlsxRow[] {
    const rows: XlsxRow[] = [];
    // The attribute run is lazy so that a self-closing tag matches `/>` rather than running
    // on to the next element's closing tag and swallowing it whole.
    for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rowNumber = Number(attribute(`<row${rowMatch[1]!}>`, "r") ?? "0");
      const body = rowMatch[2] ?? "";
      const cells = new Map<string, XlsxCell>();
      for (const cellMatch of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const tag = `<c${cellMatch[1]!}>`;
        const ref = attribute(tag, "r");
        if (ref === null) continue;
        const { column, row } = splitCellRef(ref);
        cells.set(column, this.parseCell(ref, column, row, attribute(tag, "t"), cellMatch[2] ?? ""));
      }
      rows.push({ row: rowNumber, cells });
    }
    return rows;
  }

  private parseCell(ref: string, column: string, row: number, type: string | null, body: string): XlsxCell {
    if (type === "inlineStr") {
      const text = sharedStringText(body);
      return { ref, column, row, value: text === "" ? null : text, kind: "inline_string" };
    }
    const valueMatch = /<v>([\s\S]*?)<\/v>/.exec(body);
    if (valueMatch === null) return { ref, column, row, value: null, kind: "empty" };
    const raw = decodeXmlText(valueMatch[1]!);
    switch (type) {
      case "s": {
        const index = Number(raw);
        const text = this.sharedStrings[index];
        if (text === undefined) throw new XlsxFormatError(`cell ${ref} references missing shared string ${raw}`);
        return { ref, column, row, value: text === "" ? null : text, kind: "shared_string" };
      }
      case "str":
        return { ref, column, row, value: raw === "" ? null : raw, kind: "formula_string" };
      case "b":
        return { ref, column, row, value: raw === "1" ? "true" : "false", kind: "boolean" };
      case "e":
        return { ref, column, row, value: raw, kind: "error" };
      default:
        return { ref, column, row, value: raw === "" ? null : raw, kind: "number" };
    }
  }
}

/** Resolve merged ranges so a header label spanning two columns answers for both of them. */
export function expandMerges(sheet: XlsxSheet): Map<string, string> {
  const owner = new Map<string, string>();
  for (const range of sheet.merges) {
    const [from, to] = range.split(":");
    if (from === undefined || to === undefined) continue;
    const start = splitCellRef(from);
    const end = splitCellRef(to);
    for (let row = start.row; row <= end.row; row += 1) {
      for (let index = columnToIndex(start.column); index <= columnToIndex(end.column); index += 1) {
        owner.set(`${indexToColumn(index)}${row}`, from);
      }
    }
  }
  return owner;
}

export function cellText(sheet: XlsxSheet, rowNumber: number, column: string): string | null {
  const row = sheet.rows.find((candidate) => candidate.row === rowNumber);
  return row?.cells.get(column)?.value ?? null;
}

/** A number, or null where the source left the cell empty. Never a guess, never a zero. */
export function cellNumber(cell: XlsxCell | undefined): number | null {
  if (cell === undefined || cell.value === null) return null;
  if (cell.kind === "error") return null;
  const parsed = Number(cell.value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
