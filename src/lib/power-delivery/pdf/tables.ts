/**
 * Reading a row of numbers out of a PDF's text layer.
 *
 * A table in a PDF is not a table; it is glyphs placed at coordinates, and a text extractor
 * returns them in drawing order. What makes the reports these helpers are used on tractable is
 * that each row ends in an anchor — a formula key like `[D]=[B]+[C]`, or a column count that is
 * fixed by the market's own geography — so a row can be located by its label and terminated by
 * something other than a guess about layout.
 *
 * Everything here fails closed. A row whose label is missing, or which yields a different number
 * of values than the caller expects, raises rather than returning what it managed to find: a
 * capacity table that has been reorganised should stop the ingestion, not quietly shorten it.
 */

export class PdfTableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfTableError";
  }
}

/** Page text with every run of whitespace collapsed to one space, which is how rows read. */
export function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * One numeric cell.
 *
 * Accounting parentheses mean negative, which matters: a cold weather outage impact of `(11,320)`
 * is minus eleven thousand, and reading it as positive would turn a derate into a resource.
 */
export function parseNumericCell(token: string): number | null {
  const text = token.trim().replace(/,/g, "").replace(/%$/, "");
  if (text === "" || /^(NA|N\/A|None|-|–|—)$/i.test(text)) return null;
  const negated = /^\((.+)\)$/.exec(text);
  const body = negated === null ? text : `-${negated[1]}`;
  if (!/^[+-]?\d+(\.\d+)?$/.test(body)) return null;
  const value = Number(body);
  return Number.isFinite(value) ? value : null;
}

/**
 * Split a span of a row into numeric cells.
 *
 * A minus sign separated from its digits by a space is one token, not two: the reports set
 * negative cells as `- 5`, and treating the sign as its own cell shifts every later column.
 */
export function numericCells(span: string): (number | null)[] {
  const tokens = flatten(span).split(" ").filter((token) => token !== "");
  const cells: (number | null)[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    let token = tokens[index]!;
    if (/^[-–—]$/.test(token) && index + 1 < tokens.length && /^[\d(]/.test(tokens[index + 1]!)) {
      index += 1;
      token = `-${tokens[index]!}`;
    }
    cells.push(parseNumericCell(token));
  }
  return cells;
}

/**
 * Build a pattern that matches a label however the typesetter broke it up.
 *
 * Extracted text puts spaces in places the reader never sees them — `per - unit`, `202 6 - 202 7`
 * — so every gap between characters of the label is allowed to be any run of spaces.
 */
export function labelPattern(label: string): string {
  return label
    .split("")
    .map((character) => (/\s/.test(character) ? "\\s+" : `\\s*${character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))
    .join("")
    .replace(/^\\s\*/, "");
}

export type RowOptions = {
  /** How many numeric cells the row must yield. */
  expect: number;
  /** What terminates the row. Defaults to a bracketed formula key. */
  terminator?: string;
  /** Where to start looking, so repeated tables on one page can be read in turn. */
  from?: number;
};

export type RowMatch = { values: (number | null)[]; raw: string[]; index: number; end: number };

/**
 * Find one labelled row and return its numeric cells.
 *
 * `expect` is not advisory. A row that yields a different count means the table has gained or
 * lost a column, and continuing would file every value under the wrong heading.
 */
export function readRow(flat: string, label: string, options: RowOptions): RowMatch {
  const terminator = options.terminator ?? "\\[[^\\]]{1,24}\\]";
  const pattern = new RegExp(`${labelPattern(label)}\\s+(.*?)\\s*(?:${terminator})`, "g");
  pattern.lastIndex = options.from ?? 0;
  const matched = pattern.exec(flat);
  if (matched === null) {
    throw new PdfTableError(`the table no longer states a row labelled "${label}"`);
  }
  const span = matched[1] ?? "";
  const raw = flatten(span).split(" ").filter((token) => token !== "");
  const values = numericCells(span);
  if (values.length !== options.expect) {
    throw new PdfTableError(
      `the row "${label}" yielded ${values.length} values where ${options.expect} were expected; `
      + `the table's columns have changed (read: ${raw.slice(0, 14).join(" ")})`,
    );
  }
  return { values, raw, index: matched.index, end: pattern.lastIndex };
}

/** Every numeric cell of a labelled row, requiring each one to be present. */
export function readNumbers(flat: string, label: string, options: RowOptions): number[] {
  const row = readRow(flat, label, options);
  const missing = row.values.findIndex((value) => value === null);
  if (missing !== -1) {
    throw new PdfTableError(
      `the row "${label}" has no readable value in column ${missing + 1} (read: ${row.raw.join(" ")})`,
    );
  }
  return row.values as number[];
}
