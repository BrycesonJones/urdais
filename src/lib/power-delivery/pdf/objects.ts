/**
 * Just enough of the PDF object model to find text, and no more.
 *
 * Dependency-free for the same reason the XLSX reader is: a number that reaches the database has
 * to be traceable to bytes this repository knows how to read. The parts implemented here are the
 * ones the real artifacts need — indirect objects, streams, Flate compression, object streams —
 * and nothing else. Encryption, inline images and every drawing operator are absent, because a
 * capacity report does not need them and an unread feature cannot silently mis-decode a digit.
 *
 * Objects are found by scanning for `N G obj` rather than by following the cross-reference table.
 * That is cruder than it sounds only in appearance: cross-reference streams, hybrid files and
 * incremental updates all describe where objects are, and a scan finds them, which is the same
 * answer by a shorter road. Where an incremental update replaced an object, the later definition
 * wins, which is what the cross-reference table would have said too.
 */

import { inflateSync } from "node:zlib";

export class PdfFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfFormatError";
  }
}

export type PdfName = { kind: "name"; name: string };
export type PdfRef = { kind: "ref"; num: number; gen: number };
export type PdfDict = { kind: "dict"; map: Map<string, PdfValue> };
export type PdfStream = { kind: "stream"; dict: PdfDict; raw: Buffer };
/** A bare keyword. Meaningful inside a content stream; a syntax error anywhere else. */
export type PdfOperator = { kind: "operator"; op: string };
export type PdfValue =
  | null | boolean | number | string
  | PdfName | PdfRef | PdfDict | PdfStream | PdfOperator | PdfValue[];

function tagged(v: PdfValue): v is PdfName | PdfRef | PdfDict | PdfStream | PdfOperator {
  return typeof v === "object" && v !== null && !Array.isArray(v) && "kind" in v;
}
export const isName = (v: PdfValue): v is PdfName => tagged(v) && v.kind === "name";
export const isRef = (v: PdfValue): v is PdfRef => tagged(v) && v.kind === "ref";
export const isDict = (v: PdfValue): v is PdfDict => tagged(v) && v.kind === "dict";
export const isStream = (v: PdfValue): v is PdfStream => tagged(v) && v.kind === "stream";
export const isOperator = (v: PdfValue): v is PdfOperator => tagged(v) && v.kind === "operator";

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITER = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const isWhite = (byte: number): boolean => WHITESPACE.has(byte);
const isDelim = (byte: number): boolean => DELIMITER.has(byte);
const isRegular = (byte: number): boolean => !isWhite(byte) && !isDelim(byte);

/** A cursor over PDF syntax. One instance reads one buffer; position is explicit throughout. */
export class PdfLexer {
  constructor(readonly bytes: Buffer, public pos = 0) {}

  skipSpace(): void {
    while (this.pos < this.bytes.length) {
      const byte = this.bytes[this.pos]!;
      if (isWhite(byte)) { this.pos += 1; continue; }
      // A comment runs to the end of the line.
      if (byte === 0x25) {
        while (this.pos < this.bytes.length && this.bytes[this.pos] !== 0x0a && this.bytes[this.pos] !== 0x0d) this.pos += 1;
        continue;
      }
      return;
    }
  }

  atEnd(): boolean {
    this.skipSpace();
    return this.pos >= this.bytes.length;
  }

  private readRegular(): string {
    const start = this.pos;
    while (this.pos < this.bytes.length && isRegular(this.bytes[this.pos]!)) this.pos += 1;
    return this.bytes.toString("latin1", start, this.pos);
  }

  /** `/Name`, with #XX escapes resolved. */
  private readName(): PdfName {
    this.pos += 1;
    const raw = this.readRegular();
    const name = raw.replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    return { kind: "name", name };
  }

