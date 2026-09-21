/**
 * The text layer of a PDF, page by page.
 *
 * This reads what a publisher wrote into the file as characters. It does not look at images, and
 * there is deliberately no optical recognition anywhere in this repository: a table that was
 * printed to a picture is a table Urdais cannot read, and saying so is the correct outcome.
 *
 * Text comes back with its spacing approximated, because a PDF does not record spaces so much as
 * distances. Callers that need to match exact wording should compare with whitespace removed from
 * both sides — `squeeze` does that — which makes the match independent of how the typesetter
 * chose to kern a line.
 */

import {
  PdfFormatError, PdfLexer, decodeStream, isDict, isName, isOperator, isRef, isStream,
  type PdfDict, type PdfStream, type PdfValue,
} from "@/lib/power-delivery/pdf/objects";

/** Text with every run of whitespace removed, for wording comparisons that ignore layout. */
export function squeeze(text: string): string {
  return text.replace(/\s+/g, "");
}

type FontDecoder = { width: 1 | 2; map: Map<number, string> };

export class PdfDocument {
  private readonly cache = new Map<number, PdfValue>();

  private constructor(
    private readonly bytes: Buffer,
    private readonly offsets: Map<number, number>,
    private readonly embedded: Map<number, PdfValue>,
    readonly pages: PdfDict[],
  ) {}

  static open(bytes: Buffer): PdfDocument {
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new PdfFormatError("the file does not begin with %PDF-");
    }
    if (bytes.includes("/Encrypt", 0, "latin1")) {
      throw new PdfFormatError("the document is encrypted, and this reader does not decrypt");
    }
    const offsets = findObjectOffsets(bytes);
    const document = new PdfDocument(bytes, offsets, new Map(), []);
    document.expandObjectStreams();
    const pages = document.collectPages();
    return new PdfDocument(bytes, offsets, document.embedded, pages);
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /** Follow indirect references until a direct value is reached. */
  resolve = (value: PdfValue): PdfValue => {
    let current = value;
    for (let hops = 0; hops < 64; hops += 1) {
      if (!isRef(current)) return current;
      current = this.object(current.num);
    }
    throw new PdfFormatError("an indirect reference chain does not terminate");
  };

  private object(num: number): PdfValue {
    const cached = this.cache.get(num);
    if (cached !== undefined) return cached;
    const embedded = this.embedded.get(num);
    if (embedded !== undefined) { this.cache.set(num, embedded); return embedded; }
    const offset = this.offsets.get(num);
    if (offset === undefined) return null;
    const lexer = new PdfLexer(this.bytes, offset);
    lexer.parseObject(); // object number
    lexer.parseObject(); // generation
    lexer.parseObject(); // the `obj` keyword
    // Guard against a cycle where a stream's /Length points back at an object being parsed.
    this.cache.set(num, null);
    const value = lexer.parseObject((ref) => this.resolve(ref));
    this.cache.set(num, value);
    return value;
  }

  private dictOf(value: PdfValue): PdfDict | null {
    const resolved = this.resolve(value);
    if (isDict(resolved)) return resolved;
    if (isStream(resolved)) return resolved.dict;
    return null;
  }

  private get(dict: PdfDict, key: string): PdfValue {
    return this.resolve(dict.map.get(key) ?? null);
  }

  private nameOf(dict: PdfDict, key: string): string | null {
    const value = this.get(dict, key);
    return isName(value) ? value.name : null;
  }

  /** Objects stored inside compressed object streams, which a byte scan cannot see. */
  private expandObjectStreams(): void {
    for (const num of [...this.offsets.keys()]) {
      let value: PdfValue;
      try { value = this.object(num); } catch { continue; }
      if (!isStream(value) || this.nameOf(value.dict, "Type") !== "ObjStm") continue;
      let data: Buffer;
      try { data = decodeStream(value, this.resolve); } catch { continue; }
      const count = this.get(value.dict, "N");
      const first = this.get(value.dict, "First");
      if (typeof count !== "number" || typeof first !== "number") continue;

      const header = new PdfLexer(data, 0);
      const entries: { num: number; offset: number }[] = [];
      for (let i = 0; i < count; i += 1) {
        const objectNumber = header.parseObject();
        const objectOffset = header.parseObject();
        if (typeof objectNumber !== "number" || typeof objectOffset !== "number") break;
        entries.push({ num: objectNumber, offset: objectOffset });
      }
      for (const entry of entries) {
        // A definition found by the byte scan is a later incremental update and takes precedence.
        if (this.offsets.has(entry.num) || this.embedded.has(entry.num)) continue;
        try {
          this.embedded.set(entry.num, new PdfLexer(data, first + entry.offset).parseObject());
        } catch { /* a single unreadable object does not condemn the file */ }
      }
    }
    this.cache.clear();
  }

