/**
 * Whether draft listed candidates may leave the read path.
 *
 * Production-visible responses stay identity-only until a calculation series
 * exists, unless an operator explicitly sets UCPI_SHOW_CANDIDATES=1. Local
 * `next dev` (NODE_ENV=development) is the internal inspection path.
 */

export function showListedCandidates(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.UCPI_SHOW_CANDIDATES === "0") return false;
  if (env.UCPI_SHOW_CANDIDATES === "1") return true;
  return env.NODE_ENV === "development";
}
