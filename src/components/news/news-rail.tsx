import { NewsCard } from "@/components/news/news-card";
import { RailScroller } from "@/components/news/rail-scroller";
import type { NewsArticle } from "@/types/news";

type NewsRailProps = {
  /** Category heading, e.g. "Compute". */
  title: string;
  articles: readonly NewsArticle[];
  /**
   * Where these stories came from. The badge says so plainly: a rail on mock
   * content is labelled demo, and a production rail is not, so live and
   * invented stories are never presented as the same thing.
   */
  provenance: "production" | "demo";
  /** Shown instead of cards when a production rail has nothing to show. */
  emptyMessage?: string;
};

/**
 * One category rail: heading plus a horizontal row of story cards. Takes
 * articles by props and does not care where they came from, so a rail can move
 * from mock data to ingestion-backed data without the component changing.
 * The heading is plain text for now; category pages are a later slice.
 */
export function NewsRail({ title, articles, provenance, emptyMessage }: NewsRailProps) {
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight text-neutral-50 md:text-2xl">{title}</h2>
        <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
          {provenance === "demo" ? "Demo content" : "Live"}
        </span>
      </div>

      {articles.length === 0 ? (
        <p className="text-sm text-neutral-500">{emptyMessage ?? "No stories are available right now."}</p>
      ) : (
        <RailScroller label={`${title} stories`}>
          {articles.map((article) => (
            <div key={article.id} className="w-[84%] shrink-0 snap-start sm:w-[46%] lg:w-[31%]">
              <NewsCard article={article} />
            </div>
          ))}
        </RailScroller>
      )}
    </section>
  );
}
