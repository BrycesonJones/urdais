/**
 * Which map layers a reader may see, and how a response is narrowed to them.
 *
 * The map is the one premium surface that is *filtered* rather than refused. It is
 * a public product containing premium products: the workspace, the basemap and the
 * data-centre layer belong to everyone, and three of the four facility categories
 * do not. Refusing the route would take the public map away to protect the premium
 * part of it, which is the wrong trade.
 *
 * Everything here is pure, and the two shapes it produces are deliberately
 * different things:
 *
 *   visibleCategories   what the response may contain
 *   lockedCategories    what the legend must still advertise as premium
 *
 * A locked category is *withheld, not hidden*. Its points do not leave the server,
 * and its name does — otherwise the map silently looks emptier to an unsubscribed
 * reader rather than looking gated, and nobody can tell there is anything to buy.
 * Sending the category names is not a leak: the premium products are advertised
 * publicly. Sending their coordinates would be.
 */

import { isPremiumEnforcementActive, type ProcessEnvLike } from "@/lib/access/activation";
import { canAccess, type AccessDenialReason, type Viewer } from "@/lib/access/entitlement";
import { productForMapCategory } from "@/lib/access/products";
import { FACILITY_CATEGORIES, type FacilityCategory } from "@/lib/facilities/domain";
import type { FacilityMapReadModel } from "@/lib/facilities/read/read-model";
import type { UrdaisMapPoint } from "@/types/map";

export type MapAccess = {
  /** False when premium enforcement is off: the current production state. */
  readonly enforced: boolean;
  /** Categories whose points may be served. */
  readonly visibleCategories: readonly FacilityCategory[];
  /** Premium categories withheld from this reader, still named in the legend. */
  readonly lockedCategories: readonly FacilityCategory[];
  /**
   * Why they are withheld, so the map's gate can offer sign-in to a reader who is
   * not signed in and not to one who is. `null` when nothing is withheld.
   *
   * One reason for the whole set rather than one per category: a single entitlement
   * governs all three, so they can only ever be withheld for the same reason, and a
   * per-category map would imply a distinction that cannot arise.
   */
  readonly reason: Exclude<AccessDenialReason, "unknown_product"> | null;
};

/** Everything visible, nothing locked. What an unenforced or entitled reader gets. */
export const OPEN_MAP_ACCESS: MapAccess = Object.freeze({
  enforced: false,
  visibleCategories: FACILITY_CATEGORIES,
  lockedCategories: Object.freeze([]) as readonly FacilityCategory[],
  reason: null,
});

/**
 * The reader's map access.
 *
 * Decided per category through the canonical `canAccess`, rather than by asking
 * once whether the reader is a subscriber and applying the answer to all three.
 * The two are equivalent today — one entitlement unlocks everything — and they
 * stop being equivalent the moment a category's classification changes, at which
 * point this loop is already right and a single boolean would silently be wrong.
 */
export function mapAccessFor(viewer: Viewer, env: ProcessEnvLike = process.env): MapAccess {
  if (!isPremiumEnforcementActive(env)) return OPEN_MAP_ACCESS;

  const visible: FacilityCategory[] = [];
  const locked: FacilityCategory[] = [];
  let reason: Exclude<AccessDenialReason, "unknown_product"> | null = null;

  for (const category of FACILITY_CATEGORIES) {
    const product = productForMapCategory(category);
    const decision = canAccess(viewer, product.id);
    if (decision.allowed) {
      visible.push(category);
      continue;
    }
    locked.push(category);
    // `unknown_product` cannot occur here: every category resolves through
    // `productForMapCategory`, which is total over the taxonomy and throws rather
    // than returning an unregistered product. Narrowed rather than asserted so the
    // type stays honest if that ever changes.
    if (!reason && decision.reason !== "unknown_product") reason = decision.reason;
  }

  return {
    enforced: true,
    visibleCategories: Object.freeze(visible),
    lockedCategories: Object.freeze(locked),
    reason,
  };
}

/** Whether a category may be served under this access. */
export function isCategoryVisible(access: MapAccess, category: FacilityCategory): boolean {
  return access.visibleCategories.includes(category);
}

/**
 * The points this reader may receive.
 *
 * Applied before the point set is handed to a client component or serialised into
 * a response, which is the boundary that matters: hiding a marker in React would
 * leave its coordinates in the payload, and a coordinate is the whole product for
 * a facility.
 */
export function filterMapPoints(points: readonly UrdaisMapPoint[], access: MapAccess): readonly UrdaisMapPoint[] {
  if (!access.enforced || access.lockedCategories.length === 0) return points;
  return points.filter((point) => isCategoryVisible(access, point.category));
}

/**
 * The facility read model narrowed to this reader.
 *
 * `coverage` is narrowed too, and that is not cosmetic: `byCategory` is a count of
 * how many facilities Urdais holds per category, so leaving it whole would tell an
 * unsubscribed reader exactly how many GPU clusters and fabs are being withheld.
 * A withheld category reports zero, and `served` is recomputed from what actually
 * ships. `published` is left alone — it describes the dataset, which is a public
 * fact about Urdais's coverage rather than a premium value.
 */
export function filterFacilityModel(model: FacilityMapReadModel, access: MapAccess): FacilityMapReadModel {
  if (!access.enforced || access.lockedCategories.length === 0) return model;

  const facilities = model.facilities.filter((facility) => isCategoryVisible(access, facility.category));

  const byCategory = { ...model.coverage.byCategory };
  for (const category of access.lockedCategories) byCategory[category] = 0;

  return {
    ...model,
    facilities,
    coverage: { ...model.coverage, byCategory, served: facilities.length },
  };
}
