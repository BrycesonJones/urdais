/**
 * Deterministic dummy snapshots for the secondary Urdais indices.
 *
 * Hard-coded, plausible values for layout work only. UCPI is intentionally
 * absent: it owns the primary Information Markets panel. Replace with API data
 * when the backend publishes index values.
 */

import { MOCK_AS_OF } from "@/data/mock/ucpi";
import type { IndexSnapshot } from "@/types/market";

export const INDEX_SNAPSHOTS: IndexSnapshot[] = [
  {
    symbol: "UGAI",
    name: "Urdais Global AI Index",
    unit: "pts",
    value: 184.21,
    change: 2.08,
    changePercent: 1.14,
    asOf: MOCK_AS_OF,
  },
  {
    symbol: "UAVI",
    name: "Urdais AI Volatility Index",
    unit: "pts",
    value: 27.84,
    change: -0.9,
    changePercent: -3.12,
    asOf: MOCK_AS_OF,
  },
  {
    symbol: "UBWI",
    name: "Bitcoin Wealth Index",
    unit: "pts",
    value: 1342.57,
    change: 5.61,
    changePercent: 0.42,
    asOf: MOCK_AS_OF,
  },
];