  /** Pages in reading order, with inheritable attributes pushed down onto each leaf. */
  private collectPages(): PdfDict[] {
    const roots: PdfDict[] = [];
    const every = [...this.offsets.keys(), ...this.embedded.keys()];
    for (const num of every) {
      let value: PdfValue;
      try { value = this.object(num); } catch { continue; }
      const dict = isDict(value) ? value : null;
      if (dict !== null && this.nameOf(dict, "Type") === "Catalog") {
        const pages = this.dictOf(dict.map.get("Pages") ?? null);
        if (pages !== null) roots.push(pages);
      }
    }
    const out: PdfDict[] = [];
    const seen = new Set<PdfDict>();
    const INHERITED = ["Resources", "MediaBox", "CropBox", "Rotate"] as const;

    const walk = (node: PdfDict, inherited: Map<string, PdfValue>, depth: number): void => {
      if (depth > 64 || seen.has(node)) return;
      seen.add(node);
      const carried = new Map(inherited);
      for (const key of INHERITED) {
        const value = node.map.get(key);
        if (value !== undefined) carried.set(key, value);
      }
      const type = this.nameOf(node, "Type");
      const kids = this.get(node, "Kids");
      if (type === "Page" || (!Array.isArray(kids) && node.map.has("Contents"))) {
        const page: PdfDict = { kind: "dict", map: new Map(node.map) };
        for (const [key, value] of carried) if (!page.map.has(key)) page.map.set(key, value);
        out.push(page);
        return;
      }
      if (!Array.isArray(kids)) return;
      for (const kid of kids) {
        const child = this.dictOf(kid);
        if (child !== null) walk(child, carried, depth + 1);
      }
    };

    for (const root of roots) walk(root, new Map(), 0);
    if (out.length === 0) {
      // No catalog: fall back to every object that calls itself a page, in object order.
      for (const num of every.sort((a, b) => a - b)) {
        const value = this.object(num);
        if (isDict(value) && this.nameOf(value, "Type") === "Page") out.push(value);
      }
    }
    return out;
  }

  /** The text of one page, 1-indexed, in the order the content stream draws it. */
  pageText(pageNumber: number): string {
    const page = this.pages[pageNumber - 1];
    if (page === undefined) throw new PdfFormatError(`the document has no page ${pageNumber}`);
    const resources = this.dictOf(page.map.get("Resources") ?? null);
    return this.textOf(this.pageContent(page), resources, 0, new Set());
  }

  /**
   * Text drawn by one content stream, following the form XObjects it invokes.
   *
   * Following them matters: a table pasted into a report is routinely a form XObject with its own
   * resources, and a reader that stops at the page content sees the prose around the table and
   * none of the numbers in it.
   */
  private textOf(content: Buffer, resources: PdfDict | null, depth: number, seen: Set<PdfStream>): string {
    const fonts = this.fontsOf(resources);
    const forms = new Map<string, PdfStream>();
    if (depth < 8 && resources !== null) {
      const xobjects = this.dictOf(resources.map.get("XObject") ?? null);
      if (xobjects !== null) {
        for (const [name, value] of xobjects.map) {
          const stream = this.resolve(value);
          if (isStream(stream) && this.nameOf(stream.dict, "Subtype") === "Form" && !seen.has(stream)) {
            forms.set(name, stream);
          }
        }
      }
    }
    return extractText(content, fonts, (name) => {
      const form = forms.get(name);
      if (form === undefined) return null;
      seen.add(form);
      let data: Buffer;
      try { data = decodeStream(form, this.resolve); } catch { return null; }
      const own = this.dictOf(form.dict.map.get("Resources") ?? null) ?? resources;
      return this.textOf(data, own, depth + 1, seen);
    });
  }

