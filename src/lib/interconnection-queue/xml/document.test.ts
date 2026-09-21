import { describe, expect, it } from "vitest";

import { childText, childrenNamed, parseXml, XmlFormatError }
  from "@/lib/interconnection-queue/xml/document";

describe("the queue XML reader", () => {
  it("reads a flat record feed in document order", () => {
    const root = parseXml(`<?xml version="1.0" encoding="UTF-8"?>
      <Projects>
        <Project><ProjectNumber>A01</ProjectNumber><Status>In Service</Status></Project>
        <Project><ProjectNumber>B02</ProjectNumber><Status>Withdrawn</Status></Project>
      </Projects>`);
    expect(root.name).toBe("Projects");
    const projects = childrenNamed(root, "Project");
    expect(projects.map((project) => childText(project, "ProjectNumber"))).toEqual(["A01", "B02"]);
  });

  it("treats an absent element and an empty one as the same absence", () => {
    // PJM writes both for "no date", and they mean one thing.
    const root = parseXml("<P><A>x</A><B/><C>   </C></P>");
    expect(childText(root, "A")).toBe("x");
    expect(childText(root, "B")).toBeNull();
    expect(childText(root, "C")).toBeNull();
    expect(childText(root, "Missing")).toBeNull();
  });

  it("keeps repeated elements as repeated children rather than collapsing them", () => {
    const root = parseXml("<P><Fuel>Solar</Fuel><Fuel>Storage</Fuel></P>");
    expect(childrenNamed(root, "Fuel").map((child) => child.text)).toEqual(["Solar", "Storage"]);
    // The convenience accessor takes the first, and the caller that cares uses childrenNamed.
    expect(childText(root, "Fuel")).toBe("Solar");
  });

  it("decodes the five predefined entities and numeric character references", () => {
    const root = parseXml("<P><N>Black &amp; Veatch &lt;LLC&gt; &quot;East&quot; &apos;1&apos;</N>"
      + "<M>&#65;&#x42;</M></P>");
    expect(childText(root, "N")).toBe("Black & Veatch <LLC> \"East\" '1'");
    expect(childText(root, "M")).toBe("AB");
  });

  it("takes CDATA literally, without decoding it again", () => {
    const root = parseXml("<P><N><![CDATA[Raw & <unescaped>]]></N></P>");
    expect(childText(root, "N")).toBe("Raw & <unescaped>");
  });

  it("reads attributes, single or double quoted, and rejects a repeated one", () => {
    const root = parseXml(`<P a="1" b='2'/>`);
    expect(root.attributes).toEqual({ a: "1", b: "2" });
    expect(() => parseXml(`<P a="1" a="2"/>`)).toThrow(XmlFormatError);
  });

  it("is deterministic: the same bytes give the same tree every time", () => {
    const source = "<P><A>1</A><B>2</B><A>3</A></P>";
    const first = JSON.stringify(parseXml(source));
    const second = JSON.stringify(parseXml(source));
    expect(first).toBe(second);
  });

  it("skips comments, processing instructions and a byte-order mark", () => {
    const root = parseXml("﻿<?xml version=\"1.0\"?><!-- a note --><P><A>1</A></P>");
    expect(childText(root, "A")).toBe("1");
  });
});

describe("what the reader refuses", () => {
  it("refuses a document type declaration rather than skipping it", () => {
    // The whole class of XML entity attacks starts with a parser that tolerates one of these.
    expect(() => parseXml(`<!DOCTYPE foo [<!ENTITY x "y">]><P/>`)).toThrow(/document type or entity declaration/);
  });

  it("refuses an entity it did not define, rather than resolving it", () => {
    expect(() => parseXml("<P><A>&xxe;</A></P>")).toThrow(/undefined entity reference/);
  });

  it("refuses a character reference outside Unicode", () => {
    expect(() => parseXml("<P><A>&#99999999;</A></P>")).toThrow(/outside Unicode/);
  });

  it("fails explicitly on mismatched, unclosed and stray tags", () => {
    expect(() => parseXml("<A><B></A></B>")).toThrow(/closes/);
    expect(() => parseXml("<A><B></B>")).toThrow(/never closed/);
    expect(() => parseXml("</A>")).toThrow(/no open element/);
  });

  it("fails on an unterminated comment, CDATA section or entity", () => {
    expect(() => parseXml("<A><!-- x </A>")).toThrow(/unterminated comment/);
    expect(() => parseXml("<A><![CDATA[x</A>")).toThrow(/unterminated CDATA/);
    expect(() => parseXml("<A>&amp</A>")).toThrow(/unterminated entity/);
  });

  it("fails on a malformed or unquoted attribute", () => {
    expect(() => parseXml("<A b=1/>")).toThrow(/not quoted/);
    expect(() => parseXml("<A b/>")).toThrow(/has no value/);
  });

  it("fails on text outside the root and on a second root", () => {
    expect(() => parseXml("junk<A/>")).toThrow(/outside the root/);
    expect(() => parseXml("<A/><B/>")).toThrow(/second root/);
  });

  it("fails on an empty document rather than returning something empty", () => {
    expect(() => parseXml("   ")).toThrow(/no element/);
  });

  it("reports where it failed, so a 22 MB feed is debuggable", () => {
    try {
      parseXml("<A><B></A></B>");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(XmlFormatError);
      expect((error as XmlFormatError).message).toMatch(/at offset \d+/);
    }
  });
});
