import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocArticle } from "@/components/docs/doc-article";
import { docHref, docPages, findDoc } from "@/lib/docs/catalog";
import { readDoc } from "@/lib/docs/content";

export const dynamicParams = false;

export function generateStaticParams() {
  return docPages.map((page) => ({ slug: page.slug ? page.slug.split("/") : [] }));
}

type Props = { params: Promise<{ slug?: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = findDoc((await params).slug?.join("/") ?? "");
  if (!page) notFound();
  return { title: page.title, description: page.description, alternates: { canonical: docHref(page.slug) } };
}

export default async function DocumentationPage({ params }: Props) {
  const page = await readDoc((await params).slug?.join("/") ?? "");
  if (!page) notFound();
  return <DocArticle page={page} />;
}
