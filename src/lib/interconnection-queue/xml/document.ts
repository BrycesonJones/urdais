/**
 * A deliberately small XML reader for queue feeds.
 *
 * PJM publishes its whole planning queue as a 22 MB XML document of flat records. That needs a
 * reader, and it does not need an XML framework: there are no namespaces to resolve, no schema to
 * validate against, and no mixed content. What it does need is to be safe and to fail loudly.
 *
 * Safety here means one thing above all: this reader resolves nothing. A DOCTYPE, an entity
 * declaration or an external reference is rejected outright rather than ignored, because the whole
 * class of XML attacks — entity expansion, external entity fetches, parameter entities — begins
 * with a parser that tries to be helpful about them. Only the five predefined entities and
 * numeric character references are decoded, and numeric references are bounded.
 *
 * Determinism means child order is preserved exactly as written, and repeated element names are
 * kept as repeated children rather than collapsed into a map. A feed that lists two <Fuel>
 * elements is saying something different from one that lists a single comma-joined value, and a
 * reader that silently picked the last one would erase the difference.
 */

export class XmlFormatError extends Error {
  constructor(message: string, readonly offset?: number) {
    super(offset === undefined ? message : `${message} (at offset ${offset})`);
    this.name = "XmlFormatError";
  }
}

export type XmlElement = {
  name: string;
  attributes: Readonly<Record<string, string>>;
  children: readonly XmlElement[];
  /** Concatenated direct text, with surrounding whitespace trimmed. */
  text: string;
};

const PREDEFINED = new Map([["lt", "<"], ["gt", ">"], ["amp", "&"], ["apos", "'"], ["quot", '"']]);
const NAME_START = /[A-Za-z_:]/;
const NAME_CHAR = /[-A-Za-z0-9_:.]/;

/** Decode the five predefined entities and numeric character references. Nothing else exists. */
function decode(raw: string, offset: number): string {
  if (!raw.includes("&")) return raw;
  let out = "";
  let i = 0;
  while (i < raw.length) {
    const amp = raw.indexOf("&", i);
    if (amp === -1) { out += raw.slice(i); break; }
    out += raw.slice(i, amp);
    const end = raw.indexOf(";", amp);
    if (end === -1 || end - amp > 12) {
      throw new XmlFormatError("an unterminated entity reference", offset + amp);
    }
    const body = raw.slice(amp + 1, end);
    const predefined = PREDEFINED.get(body);
    if (predefined !== undefined) {
      out += predefined;
    } else if (body.startsWith("#")) {
      const hex = body.startsWith("#x") || body.startsWith("#X");
      const digits = hex ? body.slice(2) : body.slice(1);
      if (!(hex ? /^[0-9a-fA-F]+$/ : /^[0-9]+$/).test(digits)) {
        throw new XmlFormatError(`a malformed character reference &${body};`, offset + amp);
      }
      const code = Number.parseInt(digits, hex ? 16 : 10);
      if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) {
        throw new XmlFormatError(`a character reference outside Unicode &${body};`, offset + amp);
      }
      out += String.fromCodePoint(code);
    } else {
      // A named entity this reader does not define. Resolving it would mean honouring a
      // declaration, which is exactly what is refused.
      throw new XmlFormatError(`an undefined entity reference &${body};`, offset + amp);
    }
    i = end + 1;
  }
  return out;
}

