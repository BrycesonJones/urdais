/**
 * Test support: build an XLSX in memory.
 *
 * The adapters are tested against workbooks assembled here rather than against twenty megabytes
 * of publishers' files, and the fixtures reproduce the specific awkwardnesses the real workbooks
 * turned out to have -- self-closing empty cells, merged block titles, booleans written as
 * booleans, sheets whose name is not the area they describe. A fixture that is tidier than the
 * source would test nothing worth testing.
 *
 * Members are stored uncompressed, which the reader supports and which keeps the writer honest:
 * it exercises the same central-directory path as a real file.
 */

import { crc32 } from "node:zlib";

export type FixtureCell = string | number | boolean | null;
export type FixtureSheet = {
  name: string;
  /** Row number to a map of column letter to value. Absent columns are absent cells. */
  rows: Map<number, Map<string, FixtureCell>>;
  merges?: string[];
};

export function sheetFromGrid(
  name: string,
  grid: Record<number, Record<string, FixtureCell>>,
  merges?: string[],
): FixtureSheet {
  const rows = new Map<number, Map<string, FixtureCell>>();
  for (const [rowNumber, cells] of Object.entries(grid)) {
    rows.set(Number(rowNumber), new Map(Object.entries(cells)));
  }
  return { name, rows, merges };
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sheetXml(sheet: FixtureSheet, sharedStrings: string[]): string {
  const rows = [...sheet.rows.entries()].sort(([a], [b]) => a - b).map(([rowNumber, cells]) => {
    const body = [...cells.entries()].map(([column, value]) => {
      const ref = `${column}${rowNumber}`;
      if (value === null) return `<c r="${ref}" s="1"/>`;
      if (typeof value === "boolean") return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
      if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
      let index = sharedStrings.indexOf(value);
      if (index === -1) index = sharedStrings.push(value) - 1;
      return `<c r="${ref}" t="s"><v>${index}</v></c>`;
    }).join("");
    return `<row r="${rowNumber}">${body}</row>`;
  }).join("");
  const merges = (sheet.merges ?? []).length === 0
    ? ""
    : `<mergeCells count="${sheet.merges!.length}">${sheet.merges!.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`;
  return `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData>${merges}</worksheet>`;
}

/**
 * Test-only corruptions of a member's central-directory metadata, so the integrity checks in
 * `readZipMember` can be exercised against an archive that lies about its own contents.
 */
export type ZipCorruption = { member: string; crc?: number; uncompressedSize?: number };

export function buildFixtureZip(
  members: { name: string; body: Buffer }[],
  corruptions: readonly ZipCorruption[] = [],
): Buffer {
  return zip(members, corruptions);
}

function zip(members: { name: string; body: Buffer }[], corruptions: readonly ZipCorruption[] = []): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const member of members) {
    const name = Buffer.from(member.name, "utf8");
    const corruption = corruptions.find((entry) => entry.member === member.name);
    const crc = corruption?.crc ?? crc32(member.body);
    const declaredSize = corruption?.uncompressedSize ?? member.body.length;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 8); // stored
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(member.body.length, 18);
    header.writeUInt32LE(declaredSize, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, member.body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(member.body.length, 20);
    entry.writeUInt32LE(declaredSize, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += header.length + name.length + member.body.length;
  }
  const centralBuffer = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(members.length, 8);
  eocd.writeUInt16LE(members.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuffer, eocd]);
}

export function buildFixtureWorkbook(
  sheets: FixtureSheet[],
  corruptions: readonly ZipCorruption[] = [],
  /** Written into docProps/core.xml, for readers that date a release by when the file was saved. */
  documentModified?: string,
): Buffer {
  const sharedStrings: string[] = [];
  const sheetParts = sheets.map((sheet, index) => ({
    sheet,
    part: `xl/worksheets/sheet${index + 1}.xml`,
    id: `rId${index + 1}`,
    xml: sheetXml(sheet, sharedStrings),
  }));
  const workbook = `<?xml version="1.0"?><workbook><sheets>${
    sheetParts.map((entry) => `<sheet name="${escapeXml(entry.sheet.name)}" sheetId="1" r:id="${entry.id}"/>`).join("")
  }</sheets></workbook>`;
  const rels = `<?xml version="1.0"?><Relationships>${
    sheetParts.map((entry) => `<Relationship Id="${entry.id}" Target="worksheets/sheet${sheetParts.indexOf(entry) + 1}.xml"/>`).join("")
  }</Relationships>`;
  const shared = `<?xml version="1.0"?><sst count="${sharedStrings.length}">${
    sharedStrings.map((value) => `<si><t>${escapeXml(value)}</t></si>`).join("")
  }</sst>`;
  const core = `<?xml version="1.0"?><cp:coreProperties`
    + ` xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"`
    + ` xmlns:dcterms="http://purl.org/dc/terms/">`
    + `<dcterms:modified xsi:type="dcterms:W3CDTF">${escapeXml(documentModified ?? "")}</dcterms:modified>`
    + `</cp:coreProperties>`;
  return zip([
    ...(documentModified === undefined ? [] : [{ name: "docProps/core.xml", body: Buffer.from(core, "utf8") }]),
    { name: "xl/workbook.xml", body: Buffer.from(workbook, "utf8") },
    { name: "xl/_rels/workbook.xml.rels", body: Buffer.from(rels, "utf8") },
    { name: "xl/sharedStrings.xml", body: Buffer.from(shared, "utf8") },
    ...sheetParts.map((entry) => ({ name: entry.part, body: Buffer.from(entry.xml, "utf8") })),
  ], corruptions);
}
