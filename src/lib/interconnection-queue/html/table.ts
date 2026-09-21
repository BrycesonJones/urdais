/**
 * A structured HTML table reader, narrow on purpose.
 *
 * ISO-NE publishes its interconnection queue as a real HTML table — 1,751 rows of semantic
 * markup — and reading it needs a table reader, not a browser. There is nothing to execute, no
 * layout to measure and no styling that carries meaning.
 *
 * What it reads is structure: `<table>` to `<tr>` to `<th>`/`<td>`, in document order, with the
 * header resolved from the cells that declare themselves headers. It deliberately does not care
 * about attributes, classes, nesting depth, or whitespace, so a publisher restyling its page does
 * not break ingestion. It does care when a column disappears, and the caller is given the exact
 * header list so it can say so.
 *
 * Two things it will not do. It will not execute anything — there is no script handling here at
 * all, and `<script>` and `<style>` content is discarded rather than read as text. And it will not
 * guess: a table whose rows disagree with its header about how many columns there are is reported
 * as it is, and the caller decides.
 */

export class HtmlTableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HtmlTableError";
  }
}

export type HtmlTable = {
  /** The table's id attribute, where it has one. */
  id: string | null;
  /** Header cell text in document order, whitespace collapsed. */
  headers: string[];
  /** Body rows, each an array of cell text in document order. */
  rows: string[][];
};

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘",
  ldquo: "“", rdquo: "”", deg: "°", bull: "•", middot: "·",
};

/** Decode the named entities a queue page actually uses, plus numeric references. */
export function decodeEntities(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Cell text: markup removed, entities decoded, whitespace collapsed. */
function cellText(html: string): string {
  // Script and style content is never text. Dropping it here means it can never reach a value.
  const stripped = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  return decodeEntities(stripped).replace(/\s+/g, " ").trim();
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  if (match === null) return null;
  return decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
}

/**
 * Every table in the document, in order.
 *
 * Nested tables are a real possibility in a page built from a grid component, so the scan tracks
 * depth rather than matching the first closing tag it sees.
 */
export function findTables(html: string): { id: string | null; inner: string }[] {
  const tables: { id: string | null; inner: string }[] = [];
  const opener = /<table\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(html)) !== null) {
    const start = match.index;
    const contentStart = start + match[0].length;
    let depth = 1;
    const scanner = /<(\/?)table\b[^>]*>/gi;
    scanner.lastIndex = contentStart;
    let end = -1;
    let inner: RegExpExecArray | null;
    while ((inner = scanner.exec(html)) !== null) {
      depth += inner[1] === "/" ? -1 : 1;
      if (depth === 0) { end = inner.index; break; }
    }
    if (end === -1) throw new HtmlTableError("a <table> element is never closed");
    tables.push({ id: attribute(match[0], "id"), inner: html.slice(contentStart, end) });
    // Resume inside the table just read, so a nested one is found rather than skipped.
    opener.lastIndex = contentStart;
  }
  return tables;
}

/** Parse one table's markup into headers and rows. */
export function parseTable(inner: string, id: string | null = null): HtmlTable {
  const headers: string[] = [];
  const rows: string[][] = [];

  for (const rowMatch of inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const body = rowMatch[1]!;
    const cells: string[] = [];
    let sawHeaderCell = false;
    let sawDataCell = false;
    for (const cellMatch of body.matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)) {
      const kind = cellMatch[1]!.toLowerCase();
      if (kind === "th") sawHeaderCell = true; else sawDataCell = true;
      const text = cellText(cellMatch[3]!);
      // A cell spanning several columns occupies each of them, so positions stay aligned.
      const span = Number.parseInt(attribute(`<x${cellMatch[2]!}>`, "colspan") ?? "1", 10);
      cells.push(text);
      for (let extra = 1; extra < (Number.isFinite(span) && span > 1 ? span : 1); extra += 1) cells.push("");
    }
    if (cells.length === 0) continue;
    // A row of header cells with no data cells is a header row; anything else is data.
    if (sawHeaderCell && !sawDataCell && headers.length === 0) headers.push(...cells);
    else if (sawDataCell) rows.push(cells);
  }

  return { id, headers, rows };
}

/** The table with this id, or null. */
export function tableById(html: string, id: string): HtmlTable | null {
  for (const table of findTables(html)) {
    if (table.id === id) return parseTable(table.inner, table.id);
  }
  return null;
}

/**
 * Resolve column positions by header text.
 *
 * Returns an index per requested name and the full header list, so a caller that cannot find
 * what it needs can say exactly what the page offered instead. Header text is matched with
 * whitespace collapsed and case ignored, because those are the changes a restyling makes.
 *
 * Repeated header names are real — ISO-NE prints "SIS" twice — so this returns the *first*
 * position for a name and the caller uses `positions` when it needs a later one.
 */
export function resolveColumns(
  table: HtmlTable, names: readonly string[],
): { index: Map<string, number>; positions: Map<string, number[]>; missing: string[] } {
  const normalized = table.headers.map((header) => header.replace(/\s+/g, " ").trim().toLowerCase());
  const positions = new Map<string, number[]>();
  normalized.forEach((header, position) => {
    const list = positions.get(header) ?? [];
    list.push(position);
    positions.set(header, list);
  });

  const index = new Map<string, number>();
  const missing: string[] = [];
  for (const name of names) {
    const key = name.replace(/\s+/g, " ").trim().toLowerCase();
    const found = positions.get(key);
    if (found === undefined || found[0] === undefined) missing.push(name);
    else index.set(name, found[0]);
  }
  return { index, positions, missing };
}