  /** `(...)`, with balanced inner parentheses and backslash escapes. Returned as latin1 bytes. */
  private readLiteralString(): string {
    this.pos += 1;
    const out: number[] = [];
    let depth = 1;
    while (this.pos < this.bytes.length) {
      const byte = this.bytes[this.pos]!;
      this.pos += 1;
      if (byte === 0x5c) {
        const next = this.bytes[this.pos];
        if (next === undefined) break;
        this.pos += 1;
        switch (next) {
          case 0x6e: out.push(0x0a); break;
          case 0x72: out.push(0x0d); break;
          case 0x74: out.push(0x09); break;
          case 0x62: out.push(0x08); break;
          case 0x66: out.push(0x0c); break;
          case 0x0a: break;
          case 0x0d: if (this.bytes[this.pos] === 0x0a) this.pos += 1; break;
          default:
            if (next >= 0x30 && next <= 0x37) {
              let octal = next - 0x30;
              for (let i = 0; i < 2; i += 1) {
                const digit = this.bytes[this.pos];
                if (digit === undefined || digit < 0x30 || digit > 0x37) break;
                octal = octal * 8 + (digit - 0x30);
                this.pos += 1;
              }
              out.push(octal & 0xff);
            } else {
              out.push(next);
            }
        }
        continue;
      }
      if (byte === 0x28) { depth += 1; out.push(byte); continue; }
      if (byte === 0x29) {
        depth -= 1;
        if (depth === 0) break;
        out.push(byte);
        continue;
      }
      out.push(byte);
    }
    return Buffer.from(out).toString("latin1");
  }

  /** `<...>` hex string. An odd final digit is padded with zero, as the specification says. */
  private readHexString(): string {
    this.pos += 1;
    let digits = "";
    while (this.pos < this.bytes.length && this.bytes[this.pos] !== 0x3e) {
      const char = String.fromCharCode(this.bytes[this.pos]!);
      if (/[0-9A-Fa-f]/.test(char)) digits += char;
      this.pos += 1;
    }
    this.pos += 1;
    if (digits.length % 2 === 1) digits += "0";
    const out: number[] = [];
    for (let i = 0; i < digits.length; i += 2) out.push(parseInt(digits.slice(i, i + 2), 16));
    return Buffer.from(out).toString("latin1");
  }

  /**
   * Read one object. `resolveStreamLength` is asked about a /Length written as a reference, which
   * happens often enough that ignoring it would lose whole pages.
   */
  parseObject(resolveStreamLength?: (ref: PdfRef) => PdfValue): PdfValue {
    this.skipSpace();
    if (this.pos >= this.bytes.length) throw new PdfFormatError("unexpected end of file while reading an object");
    const byte = this.bytes[this.pos]!;

    if (byte === 0x2f) return this.readName();
    if (byte === 0x28) return this.readLiteralString();
    if (byte === 0x5b) {
      this.pos += 1;
      const items: PdfValue[] = [];
      for (;;) {
        this.skipSpace();
        if (this.pos >= this.bytes.length) throw new PdfFormatError("unterminated array");
        if (this.bytes[this.pos] === 0x5d) { this.pos += 1; return items; }
        items.push(this.parseObject(resolveStreamLength));
      }
    }
    if (byte === 0x5d || byte === 0x3e || byte === 0x29 || byte === 0x7b || byte === 0x7d) {
      // A stray delimiter. Step over it so a malformed region cannot spin forever.
      this.pos += 1;
      return { kind: "operator", op: String.fromCharCode(byte) };
    }
    if (byte === 0x3c) {
      if (this.bytes[this.pos + 1] !== 0x3c) return this.readHexString();
      this.pos += 2;
      const map = new Map<string, PdfValue>();
      for (;;) {
        this.skipSpace();
        if (this.pos >= this.bytes.length) throw new PdfFormatError("unterminated dictionary");
        if (this.bytes[this.pos] === 0x3e && this.bytes[this.pos + 1] === 0x3e) { this.pos += 2; break; }
        const key = this.parseObject(resolveStreamLength);
        if (!isName(key)) throw new PdfFormatError("a dictionary key is not a name");
        map.set(key.name, this.parseObject(resolveStreamLength));
      }
      const dict: PdfDict = { kind: "dict", map };

      // A stream follows its dictionary directly.
      const save = this.pos;
      this.skipSpace();
      if (this.bytes.toString("latin1", this.pos, this.pos + 6) === "stream") {
        this.pos += 6;
        if (this.bytes[this.pos] === 0x0d) this.pos += 1;
        if (this.bytes[this.pos] === 0x0a) this.pos += 1;
        const start = this.pos;
        let length = dict.map.get("Length") ?? null;
        if (isRef(length) && resolveStreamLength !== undefined) length = resolveStreamLength(length);
        let end: number;
        if (typeof length === "number" && length >= 0 && start + length <= this.bytes.length) {
          end = start + length;
          // A wrong /Length is common enough to be worth checking rather than trusting.
          if (!/^\s*endstream/.test(this.bytes.toString("latin1", end, end + 20))) end = this.findEndstream(start);
        } else {
          end = this.findEndstream(start);
        }
        this.pos = end;
        this.skipSpace();
        if (this.bytes.toString("latin1", this.pos, this.pos + 9) === "endstream") this.pos += 9;
        return { kind: "stream", dict, raw: this.bytes.subarray(start, end) };
      }
      this.pos = save;
      return dict;
    }

    const word = this.readRegular();
    if (word === "") {
      this.pos += 1;
      return { kind: "operator", op: String.fromCharCode(byte) };
    }
    if (word === "true") return true;
    if (word === "false") return false;
    if (word === "null") return null;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
      const value = Number(word);
      // `N G R` is a reference; `N G obj` is a definition, which the caller handles.
      if (Number.isInteger(value) && value >= 0) {
        const save = this.pos;
        this.skipSpace();
        const gen = this.readRegular();
        if (/^\d+$/.test(gen)) {
          this.skipSpace();
          if (this.readRegular() === "R") return { kind: "ref", num: value, gen: Number(gen) };
        }
        this.pos = save;
      }
      return value;
    }
    return { kind: "operator", op: word };
  }

  private findEndstream(start: number): number {
    const at = this.bytes.indexOf("endstream", start, "latin1");
    if (at === -1) throw new PdfFormatError("a stream has no endstream");
    let end = at;
    if (this.bytes[end - 1] === 0x0a) end -= 1;
    if (this.bytes[end - 1] === 0x0d) end -= 1;
    return end;
  }
}

