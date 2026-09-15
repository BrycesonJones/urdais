/**
 * The frozen UBWI publication, read from the database for the public surface.
 *
 * Until Phase 2F there was nothing to read: the gate refused every calculation, so the
 * surface rendered its withheld state unconditionally and the read path did not exist.
 * Methodology 1.2.0 removed the last numerator rights dependency, the gate passed, and a
 * point is frozen -- so the surface has to serve the real value rather than a placeholder.
 *
 * Three rules this module exists to keep:
 *
 *   1. Only a FROZEN publication is served. A row without `frozen_at` is a row the
 *      publication process did not finish, and serving it would publish something Urdais
 *      never committed to.
 *   2. The percentage change is computed only against a real predecessor under the same
 *      methodology and residual-model versions. With one point there is no predecessor and
 *      the change is null. It is never zero, and never back-filled.
 *   3. No database, or any error reaching one, yields null rather than a fabricated point.
 *      A surface that cannot read its own publication must say it has no value, not invent
 *      one.
 */

export type FrozenUbwiPublication = {
  publishedAt: string;
  valuePercent: number;
  /** Null until a second frozen point exists under the same versions. Never zero. */
  changePercent: number | null;
  methodologyVersion: string;
  residualModelVersion: string;
};

/** The version pair a change may be computed within, and never across. */
export type UbwiRegime = {
  methodologyVersion: string;
  residualModelVersion: string;
};

/**
 * The relative percentage return from one published UBWI level to the next.
 *
 * UBWI is itself quoted in percent, which is exactly why this has to be stated rather
 * than assumed. Until this phase the read path returned `latest - previous`, a difference
 * in percentage *points* carried under the name `changePercent`. At UBWI's scale that is
 * not a cosmetic disagreement: a move from 0.2672 % to 0.2700 % is a real +1.05 % change
 * in Bitcoin's share of global wealth, and the percentage-point difference of 0.0028
 * renders as "+0.00%" at the two decimals every movement surface uses. A genuine
 * one-percent day would have displayed as no movement at all, on the market page and on
 * the homepage row alike.
 *
 * The convention here is the one the rest of Urdais already keeps -- `periodReturn` in
 * @/lib/market-ranges computes `(last - first) / first * 100` -- so UBWI's movement is
 * comparable with every other instrument's.
 *
 * Null, never zero, whenever the comparison would be meaningless: no predecessor, a
 * predecessor published under a different methodology or residual-model version, or a
 * base of zero.
 */
export function ubwiChangePercent(
  latest: { valuePercent: number } & UbwiRegime,
  previous: ({ valuePercent: number } & UbwiRegime) | undefined,
): number | null {
  if (previous === undefined) return null;
  // A change across a methodology or model boundary would compare two different
  // definitions and call the difference a movement in the world. It is withheld
  // instead, which is the same rule the calculation layer applies to vintages.
  if (previous.methodologyVersion !== latest.methodologyVersion) return null;
  if (previous.residualModelVersion !== latest.residualModelVersion) return null;
  if (!Number.isFinite(previous.valuePercent) || previous.valuePercent === 0) return null;
  if (!Number.isFinite(latest.valuePercent)) return null;
  return ((latest.valuePercent - previous.valuePercent) / previous.valuePercent) * 100;
}

type Row = Record<string, unknown>;

/**
 * Load the latest frozen publication, and its immediate predecessor if one exists.
 *
 * Ordered by `published_at` and tie-broken by `frozen_at`, so two points published in the
 * same second still have a defined order rather than an arbitrary one. Superseded points
 * are excluded, which is the same public-history rule ./publication-history.ts applies:
 * a correction is a supersession, and the corrected point is not what Urdais publishes.
 */
export async function loadFrozenUbwiPublication(
  env: NodeJS.ProcessEnv = process.env,
): Promise<FrozenUbwiPublication | null> {
  try {
    const { resolveTokenDatabaseUrl, tokenSqlExecutor } = await import(
      "@/lib/tokens/read/database"
    );
    const url = resolveTokenDatabaseUrl(env, { allowLocalDefault: false });
    if (!url) return null;

    // The executor is process-wide and shared with the news and token reads; it is
    // borrowed here, never closed. See @/lib/tokens/read/database.
    const sql = await tokenSqlExecutor(url);
    const { rows } = await sql.query(
      `select published_at, frozen_at, published_value_percent,
              methodology_version, residual_model_version
         from pipeline.ubwi_publications
        where frozen_at is not null and superseded_by_id is null
        order by published_at desc, frozen_at desc
        limit 2`,
      [],
    );
    if (rows.length === 0) return null;

    const latest = rows[0] as Row;
    const previous = rows[1] as Row | undefined;

    const valuePercent = Number(latest.published_value_percent);
    if (!Number.isFinite(valuePercent)) return null;

    const methodologyVersion = String(latest.methodology_version);
    const residualModelVersion = String(latest.residual_model_version);

    const changePercent = ubwiChangePercent(
      { valuePercent, methodologyVersion, residualModelVersion },
      previous === undefined
        ? undefined
        : {
            valuePercent: Number(previous.published_value_percent),
            methodologyVersion: String(previous.methodology_version),
            residualModelVersion: String(previous.residual_model_version),
          },
    );

    return {
      publishedAt: new Date(String(latest.published_at)).toISOString(),
      valuePercent,
      changePercent,
      methodologyVersion,
      residualModelVersion,
    };
  } catch (error) {
    // No database, an unreachable one, or a schema without the table. The surface shows
    // its no-value state; it never invents a point to fill the gap.
    //
    // It says so in the log on the way, because "no UBWI row" and "could not reach the
    // database" render identically on the page and must not be indistinguishable to an
    // operator. A transient fault that leaves no trace cannot be diagnosed once it heals.
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`ubwi: publication unavailable (${detail}); the index row will not render`);
    return null;
  }
}
