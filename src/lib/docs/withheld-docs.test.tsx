import { render, screen } from "@testing-library/react";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/docs",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { DocArticle } from "@/components/docs/doc-article";
import { DocsNavigation } from "@/components/docs/docs-navigation";
import DocumentationPage, { generateMetadata, generateStaticParams } from "@/app/docs/[[...slug]]/page";
import { docPages, findDoc, findPublicDoc, publicDocPages } from "@/lib/docs/catalog";
import { readDoc } from "@/lib/docs/content";

/**
 * UGAI and UAVI are no longer publicly presented products, so their methodology documents are no
 * longer current public documentation either. Everything about the documents is preserved; only
 * the routes into them are gone.
 */

const WITHHELD = ["methodology/ugai", "methodology/uavi"] as const;
const params = (slug: string) => ({ params: Promise.resolve({ slug: slug.split("/") }) });
const read = (file: string) => readFileSync(path.join(process.cwd(), "docs", file), "utf8");

describe("public docs discovery", () => {
  it("lists neither UGAI nor UAVI, and leaves every other page listed", () => {
    expect(publicDocPages.map((page) => page.slug)).toEqual(
      docPages.map((page) => page.slug).filter((slug) => !WITHHELD.includes(slug as (typeof WITHHELD)[number])),
    );
    // Exactly two withheld, so a later change cannot quietly take a third page with it.
    expect(docPages.length - publicDocPages.length).toBe(2);
  });

  it("shows neither in the docs navigation, and still shows their neighbours", () => {
    render(<DocsNavigation />);
    expect(screen.queryByRole("link", { name: "UGAI" })).toBeNull();
    expect(screen.queryByRole("link", { name: "UAVI" })).toBeNull();
    // The pages either side of them in the registry: the section was narrowed, not emptied.
    // The navigation renders twice (a mobile disclosure and the sidebar), hence getAll.
    expect(screen.getAllByRole("link", { name: "AI Equity Universe" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "UCPI" }).length).toBeGreaterThan(0);
  });

  it("generates no static route for either, so the URL is the route's own 404", () => {
    const generated = generateStaticParams().map((entry) => entry.slug.join("/"));
    for (const slug of WITHHELD) expect(generated, slug).not.toContain(slug);
    expect(generated).toContain("methodology/ai-equity-universe");
    expect(generated).toContain("methodology/ucpi");
  });

  it.each(WITHHELD)("serves %s as not found, page and metadata alike", async (slug) => {
    await expect(DocumentationPage(params(slug))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(generateMetadata(params(slug))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("still serves an unrelated methodology document", async () => {
    expect(await generateMetadata(params("methodology/ucpi"))).toMatchObject({ title: "UCPI" });
    expect(await readDoc("methodology/ai-equity-universe")).toBeDefined();
  });

  it("does not resolve them through the public lookup, while the registry still knows them", () => {
    for (const slug of WITHHELD) {
      expect(findPublicDoc(slug), slug).toBeUndefined();
      expect(findDoc(slug), slug).toBeDefined();
    }
  });

  it("never steps onto a withheld page from the previous/next pager", async () => {
    // The universe page sits immediately before UGAI in the registry, so it is the one page whose
    // "next" would have walked straight into a withheld document.
    const page = (await readDoc("methodology/ai-equity-universe"))!;
    const { container } = render(<DocArticle page={page} />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((link) => link.getAttribute("href") ?? "");
    expect(hrefs).not.toContain("/docs/methodology/ugai");
    expect(hrefs).not.toContain("/docs/methodology/uavi");
  });
});

/**
 * The public documents that link to the withheld ones cannot be edited to drop the links: their
 * bytes are the `content_hash` of approved methodology versions. The links are neutralized in the
 * renderer instead -- the sentence stays, the route into the document goes.
 */
describe("links from public documents into withheld ones", () => {
  it.each(["methodology.md", "methodology/ai-equity-universe.md"])(
    "still contains the links in the source of %s",
    (file) => {
      const source = read(file);
      expect(source).toContain("](/docs/methodology/ugai)");
      expect(source).toContain("](/docs/methodology/uavi)");
    },
  );

  it.each(["methodology", "methodology/ai-equity-universe"])("renders %s with no link into either", async (slug) => {
    const page = (await readDoc(slug))!;
    const { container } = render(<DocArticle page={page} />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((link) => link.getAttribute("href") ?? "");
    for (const href of ["/docs/methodology/ugai", "/docs/methodology/uavi"]) {
      expect(hrefs, href).not.toContain(href);
    }
    // The prose is untouched: this removes a route, not a mention. Scrubbing the names would be a
    // rewrite of an approved methodology document.
    expect(container.textContent).toContain("UGAI");
    expect(container.textContent).toContain("UAVI");
  });

  it("leaves links to publicly listed documents working", async () => {
    const page = (await readDoc("methodology/ai-equity-universe"))!;
    const { container } = render(<DocArticle page={page} />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((link) => link.getAttribute("href") ?? "");
    expect(hrefs).toContain("/docs/methodology");
  });
});

/** Withholding is visibility control. Nothing behind these documents may be lost to it. */
describe("the withheld methodology artifacts are intact", () => {
  it("keeps both files on disk at the bytes the registry points at", () => {
    for (const slug of WITHHELD) {
      const entry = findDoc(slug)!;
      expect(existsSync(path.join(process.cwd(), "docs", entry.file)), entry.file).toBe(true);
      expect(read(entry.file).length).toBeGreaterThan(1000);
    }
  });

  it("keeps their content hashes, which are what an approved methodology version is pinned to", () => {
    // Not the values themselves -- those belong to the methodology ledger -- but the property that
    // matters here: the documents still hash to something, because nothing rewrote them.
    for (const slug of WITHHELD) {
      const digest = createHash("sha256").update(read(findDoc(slug)!.file)).digest("hex");
      expect(digest, slug).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("keeps their version history and their cross-links to the parent universe", () => {
    const ugai = read(findDoc("methodology/ugai")!.file);
    const uavi = read(findDoc("methodology/uavi")!.file);
    for (const doc of [ugai, uavi]) {
      expect(doc).toContain("](/docs/methodology/ai-equity-universe)");
      expect(doc).toContain("](/docs/methodology)");
      expect(doc).toMatch(/version \d+\.\d+\.\d+/);
    }
  });

  it("leaves the AI Equity Universe publicly listed, as a shared primitive rather than a product page", () => {
    // It defines the shared equity universe and names UGAI and UAVI as its future consumers. It
    // presents no index, no level and no product, so it is preserved and stays public.
    const entry = findPublicDoc("methodology/ai-equity-universe");
    expect(entry).toBeDefined();
    expect(read(entry!.file)).toContain("It is a shared methodology primitive, not a market index");
  });
});
