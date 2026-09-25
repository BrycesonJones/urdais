/**
 * Which markets Urdais can actually read, and why the one that cannot still cannot.
 *
 * Six of the seven now have an adapter. ERCOT and ISO-NE joined them once credentials existed:
 * ERCOT's token flow and ISO-NE's Basic authentication both succeed, both payloads were captured
 * for an ordinary day and both transition days, and neither contradicted the frozen specification.
 *
 * **PJM remains without one, and its block has two independent halves.** The first is a
 * subscription key Urdais does not hold -- probed on 25 September 2026, Data Miner answered HTTP
 * 401. The second survives any key: PJM's terms prohibit publishing data derived from Data Miner
 * without an active membership, so obtaining access would make the series readable and still not
 * publishable. A typed refusal rather than a missing entry, so "Urdais has not built this" is a
 * state a test can assert rather than an absence it has to infer.
 */

import { caisoAdapter } from "@/lib/uepi/source/adapters/caiso";
import { ercotAdapter } from "@/lib/uepi/source/adapters/ercot";
import { isoneAdapter } from "@/lib/uepi/source/adapters/isone";
import { misoAdapter } from "@/lib/uepi/source/adapters/miso";
import { nyisoAdapter } from "@/lib/uepi/source/adapters/nyiso";
import { sppAdapter } from "@/lib/uepi/source/adapters/spp";
import { UepiSourceError, type UepiSourceAdapter, type UnavailableAdapter } from "@/lib/uepi/source/types";
import { UEPI_SERIES_IDS, type UepiSeriesId } from "@/lib/uepi/types";

export const UEPI_ADAPTERS: Readonly<Record<UepiSeriesId, UepiSourceAdapter | UnavailableAdapter>> = {
  "uepi-caiso": caisoAdapter,
  "uepi-ercot": ercotAdapter,
  "uepi-iso-ne": isoneAdapter,
  "uepi-miso": misoAdapter,
  "uepi-nyiso": nyisoAdapter,
  "uepi-spp": sppAdapter,

  "uepi-pjm": {
    seriesId: "uepi-pjm",
    available: false,
    reason: "SOURCE_CREDENTIAL_REQUIRED",
    detail:
      "PJM Data Miner requires an Ocp-Apim-Subscription-Key. Probed without one on 2026-09-25, "
      + "https://api.pjm.com/api/v1/da_hrl_lmps answered HTTP 401. Separately, and unaffected by any "
      + "key, PJM's terms prohibit publishing data derived from Data Miner without an active "
      + "membership, so this series stays internal even once it can be read.",
    unblockedBy: [
      "a PJM Data Miner subscription key",
      "one captured da_hrl_lmps payload at pricing node 1 for an ordinary operating day",
      "one captured payload for a transition day",
      "a primary PJM sentence for how pricing node 1 is weighted (specification §K.2 item 10)",
    ],
  },
};

export function isAvailable(entry: UepiSourceAdapter | UnavailableAdapter): entry is UepiSourceAdapter {
  return (entry as UnavailableAdapter).available !== false;
}

/** The adapter for a series, or a typed refusal naming what would unblock it. */
export function adapterFor(seriesId: UepiSeriesId): UepiSourceAdapter {
  const entry = UEPI_ADAPTERS[seriesId];
  if (!isAvailable(entry)) {
    throw new UepiSourceError(seriesId, "ADAPTER_UNAVAILABLE", `${entry.reason}: ${entry.detail}`);
  }
  return entry;
}

export function unavailableReason(seriesId: UepiSeriesId): UnavailableAdapter | null {
  const entry = UEPI_ADAPTERS[seriesId];
  return isAvailable(entry) ? null : entry;
}

export const IMPLEMENTED_SERIES_IDS: readonly UepiSeriesId[] =
  UEPI_SERIES_IDS.filter((seriesId) => isAvailable(UEPI_ADAPTERS[seriesId]));

export const UNIMPLEMENTED_SERIES_IDS: readonly UepiSeriesId[] =
  UEPI_SERIES_IDS.filter((seriesId) => !isAvailable(UEPI_ADAPTERS[seriesId]));
