import GithubSlugger from "github-slugger";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { toString } from "mdast-util-to-string";
import { gfmTable } from "micromark-extension-gfm-table";
import remarkParse from "remark-parse";
import { unified, type Processor } from "unified";

/**
 * Pipe-table support, and nothing else.
 *
 * The approved methodology documents state their coverage matrices as tables, and their bytes are
 * frozen: each one's SHA-256 is the `content_hash` of an approved methodology version already
 * applied to production, so the renderer has to meet the documents rather than the reverse.
 *
 * This is the table half of remark-gfm, without the rest of it. Full GFM would also switch on
 * strikethrough, autolinks, footnotes and task lists across every documentation page, which is a
 * change to how existing documents render and is not what table support requires.
 */
export function remarkTables(this: Processor) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(gfmTable());
  (data.fromMarkdownExtensions ??= []).push(gfmTableFromMarkdown());
}

/** The parser the renderer uses, so headings and rendered output cannot disagree about structure. */
const parser = unified().use(remarkParse).use(remarkTables);

// Use the same parsed heading text and slug rules for anchors and the TOC.
// Parsing Markdown avoids treating headings inside code fences as sections.
export function getHeadings(markdown: string) {
  const tree = parser.parse(markdown);
  const slugger = new GithubSlugger();
  const headings: { depth: number; text: string; id: string; line?: number }[] = [];

  function collect(node: (typeof tree.children)[number]) {
    if (node.type === "heading") {
      const text = toString(node);
      headings.push({
        depth: node.depth,
        text,
        id: `docs-${slugger.slug(text)}`,
        line: node.position?.start.line,
      });
    }
    if ("children" in node) node.children.forEach(collect);
  }

  tree.children.forEach(collect);
  return headings;
}
