/**
 * One rule, shared by every manual-verification tranche: a coordinate that two
 * facilities share does not establish either building.
 *
 * Operators publish separately named halls at a single street address —
 * "11 Hanbury Street, Block B / Block C / Block D", "Louis-Häfliger-Gasse 10,
 * Building 1 / Building 2", "350 E Cermak Rd, 5th / 6th / 8th Floor" — and a
 * geocoder queried with the street returns one point for the property. That
 * point is then carried by every hall at it. OpenStreetMap makes the mechanism
 * plain: the London query comes back as a single feature named "Digital Realty
 * London LON3", and the Vienna one as "Digital Realty VIE1 & VIE2".
 *
 * The shared coordinate is correct and stays. What is wrong is the precision:
 * `building` claims each hall was located, when what was located is the address
 * they share. So the claim is lowered to `street`, which is what the geocode
 * actually establishes.
 *
 * Deliberately not done: moving the points apart. Co-located facilities are a
 * normal and truthful shape for this dataset, and nudging dots to separate them
 * visually would invent positions nobody surveyed.
 *
 * Lives here rather than inside one operator's generator because the defect is
 * a property of geocoding shared addresses, not of any one operator. Digital
 * Realty and Equinix both hit it; the next tranche will too.
 */

/**
 * The shape this rule needs. Deliberately structural: a tranche result carries
 * far more than this, and none of the rest is any of this function's business.
 */
export type SharedPointResult = {
  researchKey: string;
  latitude: number | null;
  longitude: number | null;
  coordinatePrecision: string;
  precisionClass: string;
  outcomeReason: string;
};

export type SharedPointDemotion<T> = {
  results: T[];
  /** Research keys whose precision this lowered, sorted. */
  demoted: string[];
  /** Every co-located group, for the QA report — including ones nothing changed in. */
  groups: { latitude: number; longitude: number; researchKeys: string[]; demoted: string[] }[];
};

export function demoteSharedBuildingPrecision<T extends SharedPointResult>(results: readonly T[]): SharedPointDemotion<T> {
  const atPoint = new Map<string, T[]>();
  for (const result of results) {
    if (result.latitude === null || result.longitude === null) continue;
    const key = `${result.latitude},${result.longitude}`;
    atPoint.set(key, [...(atPoint.get(key) ?? []), result]);
  }

  const shared = new Set<string>();
  const groups: SharedPointDemotion<T>["groups"] = [];
  for (const [key, group] of atPoint) {
    if (group.length < 2) continue;
    const demotedHere = group.filter((result) => result.coordinatePrecision === "building").map((result) => result.researchKey);
    for (const researchKey of demotedHere) shared.add(researchKey);
    const [latitude, longitude] = key.split(",").map(Number);
    groups.push({
      latitude: latitude ?? 0,
      longitude: longitude ?? 0,
      researchKeys: group.map((result) => result.researchKey).sort(),
      demoted: [...demotedHere].sort(),
    });
  }

  const demoted: string[] = [];
  const next = results.map((result) => {
    if (!shared.has(result.researchKey)) return result;
    demoted.push(result.researchKey);
    // The cast is the price of being generic over every tranche's result type:
    // each narrows `coordinatePrecision` to its own union, and "street" and
    // "interpolated_or_street" are members of all of them.
    return {
      ...result,
      coordinatePrecision: "street",
      precisionClass: "interpolated_or_street",
      outcomeReason:
        `${result.outcomeReason} Precision lowered to street: this coordinate is shared with another facility at the same published address, ` +
        `so it locates the property rather than this named building.`,
    } as unknown as T;
  });

  groups.sort((a, b) => (a.researchKeys[0] ?? "").localeCompare(b.researchKeys[0] ?? ""));
  return { results: next, demoted: demoted.sort(), groups };
}
