/**
 * The smallint each low-cardinality code is stored as.
 *
 * TH-5A moved seven columns from text to smallint after measuring that they cost 81 bytes a row on
 * the limit table to carry about three bytes of information, and were repeated in every index
 * entry as well. The reference vocabularies remain the authority on what a code *means*; this is
 * only how it is written down, and `reference.transmission_code_map` holds the same mapping so a
 * SQL reader can resolve it without this file.
 */

const map = <T extends string>(entries: Record<T, number>) => ({
  to: (code: T): number => {
    const ordinal = entries[code];
    if (ordinal === undefined) throw new Error(`unmapped code: ${String(code)}`);
    return ordinal;
  },
  from: (ordinal: number): T => {
    const found = (Object.entries(entries) as [T, number][])
      .find(([, value]) => value === ordinal);
    if (found === undefined) throw new Error(`unmapped ordinal: ${ordinal}`);
    return found[0];
  },
});

export const contingencyKind = map({ not_applicable: 0, base_case: 1, post_contingency: 2 });
export const entityKind = map({ interface: 1, element: 2 });
export const limitState = map({ real: 1, zero: 2, sentinel: 3, implausible: 4 });
export const limitDirection = map({ undirected: 0, positive: 1, negative: 2 });
export const flowDirection = map({ unspecified: 0, positive: 1, negative: 2, zero: 3 });
export const marginState = map({
  ok: 1, unmonitored_direction: 2, zero_flow_direction_undetermined: 3, implausible_limit: 4,
});
export const selectedDirection = map({ undetermined: 0, positive: 1, negative: 2, undirected: 3 });
export const zoneStatus = map({ source_stated: 0, assumed_market_local: 1, ambiguous: 2 });
export const nativeField = map({
  "Flow (MWH)": 1, "Positive Limit (MWH)": 2, "Negative Limit (MWH)": 3, Value: 4, Limit: 5,
});
export const unitAsPublished = map({ MWH: 1, MW: 2 });
