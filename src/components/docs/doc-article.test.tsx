import { existsSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DocArticle } from "@/components/docs/doc-article";
import { docPages, publicDocPages } from "@/lib/docs/catalog";
import { readDoc } from "@/lib/docs/content";
import { getHeadings } from "@/lib/docs/markdown";

describe("repository-backed documentation", () => {
  it("renders each publicly listed source with working contents links and one page heading", async () => {
    for (const entry of publicDocPages) {
      const page = await readDoc(entry.slug);
      expect(page).toBeDefined();
      const { container, unmount } = render(<DocArticle page={page!} />);
      expect(container.querySelectorAll("h1")).toHaveLength(1);
      for (const link of container.querySelectorAll('a[href^="#"]')) {
        const id = link.getAttribute("href")!.slice(1);
        expect(container.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
      }
      expect(container.querySelector("article")?.textContent).toContain(getHeadings(page!.markdown)[0]!.text);
      unmount();
    }
  }, 15_000);

  it("does not publish unregistered files or resolve URL paths against the filesystem", async () => {
    expect(await readDoc("FRONTEND_PRD")).toBeUndefined();
    expect(await readDoc("../../package.json")).toBeUndefined();
    expect(await readDoc("methodology/indices")).toBeUndefined();
  });

  it("does not publish a withheld document, which stays registered and on disk", async () => {
    for (const slug of ["methodology/ugai", "methodology/uavi"]) {
      expect(await readDoc(slug), slug).toBeUndefined();
      // Registered, and pointing at a file that is still there: the loader refuses it, and
      // nothing about the document was removed.
      const entry = docPages.find((page) => page.slug === slug);
      expect(entry, slug).toBeDefined();
      expect(existsSync(path.join(process.cwd(), "docs", entry!.file)), entry!.file).toBe(true);
    }
  });

  it("keeps repeated formatted heading anchors unique and ignores fenced headings", () => {
    const markdown = "# Test\n\n## **Source** `quality`\n\n## Source quality\n\n```markdown\n## Not a section\n```";
    const { container } = render(<DocArticle page={{ ...docPages[0]!, markdown }} />);
    expect(getHeadings(markdown).map((heading) => heading.id)).toEqual([
      "docs-test", "docs-source-quality", "docs-source-quality-1",
    ]);
    expect(container.querySelector("#docs-source-quality")).toHaveTextContent("Source quality");
    expect(container.querySelector("#docs-source-quality-1")).toHaveTextContent("Source quality");
    expect(screen.queryByRole("heading", { name: "Not a section" })).toBeNull();
  });

  it("does not execute raw HTML or unsafe Markdown links", () => {
    const markdown = '# Test\n\n<script>alert(1)</script>\n\n[Unsafe](javascript:alert%281%29)';
    const { container } = render(<DocArticle page={{ ...docPages[0]!, markdown }} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });
});

describe("markdown tables", () => {
  const TABLE = [
    "# Test",
    "",
    "| Market | Status | Why |",
    "| --- | --- | --- |",
    "| ERCOT | `public_gap_eligible` | Both sides exist |",
    "| SPP | **blocked** | Publication prohibited |",
  ].join("\n");

  const renderMarkdown = (markdown: string) =>
    render(<DocArticle page={{ ...docPages[0]!, markdown }} />).container;

  it("renders a pipe table as a table rather than as text", () => {
    const container = renderMarkdown(TABLE);
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    // The syntax itself never reaches the reader.
    expect(container.querySelector("article")?.textContent).not.toContain("| --- |");
    expect(container.querySelector("article")?.textContent).not.toContain("| Market |");
  });

  it("separates the header row from the body rows", () => {
    const container = renderMarkdown(TABLE);
    const headers = [...container.querySelectorAll("thead th")].map((cell) => cell.textContent);
    expect(headers).toEqual(["Market", "Status", "Why"]);

    const body = [...container.querySelectorAll("tbody tr")];
    expect(body).toHaveLength(2);
    expect(body.map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent))).toEqual([
      ["ERCOT", "public_gap_eligible", "Both sides exist"],
      ["SPP", "blocked", "Publication prohibited"],
    ]);
    // The header cells are th, and the body cells are not.
    expect(container.querySelectorAll("tbody th")).toHaveLength(0);
    expect(container.querySelectorAll("thead td")).toHaveLength(0);
  });

  it("renders the inline Markdown the approved documents use inside cells", () => {
    const container = renderMarkdown(TABLE);
    expect(container.querySelector("tbody code")?.textContent).toBe("public_gap_eligible");
    expect(container.querySelector("tbody strong")?.textContent).toBe("blocked");
  });

  it("keeps a header cell that the document leaves empty", () => {
    // deliverable-capacity opens a matrix with an unlabelled first column.
    const container = renderMarkdown("# Test\n\n| | What it is |\n| --- | --- |\n| Capability | What exists |");
    const headers = [...container.querySelectorAll("thead th")].map((cell) => cell.textContent);
    expect(headers).toEqual(["", "What it is"]);
  });

  it("escapes cell contents rather than trusting them", () => {
    const container = renderMarkdown([
      "# Test",
      "",
      "| Payload | Link |",
      "| --- | --- |",
      "| <script>alert(1)</script> | [x](javascript:alert%281%29) |",
      "| <img src=x onerror=alert(1)> | ok |",
    ].join("\n"));

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    // The markup is inert text in a cell, which is what escaping looks like from the outside.
    expect(container.querySelector("tbody")?.textContent).toContain("alert(1)");
    expect(container.innerHTML).not.toContain("<script>");
    expect(container.innerHTML).not.toContain("onerror");
  });

  it("scrolls a wide table without breaking the table element", () => {
    const container = renderMarkdown(TABLE);
    const scroller = container.querySelector(".docs-table-scroll");
    expect(scroller).not.toBeNull();
    expect(scroller?.querySelector("table")).not.toBeNull();
  });

  it("leaves documents without tables rendering exactly as before", async () => {
    // A page that predates table support: same headings, same anchors, and no table introduced.
    const page = await readDoc("methodology/ucpi");
    const { container } = render(<DocArticle page={page!} />);
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(getHeadings(page!.markdown).length).toBeGreaterThan(0);
    for (const heading of getHeadings(page!.markdown)) {
      expect(container.querySelectorAll(`[id="${heading.id}"]`).length).toBeLessThanOrEqual(1);
    }
  });

  it("switches on tables only, leaving the rest of GFM off", () => {
    // Full GFM would also change how existing documents render; table support must not.
    const container = renderMarkdown("# Test\n\n~~struck~~ and www.example.com\n\n- [ ] a task");
    expect(container.querySelector("del")).toBeNull();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.querySelector('a[href*="example.com"]')).toBeNull();
  });
});
