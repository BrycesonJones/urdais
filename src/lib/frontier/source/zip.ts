/**
 * Reading the entries of a ZIP archive, with no dependency.
 *
 * Epoch publishes its bundle as a zip and Node ships the only hard part — DEFLATE — in
 * `node:zlib`. What remains is the container format, which for this purpose is small: walk the
 * central directory backwards from the end-of-central-directory record, and for each entry
 * find its local header and inflate the bytes after it.
 *
 * Reading the **central directory** rather than scanning local headers is the part that
 * matters. The central directory is the archive's authoritative index; scanning for local
 * signatures can match bytes inside compressed data and silently produce a file that was
 * never in the archive.
 *
 * Only what this needs is implemented: stored and deflated entries, no encryption, no zip64,
 * no multi-disk. Anything else throws rather than being guessed at.
 */

import { inflateRawSync } from "node:zlib";

import { FrontierContractError } from "@/lib/frontier/types";

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

const STORED = 0;
const DEFLATED = 8;

export type ZipEntry = { name: string; data: Buffer };

/** Every file in the archive, by name. Directories are skipped. */
export function readZipEntries(archive: Buffer): ZipEntry[] {
  // The end-of-central-directory record is at the end, after a comment of unknown length, so
  // it is found by scanning backwards for its signature.
  let eocd = -1;
  for (let i = archive.length - 22; i >= 0; i -= 1) {
    if (archive.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new FrontierContractError("not a zip archive: no end-of-central-directory record");

  const entryCount = archive.readUInt16LE(eocd + 10);
  let offset = archive.readUInt32LE(eocd + 16);
  if (offset === 0xffffffff) throw new FrontierContractError("zip64 archives are not supported");

  const entries: ZipEntry[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(offset) !== CENTRAL_FILE_HEADER) {
      throw new FrontierContractError(`central directory entry ${index} has a bad signature`);
    }
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/")) continue;

    if (archive.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) {
      throw new FrontierContractError(`'${name}' has a bad local header`);
    }
    // The local header's own name and extra lengths are authoritative for where data starts;
    // the central directory's extra field is frequently a different length.
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = archive.subarray(start, start + compressedSize);

    if (method === STORED) entries.push({ name, data: Buffer.from(raw) });
    else if (method === DEFLATED) entries.push({ name, data: inflateRawSync(raw) });
    else throw new FrontierContractError(`'${name}' uses unsupported compression method ${method}`);
  }

  return entries;
}