/** Undo a PNG predictor, which cross-reference and object streams sometimes apply before Flate. */
export function undoPngPredictor(data: Buffer, colors: number, bpc: number, columns: number): Buffer {
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLength = Math.ceil((colors * bpc * columns) / 8);
  const rows = Math.floor(data.length / (rowLength + 1));
  const out = Buffer.alloc(rows * rowLength);
  let previous = Buffer.alloc(rowLength);
  for (let row = 0; row < rows; row += 1) {
    const tag = data[row * (rowLength + 1)]!;
    const line = Buffer.from(data.subarray(row * (rowLength + 1) + 1, (row + 1) * (rowLength + 1)));
    for (let i = 0; i < rowLength; i += 1) {
      const left = i >= bpp ? line[i - bpp]! : 0;
      const up = previous[i]!;
      const upLeft = i >= bpp ? previous[i - bpp]! : 0;
      let value = line[i]!;
      switch (tag) {
        case 0: break;
        case 1: value = (value + left) & 0xff; break;
        case 2: value = (value + up) & 0xff; break;
        case 3: value = (value + ((left + up) >> 1)) & 0xff; break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upLeft);
          value = (value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 0xff;
          break;
        }
        default: throw new PdfFormatError(`unsupported PNG predictor tag ${tag}`);
      }
      line[i] = value;
    }
    line.copy(out, row * rowLength);
    previous = line;
  }
  return out;
}

/** Decode a stream's bytes. Only the filters the real artifacts use are implemented. */
export function decodeStream(stream: PdfStream, resolve: (v: PdfValue) => PdfValue): Buffer {
  const filterValue = resolve(stream.dict.map.get("Filter") ?? null);
  const filters = filterValue === null ? []
    : Array.isArray(filterValue) ? filterValue.map(resolve)
    : [filterValue];
  if (filters.length === 0) return stream.raw;

  const parmsValue = resolve(stream.dict.map.get("DecodeParms") ?? stream.dict.map.get("DP") ?? null);
  const parms = Array.isArray(parmsValue) ? parmsValue.map(resolve) : [parmsValue];

  let data = stream.raw;
  filters.forEach((filter, index) => {
    if (!isName(filter)) throw new PdfFormatError("a stream filter is not a name");
    if (filter.name !== "FlateDecode" && filter.name !== "Fl") {
      throw new PdfFormatError(`unsupported stream filter ${filter.name}`);
    }
    data = inflateSync(data);
    const parm = parms[index] ?? parms[0] ?? null;
    if (!isDict(parm)) return;
    const num = (key: string, fallback: number): number => {
      const value = resolve(parm.map.get(key) ?? null);
      return typeof value === "number" ? value : fallback;
    };
    const predictor = num("Predictor", 1);
    if (predictor >= 10) data = undoPngPredictor(data, num("Colors", 1), num("BitsPerComponent", 8), num("Columns", 1));
    else if (predictor !== 1) throw new PdfFormatError(`unsupported predictor ${predictor}`);
  });
  return data;
}
