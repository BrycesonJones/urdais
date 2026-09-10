import { NewsCard } from "@/components/news/news-card";
import { RailScroller } from "@/components/news/rail-scroller";
import type { NewsArticle } from "@/types/news";

type NewsRailProps = {
  /** Category heading, e.g. "Compute". */
  title: string;
  articles: NewsArticle[];
};

/**
 * One category rail: heading plus a horizontal row of story cards. Takes
 * articles by props and does not care where they came from, so the mock
 * source can be swapped for ingestion-backed data without touching the UI.
 * The heading is plain text for now; category pages are a later slice.
 */
export function NewsRail({ title, articles }: NewsRailProps) {
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight text-neutral-50 md:text-2xl">{title}</h2>
        <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
          Demo content
        </span>
      </div>

      <RailScroller label={`${title} stories`}>
        {articles.map((article) => (
          <div key={article.id} className="w-[84%] shrink-0 snap-start sm:w-[46%] lg:w-[31%]">
            <NewsCard article={article} />
          </div>
        ))}
      </RailScroller>
    </section>
  );
}
