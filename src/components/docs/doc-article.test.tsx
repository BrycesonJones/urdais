import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DocArticle } from "@/components/docs/doc-article";
import { docPages } from "@/lib/docs/catalog";
import { readDoc } from "@/lib/docs/content";
import { getHeadings } from "@/lib/docs/markdown";

describe("repository-backed documentation", () => {
  it("renders each registered source with working contents links and one page heading", async () => {
    for (const entry of docPages) {
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
  });

  it("does not publish unregistered files or resolve URL paths against the filesystem", async () => {
    expect(await readDoc("FRONTEND_PRD")).toBeUndefined();
    expect(await readDoc("../../package.json")).toBeUndefined();
    expect(await readDoc("methodology/indices")).toBeUndefined();
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
