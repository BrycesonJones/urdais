# UCPI-B200-LISTED Child Specification

**Status: approved child specification, version 1.0.0, effective 15 September 2026.** Prepared 14 September 2026, approved 15 September 2026. This child declares [UCPI-LISTED-GPU](/docs/methodology/ucpi-listed-gpu) as its methodology and binds this version to UCPI-LISTED-GPU 1.0.0. A child of the [UCPI-LISTED-GPU family specification](/docs/methodology/ucpi-listed-gpu) under the [Urdais Compute Price Index family](/docs/methodology/ucpi); everything not stated here is inherited from those documents unchanged. A different economic object from any accessible-offer child.

## Instrument

NVIDIA B200 as sold in HGX B200 systems (the SXM6 module), full physical device, per-accelerator allocation class. Sellers label device memory 180 GB or 192 GB for the same part, so memory does not gate identity for this instrument. GB200 and GB300 NVL rack-scale platforms, and the B300, are different products and are never admitted as B200 observations.

## Admitted upstream SKUs

Price of Compute canonical SKU `B200`. On first retrieval every seller row behind it carried a seller label of B200 SXM6, HGX B200 or B200 180 GB; no GB200 label was found. Admitted as Grade C identity, with that check recorded.

## Seller topology evidence, 14 September 2026

Verda: 1x B200 SXM6 180GB instance. Runpod: B200 180 GB listed per GPU with per-GPU host resources (Secure Cloud). Lambda: 1x B200 SXM6 instance exists, priced by quantity (1x, 2x, 4x, 8x), so the observation carries `SELLER_PRICE_TIERED_BY_QUANTITY`. Hyperstack: B200 listed per GPU; not present in the source's B200 rows on first retrieval. Massed Compute: B200 SXM6 sold only as an eight-GPU node, and the source's per-accelerator figure is that node price divided by eight; excluded `WHOLE_NODE_REQUIRED`. CoreWeave: HGX B200 node, excluded `WHOLE_NODE_REQUIRED`. Vast.ai: platform aggregate, excluded.

## Version History

**1.0.0, 15 September 2026, effective 15 September 2026**: approved, bound to UCPI-LISTED-GPU 1.0.0. No rule of this child changed; the specification it inherits was approved and this child was approved with it. Whether this child publishes on any date is decided by the family's structural participant rule against that date's eligible sellers, never by this approval.

**0.1.0-draft, 14 September 2026**: initial child. No production effective date.
