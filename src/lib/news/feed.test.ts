import { describe, expect, it } from "vitest";

import { decodeEntities, elementText, parseFeed, stripMarkup } from "@/lib/news/feed";
import { loadFeedFixture } from "@/lib/news/fixtures";
import { MalformedFeedError } from "@/lib/news/types";

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example</title>
  <entry>
    <title>Capacity comes online</title>
    <link rel="self" href="https://example.com/feed"/>
    <link rel="alternate" href="https://example.com/a"/>
    <id>tag:example.com,2026:a</id>
    <summary>A short summary.</summary>
    <published>2026-09-12T10:00:00Z</published>
  </entry>
  <entry>
    <title>Only updated</title>
    <link href="https://example.com/b"/>
    <id>tag:example.com,2026:b</id>
    <updated>2026-09-11T09:00:00Z</updated>
  </entry>
</feed>`;

describe("entity and markup handling", () => {
  it("resolves named and numeric references without double-decoding", () => {
    expect(decodeEntities("AT&amp;T &#8212; &#x201c;yes&#x201d;")).toBe("AT&T — “yes”");
    // A doubly escaped sequence decodes to the escape, not past it.
    expect(decodeEntities("&amp;lt;p&amp;gt;")).toBe("&lt;p&gt;");
    expect(decodeEntities("&notareal;")).toBe("&notareal;");
  });

  it("turns markup into readable text with block boundaries preserved as spaces", () => {
    expect(stripMarkup("<p>One</p><p>Two</p>")).toBe("One Two");
    expect(stripMarkup("<span>Spaced   out</span>\n\n<br/>end")).toBe("Spaced out end");
    // stripMarkup is handed markup, not escaped markup: elementText has already
    // undone the XML escaping. Text that only looks like a tag stays text.
    expect(stripMarkup("&lt;b&gt;bold&lt;/b&gt;")).toBe("<b>bold</b>");
  });

  it("removes markup from a description end to end, through both decodings", () => {
    const item = "<item><description>&lt;p&gt;A &amp;amp; B&lt;/p&gt;</description></item>";
    expect(stripMarkup(elementText(item, "description")!)).toBe("A & B");
  });
});

describe("RSS", () => {
  it("reads title, link, guid, description, date and a media thumbnail", () => {
    const parsed = parseFeed(loadFeedFixture("coreweave-blog").body, "rss");
    expect(parsed.entries.length).toBe(4);
    const first = parsed.entries[0]!;
    expect(first.title).toBe("An AI Cloud Platform Requires More Than Renting GPUs");
    expect(first.link).toBe("https://wf.coreweave.com/blog/an-ai-cloud-platform-requires-more-than-renting-gpus");
    expect(first.guid).toBe(first.link);
    expect(first.description).toContain("GPU rental");
    expect(first.published).toBe("Sat, 12 Sep 2026 19:24:20 GMT");
    expect(first.imageUrl).toMatch(/^https:\/\/cdn\.prod\.website-files\.com\//);
  });

  it("unwraps CDATA and keeps a non-permalink guid distinct from the link", () => {
    const parsed = parseFeed(loadFeedFixture("microsoft-azure-blog").body, "rss");
    const first = parsed.entries[0]!;
    expect(first.title).toBe(
      "Microsoft named a Leader in the 2026 Gartner® Magic Quadrant™ for Container Management",
    );
    expect(first.guid).toBe("https://azure.microsoft.com/en-us/blog/?p=53828");
    expect(first.guid).not.toBe(first.link);
    expect(first.description?.startsWith("<p>")).toBe(true);
  });

  it("does not mistake the channel title for an item title", () => {
    const parsed = parseFeed(loadFeedFixture("google-cloud-infrastructure").body, "rss");
    expect(parsed.feedTitle).toBe("Infrastructure");
    expect(parsed.entries.every((entry) => entry.title !== "Infrastructure")).toBe(true);
  });
});

describe("Atom", () => {
  it("prefers the alternate link over self and falls back to updated", () => {
    const parsed = parseFeed(ATOM, "atom");
    expect(parsed.entries.map((entry) => entry.link)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
    expect(parsed.entries[0]!.published).toBe("2026-09-12T10:00:00Z");
    expect(parsed.entries[1]!.published).toBe("2026-09-11T09:00:00Z");
    expect(parsed.entries[0]!.guid).toBe("tag:example.com,2026:a");
  });
});

describe("malformed input", () => {
  it("refuses a body that is not the document it claims to be", () => {
    expect(() => parseFeed("<html><body>404</body></html>", "rss")).toThrow(MalformedFeedError);
    expect(() => parseFeed("", "rss")).toThrow(MalformedFeedError);
    expect(() => parseFeed("<rss version=\"2.0\"><channel></channel></rss>", "atom")).toThrow(MalformedFeedError);
  });

  it("loses only the broken entry when a feed is truncated mid-item", () => {
    const truncated = `<rss version="2.0"><channel><title>T</title>
      <item><title>Good</title><link>https://example.com/good</link><pubDate>Fri, 11 Sep 2026 09:00:00 GMT</pubDate></item>
      <item><title>Cut off</title><link>https://example.com/bad`;
    const parsed = parseFeed(truncated, "rss");
    expect(parsed.entries.map((entry) => entry.title)).toEqual(["Good"]);
  });

  it("returns no entries rather than throwing for a well-formed empty feed", () => {
    expect(parseFeed('<rss version="2.0"><channel><title>T</title></channel></rss>', "rss").entries).toEqual([]);
  });
});
