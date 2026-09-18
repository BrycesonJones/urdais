import type { FacilityCategory, FacilityLifecycleStatus } from "@/lib/facilities/domain";

/**
 * Top-level infrastructure category of a point: a data-centre facility, a GPU
 * compute cluster, a semiconductor fabrication facility, or electrical
 * infrastructure. It is the facility vocabulary, re-exported rather than
 * restated, so the map and the database cannot come to disagree about what the
 * four categories are.
 *
 * The canonical value for the second is `gpu_compute_cluster`. It was
 * `compute_cluster`, which was too broad for a category whose members are all
 * accelerator fleets; the public label is "GPU Compute Cluster".
 */
export type MapPointCategory = FacilityCategory;

/**
 * A point Urdais places on the map.
 *
 * There is no mapping-status field here any more, and that absence is the
 * point. The map used to carry an "Unmapped" point alongside the four
 * categories — a black dot for a facility Urdais had not placed, which required
 * placing it somewhere in order to say it had not been placed. Whether a record
 * is ready to be shown is a publication decision that now lives in the
 * database, and a facility that fails it is simply not in this list. Every
 * point here is a published, placed, sourced facility.
 */
export type UrdaisMapPoint = {
  /** Stable, unique across the whole point set; becomes the GeoJSON feature id. */
  id: string;
  /** Degrees, −180 to 180. */
  longitude: number;
  /** Degrees, −90 to 90. */
  latitude: number;
  name: string;
  category: MapPointCategory;
  /**
   * Best known address or location string, shown on the profile popup:
   * a full street address ("1500 Beech Road, New Albany, OH, United States")
   * or just the place ("Kajaani, Kainuu, Finland"). Not parsed into parts.
   */
  address?: string;
  /** Owner and operator are different roles and often different companies. */
  ownerName?: string;
  operatorName?: string;
  lifecycleStatus?: FacilityLifecycleStatus;
  /** ISO date. Shown so a reader can judge how current the record is. */
  lastVerifiedDate?: string;
  /** The documents behind the record. A dot without one never reaches the map. */
  sources?: readonly { publisher: string; url: string }[];
};
