/**
 * The Urdais news refresh policy.
 *
 * One cadence for news, not one per category. Compute is the only
 * production-backed rail today, but the schedule is a property of news rather
 * than of Compute: when Memory, Photonics, Energy / Power, AI Chips or Crypto
 * gain approved sources they join this run by appearing in the registry, and
 * nothing here changes. That is why there is one cron entry and not six.
 *
 * Four hours suits what these sources actually are. A publisher newsroom
 * produces a handful of items a day; polling more often costs the publisher
 * requests and gains Urdais nothing, and polling less often lets a rail look
 * stale for most of a working day.
 */

/** Hours between production ingestion runs. */
export const NEWS_REFRESH_INTERVAL_HOURS = 4;

/**
 * The cron expression in vercel.json, kept beside the interval it encodes so
 * the two cannot drift. Vercel cron is always UTC, so the run lands at 00:00,
 * 04:00, 08:00, 12:00, 16:00 and 20:00 UTC.
 */
export const NEWS_REFRESH_CRON = "0 */4 * * *";

/** The path Vercel calls. One route for every category. */
export const NEWS_REFRESH_PATH = "/api/cron/news";

/** The UTC hours the schedule fires on, derived rather than restated. */
export function newsRefreshHoursUtc(): number[] {
  const hours: number[] = [];
  for (let hour = 0; hour < 24; hour += NEWS_REFRESH_INTERVAL_HOURS) hours.push(hour);
  return hours;
}