  private pageContent(page: PdfDict): Buffer {
    const contents = this.get(page, "Contents");
    const streams: PdfStream[] = [];
    const push = (value: PdfValue): void => {
      const resolved = this.resolve(value);
      if (isStream(resolved)) streams.push(resolved);
    };
    if (Array.isArray(contents)) contents.forEach(push);
    else push(contents);
    const parts = streams.map((stream) => {
      try { return decodeStream(stream, this.resolve); } catch { return Buffer.alloc(0); }
    });
    return Buffer.concat(parts.flatMap((part) => [part, Buffer.from("\n")]));
  }

  private fontsOf(resources: PdfDict | null): Map<string, FontDecoder> {
    const decoders = new Map<string, FontDecoder>();
    if (resources === null) return decoders;
    const fontDict = this.dictOf(resources.map.get("Font") ?? null);
    if (fontDict === null) return decoders;
    for (const [name, value] of fontDict.map) {
      const font = this.dictOf(value);
      if (font === null) continue;
      decoders.set(name, this.fontDecoder(font));
    }
    return decoders;
  }

  private fontDecoder(font: PdfDict): FontDecoder {
    const subtype = this.nameOf(font, "Subtype");
    const encoding = this.nameOf(font, "Encoding");
    // A composite font addresses glyphs by two-byte code; a simple font always by one.
    //
    // The font's own type decides this, never the CMap. Word and Acrobat routinely emit a
    // ToUnicode CMap declaring a <0000> <FFFF> codespace on a plain one-byte TrueType font, and
    // believing that declaration reads every pair of letters as one unmapped glyph — which is to
    // say it turns the whole document into replacement characters.
    const composite = subtype === "Type0" || encoding === "Identity-H" || encoding === "Identity-V";
    const width: 1 | 2 = composite ? 2 : 1;
    const toUnicode = this.resolve(font.map.get("ToUnicode") ?? null);
    if (isStream(toUnicode)) {
      try {
        const parsed = parseToUnicode(decodeStream(toUnicode, this.resolve));
        return { width: composite ? parsed.width ?? width : 1, map: parsed.map };
      } catch { /* fall through to the raw encoding below */ }
    }
    return { width, map: new Map() };
  }
}

/** Every `N G obj` in the file. A later definition replaces an earlier one, as an update should. */
function findObjectOffsets(bytes: Buffer): Map<number, number> {
  const offsets = new Map<number, number>();
  const text = bytes.toString("latin1");
  const pattern = /(?:^|[\s>\]])(\d{1,10})\s+(\d{1,5})\s+obj\b/g;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    const start = match.index + match[0].length - `${match[1]} ${match[2]} obj`.length;
    offsets.set(Number(match[1]), Math.max(0, start));
  }
  return offsets;
}

