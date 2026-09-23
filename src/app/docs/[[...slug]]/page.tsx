import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocArticle } from "@/components/docs/doc-article";
import { docHref, findPublicDoc, publicDocPages } from "@/lib/docs/catalog";
import { readDoc } from "@/lib/docs/content";

export const dynamicParams = false;

/**
 * Only the pages the public documentation offers. With `dynamicParams = false` above, a slug that
 * is not generated here is a 404 -- which is already this route's convention for a document that
 * does not exist, and is now also its answer for one that is withheld.
 */
export function generateStaticParams() {
  return publicDocPages.map((page) => ({ slug: page.slug ? page.slug.split("/") : [] }));
}

type Props = { params: Promise<{ slug?: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = findPublicDoc((await params).slug?.join("/") ?? "");
  if (!page) notFound();
  return { title: page.title, description: page.description, alternates: { canonical: docHref(page.slug) } };
}

export default async function DocumentationPage({ params }: Props) {
  const page = await readDoc((await params).slug?.join("/") ?? "");
  if (!page) notFound();
  return <DocArticle page={page} />;
}
