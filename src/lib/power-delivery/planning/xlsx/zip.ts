/**
 * The ZIP half of an XLSX reader.
 *
 * Every planning publisher ships spreadsheets, and an XLSX file is a ZIP of XML parts. Rather
 * than take a spreadsheet dependency for the handful of sheets PD-3 actually reads, this walks
 * the ZIP central directory and inflates the members it is asked for. `node:zlib` supplies the
 * only decompression primitive needed; deflate and store are the only methods Excel emits.
 *
 * It reads the central directory rather than scanning local headers, because a local header may
 * carry zeroed sizes with the real ones in a trailing data descriptor, and the central directory
 * is authoritative in both cases.
 */

import { crc32, inflateRawSync } from "node:zlib";

export type ZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  localHeaderOffset: number;
};

const SIGNATURE_EOCD = 0x06054b50;
const SIGNATURE_EOCD64_LOCATOR = 0x07064b50;
const SIGNATURE_CENTRAL = 0x02014b50;
const SIGNATURE_LOCAL = 0x04034b50;

export class ZipFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipFormatError";
  }
}

/**
 * A member decompressed, but not to what the archive says it should be. Distinct from a format
 * error because it means the bytes are wrong rather than unreadable, and an ingestion run must
 * stop on it rather than parse whatever came out.
 */
export class ZipIntegrityError extends Error {
  constructor(
    readonly member: string,
    message: string,
  ) {
    super(`ZIP member ${member}: ${message}`);
    this.name = "ZipIntegrityError";
  }
}

/** Sentinel the ZIP format uses in a 32-bit size field when the real value lives in ZIP64 extra data. */
const SIZE_IN_ZIP64_EXTRA = 0xffffffff;

/** Scan backwards for the end-of-central-directory record; it is last but for a variable comment. */
function findEndOfCentralDirectory(buffer: Buffer): number {
  const earliest = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === SIGNATURE_EOCD) return offset;
  }
  throw new ZipFormatError("not a ZIP archive: no end-of-central-directory record");
}

/** ZIP64 keeps the real directory offset in its own record when the 32-bit fields overflow. */
function centralDirectoryStart(buffer: Buffer, eocd: number): { offset: number; count: number } {
  const count = buffer.readUInt16LE(eocd + 10);
  const offset = buffer.readUInt32LE(eocd + 16);
  if (offset !== 0xffffffff && count !== 0xffff) return { offset, count };
  const locator = eocd - 20;
  if (locator < 0 || buffer.readUInt32LE(locator) !== SIGNATURE_EOCD64_LOCATOR) {
    throw new ZipFormatError("ZIP64 archive without a ZIP64 locator");
  }
  const zip64 = Number(buffer.readBigUInt64LE(locator + 8));
  return { offset: Number(buffer.readBigUInt64LE(zip64 + 48)), count: Number(buffer.readBigUInt64LE(zip64 + 32)) };
}

export function readZipDirectory(buffer: Buffer): Map<string, ZipEntry> {
  const eocd = findEndOfCentralDirectory(buffer);
  const { offset, count } = centralDirectoryStart(buffer, eocd);
  const entries = new Map<string, ZipEntry>();
  let cursor = offset;
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== SIGNATURE_CENTRAL) {
      throw new ZipFormatError(`corrupt central directory at entry ${index}`);
    }
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    entries.set(name, {
      name,
      compressionMethod: buffer.readUInt16LE(cursor + 10),
      crc32: buffer.readUInt32LE(cursor + 16),
      compressedSize: buffer.readUInt32LE(cursor + 20),
      uncompressedSize: buffer.readUInt32LE(cursor + 24),
      localHeaderOffset: buffer.readUInt32LE(cursor + 42),
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * Read one member and prove it is the member the archive describes.
 *
 * The central directory states an uncompressed length and a CRC-32 for every entry, and until
 * now neither was checked: a truncated download or a mangled byte would have parsed into fewer
 * rows, or subtly wrong ones, with nothing saying so. Both are verified here, so a corrupted
 * member stops the run instead of quietly becoming data.
 */
export function readZipMember(buffer: Buffer, entry: ZipEntry): Buffer {
  if (buffer.readUInt32LE(entry.localHeaderOffset) !== SIGNATURE_LOCAL) {
    throw new ZipFormatError(`corrupt local header for ${entry.name}`);
  }
  // Per-entry ZIP64 sizes live in the extra field, which this reader does not parse. Slicing on
  // the 32-bit sentinel would read the wrong bytes, so refuse rather than misread.
  if (entry.compressedSize === SIZE_IN_ZIP64_EXTRA || entry.uncompressedSize === SIZE_IN_ZIP64_EXTRA) {
    throw new ZipFormatError(`${entry.name} stores its size in a ZIP64 extra field, which is not supported`);
  }
  const nameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const start = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const body = buffer.subarray(start, start + entry.compressedSize);
  if (body.length !== entry.compressedSize) {
    throw new ZipIntegrityError(
      entry.name,
      `archive is truncated: ${entry.compressedSize} compressed bytes declared, ${body.length} present`,
    );
  }

  let content: Buffer;
  if (entry.compressionMethod === 0) content = Buffer.from(body);
  else if (entry.compressionMethod === 8) content = inflateRawSync(body);
  else throw new ZipFormatError(`${entry.name} uses unsupported ZIP compression method ${entry.compressionMethod}`);

  if (content.length !== entry.uncompressedSize) {
    throw new ZipIntegrityError(
      entry.name,
      `declared uncompressed size ${entry.uncompressedSize} does not match the ${content.length} bytes decompressed`,
    );
  }
  const actualCrc = crc32(content);
  if (actualCrc !== entry.crc32) {
    throw new ZipIntegrityError(
      entry.name,
      `CRC-32 mismatch: archive declares ${entry.crc32.toString(16).padStart(8, "0")}, content hashes to ${actualCrc.toString(16).padStart(8, "0")}`,
    );
  }
  return content;
}
