import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

import { findDoc } from "@/lib/docs/catalog";

/** The allowlist is the only source of file paths; URL input never reaches fs. */
export const readDoc = cache(async (slug: string) => {
  const page = findDoc(slug);
  if (!page) return undefined;
  const markdown = await readFile(path.join(process.cwd(), "docs", page.file), "utf8");
  return { ...page, markdown };
});