/** A ToUnicode CMap: which character codes stand for which characters. */
function parseToUnicode(data: Buffer): { width: 1 | 2 | null; map: Map<number, string> } {
  const map = new Map<number, string>();
  let width: 1 | 2 | null = null;
  const lexer = new PdfLexer(data, 0);
  const stack: PdfValue[] = [];
  const codeOf = (value: PdfValue): number | null => {
    if (typeof value !== "string") return null;
    let code = 0;
    for (let i = 0; i < value.length; i += 1) code = (code << 8) | (value.charCodeAt(i) & 0xff);
    return code;
  };
  const textOf = (value: PdfValue): string | null => {
    if (typeof value !== "string") return null;
    // UTF-16BE, which is what a ToUnicode destination always is.
    let out = "";
    for (let i = 0; i + 1 < value.length; i += 2) {
      out += String.fromCharCode(((value.charCodeAt(i) & 0xff) << 8) | (value.charCodeAt(i + 1) & 0xff));
    }
    if (value.length === 1) out = value;
    return out;
  };

  while (!lexer.atEnd()) {
    let value: PdfValue;
    try { value = lexer.parseObject(); } catch { break; }
    if (!isOperator(value)) { stack.push(value); if (stack.length > 600) stack.shift(); continue; }
    switch (value.op) {
      case "endcodespacerange": {
        for (const entry of stack) {
          if (typeof entry === "string" && (entry.length === 1 || entry.length === 2)) {
            width = entry.length as 1 | 2;
            break;
          }
        }
        stack.length = 0;
        break;
      }
      case "endbfchar": {
        for (let i = 0; i + 1 < stack.length; i += 2) {
          const code = codeOf(stack[i]!);
          const text = textOf(stack[i + 1]!);
          if (code !== null && text !== null) map.set(code, text);
        }
        stack.length = 0;
        break;
      }
      case "endbfrange": {
        for (let i = 0; i + 2 < stack.length; i += 3) {
          const low = codeOf(stack[i]!);
          const high = codeOf(stack[i + 1]!);
          const destination = stack[i + 2]!;
          if (low === null || high === null || high < low || high - low > 65_535) continue;
          if (Array.isArray(destination)) {
            destination.forEach((item, index) => {
              const text = textOf(item);
              if (text !== null) map.set(low + index, text);
            });
            continue;
          }
          const text = textOf(destination);
          if (text === null || text.length === 0) continue;
          const base = text.charCodeAt(text.length - 1);
          for (let code = low; code <= high; code += 1) {
            map.set(code, text.slice(0, -1) + String.fromCharCode(base + (code - low)));
          }
        }
        stack.length = 0;
        break;
      }
      case "begincodespacerange": case "beginbfchar": case "beginbfrange":
        stack.length = 0;
        break;
      default:
        break;
    }
  }
  return { width, map };
}

/**
 * A TJ displacement below this many thousandths of an em is read as a word gap rather than as
 * kerning. It affects only how the text reads; callers comparing wording remove whitespace first.
 */
const WORD_GAP = -150;

/** Walk a content stream and collect what the text operators draw. */
function extractText(
  content: Buffer,
  fonts: ReadonlyMap<string, FontDecoder>,
  form: (name: string) => string | null,
): string {
  const lexer = new PdfLexer(content, 0);
  const operands: PdfValue[] = [];
  let out = "";
  let font: FontDecoder | null = null;

  const show = (value: PdfValue): void => {
    if (typeof value !== "string") return;
    if (font === null || font.map.size === 0) {
      // No ToUnicode: the codes are their own characters, which is true for the simple
      // encodings a report uses and visibly wrong if it is ever not, rather than silently so.
      out += value.replace(/[ --]/g, "");
      return;
    }
    for (let i = 0; i + font.width - 1 < value.length; i += font.width) {
      let code = 0;
      for (let b = 0; b < font.width; b += 1) code = (code << 8) | (value.charCodeAt(i + b) & 0xff);
      // An unmapped code becomes a replacement character, so a caller matching exact wording
      // fails to match rather than quietly accepting a wrong letter.
      out += font.map.get(code) ?? "�";
    }
  };

  while (!lexer.atEnd()) {
    let value: PdfValue;
    try { value = lexer.parseObject(); } catch { break; }
    if (!isOperator(value)) {
      operands.push(value);
      if (operands.length > 500) operands.shift();
      continue;
    }
    switch (value.op) {
      case "Tf": {
        const name = operands[operands.length - 2] ?? null;
        font = isName(name) ? fonts.get(name.name) ?? null : null;
        break;
      }
      case "Tj": show(operands[operands.length - 1] ?? null); break;
      case "'": out += "\n"; show(operands[operands.length - 1] ?? null); break;
      case '"': out += "\n"; show(operands[operands.length - 1] ?? null); break;
      case "TJ": {
        const array = operands[operands.length - 1];
        if (Array.isArray(array)) {
          for (const item of array) {
            if (typeof item === "number") { if (item <= WORD_GAP) out += " "; continue; }
            show(item);
          }
        }
        break;
      }
      case "Td": case "TD": case "T*": case "Tm": out += "\n"; break;
      case "ET": out += "\n"; break;
      case "Do": {
        const name = operands[operands.length - 1] ?? null;
        if (isName(name)) {
          const nested = form(name.name);
          if (nested !== null) out += `\n${nested}\n`;
        }
        break;
      }
      default: break;
    }
    operands.length = 0;
  }
  return out;
}
