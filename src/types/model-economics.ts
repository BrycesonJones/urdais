/**
 * Model Economics: the deeper analytical view of the model economy. These
 * shapes describe one coherent demo data graph (labs → models → price,
 * volume, capability, access class) and the views derived from it.
 */


/** Whether a model's weights are downloadable. Demo metadata, not a licensing record. */
export type AccessClass = "open-weight" | "proprietary";

export type ModelRecord = {
  id: string;
  labId: string;
  labName: string;
  modelName: string;
  modelFamily: string;
  accessClass: AccessClass;
  /** Provisional blended price in $/1M tokens: a normalised average of input and output economics. */
  blendedPrice: number;
  /** Demo capability score, 0–100. Not a benchmark and not an Urdais index. */
  capabilityScore: number;
};

/** One row of a ranked share table. `share` is a percentage of the window total. */
export type ShareRow = {
  id: string;
  label: string;
  /** Secondary label, e.g. the lab name on a model row. */
  detail?: string;
  volume: number;
  share: number;
};

export type FrontierPoint = ModelRecord & {
  /** Mean observed tokens per day over the share window. */
  tokenVolume: number;
  /** True when no other model is both cheaper and more capable. */
  onFrontier: boolean;
};

export type OpenWeightAnalysis = {
  volumeShare: { openWeight: number; proprietary: number };
  capabilityGap: { openWeight: number; proprietary: number; gap: number };
  priceGap: {
    /** Median blended price among models at or above the capability threshold. */
    openWeight: number;
    proprietary: number;
    /** Proprietary median divided by open-weight median. */
    ratio: number;
    capabilityThreshold: number;
    openWeightCount: number;
    proprietaryCount: number;
  };
};
