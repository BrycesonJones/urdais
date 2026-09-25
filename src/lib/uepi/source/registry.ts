/**
 * Which markets Urdais can actually read, and why the others cannot be read.
 *
 * Three of the seven have no adapter, and the distinction between them matters operationally:
 *
 *   **ERCOT and PJM** are *credential*-blocked. Their benchmarks are settled and their schemas are
 *   documented; what is missing is a subscription key. Probed on 25 September 2026 without one,
 *   ERCOT's public API answered HTTP 302 into an authentication redirect and PJM's answered 401.
 *   An adapter written against a schema nobody has fetched would be a guess, and the fixture rule
 *   exists precisely to stop that.
 *
 *   **ISO-NE** is *evidence*-blocked, which is worse. No authenticated payload has ever been
 *   observed, so its field names come from a derived schema and its hour convention and
 *   transition-day behaviour are unknown. A credential alone does not unblock it: one ordinary day
 *   and one transition day have to be parsed first.
 *
 * A typed refusal rather than a missing entry, so "Urdais has not built this" is a state a test
 * can assert rather than an absence it has to infer.
 */

import { caisoAdapter } from "@/lib/uepi/source/adapters/caiso";
import { misoAdapter } from "@/lib/uepi/source/adapters/miso";
import { nyisoAdapter } from "@/lib/uepi/source/adapters/nyiso";
import { sppAdapter } from "@/lib/uepi/source/adapters/spp";
import { UepiSourceError, type UepiSourceAdapter, type UnavailableAdapter } from "@/lib/uepi/source/types";
import { UEPI_SERIES_IDS, type UepiSeriesId } from "@/lib/uepi/types";

export const UEPI_ADAPTERS: Readonly<Record<UepiSeriesId, UepiSourceAdapter | UnavailableAdapter>> = {
  "uepi-caiso": caisoAdapter,
  "uepi-miso": misoAdapter,
  "uepi-nyiso": nyisoAdapter,
  "uepi-spp": sppAdapter,

  "uepi-ercot": {
    seriesId: "uepi-ercot",
    available: false,
    reason: "SOURCE_CREDENTIAL_REQUIRED",
    detail:
      "ERCOT's public API requires a subscription key and a one-hour ID token. Probed without one on "
      + "2026-09-25, https://api.ercot.com/api/public-reports/np4-190-cd/dam_stlmnt_pnt_prices answered "
      + "HTTP 302 into an authentication redirect and returned no data. The display HTML is not the "
      + "production path, so no first-party artifact could be captured.",
    unblockedBy: [
      "an ERCOT developer-portal registration and subscription key",
      "one captured NP4-190-CD payload for an ordinary operating day",
      "one captured payload for a daylight-saving transition day, to establish DSTFlag behaviour",
    ],
  },
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
  "uepi-iso-ne": {
    seriesId: "uepi-iso-ne",
    available: false,
    reason: "AUTHENTICATED_SOURCE_EVIDENCE_REQUIRED",
    detail:
      "No ISO-NE payload has ever been observed. An anonymous call to the web-services API returns "
      + "401, the field names Urdais holds come from a derived schema rather than a live document, "
      + "and the hour convention and transition-day length are unknown. Parsing a third-party "
      + "representation as though it were first-party evidence is the specific thing this refusal "
      + "prevents.",
    unblockedBy: [
      "an ISO Express credential",
      "one authenticated /hourlylmp/da/final payload for an ordinary operating day",
      "one authenticated payload for a transition day",
      "confirmation of LmpTotal and of hour-beginning versus hour-ending",
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
