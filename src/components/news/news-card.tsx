import { NewsThumbnail } from "@/components/news/news-thumbnail";
import type { NewsArticle } from "@/types/news";

const THUMBNAIL_SIZES = "(min-width: 1024px) 31vw, (min-width: 640px) 46vw, 84vw";

function formatPublished(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

/**
 * One editorial story: thumbnail, headline, dek, and source metadata.
 * The headline becomes a link only when the article has a canonical URL,
 * so mock content never links anywhere.
 */
export function NewsCard({ article }: { article: NewsArticle }) {
  const headline = article.url ? (
    <a
      href={article.url}
      className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
    >
      {article.title}
    </a>
  ) : (
    article.title
  );

  return (
    <article className="flex flex-col gap-3">
      <NewsThumbnail imageUrl={article.imageUrl} sizes={THUMBNAIL_SIZES} />
      <div className="flex flex-col gap-1.5">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug tracking-tight text-neutral-50">
          {headline}
        </h3>
        <p className="line-clamp-3 text-sm leading-relaxed text-neutral-400">{article.summary}</p>
        <p className="text-xs text-neutral-500">
          {article.source} · {formatPublished(article.publishedAt)}
        </p>
      </div>
    </article>
  );
}
