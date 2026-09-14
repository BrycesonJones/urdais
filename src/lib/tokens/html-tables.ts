/**
 * Minimal HTML table extraction for first-party pricing docs. Nested tables
 * are refused. Colspan is expanded so grouped headers (OpenAI short vs long
 * context) become one header string per column.
 */

import { IncompatiblePricingUnitError, MalformedPricingSourceError } from "@/lib/tokens/types";

export type HtmlTable = {
  precedingHeading: string | null;
  caption: string | null;
  headers: string[];
  rows: string[][];
};

export function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function isMissingPriceCell(value: string): boolean {
  const t = value.trim();
  return t.length === 0 || t === "-" || t === "—" || t === "–" || t.toLowerCase() === "n/a";
}

export function parseUsdTokenPrice(cell: string): number {
  const trimmed = cell.replace(/\s+/g, " ").trim();
  if (isMissingPriceCell(trimmed)) {
    throw new MalformedPricingSourceError(`missing token price in cell '${cell}'`);
  }
  if (/\/\s*(image|sec|min|minute|hour|hr|gb|call|search|char)/i.test(trimmed)) {
    throw new IncompatiblePricingUnitError(trimmed);
  }
  const match = trimmed.match(/^\$\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\/\s*(?:mtok|1m(?:illion)?(?:\s*tokens)?))?$/i);
  if (!match?.[1]) {
    throw new MalformedPricingSourceError(`not a USD / 1M-token price: '${cell}'`);
  }
  return Number(match[1]);
}

export function tryUsdTokenPrice(cell: string): number | null {
  if (isMissingPriceCell(cell)) return null;
  return parseUsdTokenPrice(cell);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&ge;/gi, "≥")
    .replace(/&le;/gi, "≤")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

export function cellText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function attrInt(attrs: string, name: string): number {
  const match = new RegExp(`${name}\\s*=\\s*["']?(\\d+)`, "i").exec(attrs);
  return match ? Number(match[1]) : 1;
}

type Cell = { text: string; colspan: number };

function parseCells(rowHtml: string): Cell[] {
  const cells: Cell[] = [];
  const re = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(rowHtml))) {
    cells.push({ text: cellText(match[3] ?? ""), colspan: attrInt(match[2] ?? "", "colspan") });
  }
  return cells;
}

function expandRow(cells: Cell[]): string[] {
  const out: string[] = [];
  for (const cell of cells) {
    const span = Number.isFinite(cell.colspan) && cell.colspan > 0 ? cell.colspan : 1;
    for (let i = 0; i < span; i++) out.push(cell.text);
  }
  return out;
}

function rowHtmls(section: string): string[] {
  return [...section.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1] ?? "");
}

function isHeaderRow(rowHtml: string): boolean {
  return /<th\b/i.test(rowHtml) && !/<td\b/i.test(rowHtml);
}

function combineHeaderRows(rows: string[][]): string[] {
  if (rows.length === 0) return [];
  const width = Math.max(...rows.map((row) => row.length));
  const headers: string[] = [];
  for (let col = 0; col < width; col++) {
    const parts: string[] = [];
    for (const row of rows) {
      const value = row[col]?.trim() ?? "";
      if (value && parts[parts.length - 1] !== value) parts.push(value);
    }
    headers.push(parts.join(" ").trim());
  }
  return headers;
}

function lastHeadingBefore(html: string, index: number): string | null {
  const before = html.slice(0, index);
  const matches = [...before.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)];
  const last = matches[matches.length - 1];
  return last ? cellText(last[1] ?? "") : null;
}

function parseOneTable(tableInner: string): HtmlTable {
  if (/<table\b/i.test(tableInner)) {
    throw new MalformedPricingSourceError("nested HTML tables are not supported");
  }
  const captionMatch = tableInner.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i);
  const theadMatch = tableInner.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i);
  const tbodyMatch = tableInner.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
  const headerSource = theadMatch?.[1] ?? tableInner;
  const bodySource = tbodyMatch?.[1] ?? tableInner;

  const headerRowHtmls = rowHtmls(headerSource).filter(isHeaderRow);
  const headerRows = headerRowHtmls.map((row) => expandRow(parseCells(row)));
  let headers = combineHeaderRows(headerRows);

  const bodyRowHtmls = rowHtmls(tbodyMatch ? bodySource : tableInner).filter((row) => !isHeaderRow(row));
  let dataRows = bodyRowHtmls.map((row) => expandRow(parseCells(row)));

  if (headers.length === 0) {
    const first = dataRows[0];
    if (!first) throw new MalformedPricingSourceError("pricing table has no header row");
    headers = first;
    dataRows = dataRows.slice(1);
  }

  if (headers.every((h) => h.length === 0)) {
    throw new MalformedPricingSourceError("pricing table headers are empty");
  }

  return {
    precedingHeading: null,
    caption: captionMatch ? cellText(captionMatch[1] ?? "") : null,
    headers: headers.map(normalizeHeader),
    rows: dataRows.filter((row) => row.some((cell) => cell.trim().length > 0)),
  };
}

export function extractHtmlTables(html: string): HtmlTable[] {
  const tables: HtmlTable[] = [];
  const re = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const table = parseOneTable(match[1] ?? "");
    table.precedingHeading = lastHeadingBefore(html, match.index);
    tables.push(table);
  }
  return tables;
}

export function headerIndex(headers: readonly string[], predicate: (header: string) => boolean): number {
  const index = headers.findIndex(predicate);
  if (index < 0) throw new MalformedPricingSourceError(`required column missing (headers: ${headers.join(" | ")})`);
  return index;
}

export function cellAt(row: readonly string[], index: number, label: string): string {
  const value = row[index];
  if (value === undefined) throw new MalformedPricingSourceError(`row is missing column '${label}'`);
  return value;
}

export function roundUsd(value: number): number {
  return Number(value.toFixed(6));
}
