import GithubSlugger from "github-slugger";
import { toString } from "mdast-util-to-string";
import remarkParse from "remark-parse";
import { unified } from "unified";

// Use the same parsed heading text and slug rules for anchors and the TOC.
// Parsing Markdown avoids treating headings inside code fences as sections.
export function getHeadings(markdown: string) {
  const tree = unified().use(remarkParse).parse(markdown);
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
