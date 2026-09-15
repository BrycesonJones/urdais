/**
 * The Urdais news refresh policy.
 *
 * One cadence for news, not one per category. Compute is the only
 * production-backed rail today, but the schedule is a property of news rather
 * than of Compute: when Memory, Photonics, Energy / Power, AI Chips or Crypto
 * gain approved sources they join this run by appearing in the registry, and
 * nothing here changes. That is why there is one cron entry and not six.
 *
 * Daily, because that is what the platform runs. Vercel's Hobby plan invokes a
 * cron job once per day and refuses a faster expression at deploy time, so a
 * four-hourly cadence — which is what these sources would otherwise warrant,
 * since a publisher newsroom produces a handful of items a day — is not
 * available until the project is on a Pro team. Raising it later is this
 * constant and the matching vercel.json line, which a test requires to agree.
 *
 * A once-daily run has a real cost worth naming: a story published just after
 * the run appears on the rail up to a day late. Nothing is lost, because each
 * run reads the feed's current window rather than a delta, so the next run
 * still finds it.
 */

/** Hours between production ingestion runs. */
export const NEWS_REFRESH_INTERVAL_HOURS = 24;

/**
 * The cron expression in vercel.json, kept beside the interval it encodes so
 * the two cannot drift. Vercel cron is always UTC. On the Hobby plan the run
 * lands somewhere inside the named hour rather than on the minute, which the
 * pipeline does not care about.
 */
export const NEWS_REFRESH_CRON = "0 0 * * *";

/** The path Vercel calls. One route for every category. */
export const NEWS_REFRESH_PATH = "/api/cron/news";

/** The UTC hours the schedule fires on, derived rather than restated. */
export function newsRefreshHoursUtc(): number[] {
  const hours: number[] = [];
  for (let hour = 0; hour < 24; hour += NEWS_REFRESH_INTERVAL_HOURS) hours.push(hour);
  return hours;
}
