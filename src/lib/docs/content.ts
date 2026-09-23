import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

import { findPublicDoc } from "@/lib/docs/catalog";

/**
 * The allowlist is the only source of file paths; URL input never reaches fs. The allowlist is
 * the *public* one, so a withheld document is never read for a public request, whatever route
 * generation did.
 */
export const readDoc = cache(async (slug: string) => {
  const page = findPublicDoc(slug);
  if (!page) return undefined;
  const markdown = await readFile(path.join(process.cwd(), "docs", page.file), "utf8");
  return { ...page, markdown };
});