/** Parse a whole document and return its root element. */
export function parseXml(source: string): XmlElement {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  let i = 0;

  const fail = (message: string): never => { throw new XmlFormatError(message, i); };

  const readName = (): string => {
    const start = i;
    if (i >= text.length || !NAME_START.test(text[i]!)) fail("an element name was expected");
    i += 1;
    while (i < text.length && NAME_CHAR.test(text[i]!)) i += 1;
    return text.slice(start, i);
  };

  const skipSpace = () => { while (i < text.length && /\s/.test(text[i]!)) i += 1; };

  type Frame = { name: string; attributes: Record<string, string>; children: XmlElement[]; text: string };
  const stack: Frame[] = [];
  let root: XmlElement | undefined;

  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt === -1) {
      if (text.slice(i).trim() !== "") fail("text outside the root element");
      break;
    }
    if (lt > i) {
      const chunk = text.slice(i, lt);
      const frame = stack.at(-1);
      if (frame === undefined) {
        if (chunk.trim() !== "") fail("text outside the root element");
      } else {
        frame.text += decode(chunk, i);
      }
    }
    i = lt;

    if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      if (end === -1) fail("an unterminated comment");
      i = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", i)) {
      const end = text.indexOf("]]>", i + 9);
      if (end === -1) fail("an unterminated CDATA section");
      const frame = stack.at(-1);
      if (frame === undefined) fail("a CDATA section outside the root element");
      // CDATA is literal by definition: it is not decoded.
      frame!.text += text.slice(i + 9, end);
      i = end + 3;
      continue;
    }
    if (text.startsWith("<?", i)) {
      const end = text.indexOf("?>", i + 2);
      if (end === -1) fail("an unterminated processing instruction");
      i = end + 2;
      continue;
    }
    if (text.startsWith("<!", i)) {
      // DOCTYPE, ENTITY, and anything else declarative. Refused rather than skipped: a reader
      // that skips a DOCTYPE quietly accepts a document written to exploit one.
      fail("a document type or entity declaration, which this reader refuses to process");
    }

    if (text.startsWith("</", i)) {
      i += 2;
      const name = readName();
      skipSpace();
      if (text[i] !== ">") fail("a malformed closing tag");
      i += 1;
      const frame = stack.pop();
      if (frame === undefined) fail(`a closing tag </${name}> with no open element`);
      if (frame!.name !== name) fail(`</${name}> closes <${frame!.name}>`);
      const element: XmlElement = {
        name: frame!.name,
        attributes: frame!.attributes,
        children: frame!.children,
        text: frame!.text.trim(),
      };
      const parent = stack.at(-1);
      if (parent === undefined) {
        if (root !== undefined) fail("a second root element");
        root = element;
      } else {
        parent.children.push(element);
      }
      continue;
    }

    i += 1;
    const name = readName();
    const attributes: Record<string, string> = {};
    for (;;) {
      skipSpace();
      if (i >= text.length) fail("an unterminated start tag");
      if (text[i] === ">" || text.startsWith("/>", i)) break;
      const attrStart = i;
      const attrName = readName();
      skipSpace();
      if (text[i] !== "=") fail(`attribute ${attrName} has no value`);
      i += 1;
      skipSpace();
      const quote = text[i];
      if (quote === undefined || (quote !== '"' && quote !== "'")) {
        throw new XmlFormatError(`attribute ${attrName} is not quoted`, i);
      }
      i += 1;
      const end = text.indexOf(quote, i);
      if (end === -1) fail(`attribute ${attrName} is unterminated`);
      if (attrName in attributes) fail(`attribute ${attrName} appears twice`);
      attributes[attrName] = decode(text.slice(i, end), attrStart);
      i = end + 1;
    }

    const selfClosing = text.startsWith("/>", i);
    i += selfClosing ? 2 : 1;
    if (selfClosing) {
      const element: XmlElement = { name, attributes, children: [], text: "" };
      const parent = stack.at(-1);
      if (parent === undefined) {
        if (root !== undefined) fail("a second root element");
        root = element;
      } else {
        parent.children.push(element);
      }
    } else {
      stack.push({ name, attributes, children: [], text: "" });
    }
  }

  if (stack.length > 0) throw new XmlFormatError(`<${stack.at(-1)!.name}> is never closed`);
  if (root === undefined) throw new XmlFormatError("the document contains no element");
  return root;
}

/** Direct children with this name, in document order. */
export function childrenNamed(element: XmlElement, name: string): readonly XmlElement[] {
  return element.children.filter((child) => child.name === name);
}

/**
 * The text of the first direct child with this name, or null when absent or empty.
 *
 * Absent and empty collapse to the same answer on purpose: PJM writes both `<WithdrawnDate/>` and
 * a whitespace-only element for "no date", and treating them differently would split one meaning
 * across two representations.
 */
export function childText(element: XmlElement, name: string): string | null {
  const child = element.children.find((candidate) => candidate.name === name);
  if (child === undefined) return null;
  return child.text === "" ? null : child.text;
}
