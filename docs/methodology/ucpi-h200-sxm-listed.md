# UCPI-H200-SXM-LISTED Child Specification

**Status: approved child specification, version 1.0.0, effective 15 September 2026.** Prepared 14 September 2026, approved 15 September 2026. This child declares [UCPI-LISTED-GPU](/docs/methodology/ucpi-listed-gpu) as its methodology and binds this version to UCPI-LISTED-GPU 1.0.0. A child of the [UCPI-LISTED-GPU family specification](/docs/methodology/ucpi-listed-gpu) under the [Urdais Compute Price Index family](/docs/methodology/ucpi); everything not stated here is inherited from those documents unchanged. A different economic object from any accessible-offer child.

## Instrument

NVIDIA H200, SXM form factor, 141 GB HBM3e, full physical device, per-accelerator allocation class. The H200 NVL is a different physical product (a PCIe board pair with NVLink bridge) and is a different instrument; it is never collapsed into this one.

## Admitted upstream SKUs

Price of Compute canonical SKU `H200-SXM` (the source separates `H200-NVL`). Admitted as Grade C identity.

## Seller topology evidence, 14 September 2026

Verda: 1x H200 SXM5 141GB instance on its own price surface. Runpod: H200 141 GB listed per GPU with per-GPU host resources (Secure Cloud). Hyperstack: H200 SXM listed per GPU; not present in the source's H200 SXM rows on first retrieval. CoreWeave: HGX H200 sold as an eight-accelerator node, excluded `WHOLE_NODE_REQUIRED`. Nebius: excluded `SELLER_LEGAL_IDENTITY_UNRESOLVED` (see the H100 child). Vast.ai: platform aggregate, excluded.

## Version History

**1.0.0, 15 September 2026, effective 15 September 2026**: approved, bound to UCPI-LISTED-GPU 1.0.0. No rule of this child changed; the specification it inherits was approved and this child was approved with it. Whether this child publishes on any date is decided by the family's structural participant rule against that date's eligible sellers, never by this approval.

**0.1.0-draft, 14 September 2026**: initial child. No production effective date.
