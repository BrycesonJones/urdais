/**
 * A CSV reader for files that say something before they start.
 *
 * SPP's generated queue CSV opens with a metadata line — `"Last Updated On",9/21/2026,` — and puts
 * the real header on the line after it. A reader that takes line one as the header misreads every
 * column and produces a table whose fields are named after a date. The preamble is also the only
 * freshness stamp SPP publishes, so it is data worth keeping rather than noise to skip.
 *
 * This is a narrow helper, not a replacement for ordinary CSV parsing: it finds where the header
 * actually starts, hands back what came before it, and preserves each row's line number so a
 * value can be traced to the line it was read from.
 */

export class CsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvFormatError";
  }
}

export type CsvRow = {
  /** 1-based line number in the source file, for provenance. */
  line: number;
  values: string[];
};

export type PreambleCsv = {
  /** Lines before the header, parsed as rows, in order. */
  preamble: CsvRow[];
  header: string[];
  headerLine: number;
  rows: CsvRow[];
};

/**
 * Split one CSV record, honouring quotes and doubled quotes.
 *
 * A record is not always a line: SPP writes free-text fields — a cause of delay, a cluster note —
 * that contain newlines inside quotes. `splitCsvRecords` below joins those back together before
 * this runs, so by the time a record arrives here its quotes balance.
 */
export function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (quoted) {
      if (character === '"') {
        if (line[index + 1] === '"') { current += '"'; index += 1; } else quoted = false;
      } else current += character;
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      values.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (quoted) throw new CsvFormatError("a quoted field is not closed");
  values.push(current);
  return values;
}

/**
 * Group physical lines into logical records, joining a quoted field that spans several.
 *
 * Each record keeps the line number it began on, so a value still traces to a place in the file.
 */
export function splitCsvRecords(text: string): { line: number; text: string }[] {
  const lines = text.split(/\r\n|\n|\r/);
  const records: { line: number; text: string }[] = [];
  let pending: string | null = null;
  let pendingLine = 0;

  const quoteCount = (value: string) => (value.match(/"/g) ?? []).length;

  lines.forEach((line, index) => {
    if (pending === null) {
      if (quoteCount(line) % 2 === 0) {
        records.push({ line: index + 1, text: line });
      } else {
        pending = line;
        pendingLine = index + 1;
      }
      return;
    }
    // A newline inside a quoted field is part of the value, so it is preserved as a space rather
    // than dropped: the field's text is what the publisher wrote.
    pending = `${pending} ${line}`;
    if (quoteCount(pending) % 2 === 0) {
      records.push({ line: pendingLine, text: pending });
      pending = null;
    }
  });

  if (pending !== null) {
    throw new CsvFormatError(`a quoted field beginning on line ${pendingLine} is never closed`);
  }
  return records;
}

const trimTrailingEmpty = (values: string[]): string[] => {
  const copy = [...values];
  while (copy.length > 0 && copy[copy.length - 1]!.trim() === "") copy.pop();
  return copy;
};

/**
 * Parse a CSV whose header does not begin the file.
 *
 * `isHeader` decides which line is the header. SPP's is recognised by the columns it must
 * contain, so a publisher adding a second preamble line changes nothing, and a publisher
 * renaming the columns fails loudly instead of quietly parsing a metadata line as data.
 */
export function parsePreambleCsv(
  text: string,
  isHeader: (values: string[], line: number) => boolean,
  options: { maxPreambleLines?: number } = {},
): PreambleCsv {
  const maxPreambleLines = options.maxPreambleLines ?? 10;
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = splitCsvRecords(body);
  if (lines.every((record) => record.text.trim() === "")) throw new CsvFormatError("the file is empty");

  const preamble: CsvRow[] = [];
  let headerIndex = -1;
  let headerLine = 0;
  let header: string[] = [];

  for (let index = 0; index < lines.length && index <= maxPreambleLines; index += 1) {
    const record = lines[index]!;
    if (record.text.trim() === "") { preamble.push({ line: record.line, values: [] }); continue; }
    const values = splitCsvLine(record.text);
    if (isHeader(values, record.line)) {
      headerIndex = index;
      headerLine = record.line;
      header = trimTrailingEmpty(values).map((value) => value.trim());
      break;
    }
    preamble.push({ line: record.line, values });
  }

  if (headerIndex === -1) {
    const seen = preamble.slice(0, 3).map((row) => row.values.join(",").slice(0, 80));
    throw new CsvFormatError(
      `no header row was found in the first ${maxPreambleLines} lines; the file begins ${JSON.stringify(seen)}`,
    );
  }

  const rows: CsvRow[] = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const record = lines[index]!;
    if (record.text.trim() === "") continue;
    rows.push({ line: record.line, values: splitCsvLine(record.text) });
  }

  return { preamble, header, headerLine, rows };
}

/** A row as a field map, with anything beyond the header's width preserved by position. */
export function rowRecord(header: readonly string[], row: CsvRow): Record<string, string> {
  const record: Record<string, string> = {};
  header.forEach((name, position) => {
    const value = row.values[position];
    if (value !== undefined && value.trim() !== "") record[name] = value.trim();
  });
  return record;
}

/** The first preamble value matching a label, which is how SPP states its update date. */
export function preambleValue(preamble: readonly CsvRow[], label: RegExp): string | null {
  for (const row of preamble) {
    for (let index = 0; index < row.values.length; index += 1) {
      if (label.test(row.values[index]!.trim())) {
        for (let next = index + 1; next < row.values.length; next += 1) {
          const value = row.values[next]!.trim();
          if (value !== "") return value;
        }
      }
    }
  }
  return null;
}
