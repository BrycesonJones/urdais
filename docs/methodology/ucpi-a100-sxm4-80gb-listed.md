# UCPI-A100-SXM4-80GB-LISTED Child Specification

**Status: approved child specification, version 1.0.0, effective 15 September 2026.** Prepared 14 September 2026, approved 15 September 2026. This child declares [UCPI-LISTED-GPU](/docs/methodology/ucpi-listed-gpu) as its methodology and binds this version to UCPI-LISTED-GPU 1.0.0. A child of the [UCPI-LISTED-GPU family specification](/docs/methodology/ucpi-listed-gpu) under the [Urdais Compute Price Index family](/docs/methodology/ucpi); everything not stated here is inherited from those documents unchanged. A different economic object from any accessible-offer child.

## Instrument

NVIDIA A100, SXM4 form factor, 80 GB HBM2e, full physical device, per-accelerator allocation class. The A100 SXM4 40 GB, the A100 PCIe 80 GB and the A100 PCIe 40 GB are different instruments and are never collapsed into this one.

## Admitted upstream SKUs

Price of Compute canonical SKU `A100-SXM-80GB` (the source separates `A100-SXM-40GB`, `A100-PCIE-80GB` and `A100-PCIE-40GB`). Admitted as Grade C identity.

## Seller topology evidence, 14 September 2026

Runpod: A100 SXM 80 GB listed per GPU with per-GPU host resources (Secure Cloud). Verda: 1x A100 SXM4 80GB instance. Hyperstack: A100 SXM 80 GB listed per GPU with per-GPU host resources. Massed Compute: A100 SXM4 (80GB) x1 exists, but the contracting legal entity is evidenced only by a copyright notice; excluded `SELLER_LEGAL_IDENTITY_UNRESOLVED` until its terms name the entity. Lambda: A100 SXM 80 GB sold only as 8x instances; excluded `WHOLE_NODE_REQUIRED`. Denvr: A100 SXM sold as eight-GPU nodes; excluded `WHOLE_NODE_REQUIRED`. Azure: ND A100 v4 eight-accelerator instances; excluded `WHOLE_NODE_REQUIRED`. Vast.ai: platform aggregate, excluded.

## Version History

**1.0.0, 15 September 2026, effective 15 September 2026**: approved, bound to UCPI-LISTED-GPU 1.0.0. No rule of this child changed; the specification it inherits was approved and this child was approved with it. Whether this child publishes on any date is decided by the family's structural participant rule against that date's eligible sellers, never by this approval.

**0.1.0-draft, 14 September 2026**: initial child. No production effective date.
